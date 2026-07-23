# DLNA Server

The DLNA Server page (`/admin/dlna-server`) in the admin console shows whether the
built-in UPnP **ContentDirectory** (CDS) browse service is currently serving and lets
an admin turn it on or off on demand. The DLNA server announces this Phlix instance on
the local network as a UPnP MediaServer, enabling DLNA-certified devices (smart TVs,
game consoles, network media players) to discover and stream media from the Phlix
library automatically.

::: warning The toggle controls the ContentDirectory browse service — default OFF
Start/Stop here writes the `dlna.cds_enabled` setting, which gates the SOAP endpoints a
control point uses to **list and stream your library**. It ships **disabled** because
DLNA/UPnP has no concept of credentials — enabling it lets any device on the local
network browse and stream the entire library with **no authentication**. This is
distinct from the SSDP advertiser (`dlna.enabled`, default ON), which only makes the
server appear in a TV's source list. See [DLNA Server (advanced)](../advanced/dlna) and
`config/dlna.php` for the full rationale.
:::

Because the ContentDirectory routes are registered once per worker at boot (gated on the
effective `dlna.cds_enabled` value), the toggle does not flip a live in-memory flag — it
**persists the setting and schedules a graceful reload** so every worker re-reads it and
registers or drops the routes. There is therefore a brief transitional window between
saving the change and it taking effect across all workers (see `reloadPending` below).

