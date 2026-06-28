# Coordinator Prompt v4 — Hub UI Coverage Build (Session Resume)

**Generated:** 2026-05-30
**Last session ended with:** All H.6a bugs fixed and PR #42 merged. H.6a schema+repos complete.
**Next steps:** H.6b (master WS handler), H.6c (leaf side+REST API), H.6d (UI). H.5 audit log deferred.

---

## Current Repo State

| Repo         | HEAD (master)                                   | Latest merge |
| ------------ | ---------------------------------------------- | -------------|
| phlix-hub    | `fbbac636` (H.6a federation schema+repos)   | H.6a ✅      |
| phlix-shared | `afc91d8` (RelayFrameType 0x09-0x0F)         | H.6a ✅      |

---

## Completed Steps (All Green)

| Step | Title                          | PR  | Status |
| ---- | ------------------------------ | --- | ----- |
| H.1  | Invite link management           | #33 | ✅ Done |
| H.2  | Library share create+edit       | #35 | ✅ Done |
| H.3  | Server detail (heartbeat/relay) | #37 | ✅ Done |
| H.4  | Subdomain/TLS status (read-only)| #39 | ✅ Done |
| H.5a | Hub settings store infrastructure| #40 | ✅ Done |
| H.5  | Hub admin settings UI           | #41+#43 | ✅ Done (route fix merged) |
| H.6a | Federation schema+repositories  | #42 | ✅ Done |

---

## Pending Work

### H.6b — Master WS Handler (next)
**Files to create:**
- `src/Hub/Federation/FederationFrameHandler.php` — handles incoming HUB_HELLO, HUB_HEARTBEAT, LIBRARY_SHARE_UPDATE, ADMIN_DELEGATION frames
- `src/Http/Controllers/FederationRelayController.php` — WS upgrade at `WS /relay/federation/{hub_id}`, master-side
- `src/Hub/Federation/FederationConnectionManager.php` — manages active hub-to-hub connections, pushes library share updates

**Key logic:**
- `FederationRelayController` receives WS upgrade at `/relay/federation/{hub_id}`
- On `HUB_HELLO` JSON frame: validate peer's Ed25519 public key against `federation_peers.public_key`
- On success: create `federation_session`, update peer status to `connected`, push `LIBRARY_SHARE_UPDATE` with all active outgoing shares
- `FederationFrameHandler` maintains a map of `hub_id → ws_connection`
- Idle reaper integration: mark sessions dead after 60s no `HUB_HEARTBEAT`
- Uses existing `FrameEncoder`/`FrameDecoder` from phlix-shared, extend for new frame types

### H.6c — Leaf Side + REST API
**Files to create:**
- `src/Http/Controllers/FederationController.php` — all REST endpoints (see below)
- `src/Hub/Federation/FederationPeerManager.php` — leaf-side: connect to master hub, reconnect loop, push shares

**REST endpoints to register in `Application.php`:**
```
GET  /api/v1/me/federation/hub-config
PUT  /api/v1/me/federation/hub-config         # update this hub's role/url/active
GET  /api/v1/me/federation/peers
POST /api/v1/me/federation/peers              # add peer: {url, public_key, name}
DELETE /api/v1/me/federation/peers/{id}
PUT  /api/v1/me/federation/peers/{id}/relay   # {enabled: bool}
PUT  /api/v1/me/federation/peers/{id}/admin-delegation # {enabled: bool}
GET  /api/v1/me/federation/library-shares/outgoing
POST /api/v1/me/federation/library-shares/outgoing # {library_id, peer_id, permission}
DELETE /api/v1/me/federation/library-shares/outgoing/{id}
GET  /api/v1/me/federation/library-shares/incoming
POST /api/v1/me/federation/library-shares/incoming/{id}/accept
POST /api/v1/me/federation/library-shares/incoming/{id}/reject
```

**Route registration pattern (same as H.5):**
```php
$this->router->group('/api/v1/me/federation', static function (Router $r) use ($controller): void {
    $r->get('/hub-config', ...);
    $r->put('/hub-config', ...);
    // ... etc
}, [$authMiddleware, $adminMiddleware]);
```

