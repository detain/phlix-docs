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
| **Relay Tunnel** | Connect state, enrolled + kill-switch, last connect-error | Enable, Disable, Ping |
| **Port Forward** | Enabled state | Enable, Disable |

All action buttons set `aria-busy` and disable during the in-flight request.
Success or error is surfaced via toast notifications. The Relay Tunnel section
shows the real persisted tunnel state (connected/enrolled/kill-switch plus the
last connect-error reason), and its Ping action reports the last persisted
heartbeat latency (or "Not measured yet" until one has been recorded). Enable
and Disable are a persisted kill-switch that takes effect on the next server
reload — they surface an honest "takes effect on next reload" notice rather than
implying an instant on/off.

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

> **The relay tunnel runs in a separate forked process** (`phlix-relay-tunnel`),
> not in the HTTP worker. These endpoints therefore read the **cross-process state
> files** the fork persists (`config/relay-tunnel.state.json`,
> `config/hub-heartbeat.state.json`, `config/relay-control.json`) rather than a
> never-started in-worker relay object. Earlier builds probed the tunnel with a
> blocking `exec('pgrep …')` + log-scrape and returned fake `{"success":true}`
> no-ops; those are gone.

#### Get relay status

```http
GET /api/v1/admin/remote/relay/status
```

Returns the real persisted tunnel state (flat JSON, no `data` wrapper):

```json
{
  "connected": true,
  "active": true,
  "reconnectAttempts": 0,
  "activeSessions": 2,
  "lastDisconnectTime": null,
  "lastConnectError": null,
  "lastConnectErrorAt": null,
  "disabled": false,
  "enrolled": true,
  "updatedAt": "2026-07-23T10:30:00+00:00",
  "endpoint": null,
  "establishedAt": "2026-07-23T10:30:00+00:00"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `connected` | `bool` | Whether the tunnel fork is currently connected to the hub |
| `active` | `bool` | Whether the tunnel is actively relaying |
| `reconnectAttempts` | `int` | Reconnect attempts since the last successful connect |
| `activeSessions` | `int` | Relay sessions currently multiplexed over the tunnel |
| `lastDisconnectTime` | `string\|null` | ISO 8601 time of the last disconnect |
| `lastConnectError` | `string\|null` | Human-readable reason the last connect failed ("why it's down") |
| `lastConnectErrorAt` | `string\|null` | ISO 8601 time of that connect error |
| `disabled` | `bool` | Effective kill-switch — `true` if the persisted `relay-control.json` kill-switch **or** the `PHLIX_RELAY_DISABLED` env var is set |
| `enrolled` | `bool` | Whether this server is paired with a hub |
| `updatedAt` | `string\|null` | When the tunnel fork last wrote state (staleness signal; `null` if it has never run) |
| `endpoint`, `establishedAt` | `string\|null` | Back-compat keys retained for the current UI |

Returns `500` (`{ "success": false, "message": "Failed to load relay status." }`)
if the state store cannot be read.

#### Enable relay

```http
POST /api/v1/admin/remote/relay/enable
```

**Enable is an honest, persisted kill-switch — it takes effect on the next server
reload, not instantly.** It clears the `disabled` flag in `config/relay-control.json`
(which the relay fork reads at boot); the tunnel then (re)connects on the next
reload. It is **not** a fake no-op — it persists a real state change and returns the
resolved levers.

```json
{
  "success": true,
  "disabled": false,
  "enrolled": true,
  "takesEffectOnReload": true,
  "message": "Relay enabled; the tunnel will (re)connect on the next server reload."
}
```

- **Enable cannot unset the `PHLIX_RELAY_DISABLED` environment variable.** If that
  env var is set it still wins, so the response comes back `disabled: true` with an
  honest message explaining the tunnel stays disabled until the env var is removed
  and the server reloads.
- If the server is not paired with a hub, the message notes the tunnel won't
  connect until it is paired.
- Returns `500` if the kill-switch state cannot be persisted.

#### Disable relay

```http
POST /api/v1/admin/remote/relay/disable
```

**Disable persists `disabled: true` to `config/relay-control.json`, which the relay
fork honors at boot in addition to `PHLIX_RELAY_DISABLED`.** It does **not** tear
down the already-running fork in-process (cross-process, no live control channel),
so it takes effect on the next server reload.

```json
{
  "success": true,
  "disabled": true,
  "enrolled": true,
  "takesEffectOnReload": true,
  "message": "Relay disabled; the tunnel will disconnect on the next server reload."
}
```

Returns `500` if the kill-switch state cannot be persisted.

#### Ping relay

```http
POST /api/v1/admin/remote/relay/ping
```

**Ping reports the *persisted* connection state and last-recorded heartbeat
latency — it does not fire a live network round-trip.** The latency is the last
value the `phlix-hub-heartbeat` fork recorded to `config/hub-heartbeat.state.json`;
`latencyMs` is `null` when no heartbeat has been recorded yet ("Not measured yet"),
never a fabricated timing.

```json
{
  "success": true,
  "connected": true,
  "active": true,
  "latencyMs": 45,
  "lastHeartbeatAt": "2026-07-23T10:30:00+00:00",
  "latencySource": "persisted"
}
```

When the tunnel is **not connected**, Ping returns HTTP **`409`** (rather than
pretending to ping), including the last connect-error reason:

```json
{
  "success": false,
  "connected": false,
  "active": false,
  "message": "Relay not connected.",
  "lastConnectError": "…",
  "lastConnectErrorAt": "2026-07-23T10:29:00+00:00"
}
```

#### Relay tunnel TLS

The server↔hub relay tunnel is a separate connection from the server's public
HTTP/HTTPS endpoint, and its TLS is configured independently.

- **The default is plaintext `ws://`.** The relay scheme is derived from the
  enrollment's hub base URL and defaults to **plaintext**, matching the hub's
  plaintext-by-default relay listener (`:8802`). This is a change from earlier
  builds, which always forced `wss://`+TLS and would silently hang against a
  plaintext hub relay port.
