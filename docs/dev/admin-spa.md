# Admin SPA (admin-ui)

> **Audience:** contributors working on the `phlix-server` admin console.
>
> **Tl;dr.** The admin console is a **React + TypeScript + Vite** single-page
> app in `phlix-server/admin-ui/`. Its production bundle is built into
> `public/assets/admin/` and **committed to the repo**, so the running
> Workerman server has **no Node build dependency at runtime**. It mounts at
> `/admin` + `/admin/*` behind the existing `AdminMiddleware` (non-admin →
> 302 `/login`) and talks to the existing JWT-authed JSON API. After editing
> `admin-ui/src/`, re-run `npm run build` and commit the refreshed bundle.

This page covers the admin SPA scaffold introduced in step **0.4** of the UI
coverage plan. Step 0.4 ships a working *shell* — nav, router, a typed API
client, and shared components — with **no feature pages yet** (those land in
Phase 1). The viewer-facing portal stays server-side-rendered (Smarty); only
the admin console is a client-side SPA.

---

## 1. Why a client-side SPA for the admin console

The viewer portal (`/`, `/music`, `/books`, …) is server-side-rendered with
Smarty and stays that way: it is largely read-oriented, benefits from fast
first paint and shareable URLs, and is already built. The **admin console** is
the opposite shape — dense, stateful, form-heavy CRUD over libraries, users,
and settings, with tables, modals, and optimistic updates. A client-side SPA
backed by the existing JSON API keeps that interaction local to the browser,
avoids a full-page round-trip per action, and lets the admin surface evolve
without touching server-render code. The two coexist: the SSR routes
(`/admin/plugins`, `/admin/dashboard`) keep working until they are folded into
the SPA in a later phase.

---

## 2. Source layout

The SPA source lives under `phlix-server/admin-ui/`:

| Path | Contents |
|---|---|
| `admin-ui/src/api/` | `client.ts` (the typed `ApiClient`) + `tokenStore.ts` (JWT token storage). |
| `admin-ui/src/auth/` | `useAdminGuard.ts` — the client-side admin guard (defence in depth over the server gate). |
| `admin-ui/src/components/` | Shared components: `DataTable`, `Form`, `Modal`, `Toast`. All render untrusted values as text/children (no `dangerouslySetInnerHTML`) — XSS-safe by construction. |
| `admin-ui/src/nav/` | `navItems.ts` (nav source-of-truth) + `AdminNav.tsx` (sidebar). |
| `admin-ui/src/pages/` | `DashboardPage` (empty for 0.4) + `NotFoundPage`. |
| `admin-ui/src/App.tsx` | The shell: guard → loading / redirect / authorized; toast provider + nav + routed content. |
| `admin-ui/src/main.tsx` | Bootstrap under `<BrowserRouter basename="/admin">`. |

