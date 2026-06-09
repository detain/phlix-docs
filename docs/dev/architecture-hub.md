# Hub architecture

## TL;DR

The hub is a Workerman HTTP + WebSocket server that holds server claim codes, validates Ed25519 enrollment tokens, runs a 60-second heartbeat loop with each paired server, multiplexes relay tunnels for remote client access, and issues HS256 user-session JWTs. Its primary UI is the shared Vue SPA (`@phlix/ui`) served at `/app`. This guide covers the hub-specific architecture, the complete pairing protocol flow (claim code → enrollment JWT → heartbeat → user-session JWT), relay tunnel design (outbound WS from server to hub, client multiplexing), namespace map, and debug recipes. If pairing fails, check the 10-minute claim-code expiry and the heartbeat logs. If a relay tunnel drops, check the relay logs. If auth is failing, check the audit log.

---

## Process model

The hub runs as a Workerman HTTP + WebSocket server:

- **Address**: `HUB_HOST:HUB_PORT` (default `0.0.0.0:8800`)
- **Workers**: `HUB_WORKERS` child processes managed by Workerman
- **Entry point**: `Phlix\Hub\Application::boot()`
- **Middleware chain**: Request → Auth middleware → Router → Controller
- **Sessions**: No in-memory sessions — all state in MySQL

```bash
# Start the hub
php public/index.php start   # production (daemonized)
php public/index.php status  # check worker status
php public/index.php stop   # stop all workers
```

**Ports:** HTTP `8800`, server relay `8802` (servers connect outbound here), client relay `8803` (remote clients connect here).

---

## User interface (Vue SPA)

The hub's primary UI is the shared **Vue 3 SPA** (the cross-repo `@phlix/ui` design system, consumed by `web-ui/` = `@phlix/hub-web-ui`). It is served by `SharedUiController` from the committed `public/assets/app/` bundle:

- `GET /` → redirects to `/app/servers` (the front door).
- `GET /app` and `GET /app/{path}` serve the SPA shell — no server-side auth gate; the SPA handles its own auth.
- SPA top nav (any logged-in user): **My Servers** `/app/servers`, **Federation** `/app/federation`, **Shares** `/app/shares`.
- A gated **Admin** console lives at `/app/admin/{dashboard,users,logs,settings,audit-logs}` (visible only to admins). See [`../hub-admin/admin-console.md`](../hub-admin/admin-console.md).

The older SSR Smarty pages (`/login`, `/signup`, `/my-servers`, `/claim-server`, …) still resolve but are **legacy** — they are no longer the documented front door.

> **Per-library Browse (media server only).** As of **`@phlix/ui` v0.21.0** the shared SPA's Browse home renders one rail per library (fetched from `GET /api/v1/libraries`, ordered by `display_order` then name), and each rail's **See all** opens a dedicated per-library page at **`/app/library/:id`** (route name `library`) — the full filterable, paginated grid scoped to one library. A consumer `MenuItem` can set `libraryLinks: true` to also render one nav link per library. The **media server** opts in (its **Browse** entry); the **hub does not** — the hub has no libraries, so its home stays `/app/servers` and it renders no per-library rails or links.

---

## Container topology

PHP-DI PSR-11 container built by `ContainerFactory::create()`:

| Provider | What it wires |
|---------|---------------|
| `CoreServicesProvider` | `Workerman\MySQL\Connection`, `LoggerFactory`, `AuditLogger` |
| `AuthServicesProvider` | `JwtHandler` (HS256 for user sessions), `UserRepository`, `AuditLogger`, `AuthManager` |
| `HttpServicesProvider` | `PageRenderer`, all controllers, all middleware |

```php
$container = ContainerFactory::create($appConfig);
$app = $container->get(\Phlix\Hub\Application::class);
$app->boot();
```

---

## Auth flow

### Signup

```text
Browser → Hub:  POST /api/v1/auth/register  {email, password, display_name}
Hub:    create user row (unprivileged), issue HS256 access + refresh JWTs
Hub → Browser: {access_token, refresh_token, user}
```

### Login

```text
Browser → Hub:  POST /api/v1/auth/login  {email, password}
Hub:    verify Argon2ID password hash, issue HS256 JWTs
Hub → Browser: {access_token, refresh_token, user}
```