::: tip Enabling the CDS does not expose it to everyone
Even when `dlna.cds_enabled` is on, the browse/stream routes are guarded by an **IP
allowlist** — **LAN-only by default** (`dlna.restrict_to_lan = true`, `dlna.allowed_cidrs
= []`). An empty allowlist is never "allow all". Configure who may reach DLNA under
**Settings → Subsystem** (`dlna.allowed_cidrs`, `dlna.restrict_to_lan`); see
[DLNA access control](./server-settings#dlna-access-control)
and [DLNA Server (advanced) → Access control](../advanced/dlna#access-control).
:::

---

## Access

Navigate to **`/admin/dlna-server`** in the admin console sidebar (entry: **DLNA
Server**, positioned in the Admin section). Requires admin authentication.

---

## What it does

The page has a single **status card** showing:

- **Running state** — a green indicator (🟢 Running) or red indicator (🔴 Stopped)
  reflecting whether **this worker** is actually serving the ContentDirectory routes
  right now (`running`).
- **Enabled state** — the persisted intent (`enabled`), i.e. whether the setting says the
  service should be on. This can differ from **Running** while a change propagates.
- **Applying…** — a transitional indicator when `reloadPending` is true (`enabled` and
  `running` disagree because a saved change has not yet been applied by a worker reload).
- **Friendly name** — the DLNA device name broadcast on the network (e.g. `Phlix
  Media Server`).

Below the status card are two action buttons:

| Button | Behaviour |
|--------|-----------|
| **Start** | `POST /api/v1/admin/dlna/start` → persists `dlna.cds_enabled = true` + schedules a graceful reload → success toast ("workers are reloading to apply it") |
| **Stop** | `POST /api/v1/admin/dlna/stop` → persists `dlna.cds_enabled = false` + schedules a graceful reload → success toast |

Both actions are idempotent: calling Start when already enabled (or Stop when already
disabled) returns `409` and makes no change. If the settings store is unavailable the
endpoint returns `503`.

<!-- Screenshot: admin-dlna-server.png -->

---

## API contract

All three endpoints are gated by `AdminMiddleware` (unauthenticated → `401`,
non-admin → `403`).

### Get status

```http
GET /api/v1/admin/dlna/status
```

Returns the current ContentDirectory state as a **flat, camelCase** payload (no
`{success, data}` envelope):

```json
{
  "enabled": true,
  "running": true,
  "reloadPending": false,
  "serverId": "uuid:phlix-server-abc123",
  "friendlyName": "Phlix Media Server",
  "port": 8200,
  "baseUrl": "http://192.168.1.100:8200"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | `bool` | Persisted intent — the effective `dlna.cds_enabled` setting, read live from the store |
| `running` | `bool` | Whether **this worker** is actually serving the ContentDirectory routes right now (frozen at its boot) |
| `reloadPending` | `bool` | `enabled !== running` — a saved change is not yet applied by a worker reload ("applying…") |
| `serverId` | `string\|null` | The UPnP device UDN (`null` when no `CdsServer` is wired) |
| `friendlyName` | `string\|null` | The UPnP device friendly name announced on the network |
| `port` | `int\|null` | The DLNA HTTP port |
| `baseUrl` | `string\|null` | The base URL used in DLNA announcements |

`serverId`/`friendlyName`/`port`/`baseUrl` are `null` when the container has no `CdsServer`
registration (degraded DI); `enabled`/`running`/`reloadPending` stay truthful regardless.

### Start

```http
POST /api/v1/admin/dlna/start
```

Persists `dlna.cds_enabled = true` and schedules a graceful reload so the ContentDirectory
routes come up across every worker. Returns `200` on success; `409` if already enabled;
`503` if the settings store is unavailable; `500` if the persist fails.

```json
{
  "success": true,
  "enabled": true,
  "reloadScheduled": true,
  "message": "DLNA content directory enabled; workers are reloading to apply it."
}
```

`reloadScheduled` is `false` when no automatic reload could be signalled (e.g. running
outside the Workerman master); the message then asks the operator to restart manually.

### Stop

```http
POST /api/v1/admin/dlna/stop
```

Persists `dlna.cds_enabled = false` and schedules a graceful reload so the ContentDirectory
routes are dropped across every worker. Same status codes and response shape as Start
(`409` when already disabled).

```json
{
  "success": true,
  "enabled": false,
  "reloadScheduled": true,
  "message": "DLNA content directory disabled; workers are reloading to apply it."
}
```

### Error responses

| Status | Meaning |
|--------|---------|
| `401` | Not authenticated |
| `403` | Not an admin |
| `409` | Conflict — already enabled (start) or already disabled (stop); no change made |
| `500` | Internal error persisting the setting |
| `503` | Settings store unavailable — cannot change CDS state |

---

## Architecture

### Backend

| File | Purpose |
|------|---------|
| `src/Server/Http/Controllers/Dlna/AdminDlnaServerController.php` | Handles `status()`, `start()`, `stop()` — reads the persisted `dlna.cds_enabled` via `SettingsRepository`, reports per-worker route state via `EffectiveConfig::file('dlna')`, and schedules the reload |
| `src/Server/Http/Controllers/Admin/AdminRestartController.php` | `scheduleGracefulReload(): bool` — defers a one-shot SIGUSR2 to the Workerman master (reused by Start/Stop) |
| `src/Server/Core/Application.php` | Wires the three routes under `AdminMiddleware` via `loadDlnaAdminRoutes()`, best-effort injecting the `SettingsRepository` + `AdminRestartController` + `CdsServer` setters; `loadCdsRoutes()` registers the ContentDirectory routes per worker at boot, gated on `dlna.cds_enabled` |

### Frontend

| File | Purpose |
|------|---------|
| `admin-ui/src/api/dlnaServer.ts` (`DlnaServerApi`) | Typed wrappers for all three endpoints; throws `ApiError` on non-2xx |
| `admin-ui/src/api/dlnaServer.test.ts` | 8 unit tests — all 3 methods, 409 and 500 error cases, already-running / not-running |
| `admin-ui/src/pages/DlnaServerPage.tsx` | React page component — status card, Start/Stop buttons with loading state, toast feedback |
| `admin-ui/src/pages/DlnaServerPage.test.tsx` | 10 component tests — all render states, action states, toast feedback, error toast, info toast (409 no-op) |

### Design notes

- **Start/Stop persist a setting and reload, they do not flip a live flag.** The
  ContentDirectory routes are frozen at each worker's `onWorkerStart`, so an honest toggle
  must (1) persist `dlna.cds_enabled` via `SettingsRepository::set(..., 'bool')` and
  (2) schedule a graceful SIGUSR2 reload so every worker re-reads the setting. The reload
  is a Workerman one-shot timer + `posix_kill` probe — no blocking I/O in the request path.
- A best-effort immediate SSDP announce/teardown is attempted on the request-handling
  worker to avoid a needless multicast delay; its failure is non-fatal because the reload
  re-establishes the authoritative state.
- `useToast()` is destructured as `const { push: pushToast } = useToast()` — the
  stable `push` reference prevents unnecessary re-renders when `pushToast()` is
  called from inside a `useCallback`.
- Buttons show `aria-busy={acting}` and are disabled during the in-flight request.
- The page handles `409` from `start()`/`stop()` gracefully with an **info toast**
  ("Already enabled" / "Already disabled") without treating it as an error.
- The settings store and reload signaller are injected via `setSettingsRepository()` /
  `setRestartController()`; `CdsServer` via `setCdsServer()`. When the settings store is
  unwired, `start()`/`stop()` return `503` and `status()` falls back to this worker's
  frozen route state so it stays truthful even in a degraded DI state.

---

## Coverage (Vitest)

| File | Statements |
|------|------------|
| `src/api/dlnaServer.ts` | **100%** |
| `src/pages/DlnaServerPage.tsx` | ≥80% |

Overall SPA: 18 passing tests covering all three API methods and all page
render/action states.

---

## See Also

- [Services](./services) — Trakt.tv / Last.fm integration management
- [Dashboard](./dashboard) — visual admin dashboard overview
- [DLNA Server (advanced)](../advanced/dlna) — full DLNA/UPnP protocol documentation
