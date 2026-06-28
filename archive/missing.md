# Phlix — Gaps to "Fully Working" Status

> Audit date: 2026-05-22.
> Method: 5 parallel research agents (server, hub, shared+plugin-example, docs, clients+website) cross-referencing code against documentation. The highest-impact findings were spot-checked by the parent reviewer before inclusion. **Line numbers should still be re-verified before fixing — they may drift as code evolves.**
>
> Already fixed in this session and excluded below: empty-body bug in `Arr\*Client::get()`, `EventNameMap::toAlias()` allocation, `ServerInfoHandler::relayActive` hardcoded false, `docs/reference/api.md` wrong JSON shape for `GET /api/v1/me/servers`.

---

## 0. Executive Summary

The Phlix project is roughly two distinct kinds of work away from "fully working":

1. **Implementation gaps** — features documented as shipped (or implied by the data model) that are stubs or returns of `[]` / `null`. Concentrated in: hub relay, hub TLS provisioning, server Live TV, server Chromecast relay, server REST API route table, server audiobook streaming, and Live TV across **all** clients.

2. **Documentation drift** — the docs claim a CLI that doesn't exist, link to files that aren't there, and miss whole subsystems (DLNA, webhooks, stats, admin dashboard, Arr clients, hub Radarr/Sonarr integration).

The single most expensive item by far is **hub relay end-to-end** (WS handler + TLS provisioning + DNS + URL computation). Everything else is small-to-medium in isolation.

**Suggested order:** schema fix → docs delete-the-lies pass → small implementation patches → relay implementation → Live TV.

---

## 1. CRITICAL — Will block any deployment

### 1.1 Hub server-claim flow is broken at the schema layer
- **Files:**
  - `phlix-hub/src/Hub/ClaimRequestHandler.php:198-211` — inserts into `servers (… enrolled_at)`
  - `phlix-hub/migrations/007_server_claims_and_servers.sql:22` — `ADD COLUMN heartbeat_interval … AFTER enrolled_at`
  - `phlix-hub/migrations/002_servers.sql:11-26` — original `servers` table; **no `enrolled_at` column**
- **Problem:** Both the migration's `AFTER enrolled_at` clause and the INSERT reference a column that no migration ever creates. The `claim` flow will fail on a fresh DB.
- **Fix options:**
  - Add `ALTER TABLE servers ADD COLUMN enrolled_at INT UNSIGNED NULL` as the first statement of migration 007 (and probably want `NOT NULL DEFAULT 0` or backfill).
  - Or drop the `enrolled_at` column references from `ClaimRequestHandler` and use `created_at` instead.
- **Effort:** Small.

### 1.2 Hub WebSocket relay is a 500 stub
- **File:** `phlix-hub/src/Http/Controllers/RelayController.php:92-95` — final response is literally `status(500) → {"error":"NOT_IMPLEMENTED","message":"WebSocket relay support is not yet fully implemented…"}`
- **Problem:** Step C.6 is documented as shipped in CHANGELOG / `docs/dev/architecture-hub.md` / `docs/dev/relay-protocol.md`, but no WS upgrade, frame parsing, multiplexing, or routing exists. Auth (JWT validation) is the only thing wired.
- **Impact:** Every advertised "remote access via hub" path is dead. NAT-behind clients have no transport.
- **Effort:** **Large** (binary framing protocol, session multiplexer, bidirectional routing, integration with `RelaySessionManager`).
- **Dependencies:** Pair with 1.3 (relay URL) and 1.4 (last_frame_at) — fixing all three together avoids whack-a-mole.

### 1.3 `relay_url` is hardcoded null in access-info
- **File:** `phlix-hub/src/Http/Controllers/ServerManageController.php:119` — `'relay_url' => null`
- **Problem:** Even when relay tunnel is live, clients receive `null` and can't reach the server.
- **Fix:** Compute as `wss://{subdomain}.phlix.media/relay/{server_id}` (or whichever scheme the relay protocol settles on), guarded by `relayActive`.
- **Effort:** Small once 1.2 ships; trivial as a "best-effort URL" patch even before.

### 1.4 `relay_sessions.last_frame_at` updated but never declared
- **Files:**
  - `phlix-hub/src/Hub/RelaySessionManager.php:121-122`, `145-146` — both `UPDATE … SET last_frame_at = UNIX_TIMESTAMP()`
  - `phlix-hub/migrations/004_relay_sessions.sql` — column does not exist