- **To run the relay tunnel over TLS, enable it on both ends together:** set
  `PHLIX_RELAY_TLS=1` on the server **and** `HUB_RELAY_TLS=true` on the hub. Only
  then does the derived scheme become `wss://` and the tunnel open with TLS.
- **Self-signed hub relay certificate:** set `PHLIX_RELAY_TLS_VERIFY=0` on the
  server to accept it (this turns off peer verification and allows self-signed
  certs, mirroring the hub's permissive relay context). Production should use a
  CA-signed certificate and leave verification on. Use `PHLIX_RELAY_TLS_CAFILE`
  to point at a custom CA bundle (default: the system bundle at
  `/etc/ssl/certs/ca-certificates.crt`).
- **Explicit endpoint override:** `PHLIX_RELAY_HUB_WS_URL` (config
  `relay.hub_relay_ws_url`) is the highest-precedence setting and overrides the
  derived scheme. If you point it at a `wss://` URL, also set `PHLIX_RELAY_TLS=1`
  so the cert/verify variables apply and the start-time TLS-mismatch heads-up
  warning stays quiet.

If the resolved relay URL is `wss://` while `PHLIX_RELAY_TLS` is off, the server
logs a once-per-process warning on the `hub` channel at boot explaining the likely
hang and which variables to set. These variables are listed in
[Environment variables → Relay tunnel](../reference/env-vars#relay-tunnel) and
[Config files → `config/relay.php`](../reference/config-files#config-relay-php).

> The tunnel worker also persists its last connect state (connected/active,
> reconnect attempts, last disconnect, last connect-error reason/time) to
> `config/relay-tunnel.state.json`. This is an internal state file consumed by the
> [Network Health](#network-health) endpoints below; operators do not edit it directly.

---

## Network Health

The admin **Network Health** panel and its two health endpoints report the state of
the server↔hub link. Because the relay tunnel and the hub heartbeat run in
**separate forked processes** (`phlix-relay-tunnel`, `phlix-hub-heartbeat`) with no
shared memory, these HTTP-worker endpoints read the **cross-process state files**
those forks persist (`config/relay-tunnel.state.json`,
`config/hub-heartbeat.state.json`) via `RelayStateStore` — **not** a never-started,
container-local `RelayConsumer`/`HubClient` copy, which always reported
offline/0/null even on a healthy, enrolled, connected box. The heartbeat fork
records the real hub round-trip latency each tick (monotonic `hrtime`), which is
what lights up the Relay Tunnel [Ping](#ping-relay) latency above.

#### Relay health

```http
GET /api/v1/health/relay
```

```json
{
  "relay": {
    "connected": true,
    "active": true,
    "reconnectAttempts": 0,
    "lastDisconnectTime": null,
    "activeSessions": 2,
    "lastConnectError": null,
    "lastConnectErrorAt": null
  },
  "hub": {
    "lastSuccessfulHeartbeat": "2026-07-23T10:30:00+00:00",
    "consecutiveFailures": 0,
    "lastLatencyMs": 45,
    "isEnrolled": true,
    "enrollmentExpiresAt": "2026-08-23T10:30:00+00:00"
  }
}
```

Reads relay + heartbeat state from the persisted files plus cheap enrollment
presence/expiry file reads. Returns `500` (`{ "success": false, "message": … }`)
on read failure.

#### Network health (cheap probe)

```http
GET /api/v1/health/network
```

This endpoint is **polled continuously** by the admin network-health indicator.

**It is a cheap, side-effect-free probe.** Earlier builds fired a **real**
`POST /api/v1/servers/{id}/heartbeat` to the hub on *every* poll — mutating hub-side
state and hammering the hub as the poller ran. It now simply reads the latency/health
snapshot the heartbeat fork already persists to `config/hub-heartbeat.state.json`.
No outbound heartbeat, no blocking I/O, no side effects.

```json
{
  "latencyMs": 45,
  "status": "healthy",
  "measuredAt": "2026-07-23T10:30:00+00:00"
}
```

| `status` | When |
|----------|------|
| `healthy` | Last heartbeat latency `< 100ms` |
| `degraded` | Last heartbeat latency `100–500ms` |
| `offline` | Not enrolled, no successful heartbeat recorded yet, the heartbeat is currently failing (`consecutiveFailures > 0`), or latency `> 500ms` |

When `offline`, the response also carries an `error` string (e.g.
`"Not enrolled in hub"`, `"No successful heartbeat recorded yet"`, or
`"Hub heartbeat failing"`) and `measuredAt` reflects the snapshot's own timestamp.
Because the probe trusts the persisted snapshot, a stale reading can persist if the
heartbeat fork itself hangs (there is currently no `updatedAt`-staleness guard — a
documented follow-up); the `consecutiveFailures` branch already covers the
hub-down-while-fork-alive case.

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
| `409` | Conflict — relay Ping requested while the tunnel is not connected |
| `500` | Internal error (e.g. port-forward toggle failed at network layer, or relay state could not be persisted/read) |

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
- The Relay Tunnel controls read/persist real cross-process state (see
  [Relay Tunnel](#relay-tunnel)): Status shows the persisted connect/enrolled/
  kill-switch state plus the last connect-error reason; Enable/Disable persist the
  reload-effective kill-switch and surface a "takes effect on next reload" notice;
  the Ping action triggers `POST /relay/ping` and shows the persisted heartbeat
  latency ("Not measured yet" when `latencyMs` is `null`, or a `409` toast when the
  tunnel is not connected).
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
