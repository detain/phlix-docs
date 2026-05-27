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