- **Problem:** Activity tracking is silently a no-op (or errors in strict mode).
- **Fix:** Add a migration `ALTER TABLE relay_sessions ADD COLUMN last_frame_at INT UNSIGNED NULL`.
- **Effort:** Small.

### 1.5 TLS provisioning is a stub
- **File:** `phlix-hub/src/Hub/TlsCertificateManager.php:182-211` (per audit; verify line range)
- **Problem:** `runAcmeChallenge()` writes account/domain keys + CSR with `openssl`, logs "ACME challenge initiated", then returns `file_exists(.../fullchain.pem)` — never speaks to Let's Encrypt. No HTTP-01 responder, no DNS-01 publisher, no certificate download. CHANGELOG (Step C.8) marks this as shipped.
- **Impact:** `*.phlix.media` subdomains have no certificate. Public hostname feature is non-functional.
- **Secondary issue:** `exec()` with `escapeshellcmd()` (not `escapeshellarg()`) on the same file. Tighten before shipping.
- **Effort:** Large. Either integrate a library (e.g. `kelunik/acme`) or wrap `certbot --webroot` / `--manual --preferred-challenges dns` and own the lifecycle.

### 1.6 Server `Application::loadApiRoutes()` is a placeholder
- **File:** `phlix-server/src/Server/Core/Application.php:220` (per audit)
- **Problem:** Comment says "Placeholder for API routes — will be populated in later phases". Only the root `/api/v1` and a few hand-wired routes are registered. The bulk of the REST surface advertised in docs returns 404. Verify the actual count of routes registered before estimating.
- **Effort:** Medium-to-Large depending on which endpoints actually exist as controllers vs. need to be written.

---

## 2. HIGH — Feature visibly broken to end users

### 2.1 Audiobook streaming returns base64 text, not audio
- **File:** `phlix-server/src/Server/Http/Controllers/AudiobookController.php:441` (per audit)
- **Problem:** `readAudiobook()` returns base64-encoded body with an `audio/*` `Content-Type`. No client can play it.
- **Fix:** Stream raw bytes (`Content-Type: audio/mp4` or `audio/mpeg`, ranged response support).
- **Effort:** Small.

### 2.2 DVB-T channel scanning returns []
- **File:** `phlix-server/src/LiveTv/LiveTvManager.php:583-585` — `scanFrequency()` returns `[]` unconditionally.
- **Related:** `phlix-server/src/LiveTv/Tuners/Dvbt/DvbtSignalEngine.php:82-84` returns a `pipe://` placeholder; comment admits production would shell out to `dvbv5-zap`.
- **Problem:** Channel scan discovers no services. LiveTV is end-to-end non-functional.
- **Effort:** Large (PAT/PMT parsing, `dvbv5-zap` orchestration, error handling).

### 2.3 Chromecast relay commands silently no-op
- **File:** `phlix-server/src/Chromecast/RemoteCastClient.php:146-160` — `sendRelayCommand()` returns `[]` for `launchApp`, `loadMedia`, `play`, `pause`, `stop`, `seek`. Comment explicitly says "placeholder".
- **Problem:** Anything driving cast through the relay (NAT-behind devices) gets silent success.
- **Effort:** Medium (needs the relay tunnel from 1.2 to land first).

### 2.4 mDNS server announcement is a no-op
- **File:** `phlix-server/src/Discovery/Mdns/MdnsDiscovery.php:104-115` — `announceServer()` logs only.
- **Problem:** Phlix server isn't advertised on the LAN; clients can't auto-discover it.
- **Effort:** Small-to-Medium (depends on chosen lib — `dnssd`, raw socket, or shelling out to `avahi-publish`).

### 2.5 FLAC duration is a documented stub
- **File:** `phlix-server/src/Media/Library/AudioScanner.php:854-859` — opens FLAC, reads header, returns null. Caller discards return.
- **Problem:** FLAC tracks show duration = 0 in library.
- **Effort:** Small.

