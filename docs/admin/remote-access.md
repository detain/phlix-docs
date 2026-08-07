# Remote Access

The Remote Access page (`/app/admin/remote-access`) in the admin console provides
five collapsible sections for managing the server's remote access capabilities:
**Hub Pairing** (connection to a Phlix Hub instance), **Subdomain** (claimable HTTPS
endpoint via Hub), **Relay Tunnel** (fallback connectivity when direct connection
is unavailable), **Port Forward** (UPnP/NAT-PMP port mapping on the LAN), and
**Network Health**.

---

## Access

Navigate to **`/app/admin/remote-access`** in the admin console sidebar (entry:
**Remote Access**, positioned in the Admin section). Requires admin authentication.
**Hub Pairing** starts expanded; the rest start collapsed. Click a section heading
to expand it.

---

## What it does

The page renders five independent collapsible sections. Each shows a summary
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
GET /api/v1/admin/remote/portforward/candidates
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

::: danger This endpoint does not exist
There is no `PUT .../subdomain/update` route, and no `PUT` method on the subdomain
group at all. The three real subdomain endpoints are `GET /subdomain/status`,
`POST /subdomain/claim` and `POST /subdomain/release` — to change a subdomain,
release the current one and claim the new one.
:::

```http
PUT /api/v1/admin/remote/subdomain/update
```

Body: `{ "subdomain": "newserver" }`.

```json
{ "success": true, "message": "Subdomain updated to newserver.hub.example.com" }
```

#### Verify subdomain DNS

::: danger This endpoint does not exist
There is no `POST .../subdomain/verify` route. DNS verification is not exposed as
an admin endpoint.
:::

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
  "heartbeatStale": false,
  "latencySource": "persisted"
}
```

`heartbeatStale` is a boolean and is always present in the `200` body. When it is
`true`, the heartbeat fork has stopped refreshing its snapshot and `latencyMs` is
a **historical** measurement rather than a current one — it lets you tell "45 ms,
measured a moment ago" from "45 ms, measured before the heartbeat fork died".

When the tunnel is **not connected**, Ping returns HTTP **`409`** (rather than
pretending to ping) — including when the tunnel's own state snapshot has gone
stale, so a frozen file cannot answer "pong, connected". The `409` body includes
the last connect-error reason:

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
    "lastConnectErrorAt": null,
    "stale": false
  },
  "hub": {
    "lastSuccessfulHeartbeat": "2026-07-23T10:30:00+00:00",
    "consecutiveFailures": 0,
    "lastLatencyMs": 45,
    "stale": false,
    "isEnrolled": true,
    "enrollmentExpiresAt": "2026-08-23T10:30:00+00:00"
  }
}
```

Reads relay + heartbeat state from the persisted files plus cheap enrollment
presence/expiry file reads. Returns `500` (`{ "success": false, "message": … }`)
on read failure.

Both `stale` flags are booleans and are always present. Each marks a state file
that the fork owning it has stopped refreshing — so the snapshot describes the
past, not the present. When the relay flag is set, the liveness fields
(`connected`, `active`) are already forced down by the staleness-gated read, so a
frozen file from a dead fork cannot report `connected: true`.

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
| `offline` | Not enrolled, **the persisted snapshot is stale**, no successful heartbeat recorded yet, the heartbeat is currently failing (`consecutiveFailures > 0`), or latency `> 500ms` |

When `offline`, the response also carries an `error` string (e.g.
`"Not enrolled in hub"`, `"No successful heartbeat recorded yet"`, or
`"Hub heartbeat failing"`) and `measuredAt` reflects the snapshot's own timestamp.

**Staleness is now guarded.** If the heartbeat fork stops refreshing its snapshot,
the probe reports `offline` with an additional `stale: true` field rather than
serving a frozen `healthy`:

```json
{
  "latencyMs": 45,
  "status": "offline",
  "measuredAt": "2026-07-23T10:30:00+00:00",
  "stale": true,
  "error": "Hub heartbeat state is stale — the phlix-hub-heartbeat worker is not running"
}
```

`stale` is emitted **only** on that branch — it is absent from healthy, degraded
and the other `offline` responses. The `consecutiveFailures` branch continues to
cover the hub-down-while-fork-alive case.

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

