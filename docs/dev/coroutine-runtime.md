# Coroutine runtime (Workerman 5 + Swoole)

> **Audience:** new contributors writing handlers, middleware, controllers,
> or background workers in `phlix-server` and `phlix-hub`.
>
> **Tl;dr.** Both daemons run on Workerman 5 with the Swoole eventLoop
> driver and `Swoole\Runtime::enableCoroutine(SWOOLE_HOOK_ALL)`. **Never
> use `exit`/`die`, never `sleep()`, and never store per-request data in
> `static` properties / `global` / `$GLOBALS`.** Use
> `Phlix\Server\Http\RequestContext` (server) or
> `Phlix\Hub\Http\RequestContext` (hub) for per-request state. Both wrap
> `support\Context`, which the eventLoop isolates per coroutine.

This page covers the runtime model introduced in step 0.2 of the UI
coverage plan. The entry-point Swoole hook landed in step **0.2a**
([`phlix-server` PR #126](https://github.com/detain/phlix-server/pull/126));
the `support\Context` migration + tests + bench + this doc landed in step
**0.2b** (server) and step **0.2c** (hub).

---

## 1. What the runtime does

`phlix-server/start.php` and `phlix-hub/start.php` perform this dance
**before any `Worker` is instantiated**:

```php
if (extension_loaded('swoole')) {
    Worker::$eventLoop = \Workerman\Events\Swoole::class;
    \Swoole\Runtime::enableCoroutine(SWOOLE_HOOK_ALL);
} else {
    trigger_error(
        'Swoole extension not detected — coroutine runtime will not be active. Install ext-swoole to enable.',
        E_USER_WARNING
    );
}
```

What that buys us:

| Setting | Effect |
|---|---|
| `Worker::$eventLoop = \Workerman\Events\Swoole::class` | Workerman uses Swoole's reactor instead of its own select-based loop. Required for coroutines. |
| `Swoole\Runtime::enableCoroutine(SWOOLE_HOOK_ALL)` | PHP's blocking I/O (`file_get_contents`, `curl_exec`, `PDO`, `sleep`/`usleep`/`time_nanosleep`, DNS, sockets, streams, …) is transparently rewritten to yield to the coroutine scheduler instead of blocking the worker thread. |
| Per-request handlers in coroutines | Concurrent requests on the same worker can interleave; a slow webhook fetch in request A no longer stalls request B. |

The graceful-fallback `else` branch keeps `composer install` + the test
suite working on dev hosts that haven't compiled `ext-swoole` yet. Once
`ext-swoole` is missing, the daemon degrades to single-blocking-request
behavior **per worker** — correctness is preserved, throughput drops.

---

## 2. Where it's wired

| Repo | File | Lines |
|---|---|---|
| `phlix-server` | `start.php` | ~48-58 (eventLoop + hook in master) |
| `phlix-server` | `public/index.php` | ~22-28 (coroutine hook for the CGI-style fallback) |
| `phlix-hub` | `start.php` | bootstrap block at the top — eventLoop + hook in master |

The CI/install side (load `swoole` + `uv` in the GitHub workflow and in
`scripts/install.sh`) lands in **step 0.3**. The Docker images already
build both extensions; see `phlix-server/docker/README.md` for the
canonical Swoole/uv build flags.

---

## 3. The no-static-state rule

The single most common way to break a resident-memory PHP daemon is to
stash per-request data on a `static` property, a `global`, or
`$GLOBALS`. Under PHP-FPM that "works" by accident: each request gets a
fresh process. Under Workerman + coroutines, every worker handles many
requests and many requests can be in flight at once on the same worker.

A `static` property is a **shared variable** across all of them.

### What "per-request state" means

- The currently-authenticated user-id.
- Tenant / org / locale for the current request.
- Trace-id / correlation-id for log enrichment.
- The current request's `Locale` for `symfony/translation`.
- Pretty much anything you'd previously have plucked off `$_SERVER`,
  `$_REQUEST`, or `$GLOBALS`.

### What you do instead

Both daemons provide a typed wrapper around `support\Context`, one per
repo, that lives alongside the rest of the HTTP layer:

```php
// phlix-server
use Phlix\Server\Http\RequestContext;

// In AdminMiddleware — publish the value:
RequestContext::setUserId($request->userId);

// In a downstream admin controller or service — read it:
$userId = RequestContext::getUserId();
if ($userId === null) {
    // anonymous — fall back to whatever your service expects
}
```

```php
// phlix-hub
use Phlix\Hub\Http\RequestContext;

// In AuthMiddleware — publish the value:
RequestContext::setUserId($claims->sub);

// In a downstream hub controller or service — read it:
$userId = RequestContext::getUserId();
```

Both wrappers expose the same four methods (`setUserId`, `getUserId`,
`hasUserId`, `clearUserId`) and use namespaced context keys
(`phlix.userId` on the server, `phlix.hub.userId` in the hub) so they
cannot collide with each other or with webman's own internal keys
(`context.onDestroy`, etc.).

If you need to publish per-request data that ISN'T the user-id (a
correlation-id, a tenant id, …), call `support\Context::set/get`
directly with a `phlix.*` / `phlix.hub.*` namespaced key — and consider
adding a typed helper method to `RequestContext` if the call sites
start to multiply. Premature abstraction is just as bad as stringly-typed
code, but more than three call sites for the same key is the threshold.

### What Context actually is

`support\Context` is a thin alias for `Workerman\Coroutine\Context`,
which picks an isolation driver at boot based on the active eventLoop:

| eventLoop | Context driver | Isolation unit |
|---|---|---|
| `Workerman\Events\Swoole` | `Workerman\Coroutine\Context\Swoole` | Swoole coroutine id |
| `Workerman\Events\Swow` | `Workerman\Coroutine\Context\Swow` | Swow coroutine id |
| (anything else) | `Workerman\Coroutine\Context\Fiber` | PHP Fiber (`Fiber::getCurrent()`) |

In all three modes, **each coroutine/fiber gets its own bag of values**.
The eventLoop destroys the bag when the coroutine exits, so you don't
have to remember to clean up.

The Fiber driver is what the PHPUnit test suite uses, so you can write
isolation tests today without ext-swoole loaded (see
`tests/Unit/Server/Coroutine/ContextIsolationTest.php` in the server and
`tests/Unit/Coroutine/ContextIsolationTest.php` in the hub).

---

## 4. Forbidden APIs

These are correctness bugs under the coroutine runtime. CI does not yet
ban them statically; reviewers MUST catch them.

| Forbidden | Why | Use instead |
|---|---|---|
| `exit;` / `die();` in a handler | Kills the entire worker, not just the request. Other in-flight requests on the same worker die too. | Return a `Response` (or throw, and let the exception handler turn it into a 5xx). |
| `sleep($s);` / `usleep($us);` / `time_nanosleep()` not under SWOOLE_HOOK_ALL | Pre-hook these block the thread. With `SWOOLE_HOOK_ALL` they yield, but **only inside a coroutine**. In an entry-point script or a non-coroutine context they still block. | `Workerman\Timer::sleep($seconds)` — always yields, always safe. |
| `protected static $foo;` holding request data | Trampled by the next request on the same worker; visible from other coroutines on the same worker. | `RequestContext::setUserId(...)` / `Context::set('your.key', $value)`. |
| `global $foo;` referencing per-request data | Same as above. | Same as above. |
| `$GLOBALS['foo']` for per-request data | Same as above. | Same as above. |
| Long-running blocking work inline in an HTTP handler | Holds the coroutine slot; under load you starve the worker. | Push to a queue (`webman/redis-queue`) or a dedicated worker process (`config/process.php`). |

The native PHP convention `global $http_response_header;` (used by
`file_get_contents()` to expose response headers) is **not** per-request
state in our sense — it's a return channel for an immediate function
call. It's allowed.

Genuine singletons (a logger instance bound at boot, a config reader
loaded once) are also fine on a `static` property — they don't hold
per-request data.

---

## 5. The graceful-fallback path

If `ext-swoole` is not loaded, both daemons:

1. Emit a single `E_USER_WARNING` at boot:
   `"Swoole extension not detected — coroutine runtime will not be active. Install ext-swoole to enable."`
2. Skip `Worker::$eventLoop = \Workerman\Events\Swoole::class`.
3. Skip `Swoole\Runtime::enableCoroutine(SWOOLE_HOOK_ALL)`.
4. Boot Workerman with its default select-based loop. Requests work,
   throughput drops, and `support\Context` falls back to the Fiber
   driver (which still isolates per-fiber if anything spawns them).

Operators must install `ext-swoole` for production. The install-script
work in step 0.3 makes this idempotent + automated.

---

## 6. Verifying concurrency

The minimal smoke-test bench lives at
`phlix-server/scripts/bench/coroutine_bench.php`. It fires N coroutines
each running a `time_nanosleep(100ms)` (hooked under SWOOLE_HOOK_ALL,
so it yields). With N=4, a serialized run would take ~400 ms; the
coroutine-scheduled run takes ~100-120 ms. The script exits 0 on pass,
1 on fail (concurrent > 1.5× serial), 2 on skip (no ext-swoole).

```bash
# from phlix-server/
php scripts/bench/coroutine_bench.php
# expected:
#   [bench] PASS — concurrent  ~102 ms ≤ threshold  ~150 ms (speedup ≈ 3.9x vs serial)
```

The heavier `scripts/bench/concurrent_streams.php` exercises a live HLS
endpoint and needs a running server + media-id — useful for staging,
overkill for CI.

---

## 7. Checklist for new contributors

Before merging any PR touching `src/Server/Http/`, `src/Server/Core/`,
or `phlix-hub/src/Http/`:

- [ ] No `exit` / `die` in handlers (or anywhere else the worker
  reaches).
- [ ] No native `sleep` / `usleep` / `time_nanosleep` outside a
  coroutine context. Prefer `Workerman\Timer::sleep`.
- [ ] No `protected static $` / `private static $` / `public static $`
  holding per-request data. Singletons (logger, config) are fine.
- [ ] No `global $` / `$GLOBALS[...]` for per-request data.
- [ ] Long jobs (scans, transcodes, recordings, backups, large
  notification fan-out) run in a queue or a dedicated worker
  process — never inline in an HTTP handler.
- [ ] All new HTTP / DB / Redis I/O is non-blocking. Use
  `workerman/http-client` for outgoing HTTP, the existing async DB
  pool for queries, and `webman/redis ~2.1` for Redis.
- [ ] If you add a new piece of per-request state, publish it via the
  repo-appropriate `RequestContext` wrapper (`Phlix\Server\Http\RequestContext`
  in the server, `Phlix\Hub\Http\RequestContext` in the hub) — not on a
  `static` somewhere.

---

## 8. Related reading

- `phlix-server/CHANGELOG.md` `[Unreleased]` — step 0.2 entries.
- `phlix-hub/CHANGELOG.md` `[Unreleased]` — step 0.2c entry.
- `PHLIX_UI_PLAN.md` — "Runtime & async (cross-cutting)" section.
- `steps/0.2-coroutine-runtime.md` — the canonical step spec with
  acceptance criteria and verification commands.
- Webman docs (Chinese, more complete): <https://www.workerman.net/doc/webman/components/context.html>
- Workerman 5 release notes: <https://www.workerman.net/doc/workerman/upgrade.html>
- Swoole runtime hook reference: <https://wiki.swoole.com/en/#/runtime>
