---
title: Hub Admin Console
description: The Hub's web admin console — pages, access control, and the admin API
---

# Hub Admin Console

The Hub ships a **web admin console** built on the shared **`@phlix/ui`** design system (the same
admin shell the Phlix media server uses, composed with a hub-specific page set). It lives inside the
Hub's Vue single-page app at **`/app/admin/*`** and is gated to admins.

> **Server vs Hub.** The media server's admin console is a React app at `/admin` (see
> [Admin SPA](../dev/admin-spa.md)); the **Hub's** admin console is the Vue `@phlix/ui` app at
> **`/app/admin/*`**. They share the same look and several pages (Users, Logs, Settings) but mount
> different page sets and talk to different backends.

## Access &amp; gating

- The Hub's web UI is the Vue SPA served at `/app` (the bare root `/` redirects to `/app/servers`).
- The **first account registered becomes an admin automatically** — there is no separate
  "create admin" step. Additional admins are granted by setting `is_admin = 1` on the user's row, or
  from the **Users** page below.
- The SPA reads `is_admin` from `GET /api/v1/auth/me` and shows the **Admin** nav entry only to
  admins. Non-admins never see it.
- Every admin page and API is also gated **server-side** by `AdminMiddleware`, independent of the
  client: **401 `auth.required`** when unauthenticated, **403 `auth.not_admin`** for a signed-in
  non-admin. The client gate is convenience; the server gate is the real boundary.

## The pages

Open the console from the **Admin** nav entry (→ `/app/admin/dashboard`). It is a sidebar layout
with five pages:

| Page | Route | What it does | API |
|------|-------|--------------|-----|
| **Hub Dashboard** | `/app/admin/dashboard` | Hub-scoped headline metrics + recent activity (the admin landing page) | `/api/v1/admin/dashboard/*` |
| **Users** | `/app/admin/users` | List/create/edit/delete accounts, toggle admin, reset passwords | `/api/v1/admin/users*` |
| **Logs** | `/app/admin/logs` | Browse and tail the Hub's log files | `/api/v1/admin/logs*` |
| **Settings** | `/app/admin/settings` | View/override Hub settings (`hub_settings`) | `/api/v1/admin/settings` |
| **Audit Logs** | `/app/admin/audit-logs` | Searchable trail of administrative actions | `/api/v1/me/audit-logs` |

> Audit Logs was originally a top-level page; it now lives inside the admin console.

### Hub Dashboard

The landing page — headline counters plus a recent-activity feed, aggregated live from existing
tables (`servers`, `relay_sessions`, `requests`, `users`, `audit_logs`). No new state is stored.

- **Server fleet** — total servers, and how many are online vs offline.
- **Active relay sessions** — open reverse-tunnel relay sessions right now.
- **Pending requests** — media requests awaiting an admin decision.
- **User count** — registered accounts.
- **Recent activity** — the newest audit-log events (actor, action, target, time).

### Users

CRUD over Hub accounts: list, view, create, edit, and delete users; toggle the admin flag; reset a
password. The Hub has no profiles subsystem, so the per-user **profiles list is always empty** (the
shared page hides profile UI when there are none). You cannot remove the last remaining admin.

### Logs

Lists the Hub's on-disk log files and tails them — a single file, or all files merged into one
chronological stream — so you can read recent app/error/hub/relay/audit output without shell access.

### Settings

Shows the Hub's effective settings from the `hub_settings` table, marks which values are overridden,
and lets an admin change them. Saving re-reads the effective values so the "custom" badges stay in
sync.

### Audit Logs

A searchable view of administrative actions (who did what, to what, when). Backed by the
already-admin-gated `/api/v1/me/audit-logs` endpoint — the same data the Hub Dashboard's activity
feed samples.

## The admin API (`/api/v1/admin/*`)

The console pages are thin clients over a JSON API. Every route below is gated
`[AuthMiddleware, AdminMiddleware]` (401 unauthenticated / 403 non-admin) and returns JSON.

### Dashboard

| Method | Path | Returns |
|--------|------|---------|
| `GET` | `/api/v1/admin/dashboard/summary` | `{ success, data: { servers: { total, online, offline }, active_relay_sessions, pending_requests, user_count } }` |
| `GET` | `/api/v1/admin/dashboard/activity?limit=` | `{ success, data: [ { id, action, actor, target, created_at } ] }` (`limit` 1–100, default 20) |

### Users

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/v1/admin/users` | List accounts (never returns password hashes) |
| `POST` | `/api/v1/admin/users` | Create an account |
| `GET` | `/api/v1/admin/users/{id}` | Fetch one account |
| `PUT` | `/api/v1/admin/users/{id}` | Update username / email / admin flag / password |
| `DELETE` | `/api/v1/admin/users/{id}` | Delete an account (refuses the last admin) |
| `POST` | `/api/v1/admin/users/{id}/set-admin` | Grant / revoke the admin flag |
| `POST` | `/api/v1/admin/users/{id}/reset-password` | Set a new password |
| `GET` | `/api/v1/admin/users/{id}/profiles` | Always `[]` on the Hub (no profiles table) |

### Logs

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/v1/admin/logs` | List the Hub's log files |
| `GET` | `/api/v1/admin/logs/tail` | Tail one log file |
| `GET` | `/api/v1/admin/logs/tail-all` | Tail all files, merged chronologically |

### Settings

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/v1/admin/settings` | `{ success, data: { settings, overridden, types } }` |
| `PUT` | `/api/v1/admin/settings` | Persist overrides; returns `{ success, data: { settings, overridden } }` |

### Requests

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/v1/admin/requests` | The media-request queue |
| `POST` | `/api/v1/admin/requests/{id}/approve` | Approve a request |
| `POST` | `/api/v1/admin/requests/{id}/deny` | Deny a request |

> The `/api/v1/admin/logs*` and `/api/v1/admin/settings` routes mirror the Hub's older
> `/api/v1/me/logs*` and `/api/v1/me/hub-settings` endpoints (kept for back-compat). The
> `/api/v1/admin/*` paths are what the shared `@phlix/ui` admin clients call.

## How it's wired (for contributors)

- **Frontend.** `web-ui/src/main.ts` mounts the hub SPA with
  `createPhlixApp({ app: 'hub', menu, extraRoutes })`. The admin section is added with
  `...buildHubAdminRoutes()` (from `@phlix/ui`), which contributes the five `/app/admin/*` routes;
  the gated `{ id: 'admin', label: 'Admin', to: '/app/admin/dashboard', requiresAdmin: true }` menu
  item exposes it. The built bundle is committed to `public/assets/app/` and served by
  `SharedUiController`.
- **Backend.** Routes are registered in `src/Application.php`
  (`registerAdmin{Log,Settings,User,Dashboard}Routes()` plus the existing `/api/v1/admin/requests`),
  each behind `[AuthMiddleware, AdminMiddleware]`, with controllers in `src/Http/Controllers/`
  registered via `HubServicesProvider`.

## See also

- [Hub Admin Overview](./overview.md) — the web UI + operational CLI
- [Audit Log](./audit-log.md) — the administrative audit trail
- [First Boot](./first-boot.md) — create the first admin and pair a server
- [Hub Architecture](../dev/architecture-hub.md) — how the SPA, API, and relay fit together
