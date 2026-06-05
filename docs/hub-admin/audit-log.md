---
title: Audit Log
description: Hub Admin activity tracking and audit trail
---

# Audit Log

The Hub Admin audit log tracks administrative actions.

## Viewing Logs

Audit Logs is one of the five pages in the Hub's [Admin Console](./admin-console.md).
Sign in as an admin and open **Audit Logs** from the Admin section of the top
navigation, or go directly to **`/app/admin/audit-logs`**. The page is gated to
admins (a non-admin gets `401 auth.required` / `403 auth.not_admin`) and reads from
`GET /api/v1/me/audit-logs`.

## Log Retention

There is **no** retention window and **no** automatic pruning. Audit entries are
written to the `audit_logs` table and kept indefinitely. If you need to trim old
rows, delete them manually in MySQL (e.g. by `created_at`).

## Export

There is **no** bulk CSV export. The only programmatic access is the
`GET /api/v1/me/audit-logs` JSON API (admin-gated). It supports filtering by
`event`, `user_id`, `resource`, `action`, `success` (`0`/`1`), `from`/`to`
(unix timestamps), plus `limit` (default 50, max 200) and `offset` for paging,
and returns `{ logs, total, limit, offset }`. For a full dump, query the
`audit_logs` table in MySQL directly.
