---
title: Library Scan Worker
description: The async worker that drains the library_scan_jobs queue off the HTTP path, its run paths, config/process.php settings, and the real per-file progress streaming
---

# Library Scan Worker

Library scanning is a long-running, I/O-heavy job. Running it **inside the HTTP
request** would block a worker for the whole scan — a violation of Phlix's
"everything async" rule. Step 1.1b moves the scan **off the request** and onto a
dedicated, Workerman-native worker process:

- `POST /api/v1/libraries/{id}/scan` and `.../rescan` no longer scan inline.
  They **enqueue a job and return `202`** (see
  [Library Management](../admin/library-management#scanning-a-library) for the
  contract).
- A **worker process** claims queued jobs (oldest first) and runs the existing
  `LibraryManager` scan, **streaming real per-file progress** onto the job row
  as it goes (see [Real per-file progress](#real-per-file-progress)).
- The worker also drains `metadata` (match-metadata) jobs through
  `LibraryMetadataMatcher`, which already reported progress the same way.
- Two read endpoints expose progress: `scan-status` (latest job) and
  `scan-history`.

This page is the developer reference for the worker side. The admin API contract
lives in [Library Management](../admin/library-management).

## The queue is a database table — no Redis

The **transport is the `library_scan_jobs` table** introduced in step 1.1a.
There is **no Redis and no queue library** anywhere in the Phlix stack — the
table doubles as the queue, the progress store, and the history log. The worker
never touches the database directly: all access goes through
`Phlix\Media\Library\ScanJobRepository` (parameterised
`Workerman\MySQL\Connection` queries) and `LibraryManager`.

The repository's `claimNext()` is the heart of the design. It is an **atomic
conditional `UPDATE`** (`... WHERE id = ? AND status = 'queued'`) that flips the
oldest queued row to `running` and only honours the claim when the affected-row
count is ≥ 1. That single atomic operation is what makes concurrent claimers
safe (see [Double-run safety](#double-run-safety)).

A job row (the `ScanJobRepository::decodeRow()` shape) carries:

| Field | Notes |
|-------|-------|
| `id` | Job UUID. |
| `library_id` | The library being scanned. |
| `type` | The `library_scan_jobs.type` ENUM: `scan`, `rescan`, `metadata` (match-metadata), `metadata_refresh`, `prune`, `clear_metadata`, `clear_artwork`, `delete_all`. |
| `status` | `queued` → `running` → `completed` \| `failed`. |
| `items_found`, `items_updated` | Live progress: total media files (denominator) / processed (numerator) for `scan` / `rescan` / `metadata` — see [Real per-file progress](#real-per-file-progress). |
| `items_added`, `items_removed`, `items_failed` | Outcome tallies, **not** part of the streamed percentage. `items_added` / `items_failed` ride along on the sink and are stamped authoritatively by `markCompleted()`; `items_removed` is the prune count. |
| `current_path` | The file currently being processed (the progress hint); populated during a `scan` / `rescan`. |
| `error` | The exception message when `status = failed`, else `null`. |
| `queued_at`, `started_at`, `completed_at` | Lifecycle timestamps (nullable until reached). |

## The worker: `LibraryScanWorker`

`src/Media/Library/LibraryScanWorker.php` (`Phlix\Media\Library`) is the
consumer. It is autowired in `MediaServicesProvider` — its constructor takes
`ScanJobRepository` + `LibraryManager` + `LibraryMetadataMatcher` (all already
autowired) plus an optional `StructuredLogger` that defaults to the `MEDIA`
channel.

It has two public methods:

### `runOnce(): bool`

Processes **at most one** job:

1. `claimNext()` the oldest queued job. If the queue is empty (or the claim lost
   the race), return `false` — the scan engine is never touched.
2. Otherwise dispatch on `type`, passing a **progress sink** so the job row
   streams a live percentage:
   - `metadata` → `LibraryMetadataMatcher::matchLibrary($id, fn(processed, total) => …)`,
     writing `items_found`/`items_updated`;
   - `rescan` → `rescanLibrary($id, $this->scanProgressSink($jobId))`;
   - otherwise (`scan`) → `scanLibrary($id, $this->scanProgressSink($jobId))`.

   `rescanLibrary()` differs from `scanLibrary()` in one thing: it passes
   `readEveryFile: true`, which unloads the music scanner's unchanged-file skip
   index so every file is opened and tag-read. Every other scanner ignores the
   flag — none of them has a skip index. It then runs the prune pass. It does
   **not** delete items first; see
   [Scan vs Rescan](../admin/library-management#scan-vs-rescan-vs-match-metadata).
3. On success → `markCompleted()`, return `true`.
4. On any `\Throwable` → `markFailed($jobId, $e->getMessage())` + an error log,
   return `true`. A failed job is **never** marked completed.

`true` always means "a job was processed" (success or failure); `false` means
"nothing was queued". A claimed row missing a usable `id`/`library_id` is
defensively logged and skipped (returns `true`, never marked completed — it is
not a real job).

`runOnce()` is fully unit-testable with mocked collaborators and is covered by
`tests/Unit/Media/Library/LibraryScanWorkerTest.php` across every branch.

### `start(int $pollSeconds): void`

Installs the poll loop:

```php
\Workerman\Timer::add($pollSeconds, fn() => $this->runOnce());
```

It uses `Workerman\Timer` — **never a blocking `sleep()`**. (The legacy
`BackgroundDetectorWorker::runLoop()` uses `sleep()`; that is the resident-memory
violation this worker deliberately does **not** copy.) `Timer::add()` requires a
running event loop, so `start()` is the infra-untestable daemon entry — it is
kept a one-liner and is exercised only at runtime, not in unit tests.

**One job per tick.** Each Timer tick processes a single job to avoid starving
the event loop. A backlog of N jobs therefore drains in ≤ N ticks, which is fine
for the infrequent-scan workload.

## Real per-file progress

`scan` / `rescan` jobs stream a **live percentage** onto the job row — the same
shape the `metadata` (match-metadata) job already reported. The numerator is the
processed-file count and the denominator is the total media-file count, so a
polling UI can render `items_updated / items_found` plus the `current_path`.
(This corrects the original 1.1b behaviour, where `LibraryManager` emitted no
counts and the row's `items_*` / `current_path` stayed at their defaults.)

The pipeline is end-to-end:

1. **`MediaScanner::countFiles(string $path, string $type): int`** walks each
   library path **before** the scan and returns the media-file count — the
   progress denominator. The count walk is cheap (no DB, no metadata) relative
   to the scan itself.
2. **`LibraryManager::scanLibrary($id, ?callable $onProgress)`** /
   **`rescanLibrary($id, ?callable $onProgress)`** accept an optional progress
   sink. When one is supplied they pre-count via `countFiles()`, then build an
   `$onFile` callback that `MediaScanner::scan()` invokes **once per processed
   media file**; that callback increments a `processed` counter and calls
   `$onProgress($processed, $total, $currentPath)`.
3. **`LibraryScanWorker::scanProgressSink(string $jobId)`** is the worker's
   `$onProgress` implementation. It **throttles** writes: it persists at most
   one update every `PROGRESS_WRITE_EVERY` (**25**) processed files, **and**
   always on the final file, calling
   `ScanJobRepository::updateProgress($jobId, ['items_found' => $total,
   'items_updated' => $processed], $currentPath)`. Throttling keeps a large
   library from issuing one `UPDATE` per media file.
4. The **`metadata`** branch streams the same `items_found`/`items_updated`
   percentage straight from `LibraryMetadataMatcher::matchLibrary()`'s
   `(processed, total)` callback (no `current_path`).

::: warning Specialised scanners stay coarse
`LibraryManager::scanLibrary()` early-returns into the specialised
**music / photo / book / audiobook** managers (`scanMusicLibrary()`,
`scanPhotoLibrary()`, `scanBookLibrary()`, `scanAudiobookLibrary()`) **before**
the progress-sink wiring. Those paths do **not** pass `$onProgress` through, so
for those library types the `items_*` counters stay `0` and the lifecycle badge
remains the only live signal. Real per-file progress is wired for the generic
`movie` / `series` / `video` path only.
:::

The worker never fabricates counts — `items_added` / `items_removed` are not
streamed and stay `0`; only `items_found` (total) and `items_updated`
(processed), plus `current_path`, are written. `ScanJobRepository::updateProgress()`
writes only the counter keys it is handed and ignores unknown ones.

## Two run paths

`config/process.php` is the single source of truth for the worker settings, read
by **two mutually-exclusive-by-default** run paths.

### 1. Managed sibling worker (default — `start.php`)

> **This app boots through a HAND-ROLLED `start.php`, not Webman's
> `support\App::run()`.** `start.php` builds its `Worker`s and calls
> `Worker::runAll()` itself, so `config/process.php` is **not** auto-consumed by
> the framework. It is read explicitly.

Before `Worker::runAll()`, `start.php` reads `config/process.php`; for the
`library-scan` entry, **if `enabled`**, it spawns a `count`-sized `Worker` named
`phlix-library-scan` whose `onWorkerStart` builds the DI container (post-fork),
resolves `LibraryScanWorker`, and calls `->start($pollSeconds)`. So
`php start.php start` supervises the HTTP worker **and** the scan worker as one
reload-able process group.

The spawn block is **additive and guarded**: it is wrapped in
`try/catch (\Throwable)` → `trigger_error(..., E_USER_WARNING)`, so a missing or
misconfigured `config/process.php` degrades to "no managed worker" plus a
warning — it can never stop the HTTP workers from booting.

### 2. Standalone runner (isolated service)

`scripts/run-library-scan-worker.php` runs the scan worker as its **own isolated
service** — e.g. a dedicated systemd unit on a host where `start.php` serves HTTP
only. It reads the **same** `config/process.php` settings: it initialises the
coroutine runtime the same way `start.php` does (the Swoole
`Worker::$eventLoopClass` guard), builds the container, creates the single
`phlix-library-scan` worker, resolves `LibraryScanWorker` in `onWorkerStart`, and
calls `Worker::runAll()`.

### `config/process.php`

```php
return [
    'library-scan' => [
        'enabled'      => true,  // when false, start.php spawns no managed worker
        'count'        => 1,     // single claimer (claimNext is atomic anyway)
        'poll_seconds' => 5,     // Workerman\Timer poll interval
    ],
];
```

It carries **plain settings**, NOT Webman's `handler`/`constructor`
instantiation contract — that contract cannot supply this worker's DI
dependencies, and `start.php` resolves the worker from the container itself.

### Double-run safety {#double-run-safety}

::: danger Never run both spawners at once
An earlier revision of this page said running the managed worker and
`scripts/run-library-scan-worker.php` side by side was "safe". **That was wrong,
and it was corrected in the code in S96(c).**

*Claiming* is safe — `claimNext()` is an atomic conditional `UPDATE`, so at most
one claimer wins each job. The **startup reaper** is not.
`LibraryScanWorker::start()` calls `ScanJobRepository::reapStaleJobs()`, which
fails **every** `running` row in `library_scan_jobs` — no `library_id` filter and
no age guard. Booting a second consumer therefore stamps the first consumer's
in-flight job `failed` with `error = 'Interrupted by server restart'` (a lie in
that scenario) while that scan carries on unaware, because nothing re-reads the
job row mid-scan.

`count: 1` is load-bearing for the same reason and must stay `1`. Either run the
standalone script with the managed entry disabled in `config/process.php`, or run
the managed worker and not the script — never both. An age guard was considered
and rejected; see the comment block in `LibraryScanWorker::start()` for why.
:::

## The CLI is synchronous — but no longer invisible

The console command `php bin/phlix library:scan {libraryId} [--rescan] [--force]`
stays **synchronous/direct** — it calls `LibraryManager` straight through its lazy
factory and blocks until the scan finishes. It does not enqueue; only the HTTP
`scan`/`rescan` endpoints are asynchronous.

**S150 — the CLI now writes to `library_scan_jobs` too.** It used to write nothing
there, so a live CLI scan was invisible to the admin Libraries page, which kept
showing whatever the last web-enqueued job had left behind. (Measured on
production during a healing rescan: a healthy scan running ~45 minutes and
demonstrably repairing rows, while the page showed a **red `failed` badge** from a
job that had ended hours earlier. A stale `failed` badge is worse than no badge —
an absent status reads as "idle"; a stale failure reads as "the last thing that
happened, broke".)

The command now:

- mints the job id and installs its signal/shutdown handlers **before** inserting
  the row, so no signal can strand a `running` row that nothing will ever fail;
- opens a `running` row with the correct `scan` / `rescan` type via
  `ScanJobRepository::startRunningIfIdle()`, an `INSERT … SELECT … WHERE NOT
  EXISTS` that folds the "is one already in flight?" predicate into the insert
  (closing the check-then-insert race);
- streams `items_found` / `items_updated` / `current_path` through
  `ScanProgressSink` — the **same** throttled sink the worker uses, extracted so
  there is one copy. It is a static factory taking the repository, not a method on
  it, because `LibraryScanWorkerTest` mocks `ScanJobRepository` and asserts on the
  `updateProgress()` calls the sink makes; a sink built by a method on that mock
  would return `null` and those assertions would silently observe nothing;
- stamps `markCompleted()` / `markFailed()` on the success and throw paths, on
  `SIGTERM`/`SIGINT`/`SIGHUP`, and on a fatal-error shutdown.

Job tracking is **observability and must never refuse an operator's scan**: an
absent or unreachable job store degrades to the pre-S150 behaviour with a warning
on stderr.

### The CLI refuses to start when a job is already in flight

Nothing previously stopped a CLI scan and a worker scan running concurrently over
one library. Two scanners interleave find-or-create on every file, and they share
one job row's worth of UI, so the badge would report one scan's progress under the
other's counters. The command therefore exits `FAILURE` when the library has any
non-terminal (`queued`/`running`) job. `--force` overrides it, for the one case
the check cannot distinguish: a row stranded `running` by a `kill -9` or a power
loss, which no in-process handler can clean up.

Two residual behaviours, stated rather than glossed:

- `reapStaleJobs()` is unscoped and has no age guard (see
  [Double-run safety](#double-run-safety)), so a `phlix-server` restart during a
  long CLI scan marks that row `failed` while the CLI keeps running. Bounding it
  needs per-job worker ownership — a schema change, deliberately not done here.
  The failure mode is a false badge, never a lost scan or a stuck row.
- `SIGKILL` cannot be trapped by anyone, so it leaves the row `running` until the
  next server boot reaps it.

A false-`failed` row also makes the "is a job in flight?" check report *idle*, so
a second scan can start.

See the [CLI reference](../reference/cli#library-scan) for the flags and exit
codes.

## See Also

- [Library Management](../admin/library-management) — the admin scan/rescan +
  scan-status / scan-history API contract.
- [Coroutine Runtime](./coroutine-runtime) — the eventLoop / no-`sleep()` /
  no-static-state rules this worker follows.
- [Server Architecture](./architecture-server) — the Workerman bootstrap.
