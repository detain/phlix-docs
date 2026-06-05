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

Retention is governed by the hub's configuration; a fixed retention window or
automatic pruning may be available depending on how your hub is configured.

## Export

Bulk CSV/JSON export of the audit log may be available depending on your hub
configuration; otherwise the entries are available through the
`GET /api/v1/me/audit-logs` API for programmatic retrieval.
