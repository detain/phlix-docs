# Remote Access

The Remote Access page (`/admin/remote-access`) in the admin console provides four
collapsible sections for managing the server's remote access capabilities: **Hub
Pairing** (connection to a Phlix Hub instance), **Subdomain** (claimable HTTPS
endpoint via Hub), **Relay Tunnel** (fallback connectivity when direct connection
is unavailable), and **Port Forward** (UPnP/NAT-PMP port mapping on the LAN).

---

## Access

Navigate to **`/admin/remote-access`** in the admin console sidebar (entry:
**Remote Access**, positioned in the Admin section). Requires admin authentication.
All four sections are collapsed by default on page load; click a section heading
to expand it.

---

## What it does

The page renders four independent collapsible sections. Each shows a summary
line (e.g. "Paired (srv-123)" or "Not paired") in the collapsed header and a
detail card in the expanded body.

| Section | Summary shows | Actions available (expanded) |
|---------|---------------|------------------------------|
| **Hub Pairing** | Pairing state + hub ID | Pair, Unenroll, Send Heartbeat |
| **Subdomain** | Claim state + subdomain or "Not claimed" | Claim, Release |
| **Relay Tunnel** | Connection state + latency | Enable, Disable, Ping |
| **Port Forward** | Enabled state | Enable, Disable |

All action buttons set `aria-busy` and disable during the in-flight request.
Success or error is surfaced via toast notifications. The Relay Tunnel section
additionally shows a latency ping result after a successful ping action.

<!-- Screenshot: admin-remote-access.png -->

---

## API contract

All endpoints are gated by `AdminMiddleware` (unauthenticated → `401`,
non-admin → `403`). All responses are JSON.

### Hub Pairing

#### Get hub status

```http
GET /api/v1/admin/remote/hub/status
```

```json
{
  "success": true,
  "data": {
    "paired": true,
    "hub_id": "srv-456",
    "hub_name": "My Hub",
    "last_heartbeat": "2026-05-28T10:30:00Z"
  }
}
```

When not paired: `{ "paired": false, "hub_id": null, "hub_name": null,
"last_heartbeat": null }`.

| Field | Type | Description |
|-------|------|-------------|
| `paired` | `bool` | Whether a Hub is paired |
| `hub_id` | `string\|null` | Hub instance identifier |
| `hub_name` | `string\|null` | Human-readable Hub name |
| `last_heartbeat` | `string\|null` | ISO 8601 timestamp of last heartbeat |

#### Pair with hub

```http
POST /api/v1/admin/remote/hub/pair
```

Body: `{ "hub_id": "srv-456" }`

```json
{ "success": true, "message": "Paired with hub srv-456." }
```

Returns `400` if already paired or if `hub_id` is invalid.

#### Unenroll from hub

```http
POST /api/v1/admin/remote/hub/unenroll
```

```json
{ "success": true, "message": "Unenrolled from hub." }
```

#### Send heartbeat

```http
POST /api/v1/admin/remote/hub/heartbeat
```

```json
{ "success": true, "message": "Heartbeat sent." }
```

#### Get relay candidates

```http
GET /api/v1/admin/remote/hub/relay-candidates
```

```json
{
  "success": true,
  "data": {
    "candidates": [
      { "id": "relay-1", "region": "us-east", "latency_ms": 45 }
    ]
  }
}
```

---

### Subdomain

#### Get subdomain claim status

```http
GET /api/v1/admin/remote/subdomain/status
```

```json
{
  "success": true,
  "data": {
    "claimed": true,
    "subdomain": "myserver",
    "fqdn": "myserver.hub.example.com",
    "assigned_at": "2026-05-20T08:00:00Z"
  }
}
```

When not claimed: `{ "claimed": false, "subdomain": null, "fqdn": null,
"assigned_at": null }`.

#### Claim subdomain

```http
POST /api/v1/admin/remote/subdomain/claim
```

Body: `{ "subdomain": "myserver" }` (alphanumeric + hyphens, 3–63 chars).

```json
{ "success": true, "message": "Subdomain claimed: myserver.hub.example.com" }
```

Returns `400` if subdomain is already taken or invalid.

#### Release subdomain

```http
POST /api/v1/admin/remote/subdomain/release
```

```json
{ "success": true, "message": "Subdomain released." }
```

#### Update subdomain

```http
PUT /api/v1/admin/remote/subdomain/update
```

Body: `{ "subdomain": "newserver" }`.

```json
{ "success": true, "message": "Subdomain updated to newserver.hub.example.com" }
```

#### Verify subdomain DNS

