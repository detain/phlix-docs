---
title: Library Scan Worker
description: The async worker that drains the library_scan_jobs queue off the HTTP path, its run paths, config/process.php settings, and the coarse-progress model
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
  `LibraryManager` scan, recording the lifecycle as it goes.
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
| `type` | `scan` or `rescan`. |
| `status` | `queued` → `running` → `completed` \| `failed`. |
| `items_found`, `items_added`, `items_updated`, `items_removed` | Progress counters — **always `0` in this release** (see [Coarse progress](#coarse-progress-is-intentional)). |
| `current_path` | Server filesystem path; `null` in this release. |
| `error` | The exception message when `status = failed`, else `null`. |
| `queued_at`, `started_at`, `completed_at` | Lifecycle timestamps (nullable until reached). |

## The worker: `LibraryScanWorker`

`src/Media/Library/LibraryScanWorker.php` (`Phlix\Media\Library`) is the
consumer. It is autowired in `MediaServicesProvider` — its constructor takes
`ScanJobRepository` + `LibraryManager` (both already autowired) plus an optional
`StructuredLogger` that defaults to the `MEDIA` channel.

It has two public methods:

### `runOnce(): bool`

Processes **at most one** job:

1. `claimNext()` the oldest queued job. If the queue is empty (or the claim lost
   the race), return `false` — the scan engine is never touched.
2. Otherwise run `rescanLibrary($id)` when `type === 'rescan'`, else
   `scanLibrary($id)`.
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

## Coarse progress is intentional

`LibraryManager::scanLibrary()` / `rescanLibrary()` return `void` and emit **no
per-item counts** — they just call `MediaScanner::scan()` per path. So the worker
records the **honest lifecycle only**: `queued → running → completed/failed`. The
`items_*` counters and `current_path` stay at their defaults (`0` / `null`) in
this release.

This is by design. The worker does **not** fabricate counts, and step 1.1b does
**not** expand `LibraryManager`/`MediaScanner` to emit per-file progress. A future
step can wire real counters through `ScanJobRepository::updateProgress()` /
`current_path` (the 1.1a repository already supports them). Until then, a polling
UI should treat scan-status as a **lifecycle indicator** (queued / running /
completed / failed), not a live per-file progress bar.

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
