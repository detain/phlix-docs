---
title: User Management
description: Managing users, the signup approval queue, and account statuses
---

# User Management

The admin console **Users** page (`/admin/users`) lists every account on the
server and lets an admin manage them — including the **signup approval queue**
introduced with the `auth.signup_mode` setting. The page is admin-gated.

## Account statuses

Every user has a `status`:

| Status | Meaning |
|--------|---------|
| **pending** | Created via signup while the server is in `approval` mode. The user has **no session/token** and cannot log in or browse media until an admin approves them. |
| **active** | A normal, full-access account. |
| **disabled** | Access revoked. The user cannot log in, and an existing live session is revoked on its next request. |

A status badge is shown per row (pending = warning, active = success, disabled =
neutral). Accounts created before this feature, or via paths that don't set a
status, are treated as **active**.

::: tip Signup mode controls how new accounts are created
The `auth.signup_mode` server setting (Settings → **Access**) decides whether
signups become active immediately (`open`), land in the approval queue
(`approval`, the default), or are rejected outright (`disabled`). The first-ever
registered user is always created active + admin. See
[Server Settings → Signup mode](./server-settings#signup-mode-auth-signup-mode).
:::

## The pending-approval queue

When one or more users are pending, the Users page shows a prominent **Pending
approval** section above the main table, with a count badge and per-row
**Approve** / **Reject** actions:

- **Approve** sets the user to `active` — they can now log in and browse.
- **Reject** deletes the pending account (after a confirmation prompt). Reject
  only applies to accounts still in the `pending` state.

Pending users also appear in the main table (with the same actions) so the list
stays consistent; the queue is simply the prominent affordance.

## Per-row status actions

The main table's row actions depend on the account's current status:

| Current status | Action(s) |
|----------------|-----------|
| pending | **Approve** (→ active) · **Reject** (delete, confirmed) |
| active | **Disable** (→ disabled, confirmed) |
| disabled | **Enable** (→ active) |

**Disable** and **Reject** are confirmed via a modal — they are never one-click.
Disabling an account **revokes a live session**: status is re-checked on the
token-refresh and validation paths, so the user (or admin) loses access on their
next request rather than waiting for token expiry. The server also refuses to
disable your own account or the last remaining admin.

The existing user actions (add/edit, set-admin, reset password, profiles) are
unchanged.

## Admin API

The page consumes these admin-gated endpoints (Bearer admin token required —
`401` unauthenticated, `403` non-admin):

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v1/admin/users?status=pending` | List users; optional `status` filter (`pending` / `active` / `disabled`). |
| `POST` | `/api/v1/admin/users/{id}/approve` | Set status to `active`. |
| `POST` | `/api/v1/admin/users/{id}/disable` | Set status to `disabled` (revokes the session). |
| `POST` | `/api/v1/admin/users/{id}/reject` | Delete a still-`pending` user. |

The user objects returned by the list endpoint (and `/auth/me`) carry the
`status` field.

## See Also

- [Server Settings](./server-settings) — the `auth.signup_mode` setting and its behaviour
- [Dashboard](./dashboard) — visual admin dashboard overview
- [Library Management](./library-management) — managing libraries and metadata