```http
POST /api/v1/admin/remote/subdomain/verify
```

```json
{ "success": true, "message": "DNS verified. Subdomain is correctly pointed." }
```

Returns `400` with `{ "success": false, "message": "…" }` when DNS is not yet propagated.

---

### Relay Tunnel

#### Get relay status

```http
GET /api/v1/admin/remote/relay/status
```

```json
{
  "success": true,
  "data": {
    "connected": true,
    "relay_id": "relay-1",
    "region": "us-east",
    "latency_ms": 45,
    "enabled": true
  }
}
```

When disconnected or disabled, `connected` is `false` and `latency_ms` is `null`.

#### Enable relay

```http
POST /api/v1/admin/remote/relay/enable
```

```json
{ "success": true, "message": "Relay tunnel enabled." }
```

#### Disable relay

```http
POST /api/v1/admin/remote/relay/disable
```

```json
{ "success": true, "message": "Relay tunnel disabled." }
```

#### Ping relay

```http
POST /api/v1/admin/remote/relay/ping
```

```json
{ "success": true, "latency_ms": 45, "relay_id": "relay-1" }
```

---

### Port Forward

#### Get port-forward status

```http
GET /api/v1/admin/remote/portforward/status
```

```json
{
  "success": true,
  "data": {
    "enabled": true,
    "port": 1900,
    "protocol": "UDP",
    "upnp_enabled": true,
    "nat_pmp_enabled": true
  }
}
```

#### Toggle port-forward

```http
POST /api/v1/admin/remote/portforward/toggle
```

Body: `{ "enabled": true }`.

```json
{ "success": true, "message": "Port forwarding enabled." }
```

Returns HTTP `500` with `{ "success": false, "message": "…" }` when the
operation fails at the network layer.

---

## Error responses

| Status | Meaning |
|--------|---------|
| `400` | Bad request — invalid input or conflict (e.g. subdomain taken) |
| `401` | Not authenticated |
| `403` | Not an admin |
| `404` | Resource not found |
| `500` | Internal error (e.g. port-forward toggle failed at network layer) |

---

## Architecture

### Backend

| File | Purpose |
|------|---------|
| `src/Server/Http/Controllers/Admin/AdminHubController.php` | 16 REST endpoints covering hub, subdomain, relay, and portforward operations |
| `src/Server/Core/Application.php` | Wires all `remote/*` routes under `AdminMiddleware` via `loadRemoteAccessRoutes()` |

### Frontend

| File | Purpose |
|------|---------|
| `admin-ui/src/api/remoteAccess.ts` (`RemoteAccessApi`) | Typed wrappers for all 16 endpoints; throws `ApiError` on non-2xx |
| `admin-ui/src/api/remoteAccess.test.ts` | 22 unit tests for `RemoteAccessApi` (100% coverage) |
| `admin-ui/src/pages/RemoteAccessPage.tsx` | React page — 4 collapsible sections with expand/collapse state machine |
| `admin-ui/src/pages/RemoteAccessPage.test.tsx` | 14 component tests covering all render states, expand/collapse, and action flows |
| `admin-ui/src/styles.css` | Remote access page styles (`.page--remote-access`, section and card styles) |

### Design notes

- Each section uses `expanded` state (`useState` per section) controlled by
  clicking the section heading. All sections start collapsed; the Hub Pairing
  section additionally loads its status data on expand (not on page mount).
- `useToast()` is destructured as `const { push: pushToast } = useToast()` —
  the stable `push` reference prevents unnecessary re-renders when
  `pushToast()` is called from inside a `useCallback`.
- The Relay latency display shows "Xms latency" in the summary line when
  connected; the Ping action triggers a `POST /relay/ping` and updates the
  displayed latency with the server response.
- Port-forward toggle returns HTTP `500` with `{ success: false }` when the
  network operation fails, which the page surfaces as an error toast.
- All 16 endpoints are also documented in the OpenAPI spec at
  `public_html/spec/openapi-admin.yaml`.

---

## Coverage (Vitest)

| File | Statements |
|------|------------|
| `src/api/remoteAccess.ts` | **100%** |
| `src/pages/RemoteAccessPage.tsx` | ≥80% |
| `src/pages/RemoteAccessPage.test.tsx` | **100%** (14/14) |

Overall SPA: 36 passing tests covering all 16 API methods and all page
render, expand/collapse, and action states.

---

## See Also

- [Dashboard](./dashboard) — visual admin dashboard overview
- [Services](./services) — Trakt.tv / Last.fm integration management
- [DLNA Server](./dlna-server) — built-in UPnP MediaServer control
