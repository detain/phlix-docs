# Hub-Admin: Abuse Handling

## TL;DR

Hub operators receive DMCA notices at `abuse@yourhub.com` and act through the
hub's [Admin Console](./admin-console.md) and the admin JSON API. The hub only
relays for media servers it does not own, so it cannot remove content from a
server — it can forward the notice to the server owner and remove the offending
account or its server enrollment. The real moderation surface is the admin
**Users** page (`/app/admin/users` → `/api/v1/admin/users`): an admin can
delete a user, toggle their admin flag, and reset their password. There is **no**
"suspend server" or "ban user" action — those are not implemented. Deleting a
user removes the `users` row, and InnoDB foreign keys cascade-delete that user's
servers, relay sessions, shared-library grants, media requests, invites and
webhooks. Admin actions are recorded to the audit log (`audit_logs`), which is
viewable at `/app/admin/audit-logs` and via `GET /api/v1/me/audit-logs`.

> [!IMPORTANT]
> There is **no `bin/hub.php` CLI**. The hub has exactly two entry points:
> the resident daemon `php start.php {start|stop|restart|reload|status}`, and the
> one-shot tool `php bin/phlix <cmd>` whose only commands are `migrate` and
> `smoke:jwt`. All moderation is done through the Admin Console or the
> `/api/v1/admin/*` JSON API — not the shell.

---

## DMCA / Takedown Workflow

### Receiving the Notice

- Hub operators receive DMCA notices at `abuse@yourhub.com`
- Forward the notice text to the hub operator's internal abuse queue
- Log receipt: timestamp, sender email, notice text (store securely, not in shared logs)

### Locating the Server and User

- Use the Admin Console to identify the account and server. The **Users** page
  (`/app/admin/users`) lists every account; `GET /api/v1/admin/users` returns the
  same data as JSON.
- Cross-reference the `server_id` named in the DMCA notice against the hub's
  server registry (the **Dashboard** / server views) before acting, so you act on
  the correct account.
- Review the user's recorded activity in the audit log: open **Audit Logs**
  (`/app/admin/audit-logs`) or call `GET /api/v1/me/audit-logs?user_id=<id>`
  (admin-gated).

### Available Actions

**1. Forward to the server owner (primary action)**

- The hub only relays connections; it does **not** store media and cannot delete
  files on a server.
- Notify the registered owner by email with the full DMCA notice text and require
  written confirmation that the infringing content has been removed.
- Record the forwarding and the owner's response in your abuse queue.

**2. Remove the offending account**

- An admin can delete the user via the **Users** page, or
  `DELETE /api/v1/admin/users/{id}` (admin-only — see below). This removes the
  account and, by foreign-key cascade, the servers it claimed and their relay
  sessions, share grants, requests, invites and webhooks.
- Guards: you cannot delete your own account, and you cannot delete the last
  remaining admin.

**3. Remove a server's enrollment**

