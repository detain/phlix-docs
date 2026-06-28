# Phlix — UI Coverage Plan (server + hub)

> **Authoritative plan.** Executed by an agent hierarchy (OpenCode + MiniMax M2.7). Start via
> `coordinator_prompt.md`. Live progress is tracked in `PHLIX_UI_STATUS.md`. Per-step specs live in
> `steps/<step-id>.md`.

## Context

The Phlix backend is feature-rich and recently driven to "fully working" (see `missing.md` /
`phlix_update.md`): ~132 REST routes across ~30 subsystems. But the **web UI is a thin slice**
of that surface. The server portal renders only browse/playback pages (home, library browse,
music/books/audiobooks/photo, search, player), a **read-only** admin dashboard, and a single
`/admin/plugins` page. Nearly every operator/admin/config capability is **API-only** or
**env/file-only with no UI at all**. The hub UI is similarly sparse (auth, my-servers,
claim-server, requests, shares, invite-accept) and is missing management for the very things it
stores. The `admin-nav.tpl` template even carries a TODO: *"subsequent admin pages (users,
libraries, settings) plug in here."*

Goal: ensure **every supported feature has a UI element to control/view it**. This plan maps the
full backend feature set to its UI status and lays out the work to close the gaps.

**Decisions already captured (from clarifying questions + follow-up messages):**
- **Scope:** both server and hub, **server-first**.
- **Approach:** build a **new client-side admin app** (SPA), not the existing SSR-only pattern.
- **Priority:** **operator control-plane first** (libraries, users, settings, integrations), then
  devices/casting, then viewer-facing polish.
- **Also required:** update `phlix-docs` + each repo's `README.md`; write tests for everything,
  targeting **as-high-as-possible (near-100%) coverage**; **evaluate what belongs in `phlix-shared`**.
- **Runtime:** upgrade to **Webman 2.2 / Workerman 5.1**, make **everything async** (coroutines), and
  prefer **Webman/Workerman-native** mechanisms wherever they exist (consult the Chinese docs).
- **Git workflow (per step):** `unset GITHUB_TOKEN` before any `gh`; local repo sits on a clean,
  pulled `master` **before and after** every step; do the work on a `feat/<slug>` branch → push →
  `gh pr create` → wait for green CI → `gh pr merge --squash --delete-branch` → `git checkout master
  && git pull`. Never commit to master directly, never amend, never force-push, never `--no-verify`.
- **Execution model:** an **agent hierarchy** — one **Master Coordinator** → **Phase Coordinators**
  → per-step **Implementer**, then a synchronous QA cycle of **Reviewer → Fixer (loop until clean)
  → Tester → Documenter**, each a fresh subagent. Work is split into **small steps (≈1 PR each)** to
  keep context usage low.
- **Target executor:** **OpenCode + MiniMax M2.7** (less capable than Claude) — so the plan and the
  coordinator prompt are **maximally explicit**: exact commands, exact paths, decision trees,
  unambiguous done-criteria, and pitfall warnings.
- **Skip infra-untestable items** (DVB-T scan, ACME/TLS provisioning) in favor of verifiable work.

**Three gaps confirmed to be UI + *new API*, not UI-only:**
1. **User/profile management** — no `/admin/users` routes exist today.
2. **Live TV / DVR** — no HTTP routes exist; only internal `HdHomeRun`/`SchedulesDirect` clients.
3. **Server-wide settings** — config lives in `config/*.php` (boot-time, file-based, not
   runtime-editable); there is no settings store or `/admin/settings` endpoint.

---

## Architecture

**Server admin console = a new SPA** (React + TypeScript + Vite, consistent with the monorepo:
mobile uses React, windows-client uses Vite+TS):
- Mounted at `/admin/*`, gated by the existing `AdminMiddleware`.
- Consumes the existing **JWT-authed JSON API** (`/api/v1/*`); reuses token storage from
  `public/assets/js/api-client.js`.
- Source in `phlix-server/admin-ui/`; build output to `public/assets/admin/`.
- A new `AdminAppController` (in `src/Server/WebPortal/Controllers/`) serves the HTML shell;
  dispatch wired in **both** entry points: `public/index.php` and `src/Server/Http/HttpHandler.php`.
- Existing `/admin/plugins` (SSR) and `/admin/dashboard` (SSR) **fold into the SPA**; the
  thin SSR pages can stay until migrated.

**SSR viewer portal is unchanged** (home/library/music/books/audiobooks/photo/search/player remain
template-rendered). Phase-3 viewer polish extends those SSR pages, not the SPA.

**Hub:** smaller surface — keep its existing SSR + vanilla-JS stack for the simple form gaps (invite
links, share editing), and add a small hub-admin section (settings, relay/TLS monitoring, audit
log). The server SPA tooling can be reused later if richer hub interactivity is wanted.

---

