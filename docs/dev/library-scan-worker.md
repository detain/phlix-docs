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
| `type` | `scan`, `rescan`, or `metadata` (match-metadata). |
| `status` | `queued` → `running` → `completed` \| `failed`. |
| `items_found`, `items_updated` | Live progress: total media files (denominator) / processed (numerator) for `scan` / `rescan` / `metadata` — see [Real per-file progress](#real-per-file-progress). |
| `items_added`, `items_removed` | Defined on the row but **not** part of the streamed progress; stay `0`. |
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

### Double-run safety

The two run paths are mutually exclusive by default, but **running both at once
is safe**. Because `claimNext()` is an atomic conditional `UPDATE` and each
worker is `count: 1`, at most one claimer wins each job — there is no
double-processing even if the managed worker and the standalone service run side
by side. This is a deliberate property, not a coincidence.

## The CLI stays synchronous

The console command `php bin/phlix library:scan {libraryId} [--rescan]` is
**unchanged** and stays **synchronous/direct** — it calls `LibraryManager`
straight through its lazy factory and blocks until the scan finishes. An operator
running the CLI wants the synchronous behaviour, not an enqueue. Only the HTTP
`scan`/`rescan` endpoints became asynchronous. See the
[CLI reference](../reference/cli#library-scan).

## See Also

- [Library Management](../admin/library-management) — the admin scan/rescan +
  scan-status / scan-history API contract.
- [Coroutine Runtime](./coroutine-runtime) — the eventLoop / no-`sleep()` /
  no-static-state rules this worker follows.
- [Server Architecture](./architecture-server) — the Workerman bootstrap.
