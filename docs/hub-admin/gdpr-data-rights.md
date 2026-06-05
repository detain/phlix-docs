---
title: GDPR & Data Rights
description: Hub Admin data privacy and user data rights
---

# GDPR & Data Rights

How Hub Admin handles data privacy requests. The hub has **no dedicated GDPR
tooling** — there is no data-export command or endpoint and no automated
"right to be forgotten" workflow. This page documents the limited surface that
actually exists.

## Data Export

There is **no** built-in full-export feature (no export endpoint, no CLI command).

- A user can retrieve their **own** recorded activity through the audit-log API:
  `GET /api/v1/me/audit-logs`.
- A complete per-user export must be assembled by the operator querying the hub's
  MySQL database directly — the relevant tables are `users`, `servers`,
  `relay_sessions`, `shared_libraries`, `library_shares`, `media_requests`,
  `invite_links`, `webhooks` and `audit_logs` (filter by the user's `id`).
- The hub stores no media content, so an export covers only this directory and
  relay metadata.

## Data Deletion

An admin can delete a user account from the [Admin Console](./admin-console.md)
**Users** page (`/app/admin/users`) or via `DELETE /api/v1/admin/users/{id}`.
There is no self-service deletion and no separate "purge" command.

- The delete runs `DELETE FROM users WHERE id = :id`. InnoDB foreign keys then
  cascade-delete the rows that reference the user (directly or through their
  servers): `servers`, `server_heartbeats`, `relay_sessions`,
  `shared_libraries`, `library_shares`, `media_requests`, `invite_links`,
  `webhooks` and `dns_challenges`.
- **Exception:** `audit_logs` rows are **not** removed — `audit_logs.user_id` is
  nullable with no foreign key, so audit history is retained by design. If a
  request requires erasing it, trim those rows manually in MySQL.
- Guards: an admin cannot delete their own account, and cannot delete the last
  remaining admin.
- The hub cannot delete data held on the user's own media server — coordinate
  that deletion with the server owner separately.

## Compliance

See the [Privacy & Security](/privacy-security) documentation for full details.
