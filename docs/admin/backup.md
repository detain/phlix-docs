---
title: Backup
description: Server backup management — create, restore, delete, S3 upload, and schedule settings
---

# Backup

The **Backup** admin page (`/admin/backup`) manages full server backups containing a MySQL database dump, config files, user data, and SSL certificates. Backups can be stored locally or uploaded to Amazon S3 (or any S3-compatible bucket), with configurable retention and automatic scheduling.

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

Downloads from S3 if needed, verifies SHA-256 checksum, extracts the archive, imports `database.sql` via `mysql`, and restores config files. The operation is atomic — if any step fails, the process aborts and reports the error.

**Response `200`:**
```json
{ "success": true, "message": "Backup restored successfully" }
```

**Response `500`:**
```json
{ "success": false, "message": "Restore failed", "error": "checksum mismatch" }
```

> **Warning**: Restore is destructive. Stop the server before restoring.

---

### 5. Upload backup to S3

```
POST /api/v1/admin/backup/{id}/upload-s3
```

Uploads the local backup archive to S3. The `is_s3` flag on the backup record updates to `true` after a successful upload.

**Response `200`:**
```json
{ "success": true, "message": "Backup uploaded to S3" }
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
  "message": "Schedule updated",
  "data": {
    "auto_backup_interval_days": 7,
    "retention_count": 10
  }
}
```

**Response `400`:**
```json
{ "success": false, "error": "retention_count must be at least 1" }
```

---

## Configuration

Backup settings are defined in `config/backup.php`:

```php
<?php
return [
    'local_path'                => '/var/backups/phlix',
    'auto_backup_interval_days' => 7,    // 0 = disabled
    'retention_count'           => 10,   // keep last N backups
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

When `auto_backup_interval_days > 0`, the server schedules backups automatically. The next scheduled time is returned by `GET /api/v1/admin/backup/schedule`. Old backups beyond `retention_count` are automatically deleted after each new backup (both local files and S3 objects).

---

## Backup Contents

`BackupManager` creates `tar.gz` archives containing:

- **MySQL database dump** — all tables via `mysqldump --single-transaction`
- **Config files** — everything in `config/*.php`
- **User data** — everything in `data/`
- **SSL certificates** — if present at `/etc/ssl/certs/phlix`, `/etc/phlix/ssl`, or `/var/lib/phlix/ssl`

---

## See Also

- [Dashboard](./dashboard) — verify backup success in the activity feed
- [Stats](./stats) — storage usage over time
- [Webhooks](./webhooks) — receive alerts on backup failures
- [Admin SPA dev docs](../dev/admin-spa#13-the-backup-page-step-15) — technical implementation details
