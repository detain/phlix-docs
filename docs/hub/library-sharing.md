# Library Sharing

**Phase:** H.2 (End-User Documentation)
**Step:** H.2
**Since:** 0.19.0

## TL;DR

Library sharing lets you grant a hub user access to one of your libraries by email — no link required. You choose the library, set a permission level, and optionally add an expiry. The collaborator sees the shared library under **"Shared with me"** immediately after you share it.

---

## The Shares Page

Both "libraries I've shared" and "shared with me" live together on the single
**Shares** page (`/app/shares`), reached from the hub's top navigation. (The
legacy `/manage-shares` and `/shared-with-me` pages still resolve, but `/app/shares`
is the current entry point.)

### Libraries I've Shared

The **Shares** page lists every library share you have created, one row per share:

```
┌─ Library    Shared With    Permission   Shared On   Actions ────────┐
│ Movies ★   alice@example.com  Read only   2026-05-29  [Edit] [Revoke]│
│ TV Shows   bob@example.com    Read/Write  2026-05-29  [Edit] [Revoke]│
└────────────────────────────────────────────────────────────────────┘
```

#### Reading a share row

Each row shows:

- **Library** — the library being shared.
- **Shared With** — the collaborator's email address.
- **Permission** — `Read` or `Read/Write`. Shown as a coloured badge.
- **Shared On** — the date the share was created.
- **Actions** — **Edit** lets you change the permission inline. **Revoke** deletes the share immediately.

### Shared With Me

The same **Shares** page also lists every library another hub user has shared with you, one card per library:

```
┌─ Library ──────────────────────────────┐
│ Movies ★                               │
│ Shared by: Alice (alice@example.com)   │
│ Server: My Server                     │
│ Permission: Read only                  │
│                         [Browse Library]│
└────────────────────────────────────────┘
```

Clicking **Browse Library** opens the library in the browse view.

---

## Sharing a Library

Click **+ Share Library** in the top-right corner of the **Shares** page to open the Share modal.

### Fields

| Field | Required | Description |
|---|---|---|
| **Server** | Yes | Select one of your claimed servers from the dropdown. |
| **Library** | Yes | Select a specific library on that server. This dropdown populates after you select a server. |
| **Share with** | Yes | The collaborator's hub account email address. They must have a hub account. |
| **Permission** | No | `Read` (default) or `Read/Write`. Read-only collaborators cannot modify playlists or download media. |
| **Expires** | No | How long the share lasts. Options: `Never` (default), `7 days`, `30 days`, `90 days`. |

Click **Share** to create the share. The new row appears at the top of the list without a page reload. Click **Cancel** or click outside the modal to close it without sharing.

---

## Managing a Share

### Change permission

On the **Shares** page, find the row for the share you want to update. Click the permission badge (e.g., "Read only") in the **Actions** column and select a new level from the dropdown. The change is saved immediately via the API and the badge updates to reflect the new level.

### Revoke a share

Click **Revoke** on the row. The share is deleted immediately and the row is removed from the table with a fade animation.

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

**Symptom:** You select a server in the Share modal but the Library dropdown shows no options.

**Reason:** The library dropdown is populated from the list of libraries on that server. If the server has no libraries, none appear.

**Fix:** Make sure the server has at least one library configured on the server itself. Refresh the server's library list by triggering a rescan from the server's control panel.

### 2. Share target email not found

**Symptom:** The Share modal shows an error and the share is not created.

**Reasons:**
- The collaborator's email address is not registered on the hub.
- There is a typo in the email address.

**Fix:** Ask the collaborator to create a hub account with the email address you want to share with, then try again.

### 3. Collaborator cannot see the shared library

**Symptom:** The share was created successfully but the collaborator does not see the library under "Shared with me".

**Diagnosis:**
```bash
# On the hub, check the share creation audit log:
grep "library-share-created" .logs/hub-audit.log | tail -20
```

**Fix:** The library must have completed a media scan on the server. A library with no scanned content appears empty. Ask the library owner to trigger a rescan.

### 4. Share expired

**Symptom:** The collaborator sees the library disappear from "Shared with me" after the expiry date.

**Reason:** The share had a fixed expiry (7, 30, or 90 days) and that period has passed.

**Fix:** The library owner can create a new share without an expiry (select "Never") to restore access.

---

## Next Steps

- [Share with Friends](./share-with-friends.md) — invite links and email-based sharing (for users without hub accounts).
- [Invite Links](./invite-links.md) — shareable links with max-use and expiry for one-off sharing.
- [What is the Hub?](./what-is-the-hub.md) — overview of all hub features and account management.
