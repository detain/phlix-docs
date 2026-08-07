# Library Sharing

## TL;DR

Library sharing grants a hub user access to one of your libraries. In the current
UI the only way to create a share is an **invite link** — you pick a server,
optionally a library, and a permission level, then send the recipient the URL. The
`POST /api/v1/me/shares` API can also create a share directly from a collaborator's
email, but no page in the hub calls it. The collaborator sees the library under
**Shared With Me** as soon as the share exists.

::: warning Much of the UI this page used to describe has been removed
The hub once had a full share-management UI — a "Share Library" modal, an expiry
menu, and inline permission editing — built on the old server-rendered template
stack. That stack was deleted and the Vue replacement re-implemented **list and
revoke only**. The API endpoints for the rest still exist; the controls do not.
:::

---

## The Shares Page

They are **two separate pages**, both in the hub's top navigation: **Shares**
(`/app/shares`) lists what you have shared out, and **Shared With Me**
(`/app/shared-with-me`) lists what others have shared with you. (The legacy
`/manage-shares` and `/shared-with-me` paths still resolve — they redirect to the
two pages above.)

### Libraries I've Shared

The **Shares** page lists every library share you have created, one row per share:

```
┌─ Library   Shared with   Permissions   Created     Expires    Actions ─┐
│ Movies ★   Alice         Read only     2026-05-29  Never      [Revoke] │
│ TV Shows   Bob           Read/Write    2026-05-29  2026-08-27 [Revoke] │
└────────────────────────────────────────────────────────────────────────┘
```

#### Reading a share row

Each row shows six columns:

- **Library** — the library being shared.
- **Shared with** — the collaborator's **display name**, falling back to their user
  id if they have not set one. The email address you shared with is not returned by
  the API and is not shown.
- **Permissions** — `Read only` or `Read / Write`, as a badge. ⚠ Read-only, in both
  senses: see [Permission levels are not enforced](#permission-levels-are-not-enforced).
- **Created** — the date the share was created.
- **Expires** — the share's expiry, if it has one.
- **Actions** — **Revoke** only. There is no **Edit** control; to change a
  permission you must call `PATCH /api/v1/me/shares/{id}` directly.

### Shared With Me

The separate **Shared With Me** page (`/app/shared-with-me`) shows one card per
incoming share:

```
┌─ Library ──────────────────────────────┐
│ Movies ★                               │
│ Shared by: Alice                       │
│ Server: My Server                      │
│ Received: 2026-05-29                   │
│ Expires: Never                         │
│ Permission: Read only                  │
│                           [Open Server]│
└────────────────────────────────────────┘
```

**Open Server** opens the media server's own web UI in a new tab, at the first
hostname that server has advertised. It is disabled when the server has not
reported a reachable URL. **There is no in-hub browse view for a shared library** —
the hub has no `/browse/:server/:library` route.

The card shows the sharer's display name only; their email address is not exposed.

---

## Sharing a Library

There is **no "+ Share Library" control on the Shares page.** Create shares from
**Invite Links** (`/app/invite-links`) instead — see
[Invite Links](./invite-links.md).

| Field | Required | Description |
|---|---|---|
| **Server** | Yes | One of your claimed servers. |
| **Library** | No | A specific library on that server. Leave it unset to grant **all** libraries on the server — that is the only sub-server granularity there is. |
| **Permission** | No | `Read` (default) or `Read/Write`. |
| **Max uses** | No | How many times the link may be redeemed. |
| **Expires** | No | `7 days` (default), `30 days`, `90 days`, `1 year` or `Never`. |

Whoever redeems the link gets the share, under their own account. Direct shares
created through `POST /api/v1/me/shares` take no expiry at all — the endpoint never
reads one from the request body.

---

## Managing a Share

### Change permission

API-only. The Shares page renders the level as a read-only badge; there is no
dropdown and no Edit control. Use:

```http
PATCH /api/v1/me/shares/{id}
```

with `{ "permission": "read" }` or `{ "permission": "readwrite" }`.

### Permission levels are not enforced {#permission-levels-are-not-enforced}

::: danger `permission_level` is a label, not a control
There are **two** levels, `read` and `readwrite` — not three, and there is no
separate download or DLNA tier. More importantly, nothing enforces either value.
The level is validated on write, stored, returned by the API and rendered as a
badge, but no code path consults it before permitting an action: the hub's
`LibraryShare::canWrite()` and `SharedLibraryDto::canWrite()` have **zero production
callers** — they are reachable only from their own unit tests.

Do not rely on `read` to prevent a collaborator from doing anything.
:::

### Revoke a share

Click **Revoke** on the row. The share stops applying immediately and the table
reloads without it. (It is a soft delete — the row is marked `revoked_at` and
filtered out of every query, rather than being physically removed.)

---

## API Endpoints Used

The library sharing pages consume the following Hub API endpoints:

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/me/shares` | `GET` | Fetch all outgoing and incoming shares. |
| `/api/v1/me/shares` | `POST` | Create a new library share. |
| `/api/v1/me/shares/{id}` | `PATCH` | Update share permission (`read` or `readwrite`). |
| `/api/v1/me/shares/{id}` | `DELETE` | Revoke a share. |
| `/api/v1/me/servers` | `GET` | Populate the server dropdown in the Share modal. |
| `/api/v1/me/libraries?server_id={id}` | `GET` | Populate the library dropdown after a server is selected. |

All endpoints require authentication (`Authorization: Bearer <jwt>` or the `phlix_hub_token` cookie).

---

## What Can Go Wrong

### 1. Library dropdown is empty after selecting a server

**Symptom:** You select a server on the **Invite Links** page but the Library dropdown shows no options.

**Reason:** The library dropdown is populated from the list of libraries on that server. If the server has no libraries, none appear.

**Fix:** Make sure the server has at least one library configured on the server itself. Refresh the server's library list by triggering a rescan from the server's control panel.

### 2. Share target email not found

**Symptom:** `POST /api/v1/me/shares` returns `404 user_not_found` and the share is not created.

**Reasons:**
- The collaborator's email address is not registered on the hub.
- There is a typo in the email address.

**Fix:** Ask the collaborator to create a hub account with the email address you want to share with, then try again.

### 3. Collaborator cannot see the shared library

**Symptom:** The share was created successfully but the collaborator does not see the library under "Shared with me".

**Diagnosis:**
```bash
# On the hub, check the share creation log line:
grep "Library shared" .logs/hub.log | tail -20
```

(There is no `.logs/hub-audit.log` — the audit channel writes to `.logs/audit.log`
— and no `library-share-created` event string exists. The handler logs the
free-text message `Library shared` on the `hub` channel.)

**Fix:** The library must have completed a media scan on the server. A library with no scanned content appears empty. Ask the library owner to trigger a rescan.

### 4. Share expired

**Symptom:** The collaborator sees the library disappear from "Shared with me" after the expiry date.

**Reason:** The share came from an invite link that carried an expiry, and that
period has passed. (Shares created directly through the API never expire — the
endpoint does not accept an expiry.)

**Fix:** The library owner can issue a new invite link with **Never** selected.

---

## Next Steps

- [Share with Friends](./share-with-friends.md) — invite links and email-based sharing (for users without hub accounts).
- [Invite Links](./invite-links.md) — shareable links with max-use and expiry for one-off sharing.
- [What is the Hub?](./what-is-the-hub.md) — overview of all hub features and account management.
