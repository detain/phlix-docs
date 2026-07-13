---
title: Relay Tuning
description: Rate limiting, per-user bandwidth quotas, and relay observability metrics for the Phlix Hub
---

# Relay Tuning

The Hub protects its abuse-prone entry points with per-surface rate limiters, enforces
per-user relay bandwidth quotas and a concurrent-stream cap, and records relay observability
metrics you can query for capacity planning. All of it is operator-configurable.

## Rate limiting

Each surface has its **own** rate limiter (a single login-grade limiter is wrong for everything
but login). Five surfaces use a per-worker in-memory limiter; **`login` alone is shared and
DB-backed** (see [Per-worker vs global](#per-worker-vs-global-important) below). The `rate_limit`
section of `config/server.php` sets each surface's `{max, window}` plus a shared key-count `cap`;
every value is env-overridable. Absent keys fall back to the defaults below.

| Env override | Default (`max` / `window` s) | Surface / key |
| --- | --- | --- |
| `PHLIX_HUB_RATELIMIT_CAP` | `10000` | Max distinct keys tracked per limiter (memory ceiling) |
| `PHLIX_HUB_RATELIMIT_LOGIN_MAX` / `_LOGIN_WINDOW` | `5` / `900` | Login attempts, keyed by identity |
| `PHLIX_HUB_RATELIMIT_PROXY_MAX` / `_PROXY_WINDOW` | `600` / `60` | Relay proxy, keyed `proxy:{userId}` (checked after the auth gate; generous so normal HLS/DASH segment bursts never trip) |
| `PHLIX_HUB_RATELIMIT_HEARTBEAT_MAX` / `_HEARTBEAT_WINDOW` | `30` / `60` | Server heartbeat, keyed `heartbeat:{serverId}` (after the enrollment JWT is validated) |
| `PHLIX_HUB_RATELIMIT_JWKS_MAX` / `_JWKS_WINDOW` | `120` / `60` | `/.well-known/jwks.json`, keyed `jwks:{ip}` |
| `PHLIX_HUB_RATELIMIT_RELAY_CONNECT_MAX` / `_RELAY_CONNECT_WINDOW` | `10` / `60` | :8802 server relay-connect handshake (WebSocket), keyed by IP |
| `PHLIX_HUB_RATELIMIT_CLIENT_MOUNT_MAX` / `_CLIENT_MOUNT_WINDOW` | `30` / `60` | :8803 client-mount handshake (WebSocket), keyed by IP (before auth) |

### What a client sees when it trips

- **HTTP surfaces** (proxy, heartbeat, JWKS, login) return **429 Too Many Requests** with a
  `Retry-After` header and body `{"error":"Too Many Requests","code":"rate_limited"}`.
- **WebSocket handshakes** (:8802 relay-connect, :8803 client-mount) can't send an HTTP status
  after the upgrade, so they **reject the connection with WS close code `1013`** (Try Again
  Later). The peer should back off and retry.

### Per-worker vs global (important)

Most thresholds are enforced **per worker process**, not globally:

- The **:8802 and :8803 relay workers are `count=1`**, so for `relay_connect` and `client_mount`
  the per-worker limit *is* the global limit — these are the primary DoS surfaces, so this is
  intentional.
- **`proxy`, `heartbeat`, and `jwks`** run across `HUB_WORKERS` HTTP workers (default 2), so
  their effective soft-global limit is roughly `max × HUB_WORKERS`. Size your override
  accordingly, or reduce `HUB_WORKERS`. A strict global cap for these would require a shared
  store (Redis/DB) and is planned future work.

**`login` is the exception — it is genuinely global.** Its bucket is backed by the shared
`login_rate_limit` DB table (migration `040_login_rate_limit`) — the **one** DB-backed profile —
so every HTTP worker shares one counter per key. This means the **5 attempts / 900 s login budget
is actually 5/900**, not the `~5 × HUB_WORKERS / 900` (≈20/900 with `HUB_WORKERS=4`, where the
first 429 landed near attempt ~9) it was when `login` was worker-local like the other surfaces.
This closes the one surface where the per-worker weakening was a real brute-force concern
(HB-4.6 "Option B"). The `login_rate_limit` table holds one row per bucket key (an
`INSERT … ON DUPLICATE KEY UPDATE` counter with a TTL-driven `reset_at`); a bounded sweep on each
recorded attempt reclaims expired rows, so it stays small with no operator maintenance.

::: tip Do not set `PROXY_MAX` too low
The proxy limiter is keyed per user and sized generously on purpose: a single HLS/DASH playback
session fires many short segment requests in a burst. A too-low `PROXY_MAX` will break normal
playback. Test with a real multi-segment stream before lowering it.
:::

## Per-user bandwidth quotas & concurrent-stream cap

The relay proxy meters the **real streamed bytes** delivered to each client and rolls them up
per user (table `relay_user_quotas`). Two byte caps and one concurrency cap are enforced; `0`
means unlimited (the default for existing rows):

| Column | Meaning | Enforcement |
| --- | --- | --- |
| `quota_bytes_in` | Monthly download cap (bytes streamed **to** the user) | Over cap → **503** `quota.exceeded` at proxy admission |
| `quota_bytes_out` | Monthly upload cap (request bytes **from** the user) | Over cap → **503** `quota.exceeded` |
| `max_concurrent_streams` | Max simultaneous relay streams for the user | Over cap → **503** `stream.limit`, request never occupies a slot |

::: warning Concurrent-stream cap is per HTTP worker
The concurrent-stream counter is held in memory in the HTTP worker that admits the stream, so
the cap is enforced **per worker** — the effective soft-global limit is
`max_concurrent_streams × HUB_WORKERS`. A strict global cap needs a shared store (future work).
Byte-cap accounting, by contrast, is persisted to the DB and is global.
:::

### Managing quotas over HTTP

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/me/bandwidth` | Any authenticated user | Read your own current-period usage + caps |
| `GET` | `/api/v1/admin/users/{id}/bandwidth` | Admin | Read any user's usage + caps |
| `PUT` | `/api/v1/admin/users/{id}/quota` | Admin | Set a user's download/upload byte caps + concurrent-stream cap |

`PUT .../quota` validates its body (non-negative integers; byte caps ≤ 1 PiB;
`max_concurrent_streams` ≤ 1000; `0` = unlimited) and records the change in the audit log
(`user.quota.set`). The response is the user's rollup
(`{user_id, bytes_in, bytes_out, quota_bytes_in, quota_bytes_out, max_concurrent_streams}`) —
a zeroed rollup with unlimited caps if the user has no row yet.

Requires migration `038_relay_user_quotas_concurrency` (adds `max_concurrent_streams`).

## Relay observability metrics

The Hub records relay metrics into the time-bucketed `metrics_rollup` table (there is **no**
`/metrics` scrape endpoint — see [Monitoring & Alerting](./monitoring-alerting)). Query them
with SQL for capacity planning and alerting:

| Column | Type | Meaning |
| --- | --- | --- |
| `relay_pending_requests` | gauge | In-flight proxied requests |
| `relay_reply_drops` | counter | Reply frames dropped (no matching in-flight request) |
| `relay_error_503` | counter | 503s returned by the proxy (offline server / no tunnel) |
| `relay_error_504` | counter | 504s (relay reply timeouts) |
| `relay_cancels` | counter | `HTTP_CANCEL` frames the Hub sent a server after a client abandoned a request |
| `relay_decode_buffer_bytes` | gauge | Frame-decoder buffer high-water |
| `relay_latency_h_le_10 … _h_gt_5000` | histogram | Per-request latency buckets (first-byte + total observations) |

`relay_cancels` (migration `039_relay_cancel_metric`) counts cancellations sent when a browser
abandons an in-flight stream. The `HTTP_CANCEL = 0x12` frame is advisory (hub → server only, no
response); the server-side stop-work half lives in `phlix-server`.

Metrics are collected per worker and flushed on a throttle; the DB retention prune runs from the
single `count=1` relay worker only (so retention DELETEs don't multiply across workers).

## See Also

- [Network](./network) — network configuration
- [Monitoring & Alerting](./monitoring-alerting) — observability, health probe, log shipping
- [Capacity Planning](./capacity-planning) — hardware sizing and bandwidth math
- [Abuse Handling](./abuse-handling) — takedowns, GDPR, pausing/removing servers
