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

Migrations run automatically at startup if `PHLIX_RUN_MIGRATIONS=1` (the default). To run them explicitly:

```bash
sudo -u phlix php scripts/run-migrations.php
```

If the migration fails with a schema error, restore the backup and investigate before proceeding. Common causes:
- Skipped an intermediate version (always upgrade incrementally through consecutive releases, not jumps).
- The `phlix` MySQL user lacks `ALTER` permission — grant it: `GRANT ALTER ON phlix.* TO 'phlix'@'127.0.0.1';`

### One-time post-migration cleanup scripts (run once after upgrading)

A few releases ship a **one-time** cleanup script alongside a migration. These scripts first
de-duplicate existing rows and then add a `UNIQUE KEY` — a step that would fail if run inline as a
plain migration on any database that already holds duplicates. **The migration reserves the change;
the cleanup script performs it.** Neither `scripts/install.sh` nor the Docker entrypoint runs these
scripts automatically, so you must run them manually **once** after the migration that introduces
them. They are idempotent — re-running is safe, and you should re-run one if it reports that
duplicates remain.

Run each from the install directory (e.g. `/opt/phlix-server`) as the `phlix` user:

| Since | Migration | Run once after upgrading | What it does |
|-------|-----------|--------------------------|--------------|
| media-path dedupe | `072_media_items_path_hash.sql` | `sudo -u phlix php migrations/cleanup_072.php` | Merges duplicate-path `media_items` rows, then adds the `(library_id, path_hash)` unique index. |
| playback-progress dedupe (updates.md #29 / S29) | `090_playback_state_session_media_unique.sql` | `sudo -u phlix php migrations/cleanup_090.php` | Merges duplicate `(session_id, media_item_id)` rows in `playback_state` (keeping the most recently updated), then adds the `uq_playback_state_session_media` unique key. **Until this runs, playback-progress writes keep inserting a new row every ~15 seconds instead of updating in place, which bloats the table and undermines resume / Continue Watching.** |

::: warning Run these before considering the upgrade complete
If you skip a one-time cleanup script, the associated migration's unique key never gets created and
the duplicate-row behaviour it fixes continues. Running the script late is fine (it dedupes whatever
has accumulated), but do it as part of the upgrade so the fix actually takes effect.
:::

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

::: danger Do not rescan straight after moving media files
A parent-less item — `movie`, `video`, `photo`, `book`, `audiobook` — whose file was
**moved without being renamed** is not re-indexed at its new path; the scanner reuses
the old row by a path-independent canonical key and leaves its `path` stale, and the
prune then deletes that row along with its watch history and resume position. It
returns on the *next* rescan as a new row with a **new UUID**. Episodes are
unaffected. There is no option that avoids this — read
[Moving a file](../admin/library-management#moving-a-file) first. Tracked as **S158**.
:::

::: warning A rescan is not the tool for a metadata change
Only the **music** scanner acts on the "read every file" flag. On a movie, TV,
photo, book or audiobook library an already-indexed path is not re-parsed and not
re-matched, so a rescan will not pick up a provider behaviour change (e.g. a
TVDb → TMDb priority shift) for items you already have. For a **movie or TV**
library, queue a forced re-match instead, which re-resolves items that already carry
metadata:

```bash
curl -X POST http://localhost:32400/api/v1/libraries/{id}/refresh-metadata \
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

(Files that were **moved** are the one filesystem change a rescan handles badly —
see [Moving a file](../admin/library-management#moving-a-file).)

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