## Runtime & async (cross-cutting — applies to every phase)

Lean on **Webman + Workerman** primitives wherever they provide a native way, and make **everything
async**. Consult the **Chinese Webman/Workerman docs** (more complete than English).

- **Upgrade to Webman 2.2 / Workerman 5.1** in both repos:
  `composer require -W workerman/workerman:~5.1 workerman/webman-framework:~2.2`. Coroutine support +
  connection pooling landed in **2.1** (PHP≥8.1, Workerman≥5.1); **2.2** adds annotation routing.
  Server is on `webman-framework ^2.0` → bump to `~2.2`; **hub has only raw Workerman → add
  `webman-framework ~2.2`** for parity.
- **Standardize the stack.** Prefer Webman/Workerman-native components for new code: routing &
  middleware, async DB with **built-in connection pools** (`webman/database ~2.1` Illuminate, or keep
  the existing async `workerman/mysql`), async Redis (`webman/redis ~2.1`, pooled), async HTTP
  (`workerman/http-client`), `Timer`, `Channel`, and the process/worker model. Pools
  (`max_connections`/`min_connections`/`wait_timeout`/`idle_timeout`/`heartbeat_interval`) work in
  both coroutine and non-coroutine modes.
- **Enable the coroutine runtime (currently NOT enabled).** `start.php` / `public/index.php` /
  `Application.php` create plain `new Worker(...)` with no coroutine driver — so any blocking call
  stalls the whole worker. Configure Workerman 5's coroutine event driver (uv loop via **`ext-uv`**;
  Swoole coroutine support) and enable Swoole runtime hooks
  (`Swoole\Runtime::enableCoroutine(SWOOLE_HOOK_ALL)`) so existing blocking I/O becomes non-blocking
  inside coroutines; run per-request handlers in coroutines. **Use `support\Context` (never
  static/global) for request-scoped state.**
- **All new I/O is async, and convert the hot blocking paths.** New admin API, LiveTv API, settings
  store, fs-browse, webhook delivery, and integration calls must be non-blocking. Convert the
  blocking HTTP hotspots: `src/Webhooks/Plugins/*` (Discord/Pushover/Ntfy/Apprise/MQTT),
  `src/Media/Metadata/MetadataHttpClient`, `src/Hub/{HttpClient,HubClient,SubdomainClient}`,
  `src/LiveTv/**` (HdHomeRun/SchedulesDirect/IPTV/Comskip fetchers),
  `src/Network/{PortForwardService,UpnpIgdClient}`, `BookController` download,
  `ThemeMediaStreamController` — move to `workerman/http-client` or rely on the Swoole coroutine hook.
- **Long jobs off the request path.** Library scans, transcodes, DVR recordings, and backups run in
  dedicated worker processes/coroutines (extend the existing `scripts/run-*-worker.php` + the Webman
  `process` model / `webman/redis-queue`), pushing progress to the UI over WebSocket — never blocking
  an HTTP worker.
- **phlix-shared async angle.** The Arr clients (cURL today) and any shared HTTP should sit behind an
  **injected HTTP-client interface** in shared, so the server provides an async implementation. Keeps
  shared transport-agnostic and consistent with its "zero-I/O, interfaces/DTOs only" charter.

## Install scripts & CI (Swoole + uv on bare metal + CI)

- Both `docker/Dockerfile` (server) and `Dockerfile` (hub) **already build Swoole** (full flag set:
  `--enable-swoole --enable-sockets --enable-mysqlnd --enable-swoole-curl --enable-cares
  --enable-swoole-pgsql --enable-swoole-sqlite --enable-swoole-coro-time --enable-iouring
  --enable-uring-socket --with-swoole-ssh2 --enable-swoole-ftp --enable-zstd --enable-brotli …`)
  and **php-uv** from source. Canonical flags + rationale live in **`phlix-server/docker/README.md`**
  — **reuse that as the single source of truth.**
- **Add idempotent Swoole + php-uv install steps** to `phlix-server/scripts/install.sh`,
  `phlix-hub/scripts/install.sh`, and `phlix-server/install/systemd.sh`: install `-dev` libs
  (`libuv-dev`, etc.), compile with the documented flags, drop `extension=swoole.so` /
  `extension=uv.so` ini files, and **skip if already loaded**. Note the `--enable-iouring`
  **kernel-5.6+ runtime caveat**; degrade gracefully on older kernels.
- **Update CI** so async paths run: `phlix-server/.github/workflows/phpunit.yml` and
  `phlix-hub/.github/workflows/ci.yml` install/enable `swoole` + `uv` (via `shivammathur/setup-php`
  `extensions:` or the same source build). Keep `coding-standards.yml` + PHPStan L9 green.
