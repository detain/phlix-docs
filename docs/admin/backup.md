---
title: Backup
description: Server backup creation, restore, and S3 storage
---

# Backup

Phlix supports full server backups that include the MySQL database dump, config files, user data, and SSL certificates. Backups can be stored locally or uploaded to Amazon S3 (or any S3-compatible bucket), with configurable retention and automatic cleanup.

## What It Is

The `BackupManager` creates `tar.gz` archives containing:

- **MySQL database dump** — all tables via `mysqldump --single-transaction`
- **Config files** — everything in `config/*.php`
- **User data** — everything in `data/`
- **SSL certificates** — if present at `/etc/ssl/certs/phlix`, `/etc/phlix/ssl`, or `/var/lib/phlix/ssl`

Backups are tracked in the `backups` table (id, label, file path, size, SHA-256 checksum, S3 flag, creation time, expiry).

## How to Configure

### Local Storage

Backups are stored locally under the path configured in `config/backup.php`:

```php
<?php
return [
    'local_path'                => '/var/backups/phlix',
    'auto_backup_interval_days' => 7,    // 0 = disabled
    'retention_count'           => 10,   // keep last N backups
    's3' => [
        'enabled'    => false,
        'region'      => 'us-east-1',
        'bucket'      => 'my-phlix-backups',
        'prefix'      => 'backups/',
        'access_key'  => null,
        'secret_key'  => null,
        'endpoint'    => null,          // for S3-compatible stores
    ],
];
```

### S3 Configuration

To enable S3 uploads:

```php
's3' => [
    'enabled'    => true,
    'region'      => 'eu-west-1',
    'bucket'      => 'my-phlix-backups',
    'prefix'      => 'phlix/',
    'access_key'  => 'AKIAIOSFODNN7EXAMPLE',
    'secret_key'  => 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    'endpoint'    => 'https://s3.eu-west-1.amazonaws.com', // omit for AWS
],
```

The `endpoint` key supports S3-compatible stores (MinIO, Cloudflare R2, Backblaze B2, etc.).

## How to Trigger

### Via Admin API

**Create a backup**

```http
POST /api/v1/admin/backup
```

Request body (optional):
```json
{ "label": "before-upgrade" }
```

Response:
```json
{
  "backup_id": "a1b2c3d4-...",
  "file_path": "/var/backups/phlix/before-upgrade_backup_2024-01-15_10-30-00.tar.gz",
  "size_bytes": 524288000
}
```

**List backups**

```http
GET /api/v1/admin/backup
```

```json
{
  "data": [
    {
      "id": "a1b2c3d4-...",
      "label": "before-upgrade",
      "file_path": "/var/backups/phlix/before-upgrade_backup_2024-01-15_10-30-00.tar.gz",
      "size_bytes": 524288000,
      "checksum_sha256": "abc123...",
      "is_s3": false,
      "created_at": "2024-01-15T10:30:00Z",
      "expires_at": null
    }
  ]
}
```

**Restore from backup**

```http
POST /api/v1/admin/backup/{id}/restore
```

Response:
```json
{
  "success": true,
  "message": "Backup 'a1b2c3d4-...' restored successfully"
}
```

Restoration downloads the S3 archive if needed, verifies the SHA-256 checksum, extracts the tarball, imports `database.sql` via `mysql`, and restores config files. The operation is atomic — if any step fails, the process aborts and reports the error.

**Delete a backup**

```http
DELETE /api/v1/admin/backup/{id}
```

**Upload a local backup to S3**

```http
POST /api/v1/admin/backup/{id}/upload-s3
```

**Download an S3 backup to local storage**

```http
POST /api/v1/admin/backup/{id}/download-from-s3
```

### Via UI

Navigate to **Admin UI → Settings → Backup** to:
- View all backups (local and S3)
- Create a new backup (with optional label)
- Restore from any listed backup
- Upload / download from S3
- Delete old backups

### Automatic Backups

When `auto_backup_interval_days > 0`, the server schedules backups automatically based on the most recent backup timestamp. The next scheduled backup time is queryable via:

```http
GET /api/v1/admin/backup/next-scheduled
```

```json
{
  "next_backup_at": "2024-01-22T10:30:00Z"
}
```

## Restore Procedures

1. Identify the backup to restore (from list or manual selection)
2. Call `POST /api/v1/admin/backup/{id}/restore`
3. The server downloads from S3 if needed, verifies checksum, then restores
4. Config files are overwritten; database is imported
5. A confirmation response is returned

> **Warning**: Restore overwrites the current database and config files. Do not restore onto a running server — stop the server first, restore, then restart.

## Backup Retention

Old backups are automatically cleaned up when `retention_count` is exceeded. The cleanup runs after every new backup creation and deletes the oldest backups beyond the retention limit (both local files and S3 objects).

## Where to Look

| Location | Description |
|----------|-------------|
| Admin UI → Settings → Backup | Full backup management UI |
| `POST /api/v1/admin/backup` | Create a new backup |
| `GET /api/v1/admin/backup` | List all backups |
| `POST /api/v1/admin/backup/{id}/restore` | Restore from backup |
| `DELETE /api/v1/admin/backup/{id}` | Delete a backup |
| `POST /api/v1/admin/backup/{id}/upload-s3` | Upload to S3 |
| `POST /api/v1/admin/backup/{id}/download-from-s3` | Download from S3 |
| `GET /api/v1/admin/backup/next-scheduled` | Next auto-backup time |

## See Also

- [Dashboard](./dashboard) — verify backup success in the activity feed
- [Stats](./stats) — storage usage over time
- [Webhooks](./webhooks) — receive alerts on backup failures
