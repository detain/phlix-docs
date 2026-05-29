# DLNA Server

The DLNA Server page (`/admin/dlna-server`) in the admin console shows whether the
built-in UPnP MediaServer is currently running and lets an admin start or stop it on
demand. The DLNA server announces this Phlix instance on the local network as a
UPnP MediaServer, enabling DLNA-certified devices (smart TVs, game consoles,
network media players) to discover and stream media from the Phlix library
automatically.

---

## Access

Navigate to **`/admin/dlna-server`** in the admin console sidebar (entry: **DLNA
Server**, positioned in the Admin section). Requires admin authentication.

---

## What it does

The page has a single **status card** showing:

- **Running state** — a green indicator (🟢 Running) or red indicator (🔴 Stopped) with
  the current state label.
- **Friendly name** — the DLNA device name broadcast on the network (e.g. `Phlix
  Media Server`).
- **Enabled state** — whether the DLNA server is configured and able to start.

Below the status card are two action buttons:

| Button | Behaviour |
|--------|-----------|
| **Start** | `POST /api/v1/admin/dlna/start` → spinner during call → success toast → status refreshes to Running |
| **Stop** | `POST /api/v1/admin/dlna/stop` → spinner during call → success toast → status refreshes to Stopped |

When the DLNA server is not configured at all, the page shows an informational
message and both buttons are hidden.

<!-- Screenshot: admin-dlna-server.png -->

---

## API contract

All three endpoints are gated by `AdminMiddleware` (unauthenticated → `401`,
non-admin → `403`).

### Get status

```http
GET /api/v1/admin/dlna/status
```

Returns the current DLNA server state:

```json
{
  "success": true,
  "data": {
    "running": true,
    "enabled": true,
    "friendly_name": "Phlix Media Server",
    "uptime_seconds": 3600
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `running` | `bool` | Whether the DLNA MediaServer process is currently active |
| `enabled` | `bool` | Whether the server is configured and able to start |
| `friendly_name` | `string` | The UPnP device friendly name announced on the network |
| `uptime_seconds` | `int` | Seconds since the server was started (absent when stopped) |

When DLNA is not configured at all, `enabled` is `false` and `running` is `false`.

### Start

```http
POST /api/v1/admin/dlna/start
```

Starts the DLNA MediaServer. Returns `200` on success, `409` if already running.

```json
{ "success": true, "message": "DLNA server started." }
```

### Stop

```http
POST /api/v1/admin/dlna/stop
```

Stops the DLNA MediaServer. Returns `200` on success, `409` if not running.

```json
{ "success": true, "message": "DLNA server stopped." }
```

### Error responses

| Status | Meaning |
|--------|---------|
| `401` | Not authenticated |
| `403` | Not an admin |
| `409` | Conflict — server already running (start) or already stopped (stop) |
| `500` | Internal error starting/stopping the server |

---

## Architecture

### Backend

| File | Purpose |
|------|---------|
| `src/Server/Http/Controllers/Dlna/AdminDlnaServerController.php` | Handles `status()`, `start()`, `stop()` — wires `CdsServer` from the DI container and delegates to `DlnaServer` |
| `src/Server/Core/Application.php` | Wires the three routes under `AdminMiddleware` via `loadDlnaAdminRoutes()` |

### Frontend

| File | Purpose |
|------|---------|
| `admin-ui/src/api/dlnaServer.ts` (`DlnaServerApi`) | Typed wrappers for all three endpoints; throws `ApiError` on non-2xx |
| `admin-ui/src/api/dlnaServer.test.ts` | 8 unit tests — all 3 methods, 409 and 500 error cases, already-running / not-running |
| `admin-ui/src/pages/DlnaServerPage.tsx` | React page component — status card, Start/Stop buttons with loading state, toast feedback |
| `admin-ui/src/pages/DlnaServerPage.test.tsx` | 10 component tests — all render states, action states, toast feedback, error toast, info toast (409 no-op) |

### Design notes

- `useToast()` is destructured as `const { push: pushToast } = useToast()` — the
  stable `push` reference prevents unnecessary re-renders when `pushToast()` is
  called from inside a `useCallback`.
- Buttons show `aria-busy={acting}` and are disabled during the in-flight request.
- The page handles `409` from `start()`/`stop()` gracefully with an **info toast**
  ("Already running" / "Already stopped") without treating it as an error.
- `CdsServer` is injected via `setCdsServer()` in the controller — if the container
  has no `CdsServer` registration the controller returns `enabled: false` gracefully.

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