There is no single `toggle` route — enable and disable are separate endpoints and
neither takes a body:

```http
POST /api/v1/admin/remote/portforward/enable
POST /api/v1/admin/remote/portforward/disable
```

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
| `src/Server/Http/Controllers/Admin/AdminHubController.php` | 17 REST endpoints covering hub, subdomain, relay, and portforward operations |
| `src/Server/Core/Application.php` | Wires all `remote/*` routes under `AdminMiddleware` via `loadHubAdminRoutes()` |

### Frontend

The React `admin-ui/` tree was **decommissioned in C8.1** and no longer exists.
The admin console is the Vue SPA in the `phlix-ui` package:

| File | Purpose |
|------|---------|
| `phlix-ui/src/api/admin/remoteAccess.ts` (`AdminRemoteAccessApi`) | Typed wrappers for all 17 endpoints; throws `ApiError` on non-2xx |
| `phlix-ui/src/api/admin/remoteAccess.test.ts` | 18 unit tests for `AdminRemoteAccessApi` |
| `phlix-ui/src/pages/admin/RemoteAccessPage.vue` | Vue SFC — 5 collapsible sections |
| `phlix-ui/src/pages/admin/RemoteAccessPage.test.ts` | 64 component tests covering render states, expand/collapse, and action flows |

There is no shared stylesheet entry — the page's styles live in the SFC's scoped
`<style>` block under the `admin-remote__*` BEM prefix.

### Design notes

- Expansion is one Vue `ref` map keyed by section, toggled by clicking the section
  heading. Sections do **not** all start collapsed — Hub Pairing starts expanded.
  Hub, subdomain, relay and portforward statuses load on mount; only **Network
  Health** defers its load until the section is expanded.
- Toasts come from `useToastStore()`, called as `toasts.error(...)`.
- The Relay Tunnel controls read/persist real cross-process state (see
  [Relay Tunnel](#relay-tunnel)): Status shows the persisted connect/enrolled/
  kill-switch state plus the last connect-error reason; Enable/Disable persist the
  reload-effective kill-switch and surface a "takes effect on next reload" notice;
  the Ping action triggers `POST /relay/ping` and shows the persisted heartbeat
  latency ("Not measured yet" when `latencyMs` is `null`, or a `409` toast when the
  tunnel is not connected).
- Port-forward toggle returns HTTP `500` with `{ success: false }` when the
  network operation fails, which the page surfaces as an error toast.
- There is **no** OpenAPI spec for this surface. Earlier revisions of this page
  cited `public_html/spec/openapi-admin.yaml`; neither that file nor that directory
  exists. The only OpenAPI document in the estate is `phlix-hub/openapi.yaml`, which
  covers a different surface.

### The 17 endpoints

All are under `/api/v1/admin/remote` and all sit behind `AdminMiddleware`:

| Group | Endpoints |
|---|---|
| Hub (6) | `GET /hub/status`, `POST /hub/pair`, `POST /hub/poll`, `POST /hub/complete`, `POST /hub/unenroll`, `POST /hub/heartbeat` |
| Subdomain (3) | `GET /subdomain/status`, `POST /subdomain/claim`, `POST /subdomain/release` |
| Relay (4) | `GET /relay/status`, `POST /relay/enable`, `POST /relay/disable`, `POST /relay/ping` |
| Port forward (4) | `GET /portforward/status`, `POST /portforward/enable`, `POST /portforward/disable`, `GET /portforward/candidates` |

Two further routes the page consumes are **not** part of that group and are
unauthenticated: `GET /api/v1/health/relay` and `GET /api/v1/health/network`.

---

## Coverage (Vitest)

**82 passing tests** covering all 17 API methods and the page's render,
expand/collapse and action states — 18 in
`phlix-ui/src/api/admin/remoteAccess.test.ts` and 64 in
`phlix-ui/src/pages/admin/RemoteAccessPage.test.ts`. No coverage threshold is
pinned for this page, so no percentage is quoted here.

---

## See Also

- [Dashboard](./dashboard) — visual admin dashboard overview
- [Services](./services) — Trakt.tv / Last.fm integration management
- [DLNA Server](./dlna-server) — built-in UPnP MediaServer control
