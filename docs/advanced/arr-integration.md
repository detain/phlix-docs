# ARR Integration

**Since:** 0.18.0

User-facing guide to integrating Sonarr, Radarr, and Bazarr with Phlix for automated media management.

---

## Overview

*ARR applications* (Sonarr, Radarr, Prowlarr, Bazarr) monitor download clients and automatically add new content to your library. Phlix acts as a client for these applications, serving the media they manage.

| Application | Manages | Connects to Phlix as |
|-------------|---------|----------------------|
| **Sonarr** | TV series | Media server (movie library or TV library) |
| **Radarr** | Movies | Media server |
| **Bazarr** | Subtitles for Sonarr/Radarr | Subtitle provider |
| **Prowlarr** | Indexer management | Indexer source for Sonarr/Radarr |

Phlix does not download or manage downloads — it only serves the media that the ARR applications have already downloaded through their own download client integration.

---

## Setting up the connection

### 1. Create a Phlix API key

1. Open the Phlix web UI as an admin user.
2. Go to **Admin → Server Settings → API Keys**.
3. Create a new API key with a descriptive name (e.g. `Sonarr`).

### 2. Add Phlix as a client in Sonarr / Radarr

#### Sonarr

1. **Settings → Connect → + → Generic**
2. Fill in:
   - **Name:** `Phlix`
   - **URL:** `http://your-phlix-host:8096`
   - **API Key:** your Phlix API key from step 1
3. Test the connection and save.

#### Radarr

1. **Settings → Connect → + → Custom Script**
2. Fill in:
   - **Name:** `Phlix`
   - **URL:** `http://your-phlix-host:8096`
   - **API Key:** your Phlix API key from step 1
3. Radarr does not have a native Generic import — use the Custom Script connector pointing at Phlix's import endpoint.

### 3. Create the library in Phlix

Create a library in Phlix (e.g. `/mnt/media/movies` for Radarr, `/mnt/media/tv` for Sonarr) and scan it so Phlix is aware of the content.

---

## ARR configuration reference

### Default ports

| Application | Default port | URL |
|-------------|-------------|-----|
| Sonarr | 8989 | `http://localhost:8989` |
| Radarr | 7878 | `http://localhost:7878` |
| Prowlarr | 9696 | `http://localhost:9696` |
| Bazarr | 6767 | `http://localhost:6767` |

### Phlix API endpoints used by ARRs

ARR applications interact with Phlix through the standard media library API:

| Action | Method | Endpoint |
|--------|--------|----------|
| List library items | `GET` | `/api/v1/libraries/{libraryId}/items` |
| Get media item | `GET` | `/api/v1/media/{id}` |
| Get download health | `GET` | `/api/v1/system/status` |
| Trigger incremental scan | `POST` | `/api/v1/libraries/{libraryId}/scan` |
| Trigger full rescan (re-walk + prune) | `POST` | `/api/v1/libraries/{libraryId}/rescan` |
| Match metadata for unmatched items | `POST` | `/api/v1/libraries/{libraryId}/match-metadata` |
| Force re-match of already-matched items | `POST` | `/api/v1/libraries/{libraryId}/refresh-metadata` |

::: warning Rescan does not re-match a movie or episode
ARR libraries are movie/TV, and on those types a rescan does **not** revisit a
path that is already indexed — the "re-read every file" behaviour is consumed by
the music scanner only. Use `rescan` after an ARR **adds, renames or deletes** a
file, and `match-metadata` when an item is **unmatched**.
:::

::: tip An ARR that MOVES a movie file without renaming it is handled (S158)
Radarr's "Movie Editor → root folder change" and any other operation that relocates
a file while keeping its filename is safe: the rescan matches the file to its
existing row by a path-independent canonical key, and the prune in the same run
**re-points that row at the new path** rather than deleting it. The UUID, watch
history and resume position survive. Episodes were never affected.

Two caveats. Run a **Rescan** rather than a standalone **Prune** afterwards — a
prune does not scan, so it has nothing to match against and will delete the row.
And an ARR operation that **renames as well as moves** produces a different
canonical key, so it still lands as a new row with a new UUID. See
[Moving a file](../admin/library-management#moving-a-file).
:::

::: warning `refresh-metadata` will not correct a wrong match

`refresh-metadata` is for backfilling fields or picking up a changed provider
priority — **not** for correcting an item that matched the wrong title. It re-seeds
a movie resolve from the item's own stored `external_ids` and re-runs a series
resolve against the same stored title, so the same record comes back. Fix those with
the [per-item match](../admin/library-management#fixing-a-single-items-match); see
[Fixing a wrong match](../admin/library-management#fixing-a-wrong-match) and
[Scan vs Rescan vs Match metadata](../admin/library-management#scan-vs-rescan-vs-match-metadata).
:::

---

## Troubleshooting

### ARR shows "No items found" in Phlix

1. Verify the library in Phlix has been scanned and contains items.
2. Check the ARR log for the specific error — the most common cause is the media path in the ARR not matching the path Phlix serves.
3. Make sure the media directory is accessible to the `phlix` system user.

### Import fails with a path mismatch

ARR applications import media by copying or hard-linking from the download location to the library folder. If Phlix and the ARR run as different users, ensure both can read/write the relevant directories:

```bash
# Allow both phlix and the download client's user access to the media directory
sudo chgrp -R media-group /mnt/media
sudo chmod -R 2775 /mnt/media
```

### Bazarr subtitles not syncing

Bazarr manages subtitles separately from Sonarr/Radarr. Verify Bazarr is pointed at the same library root as Phlix:

1. **Bazarr → Settings → Sonarr / Radarr** — confirm the series/movie root folder matches what Phlix has scanned.
2. Run a manual scan in Bazarr: **Settings → History → Rescan**.

---

## More detail

Developer documentation for the underlying ARR API client library (which runs in the `detain/phlix-shared` package) is at [/dev/arr-clients](/dev/arr-clients). This covers the Sonarr/Radarr/Prowlarr/Bazarr API wrappers, their configuration options, and how to extend them.