- **Preflight check:** Workerman needs `pcntl_*`, `posix_*`, `proc_*`, `exec`/`shell_exec`,
  `stream_socket_*` **not** disabled in `php.ini` (Phlix also shells out via `symfony/process` for
  ffmpeg/avahi/dvbv5). Add Webman's disable-function check to the install scripts as a preflight.
- **Caveat — `build:bin`/`build:phar` are incompatible with the async requirement:** the standalone
  binary has **no Swoole coroutine support** and no `reload`. Since we depend on coroutines, deploy
  from source under **systemd** (the project already has `install/systemd.sh`), not `build:bin`.

---

## Webman 2.2 — framework capabilities to adopt (from the docs)

Prefer the native mechanism over hand-rolled code; consult the **Chinese docs** for current APIs.

- **`webman/console` CLI** → provides the real `bin/phlix`-style CLI that `missing.md` §3.1 flagged as
  missing. Gives `make:controller/model/crud/middleware/command`, `route:list`, and
  `start/stop/reload/restart/status`. Replace ad-hoc `scripts/*.php` with console commands
  (migrate, library:scan, user:reset-password, plugin:*, hub:claim, backup:create, hwaccel:probe).
- **`workerman/crontab` (2nd-precision, custom process)** → scheduled backups, EPG refresh, library
  scans, trickplay generation, retention cleanup, hub heartbeat. Define in a `Task` process.
- **`webman/push` (Pusher-compatible WS + JS SDK, private channels)** → push live progress
  (scan/transcode/recording/backup %) to the admin SPA. Or reuse the server's existing `WebSocket/`
  layer; pick one and standardize.
- **`webman/redis-queue` (+ Stomp option)** → offload slow jobs (scans, transcodes, notification
  fan-out, Arr/metadata sync) with retries/delays; return results via push.
- **Custom processes (`config/process.php`)** → formalize the existing `run-*-worker.php` as managed
  worker pools (count, user/group, reusePort); add a dedicated **task port** for slow admin endpoints
  if needed.
- **Routing + annotations (2.2) + `Route::resource` + named routes** → use for the **new** admin and
  LiveTv route tables; migrate existing routes incrementally, not big-bang.
- **Middleware (onion, global/route/method, `#[Middleware]`)** → admin auth gating (augment/replace
  `AdminMiddleware`), CORS for the SPA, per-route limits.
- **`webman/validation` (`#[Validate]` / `Validator::make`)** → validate every new admin form/API
  input. **`#[Limit]` rate-limiter** → throttle auth + sensitive admin endpoints.
- **Exception model (`BusinessException` + custom `Handler`)** → one structured JSON error shape
  (`{code,msg}`) for the whole admin API; auto-adapts JSON vs HTML.
- **DI (`php-di`, already a dep; `#[Inject]`, `config/dependence.php`)** → align new services.
- **`webman/cache` (PSR-16, pooled)** → cache metadata, EPG, dashboard/stats aggregates.
- **Env (`vlucas/phpdotenv`)** → standardize `.env` + `.env.example` across both repos (hub already
  reads `getenv`); settings stores layer on top of env defaults. Use **NTS PHP**.
- **Monitor process** → file-watch reload (dev) + **memory-monitor auto-restart** (prod) to contain
  resident-memory growth on long-running media/transcode workers.
- **Pagination (`paginate()`)** → server-side pagination for large library/stats/user lists (note
  `links()` unsupported — return JSON meta for the SPA).
- **Image (`intervention/image`)** → standardize poster/thumbnail/trickplay image processing.
- **Translation (`symfony/translation`, `trans()`/`locale()` + per-request middleware)** → i18n for
  the web UI.
- **AOP (`hyperf/aop-integration`)** — *optional*, for cross-cutting logging/timing/transactions.
- **Resident-memory discipline:** no `exit`/`die` in handlers; never store request data in
  `static`/`global` (use `support\Context`); avoid unbounded static arrays; `controller_reuse` only
  with stateless controllers; worker count 3–8× cores for DB/IO workloads. In the review checklist.
- **Security (controller-suffix, low-priv user, nginx in front, escape-on-render)** → keep the
  controller-suffix convention; the existing `reverse-proxy/` nginx config should set
  `X-Real-IP`/`X-Forwarded-*` + WS upgrade headers and serve `public/` (incl. SPA bundle) via
  `try_files`.

### View layer decision — Twig vs Smarty (viewer-facing SSR only)

The admin console is an SPA (no server templates). This only affects the **viewer-facing** SSR
portal (~40 `.tpl` files). Webman's `view()` natively supports **PHP/Twig/Blade/ThinkTemplate — not
Smarty**. Both Smarty and Twig compile to PHP and cache; in a resident-memory worker with **OPcache**,
per-request cost is just executing compiled PHP, so the raw-speed gap is **negligible** (Smarty
marginally faster on pure render; Twig closes it with its compile cache).
**Decision (default): migrate the SSR templates to Twig** — first-class Webman integration + default
auto-escaping (XSS win). Fallback: keep Smarty via direct `PageRenderer` instantiation (works today;
avoids the one-time `.tpl` port). If the migration proves too large for the timeline, mark step 0.9
deferred and keep Smarty.

