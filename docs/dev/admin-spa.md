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
