---
title: Backup
description: Server backup management — create, restore, delete, S3 upload, and schedule settings
---

# Backup

The **Backup** admin page (`/app/admin/backup`) manages full server backups containing a MySQL database dump, config files, user data, and SSL certificates. Backups can be stored locally or uploaded to Amazon S3 (or any S3-compatible bucket), with configurable retention and automatic scheduling.

> **Destructive operation**: Restore overwrites the current database and all config files. Do not restore onto a running server — stop the server first, restore, then restart.

---

## Page Layout

The page has two sections on a single `/admin/backup` route:

1. **Backup list + actions** — table of all backups with per-row controls
2. **Scheduled backups** — interval and retention settings form

---

## UI Actions

| Action | Trigger | Behavior |
|--------|---------|----------|
| Create backup | "Create backup" button (top-right of list card) | Opens inline form with optional label input; POSTs to `/api/v1/admin/backup/create`; shows spinner on button; displays success or error toast; refreshes list on completion |
| Restore | "Restore" button per row (danger) | Opens confirmation modal: "This will overwrite your current data. Continue?" + Cancel/Restore buttons; POSTs to `/api/v1/admin/backup/{id}/restore`; shows success/error toast |
| Delete | "Delete" button per row (danger) | Opens confirmation dialog: "Are you sure you want to delete this backup? This cannot be undone." + Cancel/Delete buttons; DELETE to `/api/v1/admin/backup/{id}`; refreshes list on completion |
| Upload to S3 | "Upload to S3" button per row (if `is_s3` is false) | POSTs to `/api/v1/admin/backup/{id}/upload-s3`; shows success toast on completion; if S3 is not configured, backend returns 500 and an error toast is shown |
| Save schedule | "Save schedule" button (schedule card) | PUTs to `/api/v1/admin/backup/schedule` with `{ auto_backup_interval_days?, retention_count? }`; shows success/error toast; refreshes schedule display |

---

## Backup Shape

Each backup object returned by the API has the following shape:

```typescript
interface Backup {
  id: string;
  label: string;
  file_path: string;
  size_bytes: number;
  checksum_sha256: string;
  is_s3: boolean;
  created_at: string;      // ISO 8601
  expires_at: string | null;
}
```

---

## Schedule Shape

```typescript
interface BackupSchedule {
  auto_backup_interval_days: number;   // 0 = disabled
  retention_count: number;           // minimum 1
  next_scheduled_backup: number | null; // Unix timestamp
  next_scheduled_backup_iso: string | null; // ISO 8601
}
```

---

## API Contract

All endpoints are gated by `AdminMiddleware` (require admin authentication) and return JSON envelopes.

### 1. List backups

```
GET /api/v1/admin/backup/list
```

Returns all backup records.

**Response `200`:**
```json
{
  "success": true,
  "data": [ /* Backup objects */ ],
  "count": 3
}
```

---

### 2. Create backup

```
POST /api/v1/admin/backup/create
```

**Request body** (all fields optional):
```json
{ "label": "before-upgrade" }
```

**Response `200`:**
```json
{
  "success": true,
  "message": "Backup created successfully",
  "data": {
    "backup_id": "a1b2c3d4-...",
    "file_path": "/var/backups/phlix/before-upgrade_backup_2024-01-15_10-30-00.tar.gz",
    "size_bytes": 524288000
  }
}
```

---

### 3. Delete backup

```
DELETE /api/v1/admin/backup/{id}
```

**Response `200`:**
```json
{ "success": true, "message": "Backup deleted successfully" }
```

**Response `404`:**
```json
{ "success": false, "error": "Backup not found" }
```

---

### 4. Restore backup

```
POST /api/v1/admin/backup/{id}/restore
```

Downloads from S3 if needed, verifies the SHA-256 checksum, extracts the archive, imports `database.sql` via `mysql`, then copies the archived config files over `config/`.

::: danger The restore is NOT atomic and there is no rollback
There is no transaction, no pre-restore snapshot and no compensating action. The
checksum and extraction steps run before anything is written, so a corrupt archive
is rejected harmlessly — but once the `mysql` import has run it cannot be undone,
and a later failure while restoring config files leaves the **database fully
replaced** and `config/` **partially overwritten**.

Partial config state is the normal path, not just the crash path: the restore
copies file-by-file and skips past entries whose parent directory it cannot create
or which fail the containment check, so it can report success having written only a
subset. **Take your own database and `config/` snapshot before restoring.**
:::

**Response `200`:** — the backup id is interpolated into the message.
```json
{ "success": true, "message": "Backup 'abc123' restored successfully" }
```

**Response `500`:** — note `message` carries the failure category and `error` the
detail, not the other way round. On a checksum mismatch:
```json
{ "success": false, "message": "Checksum mismatch", "error": "Expected <a>, got <b>" }
```
`"Restore failed"` appears as the **`error`** value only when an unexpected
exception escapes.

> **Warning**: Restore is destructive. Stop the server before restoring.

---

### 5. Upload backup to S3