---

## EXECUTION MODEL (how this plan is run)

> Executed by **OpenCode + MiniMax M2.7**, which is less capable than Claude. Be literal. Follow
> every instruction exactly. Do not improvise architecture. When unsure, prefer the smallest change
> that satisfies the step's acceptance criteria, and write questions into the STATUS file rather than
> guessing.

### Agent hierarchy

```
Master Coordinator (1, long-lived)
  └─ Phase Coordinator (1 per phase, spawned one at a time)
       └─ for each STEP (sequential, ≈1 PR each), on a feat/ branch:
            A. Implementer   — writes the code/work for the step.
            B. Reviewer      — reviews THIS step's diff; numbered findings or "NO FINDINGS"
                               (oac:code-review).
            C. Fixer         — fixes every finding.  ⟲ LOOP B⇄C UNTIL "NO FINDINGS".
            D. TestEngineer  — builds/extends tests for THIS step's changes to the coverage target;
                               runs suite + static analysis.  If red → back to C; ⟲ until green.
            E. Scribe        — updates phlix-docs + README + CHANGELOG + in-code docblocks for the
                               step; ensures docs are COMPLETE and accurate.
            F. GIT CYCLE     — commit → push → PR → green CI → squash-merge → pull master.
                               (END OF STEP — ONE PR per step containing impl + tests + docs.)
       After EACH step's GIT CYCLE, run the CUMULATIVE pass (catches cross-step regressions):
            G. Reviewer (cumulative) — review ALL steps completed so far IN THIS PHASE together
                                       (integration + regressions), reading every completed step's
                                       worklog + diff.
            H. Fixer (cumulative)    — fix findings.  ⟲ LOOP G⇄H until clean.  If any fixes were made,
                                       ship them via their OWN GIT CYCLE (feat/ → PR → merge → pull)
                                       and re-run TestEngineer if code changed.
       Then update STATUS and proceed to the next step.
```

- **Agents (fresh subagent each, all synchronous — parent waits for each before spawning the next):**
  **Implementer · Reviewer · Fixer · TestEngineer · Scribe** (the cumulative Reviewer/Fixer are the
  same agent types re-spawned with cross-step scope).
- **The per-step cycle is MANDATORY after every step** — never skip Review→Fix→TestEngineer→Scribe,
  and never merge a step's PR until that step's cycle is clean + green.
- **Information handoff (must flow all the way down):** each agent appends its outputs to a per-step
  worklog `/home/sites/phlix/steps/<step-id>.worklog.md` (Reviewer findings, Fixer resolutions,
  TestEngineer coverage% + command output, Scribe doc changes). The next agent reads the worklog
  first; the cumulative Reviewer reads ALL completed worklogs + diffs for the phase. STATUS holds the
  one-line state; the worklog holds the detail.
- **Each subagent receives only**: (a) the step spec, (b) the file paths it needs, (c) the relevant
  convention snippet, (d) the step's worklog — **not** the whole plan. This conserves context.
- The **Master Coordinator** owns phase order, spawns one Phase Coordinator at a time, verifies
  `master` is clean+green between phases, and never lets two steps be in flight at once.

### STATUS file (shared memory)

`/home/sites/phlix/PHLIX_UI_STATUS.md`. One row per step:
`| step-id | title | repo | state | PR | coverage% | notes |` where state ∈
`todo | implementing | review | fixing | testing | documenting | merging | done | blocked`.
Every subagent reads its row first and writes its result back. On resume, continue at the first
non-`done` step.

### Git workflow (MANDATORY, every step)

```bash
unset GITHUB_TOKEN                       # ALWAYS, before any gh command
git checkout master && git pull          # start clean + current
git checkout -b feat/<phase>-<step>-<slug>
# ... implement / fix / test / document ...
git add <specific files>                 # never `git add -A` blindly
git commit -m "<type>: <what> (<step-id>)"
git push -u origin feat/<phase>-<step>-<slug>
unset GITHUB_TOKEN; gh pr create --fill  # PR
# wait for CI to go green (poll `gh pr checks`); if red → Fixer → push again
unset GITHUB_TOKEN; gh pr merge --squash --delete-branch
git checkout master && git pull          # local ends on clean master
```

Rules: one repo per PR; never commit to `master` directly; never `--amend`; never force-push; never
`--no-verify`; if a pre-commit hook (e.g. `caliber refresh`) runs, stage its output and re-commit.

### Step spec template (Phase Coordinator writes one per step before dispatch)