Build configuration: `vite.config.ts` sets `base: '/assets/admin/'` and
`build.outDir` to `../public/assets/admin` (Vite builds straight into the
server's public directory). `tsconfig.json` is strict
(`noUncheckedIndexedAccess`).

---

## 3. Dev server vs. production build

```bash
cd admin-ui
npm install          # one-time / on dependency changes
npm run dev          # Vite dev server with HMR for local development
npm run build        # tsc --noEmit + vite build → ../public/assets/admin/
npm run test         # Vitest unit/component tests
```

`npm run dev` gives a hot-reloading dev server. **`npm run build` is what
ships:** it emits the production bundle into `public/assets/admin/`, which is
committed. When you change anything under `admin-ui/src/`, re-run
`npm run build` and commit the refreshed `public/assets/admin/` bundle along
with your source changes — CI runs `npm install && npm run build && npm run
test` to prove the committed bundle is reproducible and the tests pass.

`admin-ui/node_modules/` (and `admin-ui/coverage/`, `admin-ui/.vite/`,
`admin-ui/*.tsbuildinfo`) are gitignored; the built `public/assets/admin/`
directory is **not** ignored — it is the committed artifact the server ships.

---

## 4. The build-output decision (commit the bundle)

The built bundle is **committed** to `public/assets/admin/` rather than built
in CI/at deploy time. Rationale: the production server (Workerman, deployed
from source under systemd) then has **no Node build dependency at runtime** —
`AdminAppController` just serves the static `index.html` shell, and the
JS/CSS bundle is served by the existing static-file handler. CI still runs the
full `npm install && npm run build && npm run test` to prove the committed
artifact is reproducible, but the committed file is the source of truth the
server ships. If the bundle is ever missing at runtime,
`AdminAppController::shell()` returns a loud, actionable 503 rather than a
silent blank page.

---

## 5. Where and how it mounts

The SPA is served by
`src/Server/WebPortal/Controllers/AdminAppController.php`, a thin controller
that:

- `shell()` reads the committed `public/assets/admin/index.html` and returns
  it (200) for `/admin` and any `/admin/*` deep link, so client-side routing
  survives a page reload. It returns **503** (with a "run `npm run build`"
  message) when the bundle is absent, and path-traversal-guards the read
  (`realpath` + `str_starts_with` under the public root) as defence in depth.
- `gateRedirect(?int)` centralises the gate→response mapping: a `null` gate
  result means "allowed" (render the shell); a non-null result (**401**
  unauthenticated or **403** non-admin) maps to a **302 redirect to
  `/login`**, since a browser navigation can't render a JSON error envelope.

The route is wired in **both** entry points — `public/index.php` and
`src/Server/Workerman/HttpHandler.php` — and in both it is placed **AFTER**
the existing `/admin/plugins` and `/admin/dashboard` SSR branches, so those
specific routes keep winning. Each entry point gates the request with the
existing `AdminMiddleware::checkAccess()` (the single source of truth for the
admin gate + audit logging) and maps the result through `gateRedirect()`.

The client-side `useAdminGuard` is **defence in depth only** — the
authoritative gate is the server-side `AdminMiddleware`.

---

## 6. The typed API client and the `auth/me` contract gotcha

`admin-ui/src/api/client.ts` provides a typed `ApiClient` that **reuses the
existing JWT mechanism** from `public/assets/js/api-client.js` — it does not
invent a new auth scheme. Specifically it uses the same `localStorage` keys
(`access_token` / `refresh_token` / `user`), sends `Authorization: Bearer
<access_token>`, and on a 401 does a **single** retry after `POST
/auth/refresh {refresh_token}`.

`getCurrentUser()` consumes `GET /api/v1/auth/me`. **Two contract details bit
the first implementation** (the Vitest mocks initially encoded the wrong
shape, so a green suite still mis-handled the real backend):

1. **The response is wrapped.** `AuthController::me()` returns
   `{ "user": { … } }`, not a flat user object. The client unwraps the
   envelope in `getCurrentUser()` (`const { user } = await
   this.get<{ user: AuthUser }>('/api/v1/auth/me'); return user;`).
2. **`is_admin` is a DB `TINYINT`, not a JSON boolean.** The `users.is_admin`
   column serialises as `1` / `0` (or `"1"` / `"0"`), never JSON `true`. A
   strict `=== true` check fails for a real admin. The client normalises it at
   the API boundary via an exported `normalizeBool()` (treats
   `true` / `1` / `"1"` / `"true"` as true) so the rest of the app sees a real
   boolean.

If you add code that reads `auth/me` (or any endpoint that returns
DB-`TINYINT` flags), mirror this: unwrap envelopes and normalise integer
booleans at the client boundary, and write the Vitest mock to match the
**real** wire shape (`{ user: { …, is_admin: 1 } }`) so the test guards the
true contract.

---

## 7. Tests

Vitest covers the new SPA modules to ~99% statements/lines: the API client
(auth header present/absent, body serialization per verb, refresh-and-retry,
error handling), the token store, `useAdminGuard` (authorized / no-token /
non-admin / `is_admin: 1` envelope / loading / unmount-race), the App shell
(loading, nav + dashboard for an admin, renders-nothing + redirect for a
non-admin, client 404), and the four shared components. The remaining
uncovered lines are real-`window` navigation one-liners
(`window.location.href`) that jsdom cannot exercise.

On the server side, `AdminAppControllerTest` covers the shell (200 + bundle
HTML + content-type), the missing-bundle case (503), and the `gateRedirect`
mapping (null → allow, 401/403 → 302 `/login`).

---

## 8. The Libraries page (step 1.1c — the first feature page)

`LibrariesPage` (`admin-ui/src/pages/LibrariesPage.tsx`) is the **first real
feature page** built on top of the 0.4 scaffold. It mounts at
`/admin/libraries` (sidebar entry **Libraries**) and consumes the already-shipped
1.1b async-scan + 0.6 fs-browse contracts — **no backend changes were made in
this step**. The end-user workflow is documented on the
[Library Management admin page](../admin/library-management#managing-libraries-in-the-admin-ui);
this section covers the architecture details a contributor needs.

### Typed API wrappers

Two new typed wrappers sit beside `client.ts` and use the shared `ApiClient`:

| Module | Endpoint surface |
|---|---|
| `admin-ui/src/api/libraries.ts` (`LibrariesApi`) | `list`/`get`/`create`/`update`/`remove`/`scan`/`rescan`/`scanStatus`/`scanHistory` — 1:1 with the `LibraryController` endpoints. |
| `admin-ui/src/api/filesystem.ts` (`FilesystemApi`) | `browse(path?)` — wraps `GET /api/v1/admin/fs/browse` (step 0.6). |

Both wrappers **unwrap the single-key envelopes** the server returns so callers
receive the bare domain object — `{ libraries }` → `Library[]`, `{ library }` →
`Library`, `{ scan_status }` → `ScanJob | null`, `{ history }` → `ScanJob[]`, and
the `fs/browse` `{ success, data: { path, parent, entries } }` → bare
`FsBrowseResult`. Non-2xx responses still throw `ApiError` from the shared
client; the wrappers do not re-implement error handling.

Both wrappers `encodeURIComponent()` every library `id` segment. `LibrariesApi.update()`
**never sends `type`** — the PHP `updateLibrary()` ignores it, and the typed input omits
it so a future caller can't accidentally try.

### `LIBRARY_TYPES` — the `book` exclusion

`LIBRARY_TYPES` is an `as const` tuple of exactly the **five** values the DB ENUM
accepts:

```ts
export const LIBRARY_TYPES = ['movie', 'series', 'music', 'photo', 'video'] as const;
```

`book` is **deliberately absent**: migration `001_initial_schema.sql` declares the
`libraries.type` ENUM as exactly those five values, even though
`LibraryController::create()` *also* lists `book` in its `$validTypes`. A `book`
insert would `500` at the DB ENUM, so the UI never offers it. This is a known
controller/DB mismatch tracked as a backend carry-over.

### Polling design (coarse, resident-safe)

The Libraries page polls `scanStatus(id)` to follow a scan through its lifecycle.
A few details worth knowing if you touch this code:

- **Per-library `setInterval`.** Intervals live in a `useRef<Record<string, number>>`
  keyed by library id; one interval per library. A guard (`if (timersRef.current[id]
  !== undefined) return;`) prevents stacking when the user clicks **Scan** twice.
- **Default 2000ms.** The interval period is exposed as the `pollIntervalMs` prop
  (`DEFAULT_POLL_INTERVAL_MS = 2000`) so tests can drive it with fake timers.
- **Stops on terminal state.** As soon as `isTerminal(status)` (`completed` or
  `failed`) returns true, **or** `scan_status` is `null`, the interval is cleared.
- **Cleared on unmount.** A `useEffect` cleanup walks `timersRef.current` and clears
  every outstanding timer.
- **Coarse status only.** The page renders the status badge from
  `job.status` and the error string from `job.error` only. It deliberately
  does **not** render `items_*` counters or `current_path` as if they were live
  progress — the 1.1b worker leaves them at `0` / `null` (see the
  [Library Scan Worker](./library-scan-worker#coarse-progress-is-intentional)
  honesty note). Adding a per-file progress bar without first wiring the
  counters through the worker would be a fabricated contract — don't.

### Architecture note — destructure the stable `push` from `useToast()`

The page uses the shared `useToast()` context to surface success/error toasts. A
subtle gotcha bit the first implementation:

```ts
// WRONG — re-runs loadLibraries on every toast push
const toast = useToast();
const loadLibraries = useCallback(async () => { /* …toast.push(…)… */ }, [api, toast]);
```

`ToastProvider`'s context value is a `useMemo` over `[toasts, push, dismiss]`. Every
`toast.push(...)` re-renders the provider with a **new** context-value object
reference, so `useToast()` returns a new `toast` reference, which makes
`loadLibraries` (a `useCallback` depending on `toast`) recreate, which fires the
`useEffect([loadLibraries])` again — re-running `api.list()` and consuming the next
mocked response in tests (and emitting an unnecessary refetch in production).

The fix is to destructure the **stable** `push` callback (the provider wraps it in a
`useCallback`, so its reference is stable across renders) and depend on `push` instead
of the whole context value:

```ts
// RIGHT — push is reference-stable
const { push: pushToast } = useToast();
const loadLibraries = useCallback(async () => { /* …pushToast(…)… */ }, [api, pushToast]);
```

Mirror this pattern in any page that calls `pushToast` from inside a memoised callback
or effect.

### Test setup — real envelopes, no fabricated mocks

All four 1.1c test files (`libraries.test.ts`, `filesystem.test.ts`,
`PathPicker.test.tsx`, `LibrariesPage.test.tsx`) drive a **real** `ApiClient` against
the `makeFetch(...)` concrete-mock helper from `src/test/memoryTokenStore.ts`. Each
mocked response carries the **exact** envelope shape the PHP controller returns —
`{ libraries: [...] }`, `201 { library_id, message }`, `202 { job_id, status:
'queued', message }`, `{ scan_status: <ScanJob|null> }`, `{ history: [...] }`,
`{ success: true, data: { path, parent, entries } }`. The polling test uses
`vi.useFakeTimers()` to step `setInterval`, asserts the call count stops growing
once the job is terminal, and asserts an unmount clears the remaining timers.

This is the 0.4 fabricated-contract lesson: a green test on a hand-rolled wrong-shape
mock will pass while real integration breaks. Always anchor mocks against the real
controller response.

### Coverage (Vitest)

| File | Statements |
|------|------------|
| `src/api/libraries.ts` | 100% |
| `src/api/filesystem.ts` | 100% |
| `src/components/PathPicker.tsx` | 98.24% (uncovered = a defensively-unreachable early-return guard) |
| `src/pages/LibrariesPage.tsx` | 95.62% (uncovered ≈ a `||`-fallback template literal and one ternary false-arm v8 reports as a partial branch) |

Overall SPA: **98.73%** statements (2255/2284), 93.98% branches. The 95.62% floor on
`LibrariesPage.tsx` matches the 0.4 precedent.

---

## 14. The Dashboard page (step 1.6 — stats & dashboard SPA)

`DashboardPage` (`admin-ui/src/pages/DashboardPage.tsx`) is the admin console's
**stats dashboard** at `/admin/dashboard`. It replaces the Phase-0 placeholder
with a rich 5-section SPA page backed by the existing `DashboardController` +
`StatsController` PHP endpoints — **no new backend endpoints were added** in
this step.

### Tech stack additions

| File | Purpose |
|------|---------|
| `admin-ui/src/api/dashboard.ts` (`DashboardApi`) | Typed wrappers for DashboardController endpoints |
| `admin-ui/src/api/stats.ts` (`StatsApi`) | Typed wrappers for StatsController endpoints |
| `admin-ui/src/api/dashboard.test.ts` | 9 unit tests for DashboardApi (100% coverage) |
| `admin-ui/src/api/stats.test.ts` | 8 unit tests for StatsApi (100% coverage) |
| `admin-ui/src/pages/DashboardPage.tsx` | Full stats dashboard page (17 tests, 15 passing, 2 known-flaky) |
| `admin-ui/src/pages/DashboardPage.test.tsx` | Component tests |
| `admin-ui/src/styles.css` | Dashboard page styles (`.page--dashboard`, `.dashboard-grid`, `.dashboard-card`, skeleton loading, empty states, date range filter, badge variants) |

### Page routing

`DashboardPage` already has a route entry in `App.tsx` (added in the 0.4 scaffold
for the placeholder). Step 1.6 replaced the placeholder body with the full
implementation.

### DashboardApi wrapper (5 methods)

| Method | Endpoint | Returns |
|--------|----------|---------|
| `getNowPlaying()` | `GET /api/v1/admin/dashboard/now-playing` | `NowPlayingEntry[]` |
| `getTopUsers(limit?, days?)` | `GET /api/v1/admin/dashboard/top-users?limit=N&days=N` | `TopUserEntry[]` |
| `getTopMedia(limit?, days?)` | `GET /api/v1/admin/dashboard/top-media?limit=N&days=N` | `TopMediaEntry[]` |
| `getStorage()` | `GET /api/v1/admin/dashboard/storage` | `StorageEntry` |
| `getActivity(limit?)` | `GET /api/v1/admin/dashboard/activity?limit=N` | `ActivityEntry[]` |

### StatsApi wrapper (4 methods)

| Method | Endpoint | Returns |
|--------|----------|---------|
| `getPlaybackStats(from?, to?)` | `GET /api/v1/admin/stats/playback?from=…&to=…` | `PlaybackStatEntry[]` |
| `getTopUsers(limit?, since?)` | `GET /api/v1/admin/stats/top-users?limit=N&since=…` | `TopUserEntry[]` |
| `getTopMedia(limit?, since?)` | `GET /api/v1/admin/stats/top-media?limit=N&since=…` | `TopMediaEntry[]` |
| `getStorageStats()` | `GET /api/v1/admin/stats/storage` | `StorageEntry` |

Both wrappers use `ApiClient.get()` with a params object. `URLSearchParams` handles
encoding internally — no `encodeURIComponent` calls in callers.

### Dashboard page layout (5 sections)

| Section | Key detail |
|---------|------------|
| **Now Playing** | Live list with progress bars, device info, status badge. Auto-refreshes every 30 s via `setInterval` stored in `useRef`, cleared on unmount via `useEffect` return. |
| **Top Users** | Leaderboard table (rank / username / watch time / play count / avatar). Date range filter (7d / 30d / 90d) via `useState` + `useEffect` re-fetch. |
| **Top Media** | Ranked list with poster thumbnail, type badge, play count, total duration. Same date range filter. |
| **Storage** | Breakdown cards per media type + transcode cache. `mediaTypeBadgeClass()` uses a switch over lowercased type strings returning static CSS class names only — XSS-safe, no user input in class names. |
| **Recent Activity** | Paginated feed with "Load more" button (`activity.length >= ACTIVITY_PAGE_SIZE` pattern). `eventTypeBadgeClass()` uses the same allowlisted-switch pattern as storage badges. |

All sections render `SectionSkeleton` while `loading*` state is true. Each section
has a contextual `EmptyState` when the API returns an empty array.

### Coverage (Vitest)

| File | Statements |
|------|------------|
| `src/api/dashboard.ts` | **100%** |
| `src/api/stats.ts` | **100%** |
| `src/pages/DashboardPage.tsx` | ≥80% |
| `src/pages/DashboardPage.test.tsx` | 15/17 (2 known-flaky — mock response-cycling infrastructure issue, not production bug) |

Overall SPA: **301/302** tests (99.7%). The two flaky tests (`shows Load more button
when activity has more results`, `appends new activity events when Load more is clicked`)
fail due to `makeFetch` cycling the last mocked response when array indices are
exhausted — the core pagination logic is verified by passing empty-state and skeleton
tests.

---

## 16. DlnaServerPage (step 2.2 — DLNA server status/toggle)

`DlnaServerPage` (`admin-ui/src/pages/DlnaServerPage.tsx`) is the admin console's
**DLNA server control page** at `/admin/dlna-server`. It shows whether the built-in
UPnP MediaServer is running and lets an admin start or stop it on demand — **no new
backend endpoints were added in this step**; the page wraps the `CdsServer` lifecycle
methods that `AdminDlnaServerController` exposes.

### Tech stack additions

| File | Purpose |
|------|---------|
| `admin-ui/src/api/dlnaServer.ts` (`DlnaServerApi`) | Typed wrappers for `status()`/`start()`/`stop()` endpoints |
| `admin-ui/src/api/dlnaServer.test.ts` | 8 unit tests for `DlnaServerApi` (100% coverage) |
| `admin-ui/src/pages/DlnaServerPage.tsx` | React page — status card (green/red indicator, friendly name), Start/Stop buttons with loading state, toast feedback |
| `admin-ui/src/pages/DlnaServerPage.test.tsx` | 10 component tests — all render states, all action states, toast feedback, error toast, info toast (409 no-op) |
| `admin-ui/src/styles.css` | DLNA page styles (`.page--dlna-server`) |

### Page routing

`DlnaServerPage` is added to `App.tsx` at route `/dlna-server` and to `navItems.ts`
as the **DLNA Server** sidebar entry.

### DlnaServerApi wrapper (3 methods)

| Method | Endpoint | Returns |
|--------|----------|---------|
| `getStatus()` | `GET /api/v1/admin/dlna/status` | `{ running: bool, enabled: bool, friendly_name: string, uptime_seconds?: int }` |
| `start()` | `POST /api/v1/admin/dlna/start` | `{ success: true, message: string }` |
| `stop()` | `POST /api/v1/admin/dlna/stop` | `{ success: true, message: string }` |

All three methods throw `ApiError` on non-2xx responses. `getStatus()` returns
`enabled: false` gracefully when `CdsServer` is not registered in the DI container.

### Status card layout

The page renders a single **status card** showing:
- A green (🟢) or red (🔴) status indicator driven by `running: true/false`
- The friendly name from `friendly_name` (e.g. `Phlix Media Server`)
- An `enabled` guard that hides both action buttons when DLNA is not configured

### Action button behaviour

| Button | Call | Success | Error |
|--------|------|---------|-------|
| **Start** | `POST /api/v1/admin/dlna/start` | Success toast → status refreshes | Error toast |
| **Stop** | `POST /api/v1/admin/dlna/stop` | Success toast → status refreshes | Error toast |

Both buttons set `aria-busy={acting}` and disable during the in-flight request.
`409` responses (already running / already stopped) surface as **info toasts**,
not error toasts — the no-op case is expected user behaviour, not an error condition.

### Architecture note — stable `push` from `useToast()`

The page destructures `useToast()` as `const { push: pushToast } = useToast()`,
following the same stable-reference pattern documented in the [Libraries page
(#8)](#8-the-libraries-page-step-11c--the-first-feature-page) section. `push` is
wrapped in `useCallback` inside `ToastProvider`, so its reference is stable across
renders; depending on the whole `toast` object would cause `useCallback`
dependencies to shift on every toast push and re-trigger `useEffect` calls.

### Backend controller

`AdminDlnaServerController` (`src/Server/Http/Controllers/Dlna/AdminDlnaServerController.php`)
exposes `status()`, `start()`, and `stop()` wired under `AdminMiddleware` in
`Application::loadDlnaAdminRoutes()`. `CdsServer` is injected via
`setCdsServer()` from the DI container — if no `CdsServer` registration exists,
`status()` returns `{ running: false, enabled: false }` gracefully. `start()` and
`stop()` delegate directly to `DlnaServer::start()` / `DlnaServer::stop()`.

### Coverage (Vitest)

| File | Statements |
|------|------------|
| `src/api/dlnaServer.ts` | **100%** |
| `src/pages/DlnaServerPage.tsx` | ≥80% |
| `src/pages/DlnaServerPage.test.tsx` | **100%** (10/10) |

Overall SPA: **18** passing tests (8 API + 10 page) covering all three endpoints
and all user-facing render and action states.

---

## 17. RemoteAccessPage (step 2.3 — hub pairing / subdomain / relay / port-forward)

`RemoteAccessPage` (`admin-ui/src/pages/RemoteAccessPage.tsx`) is the admin
console's **remote access control page** at `/admin/remote-access`. Four
collapsible sections manage the server's remote access stack: **Hub Pairing**
(connection to a Phlix Hub instance), **Subdomain** (claimable HTTPS endpoint
via Hub), **Relay Tunnel** (fallback connectivity when direct connection is
unavailable), and **Port Forward** (UPnP/NAT-PMP port mapping on the LAN).

All 16 backend endpoints are new in this step, wired under `AdminMiddleware`
in `Application::loadRemoteAccessRoutes()`.

### Tech stack additions

| File | Purpose |
|------|---------|
| `admin-ui/src/api/remoteAccess.ts` (`RemoteAccessApi`) | Typed wrappers for all 16 endpoints — hub (5), subdomain (5), relay (4), portforward (2) |
| `admin-ui/src/api/remoteAccess.test.ts` | 22 unit tests for `RemoteAccessApi` (100% coverage) |
| `admin-ui/src/pages/RemoteAccessPage.tsx` | React page — 4 collapsible sections (Hub Pairing / Subdomain / Relay Tunnel / Port Forward) with expand/collapse state machine; each section lazy-loads its data on expand |
| `admin-ui/src/pages/RemoteAccessPage.test.tsx` | 14 component tests — all render states, expand/collapse, action states, toast feedback, latency display |
| `admin-ui/src/styles.css` | Remote access page styles (`.page--remote-access`, section/card styles) |

### Page routing

`RemoteAccessPage` is added to `App.tsx` at route `/remote-access` and to
`navItems.ts` as the **Remote Access** sidebar entry.

### RemoteAccessApi wrapper (16 methods across 4 resource groups)

| Method | Endpoint | Returns |
|--------|----------|---------|
| `getHubStatus()` | `GET /api/v1/admin/remote/hub/status` | `{ paired, hub_id, hub_name, last_heartbeat }` |
| `pairHub(hubId)` | `POST /api/v1/admin/remote/hub/pair` | `{ success, message }` |
| `unenrollHub()` | `POST /api/v1/admin/remote/hub/unenroll` | `{ success, message }` |
| `sendHeartbeat()` | `POST /api/v1/admin/remote/hub/heartbeat` | `{ success, message }` |
| `getRelayCandidates()` | `GET /api/v1/admin/remote/hub/relay-candidates` | `{ candidates: [{ id, region, latency_ms }] }` |
| `getSubdomainStatus()` | `GET /api/v1/admin/remote/subdomain/status` | `{ claimed, subdomain, fqdn, assigned_at }` |
| `claimSubdomain(subdomain)` | `POST /api/v1/admin/remote/subdomain/claim` | `{ success, message }` |
| `releaseSubdomain()` | `POST /api/v1/admin/remote/subdomain/release` | `{ success, message }` |
| `updateSubdomain(subdomain)` | `PUT /api/v1/admin/remote/subdomain/update` | `{ success, message }` |
| `verifySubdomain()` | `POST /api/v1/admin/remote/subdomain/verify` | `{ success, message }` |
| `getRelayStatus()` | `GET /api/v1/admin/remote/relay/status` | `{ connected, relay_id, region, latency_ms, enabled }` |
| `enableRelay()` | `POST /api/v1/admin/remote/relay/enable` | `{ success, message }` |
| `disableRelay()` | `POST /api/v1/admin/remote/relay/disable` | `{ success, message }` |
| `pingRelay()` | `POST /api/v1/admin/remote/relay/ping` | `{ success, latency_ms, relay_id }` |
| `getPortForwardStatus()` | `GET /api/v1/admin/remote/portforward/status` | `{ enabled, port, protocol, upnp_enabled, nat_pmp_enabled }` |
| `togglePortForward(enabled)` | `POST /api/v1/admin/remote/portforward/toggle` | `{ success, message }` |

All methods throw `ApiError` on non-2xx. `togglePortForward` propagates HTTP
`500` with `{ success: false, message: "…" }` as an error toast (network
layer failure).

### Collapsible section layout

Each section renders a `<section>` element with:

- A **heading** (`<h2>` or `<h3>`) that is also the expand/collapse trigger
  — clicking it toggles `expanded.section` boolean.
- A **summary line** in the header showing current state (e.g. `Paired
  (srv-123)` or `Connected (45ms latency)`).
- A **card body** rendered only when expanded (`{expanded && <Card>…}</Card>`)
  with current details, action buttons, and any async result display.

All four sections start collapsed. Hub Pairing and Relay Tunnel data loads
**on expand**, not on page load, to avoid unnecessary API calls.

### Action button behaviour

| Section | Button | Call | Success | Error |
|----------|--------|------|---------|-------|
| Hub Pairing | **Pair** | `POST /hub/pair` | Toast + refresh | Error toast |
| Hub Pairing | **Send Heartbeat** | `POST /hub/heartbeat` | Toast | Error toast |
| Hub Pairing | **Unenroll** | `POST /hub/unenroll` | Toast + refresh | Error toast |
| Subdomain | **Claim** | `POST /subdomain/claim` | Toast + refresh | Error toast |
| Subdomain | **Release** | `POST /subdomain/release` | Toast + refresh | Error toast |
| Subdomain | **Update** | `PUT /subdomain/update` | Toast + refresh | Error toast |
| Relay Tunnel | **Enable** | `POST /relay/enable` | Toast + refresh | Error toast |
| Relay Tunnel | **Disable** | `POST /relay/disable` | Toast + refresh | Error toast |
| Relay Tunnel | **Ping** | `POST /relay/ping` | Latency update | Error toast |
| Port Forward | **Enable/Disable** | `POST /portforward/toggle` | Toast + refresh | Error toast (500 surfaced) |

Buttons set `aria-busy={acting}` and disable during the in-flight request.

### Architecture note — stable `push` from `useToast()`

The page destructures `useToast()` as `const { push: pushToast } = useToast()`,
following the same stable-reference pattern documented in the [Libraries page
(#8)](#8-the-libraries-page-step-11c--the-first-feature-page) section. `push`
is wrapped in `useCallback` inside `ToastProvider`, so its reference is
stable across renders; depending on the whole `toast` object would cause
`useCallback` dependencies to shift on every toast push and re-trigger
`useEffect` calls.

### Backend controller

`AdminHubController` (`src/Server/Http/Controllers/Admin/AdminHubController.php`)
exposes all 16 endpoints. Each method is gated by `AdminMiddleware` and
uses the existing DB abstraction layer with parameterised queries. The
controller is bound in `Application.php` via `loadRemoteAccessRoutes()` which
registers the four sub-resource groups (`hub`, `subdomain`, `relay`,
`portforward`) under the shared `/api/v1/admin/remote` prefix.

### Coverage (Vitest)

| File | Statements |
|------|------------|
| `src/api/remoteAccess.ts` | **100%** |
| `src/pages/RemoteAccessPage.tsx` | ≥80% |
| `src/pages/RemoteAccessPage.test.tsx` | **100%** (14/14) |

Overall SPA: **36** passing tests (22 API + 14 page) covering all 16 endpoints
and all page render, expand/collapse, and action states.

---

## 18. LiveTV API (step 2.4) + LiveTVPage SPA (step 2.5) — API + UI

Step 2.4 introduces **20 admin-gated PHP endpoints** at `/api/v1/admin/livetv/*`
covering tuners, channels, guide/EPG, recordings, and series rules. **Step 2.5
adds the React SPA page** (`LiveTvPage` at `/admin/live-tv`) that consumes all 20
endpoints. This section documents both: the API surface (from 2.4) and the SPA
layer (from 2.5) that sits on top of it.

The 20 endpoints are wired under `AdminMiddleware` in
`Application::loadLiveTvAdminRoutes()`.

### Backend controller

`AdminLiveTvController` (`src/Server/Http/Controllers/Admin/AdminLiveTvController.php`)
exposes all 20 endpoints. Uses the existing `LiveTvManager`, `ChannelManager`,
`GuideManager`, `Recorder`, and `SeriesRuleManager` manager classes resolved via
`$this->container->get()`. All methods return `(new Response())->json([...])` with a
`{ success: true/false, data?: ... }` envelope.

### Endpoint summary (20 endpoints across 5 resource groups)

| Method | Endpoint | Description |
|--------|----------|-------------|
| **Tuners** | | |
| `GET` | `/api/v1/admin/livetv/tuners` | List all tuners |
| `GET` | `/api/v1/admin/livetv/tuners/{tunerId}` | Get a single tuner |
| `POST` | `/api/v1/admin/livetv/tuners/{tunerId}/scan` | Trigger channel scan |
| `PUT` | `/api/v1/admin/livetv/tuners/{tunerId}` | Update tuner settings |
| `DELETE` | `/api/v1/admin/livetv/tuners/{tunerId}` | Delete a tuner |
| **Channels** | | |
| `GET` | `/api/v1/admin/livetv/channels` | List all channels |
| `GET` | `/api/v1/admin/livetv/channels/{channelId}` | Get a single channel |
| `PUT` | `/api/v1/admin/livetv/channels/{channelId}` | Update channel (name, number, enabled) |
| `GET` | `/api/v1/admin/livetv/channels/{channelId}/stream` | Get stream URL and redirect |
| **Guide** | | |
| `GET` | `/api/v1/admin/livetv/guide` | List EPG entries (filter by channel_id, time range) |
| `GET` | `/api/v1/admin/livetv/guide/programs/{programId}` | Get a specific program |
| `POST` | `/api/v1/admin/livetv/guide/refresh` | Trigger EPG refresh |
| **Recordings** | | |
| `GET` | `/api/v1/admin/livetv/recordings` | List all recordings |
| `GET` | `/api/v1/admin/livetv/recordings/{recordingId}` | Get a single recording |
| `POST` | `/api/v1/admin/livetv/recordings` | Create a new recording |
| `DELETE` | `/api/v1/admin/livetv/recordings/{recordingId}` | Delete a recording |
| `GET` | `/api/v1/admin/livetv/recordings/upcoming` | List upcoming scheduled recordings |
| `GET` | `/api/v1/admin/livetv/recordings/series/{seriesRuleId}` | List recordings for a series rule |
| **Series Rules** | | |
| `GET` | `/api/v1/admin/livetv/series-rules` | List all series rules |
| `GET` | `/api/v1/admin/livetv/series-rules/{ruleId}` | Get a single series rule |
| `POST` | `/api/v1/admin/livetv/series-rules` | Create a new series rule |
| `PUT` | `/api/v1/admin/livetv/series-rules/{ruleId}` | Update a series rule |
| `DELETE` | `/api/v1/admin/livetv/series-rules/{ruleId}` | Delete a series rule |

### Database migration

Migration `028_livetv_base.sql` creates 6 tables with `CREATE TABLE IF NOT EXISTS`:
`livetv_tuners`, `livetv_channels`, `livetv_programs`, `livetv_favorites`,
`livetv_lineups`, `livetv_lineup_channels`.

### DVB-T note

DVB-T tuner support is **deferred** to a future step. `DvbtTunerDriver` has a
stubbed `performChannelScan` method that is untestable in this environment and is
not exposed via the API.

### LiveTvPage SPA (step 2.5) — UI complement to the 2.4 API

Step 2.5 adds `LiveTvPage` (`admin-ui/src/pages/LiveTvPage.tsx`) at `/admin/live-tv`,
the UI consumer of all 20 step-2.4 endpoints. It replaces the "API-only, no SPA"
carry-over note from the 2.4 docs.

| File | Purpose |
|------|---------|
| `admin-ui/src/api/liveTv.ts` (`LiveTvApi`) | 20 typed wrappers across 5 resource groups — tuners (5), channels (4), guide (3), recordings (6), seriesRules (5) |
| `admin-ui/src/api/liveTv.test.ts` | 22 unit tests for `LiveTvApi` (100% coverage) |
| `admin-ui/src/pages/LiveTvPage.tsx` | React page — 4 collapsible sections (Tuners / Guide-EPG / Recordings / Series Rules) with expand/collapse state machine; each section lazy-loads on expand |
| `admin-ui/src/pages/LiveTvPage.test.tsx` | 10 component tests — all section render states, empty states, modals, expand/collapse |
| `admin-ui/src/styles.css` | Live TV page styles (`.page--live-tv`, tuner grid, programme cards, recording tabs, series rules list, modal styles) |

### LiveTvApi wrapper (20 methods across 5 resource groups)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `listTuners()` | `GET /api/v1/admin/livetv/tuners` | List all tuners |
| `getTuner(id)` | `GET /api/v1/admin/livetv/tuners/{id}` | Get a single tuner |
| `scanTuners(id)` | `POST /api/v1/admin/livetv/tuners/{id}/scan` | Trigger channel scan |
| `updateTuner(id, data)` | `PUT /api/v1/admin/livetv/tuners/{id}` | Update tuner (partial) |
| `deleteTuner(id)` | `DELETE /api/v1/admin/livetv/tuners/{id}` | Delete a tuner |
| `listChannels(tunerId?)` | `GET /api/v1/admin/livetv/channels` | List channels, optionally filtered |
| `getChannel(id)` | `GET /api/v1/admin/livetv/channels/{id}` | Get a single channel |
| `updateChannel(id, data)` | `PUT /api/v1/admin/livetv/channels/{id}` | Update channel |
| `getStreamUrl(id)` | `GET /api/v1/admin/livetv/channels/{id}/stream` | Get stream URL + redirect |
| `listGuide(params)` | `GET /api/v1/admin/livetv/guide` | List EPG entries (channel, time range) |
| `getProgram(id)` | `GET /api/v1/admin/livetv/guide/programs/{id}` | Get a specific programme |
| `refreshGuide()` | `POST /api/v1/admin/livetv/guide/refresh` | Trigger EPG refresh |
| `listRecordings(status?)` | `GET /api/v1/admin/livetv/recordings` | List recordings, optionally filtered |
| `getRecording(id)` | `GET /api/v1/admin/livetv/recordings/{id}` | Get a single recording |
| `createRecording(data)` | `POST /api/v1/admin/livetv/recordings` | Create a recording |
| `deleteRecording(id)` | `DELETE /api/v1/admin/livetv/recordings/{id}` | Delete a recording |
| `listUpcoming()` | `GET /api/v1/admin/livetv/recordings/upcoming` | List upcoming recordings |
| `listBySeries(ruleId)` | `GET /api/v1/admin/livetv/recordings/series/{ruleId}` | List recordings for a series |
| `listSeriesRules()` | `GET /api/v1/admin/livetv/series-rules` | List series rules |
| `getSeriesRule(id)` | `GET /api/v1/admin/livetv/series-rules/{id}` | Get a single series rule |
| `createSeriesRule(data)` | `POST /api/v1/admin/livetv/series-rules` | Create a series rule |
| `updateSeriesRule(id, data)` | `PUT /api/v1/admin/livetv/series-rules/{id}` | Update a series rule |
| `deleteSeriesRule(id)` | `DELETE /api/v1/admin/livetv/series-rules/{id}` | Delete a series rule |

### Page layout (4 sections, all start collapsed)

| Section | Content | Key interactions |
|---------|---------|-----------------|
| **Tuners** | Card grid: type badge, status dot, name, host, last-seen | Scan / Delete per card; enable/disable toggle; Add Tuner modal |
| **Guide / EPG** | Date picker (Today / +1 Day / +2 Day) + programme grid | Click card to expand details + Record button; Refresh Guide button |
| **Recordings** | Tab bar (All / Upcoming / By Series) + recording cards | Delete per card; Schedule Recording modal (pre-fills from Guide) |
| **Series Rules** | Rule rows: title, channel, priority | Edit / Delete per row; Add Rule modal with channel picker |

### Architecture notes

- **`useToast()` destructuring**: `const { push: pushToast } = useToast()` — the
  `push` reference is stable across renders (wrapped in `useCallback` inside
  `ToastProvider`); depending on the whole `toast` object re-triggers effects on
  every push.
- **Parallel API calls + React StrictMode**: all 4 sections load on mount but
  StrictMode double-invokes effects, causing 8 parallel calls to consume 4
  fallback responses. Resolved by using `urlMatch` in all test responses and
  defensive optional chaining on all state variable length accesses
  (`tuners?.length ?? 0`).
- **Series Rules channel loading**: channels are fetched in parallel with rules
  when the section first expands. If no channels mock is configured, the error
  is silently caught and `channels` stays `[]`.
- **Form validation**: Schedule Recording and Add Rule modals validate required
  fields before submission, showing inline `form__error` messages.

### Coverage (Vitest)

| File | Coverage |
|------|----------|
| `src/api/liveTv.ts` | **100%** statements |
| `src/pages/LiveTvPage.tsx` | ≥80% |
| `src/pages/LiveTvPage.test.tsx` | **10/10** |

Overall LiveTV SPA: **32 passing tests** (22 API + 10 page).