### Protected request (Bearer or cookie)

```text
Browser → Hub:  GET /api/v1/libraries  (Authorization: Bearer <access_token>)
Hub:    validate HS256 JWT (iss=phlix-hub, aud=hub)
Hub → Browser: {libraries: [...]}
```

All cookies use `SameSite=Lax` — cross-origin requests cannot auto-attach cookies, so browser JS clients use the `Authorization: Bearer` header instead.

### Logout

```text
Browser → Hub:  POST /api/v1/auth/logout
Hub:    (no server-side token revocation — tokens expire naturally)
Browser: clears access_token from memory / cookie
```

---

## JWT shape

All hub JWTs follow `Phlix\Shared\Auth\JwtClaims::fromPayload()`:

| Claim | Value |
|-------|-------|
| `iss` | `phlix-hub` |
| `aud` | `hub` |
| `sub` | User UUID |
| `type` | `access` (1h TTL) or `refresh` (7d TTL) |
| `scope` | `["library:read", "library:playback"]` |
| `serverId` | Present on server-issued enrollment tokens |

**Algorithms — two distinct token families:**

- **User-session JWTs** (access + refresh, minted by `src/Auth/JwtHandler.php`) are **HS256** — symmetric HMAC-SHA256 signed with the hub's shared secret. The handler explicitly supports HS256 only (no RS256/ES256).
- **Server enrollment JWTs** are **Ed25519** — asymmetric, minted by `EnrollmentJwtService` / `Ed25519KeyManager` and verified against the hub's public JWKS at `/.well-known/jwks.json`. These are a separate mechanism from user sessions; see the pairing protocol below.

---

## Admin bootstrap

The first user to register is auto-promoted to admin via `UserRepository::setAdmin()` — called in the same transaction as the user row insert:

```php
// Inside UserRepository::create()
$this->db->query(
    "INSERT INTO users (id, email, ...) VALUES (?, ?, ...)",
    [$id, $email, ...]
);
if ($this->countAll() === 1) {
    $this->setAdmin($id, true);
}
```

---

## CSRF

Deliberately omitted for MVP:

- JSON APIs use `Authorization: Bearer` — browsers do not auto-attach cookies to cross-origin `fetch()` calls, so CSRF is not applicable
- HTML pages use `SameSite=Lax` cookies — the browser suppresses cookie send on dangerous cross-origin POSTs
- Logout is the only state-changing operation on the HTML portal and carries no privilege escalation risk

---

## Audit logging

All auth events are written to `.logs/audit.log` via the `audit` channel:

| Event | When logged |
|-------|------------|
| `signup` | New user registers |
| `login_success` | Password verified |
| `login_failure` | Password failed or user not found |
| `logout` | User logs out |
| `permission_denied` | Token valid but lacks required scope |
| `auth_failure` | Missing, malformed, or expired token |

```php
$auditLogger->log('login_failure', ['email' => $email, 'reason' => 'bad_password']);
```

---

## Pairing protocol internals

Step-by-step flow for pairing a `phlix-server` instance with the hub.

### Step 1 — Server initiates claim

```bash
# Server (HubClient) POSTs to hub. The request body is a `Phlix\Shared\Hub\ClaimRequest`
# (camelCase fields); the protocol version is gated by the Accept-Phlix-Protocol header.
POST https://hub.example.com/api/v1/server-claims/new
Content-Type: application/json
Accept-Phlix-Protocol: v1

{
  "serverName": "Alice's NAS",
  "version": "1.2.0",
  "publicKeysJwk": { "keys": [{ "kty": "OKP", "crv": "Ed25519", "x": "...", "kid": "..." }] },
  "hostnameCandidates": ["nas.alice.com", "192.168.1.100"],
  "protocolVersion": "v1"
}
```

### Step 2 — Hub generates claim code

- Hub stores `server_claims` row: `claim_code` (human-friendly `ABCD-1234`), `status=pending`, `expires_at=NOW+10min`
- Hub stores `servers` row: `status=claiming` (not yet linked to a user)
- Responds with a `Phlix\Shared\Hub\ClaimResponse` (camelCase fields):