### 2.6 Plugin example uses pre-B.1 namespace
- **File:** `phlix-plugin-example/src/HelloMetadataProvider.php:7` — implements `Phlix\Plugins\Contract\LifecycleInterface` (since superseded by `Phlix\Shared\Plugin\LifecycleInterface` in shared v0.2.0).
- **Problem:** The reference plugin is out of date with the namespace move that already shipped. New plugin authors will copy a deprecated import.
- **Effort:** Small.

---

## 3. HIGH — Documentation is actively misleading

### 3.1 The `bin/phlix` CLI doesn't exist
- **Doc:** `phlix-docs/docs/reference/admin-reference.md:23-53` lists 13 commands (`status`, `migrate`, `backup:create`, `library:scan`, `user:reset-password`, `plugin:install/enable/disable/uninstall/list`, `hwaccel:probe`, `log:tail`, `hub:claim`).
- **Reality:** Verified — `phlix-server/bin/` doesn't exist. Only `phlix-server/scripts/*.php` (a handful of one-off scripts: `pair-with-hub.php`, `port-forward.php`, `run-migrations.php`, `claim-subdomain.php`, `run-marker-detection-worker.php`, plus `release.sh`, `docker-release.sh`, `compatibility-check.sh`).
- **Pick one:**
  - **Document reality** — rewrite admin-reference.md to point at the real `scripts/*.php`. Small.
  - **Implement the CLI** — build a `bin/phlix` Symfony-Console-style dispatcher that fans out to the real services. Medium.
- The first is the honest near-term answer; the second is the better long-term answer.