### H.6d — UI
**Files to create:**
- `public/templates/home/federation.tpl` — shell template (master config + peer list + relay toggle + admin delegation toggle)
- `public/assets/js/federation.js` — fetch + render peer list, toggle relay/admin-delegation, add/remove peers
- `public/templates/home/federation-shares.tpl` — incoming/outgoing tabs
- `public/assets/js/federation-shares.js`
- Nav: add "Federation" item in `base.tpl`

### Deferred: H.5 Audit Log Viewer
Requires `audit_logs` DB table + `AuditLogRepository` (infrastructure step, can be done in parallel or follow-up)

---

## Implementation Notes

### Hub-to-Hub WebSocket Protocol
- Leaf initiates WS to `wss://master-url/relay/federation/{leaf_hub_id}`
- First frame: `HELLO` (text JSON): `{type:"hub_hello", hub_id, hub_name, public_key, role:"leaf", capabilities:["library_shares","relay","admin_delegation"]}`
- Master validates key against `federation_peers.public_key` → 401 if mismatch
- Master responds: `HELLO_ACK` (text JSON): `{type:"hub_hello_ack", session_id, master_hub_id, role:"master"}`
- Ongoing: `HUB_HEARTBEAT` binary frame every 15s (channel 0, empty payload or 4-byte timestamp)
- Master pushes: `LIBRARY_SHARE_UPDATE` (JSON), `ADMIN_DELEGATION` (JSON)

### Existing Code to Reuse
- `FrameEncoder::encode()` / `FrameDecoder::decode()` from phlix-shared
- `RelayWireCodecInterface` for wire format
- `EnrollmentJwtService::validateEnrollmentJwt()` for Ed25519 key verification (check how it works for servers, replicate for hub-to-hub)
- `Ed25519KeyManager` for getting this hub's public key
- `IdleReaper` in `HubServicesProvider` for periodic session cleanup

### DI Registration for H.6b/c
Add to `HubServicesProvider`:
```php
FederationConnectionManager::class => autowire(),
FederationPeerManager::class => autowire(),
FederationController::class => autowire(),
```

---

## Cardinal Rules (Non-Negotiable)

1. **Throwaway-clone for ALL commits** (CALIBER hook corruption hazard — live hub index was corrupted in a prior session)
2. **Stage SPECIFIC files only** (`git add path/to/file`), never `git add -A`
3. **`unset GITHUB_TOKEN` in SAME command as `gh` calls**
4. **Never `--amend`, `--no-verify`, force-push, or `--no-verify`**
5. **PHPStan L9 + PHPCS PSR-12 + PHPUnit GREEN** before any commit
6. **One repo per PR**, Conventional-Commit messages + Co-Authored-By
7. **All hub SSR pages use shell + client-side JS fetch pattern** (H.1 precedent)
8. **All 4 H.6 sub-steps must be green-merged before H.6 is marked `done`**

---

## QA Gate Per Sub-Step

After each sub-step (H.6a→b→c→d):
```
cd /home/sites/phlix/phlix-hub && ./vendor/bin/phpunit && ./vendor/bin/phpstan analyze src/ --level=9 && ./vendor/bin/phpcs --standard=PSR12 src/
```

If ANY tool reports issues → FIX before proceeding to next sub-step.

---

## Current Blockers

- **H.5 audit log viewer** — blocked by missing `audit_logs` DB table (need `migrations/029_audit_logs.sql` + `AuditLogRepository`)
- **H.6d UI** — blocked until H.6b+c are complete

---

## Files Created in H.6a (for reference)

```
migrations/028_federation.sql
src/Hub/Federation/FederationHubRepository.php
src/Hub/Federation/FederationSessionManager.php
src/Hub/Federation/FederationLibraryShareRepository.php
src/Hub/Federation/FederationAdminDelegationRepository.php
src/Hub/Federation/FederationHubConfig.php
src/Hub/Federation/FederationPeerDto.php
src/Hub/Federation/FederationLibraryShareDto.php
src/Hub/Federation/FederationIncomingOfferDto.php
```