`/home/sites/phlix/steps/<step-id>.md` containing:
- **Objective** — one sentence.
- **Repo** — server / hub / shared / docs.
- **In scope (files)** — explicit paths to create/edit.
- **Out of scope** — what NOT to touch.
- **Depends on** — prior step-ids that must be `done`.
- **Acceptance criteria** — bullets, each objectively checkable.
- **Tests + coverage target** — what to test, target % (near-100% on new/touched code).
- **Docs** — which phlix-docs pages + README + CHANGELOG entries to update.
- **Verification commands** — exact commands that must pass.
- **Done =** — the unambiguous completion condition.

(See `steps/0.1-webman-upgrade.md` for a worked example.)

### Per-role briefs

- **Implementer:** "Implement exactly the In-scope items to satisfy Acceptance criteria. Do not add
  features. Use the conventions snippet. Append a summary of what you changed to the step worklog.
  Stop when criteria are met."
- **Reviewer (per-step):** "Review THIS step's diff against Acceptance criteria, security
  (XSS/SQLi/path-traversal/auth), async rules (no blocking I/O in handlers; `support\Context` not
  statics), and Webman conventions. Write a numbered findings list (or 'NO FINDINGS') to the step
  worklog." (Use `oac:code-review`.)
- **Fixer:** "Read the latest findings in the worklog. Resolve EVERY numbered finding. Do not
  introduce new scope. Record resolutions in the worklog." Loop with Reviewer until 'NO FINDINGS'.
- **TestEngineer:** "Read the worklog. Add/extend tests covering THIS step's changes to the coverage
  target. Run the verification commands. Write pass/fail + coverage% + command output to the worklog.
  If failing, hand back to Fixer." (Use `oac:test-generation`.)
- **Scribe:** "Read the worklog. Update the listed phlix-docs pages, README, CHANGELOG, AND in-code
  docblocks to match what shipped — ensure they are COMPLETE and accurate. No behavioral code
  changes. Record what you documented in the worklog."