### 3.2 Five broken cross-links in docs
- **`phlix-docs/docs/install/hardware-transcoding.md:7-9`** → `../libraries/playback-quality.md`, `../advanced/transcoding-tuning.md`, `../advanced/troubleshooting.md` (last should be `../../troubleshooting.md`).
- **`phlix-docs/docs/libraries/movies.md:8`** → `../users/dlna.md` (no `users/` directory, no DLNA doc).
- **`phlix-docs/docs/troubleshooting.md:236`**, **`privacy-security.md`** → `../advanced/reverse-proxy.md` (file doesn't exist).
- **Effort:** Each is small individually; clustered cleanup is ~half a day.

### 3.3 Documented endpoints that don't exist
- **`GET /api/v1/playback/{id}/stream`** — `phlix-docs/docs/reference/api.md:178-194`. No such controller; HLS is at `/hls/...` via `HlsController`.
- **OPDS endpoints** — `phlix-docs/docs/reference/api.md:321-330` lists `/opds/v1.2`, `/opds/v1.2/libraries`, `/opds/v1.2/libraries/{id}`. No OPDS controller in `phlix-server/src/Server/Http/`.
- **Fix:** Delete from docs unless implementing soon. Small.

### 3.4 `POST /api/v1/server-claims/new` documented as authenticated, isn't
- **Doc:** `phlix-docs/docs/reference/api.md:269` — "Auth: Required (Bearer token)".
- **Reality:** The claim flow is the bootstrap. The server proves possession of its Ed25519 keypair; there is no prior session.
- **Fix:** Edit the doc. Small.

### 3.5 Phase markers stale
- **`phlix-docs/docs/clients/skip-button-integration-brief.md:56-58`** — "Phase M (upcoming)", but Roku already ships `source/player/SkipButton.brs` and the server exposes markers via `GET /api/v1/media/{id}/markers`. Re-verify per-client and update.

---

## 4. HIGH — Whole shipped subsystems with zero user-facing docs

These all appear in `phlix-server` `CHANGELOG.md` (or are clearly wired in code) but have **no** documentation in `phlix-docs/` or the repo's own `docs/`:

| Subsystem | Code lives at | Suggested doc |
|---|---|---|
| Webhook dispatch (Step L.1) + 7 notification plugins | `phlix-server/src/Webhooks/`, plugins under `src/Plugins/Notifications/*` (Discord, Slack, …) | `docs/admin/webhooks.md`, `docs/integrations/discord.md`, etc. |
| Stats (Step L.3) | `phlix-server/src/Stats/` | `docs/admin/stats.md` |
| Admin Dashboard (Step L.4) | `phlix-server/src/Admin/DashboardService.php` | `docs/admin/dashboard.md` |
| Backup/restore with S3 (Step L.6) | `phlix-server/src/Admin/BackupManager.php` | `docs/admin/backup.md` |
| Trakt history sync | `phlix-server/src/Plugins/Scrobbler/Trakt/TraktHistorySync.php` | `docs/integrations/trakt.md` |
| Last.fm scrobbler | `phlix-server/src/Plugins/Scrobbler/Lastfm/` | `docs/integrations/lastfm.md` |
| DLNA | `phlix-server/src/Dlna/` (entire dir) | `docs/advanced/dlna.md` (this fixes a broken link from §3.2 too) |
| Trickplay thumbnails | `phlix-server/src/.../TrickPlayController.php` (routes `/trickplay/{jobId}/...`) | Reference page or feature section |
| Hub-side Radarr/Sonarr integration | `phlix-hub` env vars `HUB_RADARR_URL`/`_API_KEY`/`_ENABLED`, `HUB_SONARR_*`; `RequestManager::approveMovieRequest`/`approveSeriesRequest`; `ArrClientFactory` wiring in `HubServicesProvider` | `phlix-docs/docs/reference/env-vars.md` section + `docs/hub/requests.md` |
| Media-request endpoints (Step K.3) | `phlix-hub` `RequestManager`, `RequestController`, migration `011_media_requests.sql` | `phlix-docs/docs/reference/api/` reference page |
| `phlix-shared\Arr\*` clients | `phlix-shared/src/Arr/` (8 classes added in v0.4.0) | A developer/integration guide page |

**Effort:** Each is small (one doc page). The bundle is ~2-3 days.

---

## 5. MEDIUM — CI/test holes

### 5.1 Roku CI runs zero tests
- **File:** `phlix-roku-client/Makefile` (target `test`) and `package.json` (shim) — `make test` and `make lint` only `find` test files and echo. They never invoke a test runner. **CI is therefore green on a project with zero executed tests.**
- **Fix options:**
  - Wire `rokuunit` (or similar) via the Roku CLI, run against a device or emulator in CI.
  - At minimum, make the lint step actually call `bslint` / `rokulint` so style drift is caught.
- **Effort:** Medium.

### 5.2 Tizen `tests/integration/` referenced by npm script but doesn't exist
- **File:** `phlix-tizen-client/package.json` script `test:integration` — directory is missing; jest reports "no tests found" and exits 0.
- **Effort:** Small.

### 5.3 Server: 14 skipped tests
- **Notable:**
  - `phlix-server/tests/Unit/Server/Core/ApplicationTest.php:19` — skips on no MySQL at `127.0.0.1:3306`. Application bootstrap is therefore untested in CI.
  - `phlix-server/tests/Unit/LiveTv/Relay/HlsSegmentPrefetcherTest.php` and `HlsRelayManagerTest.php` — multiple skips on Workerman Timer.
  - `phlix-server/tests/Unit/Admin/BackupManagerTest.php:25` — skips on missing `mysqldump`.
  - `phlix-server/tests/Unit/Plugins/Installer/ComposerRunnerTest.php` / `HttpInstallerTest.php` — skip on missing composer binary, root permissions edge cases.
- **Direction:** Where possible, abstract the I/O dependency (testable shell-runner) instead of skipping. Where not, run them in a containerized integration job that has MySQL + Workerman + composer + mysqldump.
- **Effort:** Medium to remediate per-skip; small per-file once a pattern is chosen.

### 5.4 Mobile / Windows: no E2E
- Detox / Playwright / Spectron all absent. Both clients pass unit tests but nothing exercises real flows.
- **Effort:** Medium per client.

---

## 6. MEDIUM — Build & signing

| Repo | Gap | File | Effort |
|---|---|---|---|
| `phlix-mobile-client` | Hardcoded `BASE_URL = 'https://api.phlix.app'` blocks self-hosted users | `src/api/client.ts:5` | Small |
| `phlix-mobile-client` | iOS provisioning empty | `ios/PhlixMobile.xcodeproj/project.pbxproj` | Medium |
| `phlix-mobile-client` | Android release `debug { }` signing config empty | `android/app/build.gradle:20-24` | Small |
| `phlix-windows-client` | APPX publisher `CN=Phlix` declared but no certificate in CI | `package.json` build section | Medium |
| `phlix-tizen-client` | `.wgt` signing not in CI; Tizen Studio manual step required | `scripts/package.js` | Medium |
| `phlix-roku-client` | Package step is `zip -r phlix.zip …` only; no signing path | `Makefile` | Small |

---

## 7. MEDIUM — Cross-client feature parity

### 7.1 Live TV / DVR / EPG: zero implementation in any client
- Advertised on the website (`phlix-website/shared/content.json`) and implied by the server's `LiveTv/` module.
- **None of mobile, Roku, Tizen, Windows have any Live TV UI or EPG service.** This is a coordinated cross-repo build, gated on §2.2 actually working first.
- **Effort:** Large (multi-week).

### 7.2 DLNA: server code exists, no client code anywhere
- Server `src/Dlna/` is real (and undocumented per §4).
- No client surfaces it. If DLNA is meant for legacy renderers (TVs, AVRs), the server-side endpoint may be sufficient — clarify intent before building client UIs.

### 7.3 Plugins: advertised on website, no client loader
- No plugin manifest/loader on any client. If client-side plugins aren't a goal, edit the website copy. If they are, scope a design doc first.

### 7.4 Tizen has no quality selector UI
- Other clients let users pick bitrate. Tizen forces "auto". Small UX fix.

### 7.5 Mobile has no PiP button
- Native modules support it (ExoPlayer on Android, AVPlayer on iOS). Add the UI control.

---

## 8. LOW — Architectural / hygiene

### 8.1 `phlix-shared` `AGENTS.md` says "Zero I/O", `src/Arr/*` does cURL and `file_get_contents`
- `phlix-shared/AGENTS.md:17-19` declares: *"Zero I/O. No filesystem reads, no network, no DB, no logging side-effects. Interfaces and DTOs only."*
- `phlix-shared/src/Arr/{Sonarr,Radarr,Bazarr,Prowlarr}Client.php` all use cURL.
- `phlix-shared/src/Arr/TrashGuidesProvider.php` reads files / fetches HTTP.
- **Pick one:** add an "Arr exception" paragraph to AGENTS.md explaining why these live here, or move them to a new `phlix-arr` package. The status-quo confuses contributors.

### 8.2 Singleton holdovers
- `phlix-server/src/Server/Core/Application.php:56,142` comments mark `getInstance()` for Phase B removal. The DI refactor was never finished.
- **Effort:** Large but pure refactor; not a "fully working product" blocker.

### 8.3 Shell-safety in `TlsCertificateManager`
- Already covered in §1.5 but worth its own bullet: replace `escapeshellcmd()` with `escapeshellarg()` on user-derived FQDN inputs; stop swallowing `unlink` errors with `@`.

---

## 9. Recommended order of operations

1. **Patch the schema break (§1.1)** — without this the hub doesn't even run end-to-end.
2. **One-day docs-honesty pass:**
   - Delete or rewrite §3.1 (`bin/phlix`), §3.3 (ghost endpoints), §3.4 (wrong auth), fix §3.2 broken links, refresh §3.5 phase markers.
   - This is cheap and stops users from filing bugs against features that never existed.
3. **Easy implementation wins (§2.1, §2.5, §2.6, §6 mobile URL):** small individual fixes; finishing this batch turns several user-visible bugs into wins.
4. **Schema/code consistency (§1.4):** trivial migration, unblocks relay observability.
5. **Subsystem documentation (§4):** parallelize — one writer per page. Two-to-three days of pure prose.
6. **CI honesty pass (§5.1, §5.2):** Roku tests must actually run; Tizen integration dir must exist or be removed from the script.
7. **Relay end-to-end (§1.2, §1.3, §1.5):** treat as one project. Land §1.3 + §1.4 as a stub-completion PR first so the API shape is correct, then do the WS handler + ACME together.
8. **Server REST surface (§1.6):** depends on a decision: are the missing endpoints in §3.3 truly cancelled, or do we want OPDS / `/api/v1/playback/{id}/stream`? Decide before wiring routes.
9. **Live TV (§2.2 + §7.1):** treat as a tier-1 multi-week project once relay is solid. Or descope from the website if it's not actually a near-term goal.
10. **Signing & E2E (§5.4, §6):** finish per-client before app-store submission. Independent of everything above.

---

## 10. Items deferred / explicitly excluded

- **Archived plans** under `*/docs/archive/` — not enforceable contracts.
- **Future-phase TODOs already noted in `CHANGELOG.md [Unreleased]`** — those are pending by design.
- **Translation / i18n stubs** in clients — placeholder strings are fine until launch.
- **Cosmetic Markdown / typo issues** — left for a separate pass.

---

## 11. How to use this document

For each item above:

1. Pick the smallest unit that produces a working slice (a single endpoint, one migration, one doc page).
2. Open a focused branch / PR per slice — easier review, easier to roll back.
3. When fixing, **re-verify line numbers** — agents reported them at audit time and code drifts.
4. Tick off in this file by replacing the leading bullet with `- [x]`, or move resolved items to a `## Resolved` section at the bottom so the doc shows progress.

Once §§1-4 are all `[x]`, the project is functionally "fully working". §§5-8 are quality and polish on top.

---

## 12. 2026-05-24 re-audit — verified state + new findings

> Method: 4 parallel agents re-checked the three core repos + docs against the post-2026-05-23 code; the two headline items were spot-checked by direct read. Actionable items are tracked as **Sections 10-14 in `phlix_update.md`**.

### Verified FIXED since 2026-05-23
- **Hub:** `enrolled_at` + `last_frame_at` migrations (012); `relay_url` computed from subdomain; TLS `provisionCertificate()` honest throw + safe `proc_open` argv.

### Verified FIXED on 2026-05-25 (this pass — see `phlix_update.md` Section 9 + the 2026-05-25 blocks)
- **Hub client-facing relay (the §12 "CRITICAL — still descoped" item below) is IMPLEMENTED.** `ClientRelayWorker` (`ws://…:8803`) is started by `Application::run()`, validates the enrollment JWT, and drives `ClientMountController::onWebSocketConnect/onClientMessage/onClientClose`; `TunnelManager`/`Tunnel` multiplex per channel. `handle()` is no longer a 401 stub (returns 426/501 steering to the WS worker). Remote access through the hub is wired end-to-end (TLS still out-of-band). Server-side `RelayConsumer` rewritten to the multiplexed protocol. = **Section 9 DONE.**
- **Server Chromecast over relay (§11.1) RESOLVED by removal.** Remote casting works through the relay's HTTP pipe (inbound traffic hits the normal `/api/v1/cast/*` routes → local `CastApiClient`); the dead `RemoteCastClient` was removed.
- **Server media-type route `/api/v1` prefix mismatch FIXED** — music/books/audiobooks/photo routes now match the docs (OPDS unchanged).
- **Server:** ~160 routes wired (placeholder comment gone, `WebPortalRouter` dispatched from `index.php`); audiobook raw-byte + Range streaming; FLAC STREAMINFO parsing; mDNS via `avahi-publish`; OPDS routes real.
- **Shared:** AGENTS.md documents the Arr I/O exception; plugin `LifecycleInterface` in `Phlix\Shared\Plugin`; 211/211 tests pass.
- **Docs:** all 14 Section-4 pages now exist and map to real controllers.

### Still open / newly found (→ phlix_update.md section)
- ~~**CRITICAL — still descoped:** Hub client-facing relay is a 401 stub~~ **— RESOLVED 2026-05-25 (Section 9 DONE; see "Verified FIXED on 2026-05-25" above).** Client WS worker implemented, callbacks wired, multiplexing live.
- **CRITICAL — new, fixable:** Shared `TrashGuidesProvider` malformed URLs (`TRaSH-/Guides`), garbage `$data['鸡']` key, missing config include → **§10.1**.
- **HIGH:** Shared `triggerDownload()` empty body to wrong endpoint → **§10.2**. Server Chromecast `sendRelayCommand()` silent no-op → **§11.1**. Docs `bin/phlix` CLI still in ~9 pages → **§13.1**; ghost endpoints in api.md → **§13.2**.
- **MEDIUM:** server audiobook whole-range-in-memory (**§11.2**), weak `validateMediaPath` substring check (**§11.3**), mDNS TXT escaping (**§11.4**); hub CHANGELOG drift + 501 code mismatch (**§12.1**) + missing `docs/` dir (**§12.2**); docs over-claim DVB-T/TLS (**§13.3**) + ~54 broken links (**§13.4**); shared version metadata (**§10.3**).
- **DVB-T real scan** (`LiveTvManager::scanFrequency` / `DvbtSignalEngine::tune`) remains **DESCOPED** (§2.4 / §11 note).