- The hub does not have an operator "suspend server" switch. The ways a server
  leaves the hub are:
  - the owner removes it from their account —
    `DELETE /api/v1/me/servers/{id}` (owner-scoped);
  - the server itself deregisters — `DELETE /api/v1/servers/{id}` (presented with
    the server's enrollment JWT);
  - the owning account is deleted (cascade, above), which removes all of that
    user's servers.
- If you need a server gone immediately and cannot reach the owner, deleting the
  owning account is the available lever.

> [!NOTE]
> A built-in "suspend without deleting" capability for servers or users is **not
> implemented**. If you need a reversible hold, your only equivalent today is to
> coordinate with the owner; account deletion is permanent (subject to the
> cascade described above).

### Audit Logging

- Every admin mutation (user create/update/delete, set-admin, password reset,
  request approve/deny) is recorded via the hub's audit logger into the
  `audit_logs` table.
- Review it from the **Audit Logs** page (`/app/admin/audit-logs`) or
  `GET /api/v1/me/audit-logs`. The API accepts filters such as `user_id`,
  `event`, `action`, `success`, `from`/`to` (unix timestamps), `limit` and
  `offset`.
- See [Audit Log](./audit-log.md) for the full field list and retention notes.

---

## GDPR Data Handling

> [!IMPORTANT]
> The hub has **no built-in GDPR tooling** — there is no data-export command or
> endpoint and no automated "right to be forgotten" workflow. What exists is:
> a user can read their **own** recorded activity via `GET /api/v1/me/audit-logs`,
> and an admin can delete an account (with the cascade described below). A full
> data export must be produced by the operator querying MySQL directly. See
> [GDPR & Data Rights](./gdpr-data-rights.md).

### What the Hub Stores Per User

- Username, email address and an Argon2id password hash (`users`)
- Claimed servers and their state (`servers`, `server_heartbeats`)
- Relay session metadata: timestamps, byte counters, close reason (`relay_sessions`)
- Shared-library grants and invites (`shared_libraries`, `library_shares`, `invite_links`)
- Media requests (`media_requests`) and any webhooks (`webhooks`)
- Audit-log rows referencing the user id (`audit_logs`)

### What the Hub Does NOT Store

- Media filenames or folder structure
- Playback/watch history
- Library content or metadata
- Any media stream content (it relays bytes; it does not retain them)

### Data Export (right to access)

- There is **no** `user:export` command and **no** export endpoint. The
  fabricated `php bin/hub.php user:export` recipe does not exist.
- A user can retrieve their **own** recorded activity through
  `GET /api/v1/me/audit-logs`.
- To assemble a full per-user export, the operator must query the MySQL tables
  listed above directly (filtering by the user's `id`). The hub holds no media
  data, so an export covers only the directory/relay metadata above.

### Data Deletion (right to erasure)

- An admin deletes an account via the **Users** page or
  `DELETE /api/v1/admin/users/{id}`. There is **no** `user:delete` CLI command.
- The delete runs `DELETE FROM users WHERE id = :id`. InnoDB foreign keys then
  cascade-delete the rows that reference the user (directly or via their
  servers): `servers`, `server_heartbeats`, `relay_sessions`,
  `shared_libraries`, `library_shares`, `media_requests`, `invite_links`,
  `webhooks` and `dns_challenges`.
- **Caveat:** `audit_logs.user_id` is nullable and has **no** foreign key, so a
  deleted user's audit-log rows are **retained** (the `user_id` becomes a
  dangling reference). If a request requires erasing audit history too, trim
  those rows manually in MySQL.
- The hub cannot delete data on the user's own media server — that is the server
  owner's responsibility; coordinate the server-side deletion separately.

### Data Retention: Relay Session Metadata

- Relay session metadata in `relay_sessions` is **not** automatically purged on a
  timer — there is no 90-day (or any) retention job in the hub.
- It is removed when the owning server row is deleted (foreign-key cascade), which
  happens when the server is deregistered or the owning account is deleted.
- To prune older relay-session rows for operational reasons, do it manually in
  MySQL.

---

## Removing a Server

There is no operator "suspend"/"unsuspend" toggle. To take a server off the hub:

- **Owner removes it:** `DELETE /api/v1/me/servers/{id}` — owner-scoped (returns
  403 `server.not_owned` for anyone else, 404 `server.not_found` if it does not
  exist).
- **Server deregisters itself:** `DELETE /api/v1/servers/{id}` — authenticated
  with the server's enrollment JWT (voluntary disconnect).
- **Delete the owning account:** `DELETE /api/v1/admin/users/{id}` (admin) — the
  foreign-key cascade removes every server that account claimed.

Removing a server deletes its `servers` row and cascades its `relay_sessions`,
`server_heartbeats`, shares, invites and DNS-challenge rows. The media server
software itself is unaffected; it simply can no longer relay through this hub.

---

## Audit Log Review

Review the audit trail from the **Audit Logs** page (`/app/admin/audit-logs`) or
the admin-gated API:

```http
GET /api/v1/me/audit-logs?user_id=<user-id>
GET /api/v1/me/audit-logs?action=user.delete
GET /api/v1/me/audit-logs?event=admin_action&from=<unix-ts>&to=<unix-ts>
```

- Supported filters: `event`, `user_id`, `resource`, `action`, `success` (`0`/`1`),
  `from`/`to` (unix timestamps), `limit` (default 50, max 200) and `offset`.
- Each entry carries: `event`, `user_id`, `action`, `resource`, `success`,
  `reason`, IP/User-Agent, a JSON `context`, and `created_at`.
- The log is append-only — entries are not modified or deleted by the application.
  There is no automatic pruning; rows are kept indefinitely (trim manually in
  MySQL if required).
- Use it to reconstruct the timeline when investigating repeated abuse.

---

## What Can Go Wrong

### DMCA Notice Acted On for the Wrong Account

**Symptom:** An innocent account/server is removed; the actual infringer remains active.

**Cause:** The `server_id` in the DMCA notice did not match the claimed server, or
the wrong account was selected in the Admin Console.

**Fix:** Always cross-reference the `server_id` in the notice against the hub's
server registry and the owning account before deleting anything. Because account
deletion is permanent and cascades, verify identity first. If you removed the
wrong account, restore it from a database backup — there is no in-app undo.

### User Data Not Fully Deleted (server still has data)

**Symptom:** The user's hub-side data is gone but their data on their own media
server remains.

**Cause:** The hub only controls hub-side rows; server-side data is under the
server owner's control. Additionally, `audit_logs` rows are retained by design.

**Fix:** Coordinate with the server owner to delete server-side data, and — if the
request requires it — manually trim the user's `audit_logs` rows in MySQL.
Document the coordination in your abuse queue.

### Need to Pause a Server Without Deleting It

**Symptom:** You want to stop a server relaying temporarily while an abuse claim
is investigated, but do not want to delete the account.

**Cause:** There is no reversible "suspend" action in the hub.

**Fix:** Contact the server owner and ask them to take the server offline (it stops
relaying when it stops sending heartbeats / closes its tunnel). If immediate hub
action is unavoidable, deleting the owning account is the only built-in lever, and
it is permanent.

---

## Next Steps

- [Hub claim and setup](../hub/claim-server.md) — understanding server claiming and hub identity
- [Hub shared libraries](../hub/share-with-friends.md) — how shared libraries work between server and hub
- [Hub-admin install & first boot](install.md) — hub setup and admin account creation
- [Audit Log](./audit-log.md) — fields, retention and export
- [GDPR & Data Rights](./gdpr-data-rights.md) — the real export/erasure surface