```
POST /api/v1/admin/backup/{id}/upload-s3
```

Uploads the local backup archive to S3. After a successful upload the `is_s3` flag on the backup record updates to `true` **and `file_path` is replaced with the `s3://` URL** — the local `.tar.gz` is left on disk and its path is no longer recorded anywhere. See [Retention](#retention) for why that matters.

**Response `200`:**
```json
{ "success": true, "message": "Backup uploaded to S3 successfully" }
```

**Response `500`:**
```json
{ "success": false, "error": "S3 upload failed" }
```

Returns `500` if S3 is not configured in `config/backup.php`.

---

### 6. Get schedule settings

```
GET /api/v1/admin/backup/schedule
```

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "auto_backup_interval_days": 7,
    "retention_count": 10,
    "next_scheduled_backup": 1705930200,
    "next_scheduled_backup_iso": "2024-01-22T10:30:00Z"
  }
}
```

`next_scheduled_backup` and `next_scheduled_backup_iso` are `null` when `auto_backup_interval_days` is `0` (scheduled backups disabled).

---

### 7. Update schedule settings

```
PUT /api/v1/admin/backup/schedule
```

**Request body** (all fields optional):
```json
{ "auto_backup_interval_days": 7, "retention_count": 10 }
```

`auto_backup_interval_days`: number of days between automatic backups; `0` disables auto-backup. `retention_count`: number of backups to retain (must be ≥ 1).

**Response `200`:**
```json
{
  "success": true,
  "message": "Schedule updated successfully",
  "data": {
    "auto_backup_interval_days": 7,
    "retention_count": 5
  }
}
```

**Response `400`:** — the specific rule is in `message`; `error` is the category.
```json
{ "success": false, "error": "Invalid retention count", "message": "retention_count must be at least 1" }
```

---

## Configuration

Backup settings are defined in `config/backup.php`:

```php
<?php
return [
    'enabled'                   => true, // REQUIRED for automatic backups
    'local_path'                => '/var/phlix/backups',
    'auto_backup_interval_days' => 7,    // 0 = disabled
    'retention_count'           => 5,    // keep last N backups
    's3' => [
        'enabled'    => false,
        'region'     => 'us-east-1',
        'bucket'     => 'my-phlix-backups',
        'prefix'     => 'backups/',
        'access_key' => null,
        'secret_key' => null,
        'endpoint'   => null,   // for S3-compatible stores (MinIO, R2, B2, etc.)
    ],
];
```

::: warning `enabled` is required, and the schedule is only read at boot
Automatic backups need an explicit truthy `enabled`. The boot-time check reads it as
`empty($backupConfig['enabled'])`, so a `config/backup.php` that **omits** the key
registers no timer at all, whatever `auto_backup_interval_days` says. (A second
reader defaults the same key to `true`, but nothing consumes that value — the
boot-time check is the only live consumer, so the behaviour is unambiguous: no
`enabled`, no automatic backups.) Manual backups from the admin page are unaffected.

Both gates — `enabled` and `auto_backup_interval_days > 0` — are evaluated **once,
at startup**. `PUT /api/v1/admin/backup/schedule` rewrites `config/backup.php` but
does not touch the running process, and the backup manager caches its config for the
process lifetime. **Restart the server for a schedule change to take effect.**
:::

When `enabled` is truthy and `auto_backup_interval_days > 0`, the server registers a scheduled-backup timer at startup. The next scheduled time is returned by `GET /api/v1/admin/backup/schedule`.

### Retention {#retention}

Old backups beyond `retention_count` are deleted after each new backup. Deletion removes **either** the S3 object **or** the local file, depending on the record's `is_s3` flag — never both.

::: warning An uploaded backup leaves its local archive behind forever
"Upload to S3" flips `is_s3` to `true` and replaces the stored `file_path` with the
`s3://` URL **without deleting the local archive**. Retention then only ever deletes
the S3 object for that record, and the on-disk `.tar.gz` path is no longer recorded
anywhere, so no code path can ever clean it up. If you use S3, prune `local_path`
yourself.
:::

---

## Backup Contents

`BackupManager` creates `tar.gz` archives containing:

- **MySQL database dump** — all tables via `mysqldump --single-transaction`
- **Config files** — every `*.php` under `config/`, walked **recursively**, so nested files such as `config/scrobblers/trakt.php` are included (a flat glob used to miss them, losing Trakt's OAuth tokens)
- **User data** — everything in `data/`
- **SSL certificates** — if present at `/etc/ssl/certs/phlix`, `/etc/phlix/ssl`, or `/var/lib/phlix/ssl`

---

## See Also

- [Dashboard](./dashboard) — verify backup success in the activity feed
- [Stats](./stats) — storage usage over time
- [Webhooks](./webhooks) — receive alerts on backup failures
- [Admin SPA dev docs](../dev/admin-spa) — technical implementation details. There is no
  dedicated backup-page section: `dev/admin-spa.md` documents sections 1–8, 14 and 16–18, and
  the backup page is not among them.