```json
{
  "claimCode": "ABCD-1234",
  "expiresIn": 600,
  "claimId": "uuid",
  "hubBaseUrl": "https://hub.example.com"
}
```

The server stores `claimId` and polls `GET /api/v1/server-claims/{claimId}` (the UUID is the bearer secret) until the claim is redeemed.

### Step 3 — User redeems claim code

- The user pastes `ABCD-1234` in the SPA (**My Servers**, `https://hub.example.com/app/servers`), which calls `POST /api/v1/server-claims/claim` with `{ "claim_code": "ABCD-1234" }` (auth required). There is no `/claim` page.
- Hub looks up `server_claims` by `claim_code` where `status=pending` AND `expires_at > NOW`
- Hub issues **Ed25519 enrollment JWT** (7-day TTL, signed with hub's Ed25519 key):

```json
{
  "iss": "phlix-hub",
  "aud": "server",
  "sub": "server-uuid",
  "type": "enrollment",
  "exp": 1234567890
}
```

- Hub links `server_claims → servers` row, sets `status=paired`, `servers.status=online`, `servers.user_id=<claiming_user_id>`
- Hub responds:

```json
{
  "enrollment_jwt": "eyJ...",
  "hub_jwks_url": "https://hub.example.com/.well-known/jwks.json"
}
```

### Step 4 — Server stores enrollment and starts heartbeat

```bash
# Server saves to config/hub-enrollment.json:
{
  "enrollment_jwt": "eyJ...",
  "hub_jwks_url": "https://hub.example.com/.well-known/jwks.json",
  "server_id": "550e8400-...",
  "hub_base_url": "https://hub.example.com"
}

# Server starts 60s heartbeat loop:
POST https://hub.example.com/api/v1/servers/{server_id}/heartbeat
Authorization: Bearer {enrollment_jwt}

{
  "version": "1.2.0",
  "uptime_seconds": 86400,
  "active_sessions": 3,
  "active_transcodes": 1,
  "hostname_candidates": ["nas.alice.com", "192.168.1.100"]
}
```

### Step 5 — Hub issues user-session JWTs

- Hub validates the enrollment JWT (Ed25519, verifies against server's JWKS at `/.well-known/jwks.json`)
- Hub issues **HS256 user-session JWTs** that server-side `HubClient` uses to authenticate remote user requests through the hub relay:

```json
{
  "iss": "phlix-hub",
  "aud": "hub",
  "sub": "user-uuid",
  "serverId": "server-uuid",
  "scope": ["library:read", "library:playback"]
}
```

---

## Relay tunnel design

### Overview

The relay allows remote clients to access a server behind NAT — without opening inbound ports on the server.

1. Server connects **outbound** WebSocket to `wss://hub.example.com/relay/{server_id}` on startup (or on-demand when first remote client connects)
2. Server sends `RelaySession::TYPE_HELLO` carrying its Ed25519 enrollment JWT for authentication
3. Hub `TunnelManager` maps `server_id` → open `RelaySession`; authenticates server and opens a tunnel
4. When a remote client connects to `wss://hub.example.com/client/{server_id}`, the hub **multiplexes** the client connection over the existing server-side tunnel
5. `RelaySession` tracks: `worker_node` (which hub worker holds the WS), `bytes_in`, `bytes_out`, `opened_at`, `close_reason`
6. If the server WS drops, `TunnelManager` marks `closed_at` and notifies pending clients with `RelaySession::TYPE_DISCONNECTED`
7. Server re-connects automatically (HubClient retry loop with backoff); clients are notified and retry

```bash
# Server-side relay connect (outbound from server to hub):
wss://hub.example.com/relay/550e8400-e29b-41d4-a716-446655440000
Server → Hub: { "type": "hello", "enrollment_jwt": "eyJ...", "server_id": "..." }
Hub → Server: { "type": "hello_ack", "relay_session_id": "...", "tunnel_id": "..." }

# Client connect (inbound from client to hub, relayed to server):
wss://hub.example.com/client/550e8400-e29b-41d4-a716-446655440000
Hub → Server (over relay tunnel): { "type": "client_connect", "client_id": "...", "session_id": "..." }
```

---

## Namespace map

```
Phlix\Hub\          — Application bootstrap, Router, Config
Phlix\Hub\Auth\     — JwtHandler (HS256 for user sessions), UserRepository,
                      AuditLogger, AuthManager
Phlix\Hub\Relay\   — RelaySession (entity), TunnelManager (orchestrator)
Phlix\Hub\Webhooks\ — WebhookDispatcher, WebhookDelivery
Phlix\Hub\Http\    — Request, Response, Router, Controllers + middleware.
                      Controllers: Auth, Me, Page, Health, ServerClaim,
                      Server, ServerList, ServerManage, ServerDetail,
                      HubJwks, Relay, ClientMount, Subdomain, Library,
                      LibraryShare, InviteLink, HubSettings, AuditLog,
                      Log, Request, Federation, and the admin-console
                      controllers AdminDashboard + AdminUser. SharedUiController
                      serves the Vue SPA shell at /app.
Phlix\Hub\Common\   — Container, Database (ConnectionPool),
                      Logger (LoggerFactory, LogChannels)
Phlix\Shared\       — Types shared with phlix-server:
                      JwtClaims, claim DTOs (ClaimRequest, ClaimResponse,
                      ServerInfoDto, HeartbeatDto),
                      events (Phlix\Shared\Events\*)
```

**Key split**: the hub repo never contains library scanning, transcoding, FFmpeg, HLS, DLNA, Live TV, or any `Phlix\Server\*` code. Those live exclusively in `phlix-server`.

---

## Debug recipes

### Enable debug logging

```bash
export HUB_LOG_LEVEL=debug
php public/index.php start
tail -f .logs/hub.log | grep -i "debug\|heartbeat\|relay\|claim"
```

In docker-compose:

```yaml
environment:
  - HUB_LOG_LEVEL=debug
```

### Connect to hub MySQL directly

```bash
mysql -h ${HUB_DB_HOST:-hub-db} -u phlix_hub -p phlix_hub
```

Useful queries:

```sql
-- Check pending claim codes (not yet redeemed):
SELECT id, claim_code, server_name, status, expires_at
FROM server_claims WHERE status = 'pending';

-- Check servers and last-seen:
SELECT id, server_name, status, last_seen_at FROM servers;

-- Check active relay sessions:
SELECT id, server_id, worker_node, bytes_in, bytes_out, opened_at
FROM relay_sessions WHERE closed_at IS NULL;

-- Check servers that have missed heartbeats (not seen in 2+ minutes):
SELECT id, server_name, last_seen_at
FROM servers WHERE last_seen_at < DATE_SUB(NOW(), INTERVAL 2 MINUTE);
```

### Heartbeat logs

```bash
# Watch heartbeat activity in real time:
tail -f .logs/hub.log | grep heartbeat

# Find all heartbeat events:
grep "heartbeat" .logs/hub.log

# Find heartbeat failures (non-2xx responses):
grep "heartbeat.*failed\|heartbeat.*error\|heartbeat.*401\|heartbeat.*403" .logs/hub.log

# Count heartbeats per server (for uptime reporting):
grep "heartbeat.*ok\|heartbeat.*200" .logs/hub.log | awk '{print $NF}' | sort | uniq -c
```

### Relay tunnel logs

```bash
# Watch relay tunnel activity:
tail -f .logs/hub.log | grep relay

# Find tunnel open events:
grep "relay.*hello\|relay.*hello_ack\|relay.*open" .logs/hub.log

# Find tunnel close/drop events:
grep "relay.*close\|relay.*disconnect\|relay.*dropped\|relay.*error" .logs/hub.log

# Watch bytes_in/bytes_out on relay sessions:
grep "relay.*bytes" .logs/hub.log

# Filter by specific server:
grep "550e8400-e29b-41d4-a716-446655440000" .logs/hub.log | grep relay
```

---

## What can go wrong

### Failure 1: Claim code expired

**Symptom:** Server pairing stalls after displaying the claim code. The user pastes the code in the SPA (My Servers, `https://hub.example.com/app/servers`) but gets "Invalid or expired claim code."

**Diagnosis:**
```bash
# Server-side HubClient logs for claim initiation:
grep "claim\|pairing" .logs/phlix.log | tail -20

# On the hub, check claim code status:
mysql -h hub-db -u phlix_hub -p phlix_hub \
  -e "SELECT claim_code, status, expires_at, created_at
      FROM server_claims
      WHERE claim_code = 'ABCD-1234';"

# Hub logs for claim initiation:
grep "claim\|server-claims" .logs/hub.log | tail -20
```

**Fix:** Re-initiate pairing. On the server: `php scripts/pair-with-hub.php https://hub.example.com "Server Name"` and complete the redemption within 10 minutes. If claim codes are expiring unused frequently, consider increasing the TTL or batching multiple servers into one claim flow.

---

### Failure 2: Server heartbeat missed (3 consecutive)

**Symptom:** Hub marks the server as `offline`. Users with shared library access see the server as unavailable in the hub dashboard. Remote relay connections fail.

**Diagnosis:**
```bash
# On the hub, check the server's last_seen_at:
mysql -h hub-db -u phlix_hub -p phlix_hub \
  -e "SELECT server_name, status, last_seen_at
      FROM servers WHERE server_name = 'Alice NAS';"

# On the server, check heartbeat loop logs:
grep "heartbeat" .logs/phlix.log | tail -50

# Check if the enrollment JWT has expired (7-day TTL):
cat config/hub-enrollment.json | grep enrolled_at

# On the hub, find servers not seen in 2+ minutes:
mysql -h hub-db -u phlix_hub -p phlix_hub \
  -e "SELECT id, server_name, last_seen_at
      FROM servers
      WHERE last_seen_at < DATE_SUB(NOW(), INTERVAL 2 MINUTE);"
```

**Fix:** Restart the heartbeat loop: `php scripts/pair-with-hub.php` (re-initiates pairing if enrollment JWT is expired, otherwise just restarts heartbeat). If the enrollment JWT has expired, the full re-enrollment flow runs automatically. For persistent network issues, increase `PHLIX_HEARTBEAT_INTERVAL` or deploy the server with a more stable uplink.

---

### Failure 3: Relay tunnel dropped

**Symptom:** Remote client connects to the hub and authenticates, but the stream stalls or the WebSocket closes. Hub dashboard shows the server as `online` but no relay session is active.

**Diagnosis:**
```bash
# On the hub, check relay session status:
mysql -h hub-db -u phlix_hub -p phlix_hub \
  -e "SELECT id, server_id, worker_node, bytes_in, bytes_out,
             opened_at, closed_at, close_reason
      FROM relay_sessions
      WHERE server_id = '550e8400-...'
      ORDER BY opened_at DESC LIMIT 5;"

# Check hub relay logs for tunnel open/close events:
grep "relay.*hello\|relay.*close\|relay.*drop\|relay.*error" .logs/hub.log | tail -30

# On the server, check outbound WS connection to hub:
grep -i "relay\|wss\|hub.*connect" .logs/phlix.log | tail -20

# Check if outbound port 8800 is blocked (NAT/firewall):
ss -tnp | grep ":8800"
```

**Fix:** The HubClient reconnect loop re-establishes the outbound WebSocket automatically within seconds. If tunnels drop repeatedly: (1) check NAT timeout on the server's outbound connection (reduce `PHLIX_HEARTBEAT_INTERVAL` or add server-side keepalive), (2) hub worker restart drops all relay sessions — servers reconnect automatically, (3) firewall or proxy between server and hub dropping idle connections. For production, consider a layer-4 load balancer that preserves TCP connections.

---

## Next steps

- [`docs/dev/schema-hub.md`](schema-hub.md) — complete hub DB schema with ER diagram, table columns, indexes, and FK relationships
- [`docs/dev/pairing-protocol.md`](pairing-protocol.md) — full protocol specification with sequence diagrams
- [`docs/dev/relay-protocol.md`](relay-protocol.md) — deep dive on tunnel establishment, message framing, and reconnection logic
- [`docs/dev/architecture-server.md`](architecture-server.md) — server-side architecture (library scanning, transcoding, streaming, DLNA, Live TV)
- [`detain/phlix-shared`](https://github.com/detain/phlix-shared) — shared DTOs, JWT claims, and events used by both repos