- **Reviewer/Fixer (cumulative, after each step's merge):** "Review ALL steps completed so far in
  this phase together — focus on integration between steps and regressions (broken imports, changed
  signatures, drifted docs, coverage gaps at the seams). Read every completed worklog + the merged
  diffs. Fix via a dedicated PR; re-run TestEngineer if code changed."

### Coverage policy

Target **as much coverage as possible (aim ~100%)** on all new/touched code. The TestEngineer
enforces per step; CI must run the full suite (not just Unit) with `swoole`+`uv` loaded. A step is
not `done` if coverage on its new code regresses below target without a written justification in
STATUS.

### MiniMax M2.7 explicit hints (read every step)

- This is **Workerman/Webman (resident memory)** — NOT PHP-FPM. **Never** `exit`/`die`, never
  `sleep()` (use `Timer::sleep`), never store request data in `static`/`global` (use
  `support\Context`). Unbounded static arrays = memory leak.
- **Async:** new I/O must be non-blocking (coroutine + `workerman/http-client` or Swoole hooks). DB
  via the async client/pool. Long jobs go to a queue/worker process, never inline in a handler.
- **Always `unset GITHUB_TOKEN`** before `gh`. **Always** return to clean `master` between steps.
- If an **OAC skill** applies (system reminders will say so), you MUST invoke it first.
- If a step is bigger than ~1 PR, STOP and ask the Phase Coordinator to split it.
- Verify before claiming done: run the exact Verification commands and paste output into STATUS.
- Skip infra-untestable items (DVB-T scan, ACME/TLS provisioning) — mark `blocked` with the reason.

---

## PHASE 0 — Foundation (prerequisites; land before/with Phase 1)

Ordered steps (each ≈1 PR):

- **0.1 — Upgrade Webman 2.2 / Workerman 5.1** in both repos (`composer require -W
  workerman/workerman:~5.1 workerman/webman-framework:~2.2`; add webman-framework to the hub). Boot
  works; suites green.
- **0.2 — Enable the coroutine runtime.** Set the `eventLoop` (Swoole) in the worker config; run
  handlers in coroutines; introduce `support\Context` where request state was held. Verify with
  `scripts/bench` that requests don't serialize.
- **0.3 — Swoole + uv on bare metal + CI.** Add the Dockerfile's documented Swoole/uv build to
  `phlix-server/scripts/install.sh`, `phlix-hub/scripts/install.sh`, `install/systemd.sh`
  (idempotent); add a disable-function preflight; load `swoole`+`uv` in `phpunit.yml` + `ci.yml`.
- **0.4 — Admin SPA scaffold.** Vite+React+TS in `phlix-server/admin-ui/` → build to
  `public/assets/admin/`; `AdminAppController` serves the shell at `/admin/*` (AdminMiddleware-gated,
  redirect non-admins to `/login`); typed API client wrapping `/api/v1/*`; shared components (data
  table, form, modal, toast); router + admin nav. Wire dispatch in `public/index.php` + `HttpHandler`.
- **0.5 — Server-wide settings store.** Migration `server_settings` (typed key/value) +
  `SettingsRepository` + `AdminSettingsController` (`GET`/`PUT /api/v1/admin/settings`); reads override
  `config/*.php` defaults at runtime. Mirror user-settings persistence (`ON DUPLICATE KEY UPDATE`).
  **Without this, every "Server settings" page has nothing to persist to.**
- **0.6 — Filesystem-browse endpoint** `GET /api/v1/admin/fs/browse` (admin-gated, jailed to allowed
  roots via `str_starts_with(realpath...)`). Needed by "add library."
- **0.7 — Shared schemas/DTOs (phlix-shared).** Add `schemas/server-settings.schema.json` + a webhook
  **event catalog** (one source of truth for server validation + SPA form-rendering); source the
  webhook event picker from `Phlix\Shared\Events`/`EventNameMap`. Keep shared "zero-I/O, DTOs only."
- **0.8 — `webman/console` CLI baseline.** Install `webman/console`; provide real commands replacing
  `scripts/*.php` (migrate, library:scan, user:reset-password, plugin:*, hub:claim, backup:create,
  hwaccel:probe) — closes the `bin/phlix` gap from `missing.md` §3.1.
- **0.9 — (decision) View layer → Twig.** If approved, port SSR `.tpl` files to Twig and switch
  `config/view.php`; else keep Smarty via `PageRenderer` and mark deferred.

---

## Phase 1 — Operator control-plane (the "basic things")

> **Step convention for Phases 1–3 + Hub track:** each numbered item is **one step (≈1 PR)**,
> step-id `<phase>.<item>` (e.g. `1.2`). For larger items (Integrations, Server settings) the Phase
> Coordinator splits into sub-steps `1.4a/1.4b/…`, one PR each. Every step runs the full QA+git cycle
> and gets a `steps/<id>.md` spec first.

Each item: UI page(s) → API consumed → new API needed?

1. **Library management** *(headline gap)* — list / add / edit / delete libraries, trigger scan &
   rescan, view scan status/history. API: existing `/api/v1/libraries*`. Needs **0.6**.
2. **User & profile management** — list/create/edit/delete users, set-admin, reset-password; manage
   per-user profiles (≤5), PINs (4/6-digit), rating filter. **UI + NEW API**: `AdminUserController`
   (`GET/POST/PUT/DELETE /api/v1/admin/users`, `…/reset-password`, `…/set-admin`) + profile endpoints
   over `UserProfileManager`.
3. **Server settings** — pages for Transcoding/HW-accel (`ffmpeg`,`hwaccel`,`hwaccel_profiles`),
   Metadata providers + API keys (TMDB/TVDB/Fanart), Marker detection, Subtitles, Discovery,
   Trickplay, Newsletter, Port-forward/UPnP. **UI + 0.5** (persist via settings store).
4. **Integrations** — Arr (Radarr/Sonarr/Bazarr/Prowlarr URLs+keys via 0.5; existing trash-guides
   sync trigger/status/enable), Trakt connect (existing OAuth), Last.fm (route the orphaned
   `admin/lastfm.tpl`), **Webhooks CRUD + test** (existing `/api/v1/admin/webhooks*`), Notification
   providers config (Discord/Slack/Telegram/ntfy/Pushover/Apprise/MQTT — via 0.5), Auth providers
   OIDC/LDAP config + test (existing endpoints).
5. **Backup / restore** — list/create/delete/restore, schedule, S3 config. Existing
   `/api/v1/admin/backup*`.
6. **Stats & dashboard** — richer stats (playback, top users, top media, storage) beyond the current
   read-only dashboard. Existing `/api/v1/admin/stats*` + `…/dashboard*`.

---

## Phase 2 — Devices, casting & remote access

- **Cast/device control** — Chromecast, AirPlay, Roku, DLNA renderers: discover/list/status +
  play/pause/stop/seek, wired into the player. Existing APIs (`/api/v1/cast`, `/airplay`, `/roku`,
  `/dlna/renderers`).
- **DLNA server** status/toggle. Existing `src/Dlna/`.
- **Remote access (hub) on the server** — surface the existing scripts (`pair-with-hub.php`,
  `claim-subdomain.php`, `port-forward.php`) as an admin "Remote Access" page showing hub pairing,
  subdomain, relay status. (Chromecast-over-relay already works via the relay HTTP pipe — no separate
  UI.)
- **Live TV / DVR** — **UI + LARGE new API** (no HTTP routes exist). Build channels/guide/recordings/
  tuners endpoints over `src/LiveTv/` first, then a tuner-config + EPG-grid + recording-schedule UI.
  **DVB-T scan UI DEFERRED** (backend stubbed/infra-untestable); focus on HDHomeRun + DVR.

---

## Phase 3 — Viewer-facing polish (SSR portal)

- **Full `/settings` page** — replace the thin shell: streaming prefs, audio/subtitle languages,
  subtitle mode, parental PIN. Existing user-settings API.
- **WebAuthn / passkeys** — route the orphaned `auth/webauthn-settings.tpl`; existing API.
- **Collections** management incl. smart-collection rules. Existing `/api/v1/collections*`.
- **Markers / extras** view + edit; **continue-watching** + **watch-history** management.
- **SyncPlay** UI; **theme switcher** exposure (light/dark/amoled/contrast already exist).

---

## Hub track (after server Phase 1; can parallelize)

- **Invite link management** — create (per server/library, max-uses, expiry) / list / revoke. API
  exists (`/api/v1/me/invite-links`), **no UI**.
- **Library shares** — create-share form + permission edit (`PATCH /api/v1/me/shares/{id}`). API
  exists, partial UI.
- **Server detail page** — heartbeat metrics (uptime/sessions), access-info, subdomain/relay status,
  **relay session monitoring** (bytes in/out, duration). Data exists, no UI.
- **Subdomain / TLS status** — read-only view of DNS-challenge/cert state. **No provisioning UI**
  (ACME is out-of-band).
- **Hub admin settings** — Radarr/Sonarr config (env-only today → needs a hub settings store, mirror
  0.5); **audit-log viewer** (`AuditLogger` writes but has no page).
- **Federation policy** — not present in hub routes today; **needs backend scoping first** (flag).

---

## phlix-shared evaluation

- Add `schemas/server-settings.schema.json` + a webhook-event catalog — one source of truth for
  server validation and SPA form-generation.
- Consider DTOs for admin resource shapes (`Library`, `User`, `Webhook`, `Backup`) so server + hub +
  clients share types (controllers return ad-hoc arrays today; optional, can be staged). Keep "zero
  I/O, DTOs/interfaces only."
- Webhook event picker sources names from `Phlix\Shared\Events`.

---

## Testing (target near-100% coverage)

- **PHP (server + hub):** PHPUnit Unit + Integration for **every new** controller/endpoint/store.
  Repo emits `coverage.xml` + `coverage-report/`; drive new code to ~100%. Keep **PHPStan L9** +
  **PHPCS PSR-12** green. Page render tests follow `ClientMountControllerTest` / existing
  PageController patterns.
- **SPA:** Vitest unit/component tests for pages + the API client; Playwright e2e for critical admin
  flows (add library, create user, change+persist a setting, configure+test a webhook).
- **phlix-shared:** PHPUnit for new schemas/DTOs.

## Docs

- **phlix-docs:** new/updated pages — `admin/library-management.md`, `admin/user-management.md`,
  `admin/server-settings.md`, `advanced/live-tv.md` (UI section), `clients/casting.md`,
  `hub/invite-links.md`, `hub/shares.md`, `hub/admin-settings.md`; fold UI sections into existing
  `admin/{webhooks,stats,dashboard,backup}.md`, `integrations/{trakt,lastfm}.md`, `advanced/dlna.md`.
  Document the admin SPA + build step in `dev/`.
- **README.md:** update `phlix-server` (admin app + build commands), `phlix-hub` (new UI pages),
  `phlix-shared` (new schemas/DTOs).

---

## Critical files

- **New:** `phlix-server/admin-ui/**` (Vite+React+TS) → builds to `public/assets/admin/`.
- **New:** `src/Server/WebPortal/Controllers/AdminAppController.php` (SPA shell, AdminMiddleware).
- **Modify:** `public/index.php` + `src/Server/Http/HttpHandler.php` (dispatch `/admin`, `/admin/*`).
- **New:** migration `server_settings` + `SettingsRepository` + `Http/Controllers/Admin/AdminSettingsController.php`.
- **New:** `Http/Controllers/Admin/AdminUserController.php` (+ routes) + profile endpoints.
- **New:** `Http/Controllers/Admin/FsBrowseController.php`.
- **New (Phase 2):** `src/Server/Http/Controllers/LiveTv/*` + route registration in `Application.php`.
- **Modify:** `public/templates/partials/admin-nav.tpl` (deprecated by SPA nav),
  `public/templates/settings/index.tpl` (real form); route `auth/webauthn-settings.tpl` &
  `admin/lastfm.tpl`.
- **phlix-shared:** `schemas/server-settings.schema.json` + optional DTOs.
- **Hub:** `src/Http/Controllers/*` new pages + `public/templates/home/*` (invite links, shares,
  server-detail, admin-settings, audit-log); hub settings-store migration.
- **Runtime/async:** `start.php` + `public/index.php` + `Application.php` (enable coroutine driver /
  Swoole runtime hooks); async HTTP client replacing cURL hotspots; add `workerman/http-client` (both
  repos) + `workerman/webman-framework` (hub) to composer.
- **Install/CI:** `phlix-server/scripts/install.sh`, `phlix-hub/scripts/install.sh`,
  `phlix-server/install/systemd.sh` (Swoole+uv build, reusing `docker/README.md` flags);
  `phlix-server/.github/workflows/phpunit.yml`, `phlix-hub/.github/workflows/ci.yml` (load swoole+uv).

## Route registration reference

Routes register via `loadXxxRoutes()` in `src/Server/Core/Application.php`; page dispatch is the
`str_starts_with($path, ...)` chain in `public/index.php` (mirrored in `HttpHandler`). Admin JSON is
gated by `src/Server/Http/Middleware/AdminMiddleware.php`. New admin pages follow the
`PluginAdminPageController` precedent (thin controller → SPA shell → JSON API).

---

## Verification

End-to-end against a live server (`php public/index.php`) + DB, logged in as admin:
- **Phase 1:** add + scan a library; create/edit a user with a profile + PIN; change a transcoding
  setting and confirm it **persists across a restart**; configure a webhook and hit **Test** (observe
  delivery); connect Trakt/Last.fm; run a backup then restore it.
- **Phase 2:** discover a cast device (or mock) and drive play/pause; configure an HDHomeRun tuner,
  load the EPG, schedule a recording.
- **Hub:** create + revoke an invite link; edit a share's permission; view a server's heartbeat /
  relay metrics.
- **Async runtime:** with the coroutine driver enabled, run `phlix-server/scripts/bench` and confirm
  concurrent requests do **not** serialize; verify a slow webhook/metadata/Arr call doesn't stall
  other requests; confirm `swoole` + `uv` load in install-script output and in CI.
- **Suites:** `phlix-server` `./vendor/bin/phpunit` (Unit+Integration) + `phpstan analyze --level=9`
  + `phpcs --standard=PSR12`; `admin-ui` vitest + playwright; `phlix-hub` phpunit; `phlix-shared`
  phpunit. Coverage near-100% on new code. CI runs with swoole+uv loaded.
- Per workflow: each step ships via `feat/` branch → PR → squash-merge → pull master; **skip** DVB-T
  scan + ACME provisioning UI.

---

## Appendix — Feature → UI coverage matrix

Legend: ✅ has UI · 🟡 partial/read-only · ❌ no UI (API/CLI/env only) · ➕ needs new API too

| Subsystem | UI today | Target (phase) |
|---|---|---|
| Auth: login/register | ✅ | keep |
| Auth: WebAuthn/passkeys | ❌ (template orphaned) | P3 (route template) |
| Auth providers: OIDC/LDAP | ❌ | P1 |
| User management | ❌ ➕ | P1 |
| User profiles / PIN / ratings | ❌ ➕ | P1 + P3 |
| User settings (playback/lang/subs) | 🟡 (thin shell) | P3 |
| Library: browse | ✅ | keep |
| Library: add/edit/delete/scan | ❌ | **P1** (0.6) |
| Server settings (transcode/meta/etc.) | ❌ ➕ | **P1** (0.5) |
| Collections / smart playlists | ❌ | P3 |
| Markers / intros / outros | ❌ | P3 |
| Extras / trailers | 🟡 (viewable in detail) | P3 |
| Theme media | ❌ | P3 |
| Streaming / transcoding profiles | ❌ | P1 |
| Music / Books / Audiobooks / Photos browse | ✅ | keep |
| OPDS | ✅ (feed) | keep |
| Plugins | ✅ | fold into SPA |
| Webhooks + notifications | ❌ | P1 |
| Stats / analytics | 🟡 (dashboard read-only) | P1 |
| Admin dashboard | 🟡 (read-only) | P1 |
| Backup / restore (+S3) | ❌ | P1 |
| Trakt / Last.fm | ❌ (lastfm template orphaned) | P1 |
| Arr (Radarr/Sonarr/Bazarr/Prowlarr) | ❌ | P1 |
| Chromecast / AirPlay / Roku / DLNA renderers | ❌ | P2 |
| DLNA server | ❌ | P2 |
| Live TV / DVR / EPG | ❌ ➕ | P2 (HDHomeRun; DVB-T deferred) |
| Discovery (mDNS/SSDP) | ❌ | P1 (settings) |
| Hub pairing / relay / subdomain (server side) | ❌ (scripts) | P2 |
| SyncPlay | ❌ | P3 |
| **Hub:** claim server / my-servers / requests | ✅ | keep |
| **Hub:** invite links | ❌ | Hub track |
| **Hub:** share create / permission edit | 🟡 | Hub track |
| **Hub:** server detail / heartbeat / relay sessions | ❌ | Hub track |
| **Hub:** subdomain/TLS status | ❌ | Hub track (read-only) |
| **Hub:** admin settings / audit log | ❌ ➕ | Hub track |
| **Hub:** federation policy | ❌ | needs backend first |
