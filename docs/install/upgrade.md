# Upgrading Phlix

**Since:** 0.18.0

Guide for updating an existing Phlix installation to a newer version. Read the [Known breaking-change patterns](#known-breaking-change-patterns) section before every upgrade.

---

## TL;DR

```bash
# 1. Back up
sudo -u phlix cp /etc/phlix/env /var/phlix/backups/env-$(date +%Y%m%d)

# 2. Pull the new version (or use the same method as your original install)
cd /opt/phlix-server
sudo -u phlix git pull

# 3. Install dependencies
sudo -u phlix composer install --no-dev

# 4. Run database migrations
sudo -u phlix php scripts/run-migrations.php

# 4b. Some releases add a ONE-TIME post-migration cleanup script that is NOT
#     run automatically — see "One-time post-migration cleanup scripts" below.

# 5. Rescan a library if needed (see below) — one library id at a time
sudo -u phlix php bin/phlix library:list
sudo -u phlix php bin/phlix library:scan {libraryId} --rescan

# 6. Restart the server
sudo systemctl restart phlix-server
```

The automated install script handles all of the above:

```bash
curl -fsSL https://raw.githubusercontent.com/detain/phlix-server/master/scripts/install.sh | sudo bash -s -- --update
```

`--update` preserves `/etc/phlix/env` so your secrets (`DB_PASSWORD`, `JWT_SECRET`, `PHLIX_SECRET_KEY`) survive across upgrades. Always confirm the env file is preserved before running the update script.

---

## 1. Back up before upgrading

Create a backup including the env file and current database:

```bash
# Env file (contains all secrets)
sudo -u phlix cp /etc/phlix/env /var/phlix/backups/env-$(date +%Y%m%d-%H%M%S)

# Full DB dump (replace with your credentials)
mysqldump -u root -p phlix > /var/phlix/backups/phlix-db-$(date +%Y%m%d-%H%M%S).sql

# Media metadata (optional — the DB dump above captures this)
# If using SQLite instead of MySQL:
# sqlite3 data/phlix.db ".backup /var/phlix/backups/phlix-db-$(date +%Y%m%d-%H%M%S).db"
```

---

## 2. Run database migrations

There is no `PHLIX_RUN_MIGRATIONS` gate — that variable exists nowhere in the
code. What actually happens:

- **Docker/container boot:** the entrypoint runs the migration chain on **every
  start** whenever a DB host is configured (`DB_HOST` or its
  `PHLIX_DATABASE_HOST` alias). If a migration fails the container still boots
  by default with a loud `PHLIX-MIGRATION-FAILURE` banner; setting
  `PHLIX_MIGRATIONS_STRICT=1` makes the container refuse to start instead —
  and since the SRV-DEPLOY hardening **all three shipped runtime images set
  `PHLIX_MIGRATIONS_STRICT=1` by default**, so a failed migration halts boot
  out of the box. (The strict flag is read by the entrypoint shell only; the
  PHP runtime never sees it.)
- **systemd / bare-metal boot:** `start.php` runs **no** migrations. Apply them
  explicitly before restarting the service:

```bash
sudo -u phlix php scripts/run-migrations.php   # or: php bin/phlix migrate
```

If the migration fails with a schema error, restore the backup and investigate before proceeding. Common causes:
- Skipped an intermediate version (always upgrade incrementally through consecutive releases, not jumps).
- The `phlix` MySQL user lacks `ALTER` permission — grant it: `GRANT ALTER ON phlix.* TO 'phlix'@'127.0.0.1';`

### Conditional recovery: dedupe cleanup scripts (normally NOT needed)

Older revisions of this page listed `cleanup_072.php` / `cleanup_090.php` as
**mandatory** post-upgrade steps. That is no longer true. The unique-key
creation they used to promise is now folded **into the sorted migration chain
itself** — `096_path_hash_unique_index.sql` and
`097_playback_state_unique_key.sql` build the `(library_id, path_hash)` index
and the `uq_playback_state_session_media` key automatically, and they are
idempotent. A normal upgrade runs them with everything else; you never touch
the cleanup scripts.

The cleanup scripts survive as **recovery tools for one specific failure**: on
a database that still holds duplicate rows, 096/097 deliberately REFUSE to
alter the table (they will not create a unique key over duplicates) and fail
with a message naming the exact remedy. Only then do you run the matching
script to merge the duplicates (keeping the most recently updated row), and
re-run the migration chain:

| Symptom (migration refuses) | Recovery command | Then |
|-----------------------------|------------------|------|
| `096` reports duplicate `media_items` paths | `sudo -u phlix php migrations/cleanup_072.php` | re-run `php scripts/run-migrations.php` |
| `097` reports duplicate `(session_id, media_item_id)` rows in `playback_state` | `sudo -u phlix php migrations/cleanup_090.php` | re-run `php scripts/run-migrations.php` |

The cleanup scripts are de-dup only (they no longer add keys themselves) and
are safe to re-run. On fresh installs and on databases without legacy
duplicates, none of this ever applies. See the phlix-server README
(“unique-key migrations and duplicate rows”) for the canonical narrative.

---

## 3. Post-upgrade library rescan

A full rescan re-walks each library, indexes files at paths that are not yet in the
catalogue, backfills missing source metadata on the existing rows whose type is
`video`, `movie`, `episode`, `audio` or `audiobook` (`photo` and `book` rows get
nothing), and prunes items whose source file is gone:

```bash
# List the libraries to get their ids
sudo -u phlix php bin/phlix library:list

# Full rescan — one library at a time (there is no "all libraries" flag)
sudo -u phlix php bin/phlix library:scan {libraryId} --rescan

# Watch the scan progress
tail -f .logs/media.log
```

The equivalent from the admin UI is **Admin → Libraries → Rescan**, or
`POST /api/v1/libraries/{id}/rescan`; those queue the job for the background
worker instead of blocking your shell.

::: tip A rescan prunes only what is gone from disk
Items still present at their recorded path, their watch history and their fetched
metadata are all preserved. On a large **music** library `--rescan` also re-reads
every file's tags and takes substantially longer than a plain scan — see
[Scan vs Rescan](../admin/library-management#scan-vs-rescan-vs-match-metadata)
for measured figures.
:::

::: tip A rescan is the right tool after moving media files (S158)
A parent-less item — `movie`, `video`, `photo`, `book`, `audiobook` — whose file was
**moved without being renamed** is matched by a path-independent canonical key, and
the prune in the same rescan re-points the existing row at the new path instead of
deleting it. The UUID, watch history and resume position all survive. Episodes were
never affected.

Use **Rescan**, not a standalone **Prune**: a prune does not scan, so it cannot tell
a moved file from a deleted one. A move that also **renames** the file still creates
a new row. See [Moving a file](../admin/library-management#moving-a-file).
:::

::: warning A rescan is not the tool for a metadata change
Only the **music** scanner acts on the "read every file" flag. On a movie, TV,
photo, book or audiobook library an already-indexed path is not re-parsed and not
re-matched, so a rescan will not pick up a provider behaviour change (e.g. a
TVDb → TMDb priority shift) for items you already have. For a **movie or TV**
library, queue a forced re-match instead, which re-resolves items that already carry
metadata:

```bash
curl -X POST http://localhost:8096/api/v1/libraries/{id}/refresh-metadata \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

See [Force a metadata re-match](../admin/library-management#force-a-metadata-re-match).

**Photo, book and audiobook libraries have no equivalent.** Both metadata jobs skip
those rows entirely and complete having processed zero items, and the server ships no
metadata-fetching provider for them, so there is nothing to re-run after an upgrade. See
[what Match metadata skips](../admin/library-management#what-match-metadata-skips).
:::

### When is a full rescan required?

| Upgrade type | Rescan needed? |
|-------------|----------------|
| Patch (e.g. 0.18.0 → 0.18.1) | No — migrations handle schema changes |
| Minor (e.g. 0.17.x → 0.18.x) | Only if files were added or deleted. For provider/match changes, run a metadata refresh instead |
| Major (e.g. 0.x → 1.x) | Review breaking changes first; rescan for added/deleted files, metadata refresh for match changes |

(Files that were **moved and renamed** are the one filesystem change a rescan
handles badly — a plain move is handled correctly. See
[Moving a file](../admin/library-management#moving-a-file).)

If movie or TV items that were previously matched show no metadata after an upgrade,
run a
[metadata match](../admin/library-management#enqueue-a-metadata-match) — it visits
exactly the items that carry no `metadata_refreshed_at` stamp — or fix a single title
with the
[per-item match action](../admin/library-management#fixing-a-single-items-match). If
an item instead matched to the **wrong** title, neither library-wide job will correct
it on its own; see
[Fixing a wrong match](../admin/library-management#fixing-a-wrong-match).

---

## 4. Breaking changes

Phlix uses [Semantic Versioning](https://semver.org). Minor version bumps are backward-compatible; major bumps may require operator action.

After every major or minor upgrade, check:

1. **Library item metadata** — If a metadata provider changed its response shape, previously matched **movie / TV** items may need re-matching. Queue a [forced metadata re-match](../admin/library-management#force-a-metadata-re-match) (`POST /api/v1/libraries/{id}/refresh-metadata`) and check the `media.log` for mismatches. A rescan will not do this — it does not revisit an already-indexed row. Photo, book and audiobook libraries are unaffected: they have no metadata-fetching provider, and the job skips their rows.
2. **FFmpeg version** — A newer FFmpeg may change default codec behaviour. If hardware-accelerated transcoding stopped working, verify encoder availability: `ffmpeg -hide_banner -encoders 2>&1 | grep nvenc`.
3. **Config file keys** — New config keys are added in minor releases; old keys are never removed without a deprecation warning in the release notes. Check `config/*.php` against the release's default templates.
4. **Plugin compatibility** — If you run plugins from the catalog, check the plugin catalog for version requirements before upgrading.

### Known breaking-change patterns

| Change | Required action |
|--------|----------------|
| Metadata provider priority change | Forced metadata re-match (`POST /api/v1/libraries/{id}/refresh-metadata`) — **not** a rescan |
| New required env var added | Set before startup; check release notes |
| Database schema change | Migrations run automatically (or manually via `run-migrations.php`) |
| FFmpeg codec deprecation | Update FFmpeg; check `config/ffmpeg.php` hwaccel paths |

---

## 5. Rolling back

If an upgrade causes problems:

```bash
# 1. Restore the env file
sudo -u phlix cp /var/phlix/backups/env-YYYYMMDD-HHMMSS /etc/phlix/env

# 2. Restore the database
mysql -u root -p phlix < /var/phlix/backups/phlix-db-YYYYMMDD-HHMMSS.sql

# 3. Revert the code
cd /opt/phlix-server
sudo -u phlix git checkout v0.17.x

# 4. Restart
sudo systemctl restart phlix-server
```

---

## 6. Upgrading the Hub

If you self-host the Hub, it is upgraded independently of phlix-server:

```bash
cd /opt/phlix-hub
sudo -u phlix git pull
sudo systemctl restart phlix-hub
```

The Hub and servers communicate over the relay tunnel. They are version-independent within a compatible relay protocol version — check the release notes for any relay protocol version requirements.
