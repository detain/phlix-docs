---
title: Library Management
description: Managing libraries in the admin UI, the filesystem-browse picker API, and the async scan endpoints
---

# Library Management

This page documents two layers:

1. The **admin UI Libraries page** (the operator workflow — list, add, edit, delete, scan, history).
2. The **HTTP API contract** the page consumes — the filesystem-browse picker (step 0.6), the
   async scan endpoints (step 1.1b), and the allowed-roots jail.

The Libraries page is the **first feature page** built on top of the
[Admin SPA scaffold](../dev/admin-spa) (step 0.4).

## Managing libraries in the admin UI

The admin console exposes a **Libraries** page at `/admin/libraries` for managing every
media library on this server. The page is **admin-gated** (same gate as the rest of
`/admin/*` — non-admin requests are redirected to `/login`).

### Reaching the page

Open `/admin` in a browser, sign in as an admin user, then click **Libraries** in the
left-hand sidebar (under **Dashboard**). The page renders a single
[`DataTable`](../dev/admin-spa) of every library currently registered with the server.

### The library list

For each library the table shows:

| Column | Source |
|--------|--------|
| **Name** | `library.name` |
| **Type** | `library.type` (one of `movie`, `series`, `music`, `photo`, `video`) |
| **Paths** | A count (e.g. `2 paths`) — the full list appears in the edit form |
| **Status** | A status badge (Idle / Queued / Running… / Completed / Failed) sourced from the latest scan job |
| **Actions** | `Edit`, `Scan`, `Rescan`, `History`, `Delete` |

When the library list is empty the page renders an empty-state message instead of an empty
table. A load error (network failure or a non-2xx from
`GET /api/v1/libraries`) raises a toast carrying the server error string — every server
string is rendered as React text only (no `dangerouslySetInnerHTML`, so untrusted names
can never inject HTML).

### Adding a library

Click **Add library** to open a modal with a form:

| Field | Notes |
|-------|-------|
| **Name** | Free-text label for the library. |
| **Type** | A select of the **five DB-valid types**: `movie`, `series`, `music`, `photo`, `video`. |
| **Paths** | One or more directories chosen via the **PathPicker** (see below). At least one path is required. |
| **Series per directory** | (series libraries only) Toggle the `series_per_directory` option — see [Per-series-directory libraries](#per-series-directory-libraries) below. |

Submitting `POST`s `{ name, type, paths, options? }` to `/api/v1/libraries`. On `201` the
modal closes, a success toast appears, and the list refreshes. A `400` (validation error)
surfaces the server's error message as a toast.

### Per-series-directory libraries

A **series** library can carry a `series_per_directory` option (stored inside the
library's `options` blob). When it is set, the scanner treats **each top-level
subdirectory of the library as exactly one series**, and the folder name —
formatted as **`Series Title (Year)`** — is the authoritative source for the series
title and year used for both **grouping episodes** and **TMDB TV metadata matching**.

This is the recommended layout for collections where each show lives in its own
directory, e.g.:

```
/vault1/anime/
  Assassination Classroom (2013)/
    Assassination Classroom S01E01.mkv
    Assassination Classroom S01E02.mkv
  Being Human US (2011)/
    ...
```

Why the folder name matters:

- The folder name is used verbatim as the match key, so disambiguators in the name
  are preserved — `Being Human US (2011)` keeps the "US", and
  `Battlestar Galactica (1978)` vs `Battlestar Galactica (2003)` stay distinct
  (sibling year folders never merge into one series).
- Episode filenames only need to carry `SxxExx` — the season and episode numbers
  come from the filename, but the show identity comes from the folder.
- Full series, season, and episode metadata (posters, overviews, air dates,
  ratings, stills) is then resolved from **TheMovieDB (TMDB)**.

::: tip TMDB, not TheTVDB
Phlix resolves TV metadata through **TheMovieDB (TMDB)**. TheTVDB is a separate
service and is not used — configure a TMDB API key under
[Server Settings → Metadata](./server-settings) for matching to work.
:::

::: tip Setting the option
The option can be sent at the top level of the create/update body (`series_per_directory: true`)
or nested inside `options`; either way it is coerced to a real boolean and stored
canonically inside `options`. It is ignored (and stripped) for non-series library
types. Activating it on an already-scanned library and re-scanning stamps the
folder-derived title/year onto existing series rows, so a plain rescan is enough —
a full purge is not required.
:::

::: warning `book` is deliberately not offered
The `libraries.type` ENUM in migration `001_initial_schema.sql` is exactly
`movie|series|music|photo|video`. The PHP controller `LibraryController::create()`
*also lists* `book` in its `$validTypes`, but a `book` insert would `500` at the DB
ENUM — so the UI excludes it. The controller/DB mismatch is a known pre-existing
backend bug tracked as a carry-over for a later step.
:::

### The PathPicker

The path field is a small directory picker that drives the
[`GET /api/v1/admin/fs/browse`](#browse-filesystem) endpoint:

- The initial view lists the **configured roots** (see [Allowed Roots](#allowed-roots)).
- Click a directory name to drill **into** it; click **Up** to walk back to its parent
  (disabled at a root).
- Click **Select this folder** to add the current directory to the selected list.
- Selected paths show a **Remove** link to drop them again; duplicates are deduplicated.

Every directory name returned by the server is rendered as React text — an HTML-looking
directory name is rendered as literal text, never parsed as markup.

### Editing a library

Click **Edit** on a row to open the same form, pre-filled with the current values. The
form `PUT`s `{ name, paths, options? }` to `/api/v1/libraries/{id}`.

::: tip Type is read-only on edit
The PHP `LibraryController::update()` silently ignores `type` (the column is not
updatable), so the form displays the existing type **read-only** and the SPA never
sends `type` in a `PUT` payload. To change a library's type, delete it and re-add it.
:::

### Deleting a library

Click **Delete** on a row to open a confirm modal. Confirming `DELETE`s
`/api/v1/libraries/{id}`; success refreshes the list and shows a toast. A `404`
(library already gone) surfaces a toast too.

### Scan vs Rescan vs Match metadata

The Libraries page offers three distinct actions, and it is worth being clear on
which one you want:

| Action | What it does | When to use |
|--------|--------------|-------------|
| **Scan** | Adds new files and updates changed ones, **keeping** existing items. | The routine, everyday update after dropping in new media. |
| **Rescan** | **Deletes all** of the library's items, then runs a full scan from scratch. | After **moving files** around, or to repair bad/duplicated matches — anything where the existing rows are wrong. |
| **Match metadata** | Re-fetches posters / details for items **already** in the library (no filesystem changes). | When art or details are missing or stale but the items themselves are fine. |

::: warning Rescan is destructive
**Rescan** purges every item in the library before rebuilding — continue-watching
positions and any per-item state tied to the old rows are lost. Reach for **Scan**
unless you specifically need the clean rebuild.
:::

**Match metadata** is the per-library counterpart of the single-item
[Match metadata action](#fixing-a-single-items-match) described below; it is a third
job type (`metadata`) alongside `scan` and `rescan`.

### Triggering a scan or rescan

Each row has **Scan** and **Rescan** buttons. Both call the [async scan
endpoints](#scanning-a-library) and return immediately with a `202` + a `job_id`. The
page shows a "queued" toast with the returned message and starts polling status for that
library.

- **Scan** runs an **incremental** scan (new + changed files).
- **Rescan** runs a **full** purge + rescan.

Neither button blocks — the work happens in the background
[Library Scan Worker](../dev/library-scan-worker). You can navigate away; the next time
you visit the page the status badge picks up the current state of the latest job.

### Reading the live status

Once a scan is queued — and on initial load for a library that already has a job — the
page polls `GET /api/v1/libraries/{id}/scan-status` every **2 seconds** for that library.
Polling **stops** as soon as the job reaches a terminal state (`completed` or `failed`),
or when the endpoint returns `null` (no job has ever run). The status badge then carries
the final value.

If a scan **fails**, the badge shows `Failed` and the page surfaces the server `error`
string as React text.

#### Live progress bar

While a job is running, the page renders a **live progress bar** above the badge,
not just a lifecycle state. It shows:

- a **percentage** — `items_updated / items_found` (processed ÷ total);
- the raw **`processed / total`** count; and
- the **current file** being processed (`current_path`).

This is wired for `scan`, `rescan`, **and** `metadata` (match) jobs — all three stream
progress onto the same job row, polled through the same
`GET /api/v1/libraries/{id}/scan-status` endpoint (it returns the latest job regardless
of type). The worker pre-counts the library's media files for the denominator and ticks
once per processed file; writes are coalesced (at most one every 25 files, plus the
final) so a large library does not hammer the job row. See the
[Library Scan Worker](../dev/library-scan-worker#real-per-file-progress) for the
mechanics.

::: tip Music, photo, book and audiobook libraries stay coarse
The specialised music / photo / book / audiobook scanners do **not** emit per-file
counts, so for those library types the bar does not fill — the lifecycle badge
(`queued → running → completed/failed`) is still accurate.
:::

### Reviewing scan history

Click **History** on a row to open a modal that loads
`GET /api/v1/libraries/{id}/scan-history?limit=20` and lists recent jobs (newest first)
in a `DataTable`:

| Column | Source |
|--------|--------|
| **Type** | `scan` / `rescan` |
| **Status** | `queued` / `running` / `completed` / `failed` |
| **Queued at** | `queued_at` |
| **Completed at** | `completed_at` (or empty for jobs still in flight) |
| **Error** | `error` (only for `failed` jobs) |

The server clamps `limit` to `[1, 100]` and defaults to `20`; the UI uses the default.

## Browse Filesystem

The admin UI's [PathPicker](#the-pathpicker) is the canonical consumer of this endpoint.
The contract below documents the wire format for that picker and for any future tooling.

```http
GET /api/v1/admin/fs/browse?path=<absolute-path>
```

Lists the immediate **subdirectories** of `path` (files are excluded), sorted by
name. The result is restricted to the configured [allowed roots](#allowed-roots)
— any path that resolves outside them is rejected.

### Query Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `path` | No | Absolute path whose subdirectories to list. When empty or absent, the configured allowed roots are returned as the entry list (the picker's starting point). |

## Authentication

The endpoint sits in the `/api/v1/admin` route group and is gated by the admin
middleware. Send a valid admin JWT as a Bearer token:

```http
Authorization: Bearer <admin-access-token>
```

- An **unauthenticated** request returns `401`.
- A **non-admin** request returns `403`.

Both error responses are JSON.

## Responses

### Starting point (no `path`)

With an empty or absent `path`, the configured roots are returned as the entry
list so the picker has somewhere to begin. `path` and `parent` are `null`:

```json
{
  "success": true,
  "data": {
    "path": null,
    "parent": null,
    "entries": [
      { "name": "home", "path": "/home" },
      { "name": "mnt", "path": "/mnt" },
      { "name": "media", "path": "/media" },
      { "name": "data", "path": "/data" }
    ]
  }
}
```

### Directory listing

For a valid directory under an allowed root, `entries` holds its immediate
subdirectories (sorted by name), `path` is the canonical (resolved) directory,
and `parent` is the parent directory **only when the parent is itself within the
jail** — otherwise `null` (so the picker stops at a root):

```json
{
  "success": true,
  "data": {
    "path": "/media/movies",
    "parent": "/media",
    "entries": [
      { "name": "Action", "path": "/media/movies/Action" },
      { "name": "Comedy", "path": "/media/movies/Comedy" }
    ]
  }
}
```

### Error responses

| Status | When | Body |
|--------|------|------|
| `400` | The path resolves but is **not a directory** (e.g. a file). | `{ "success": false, "error": "Not a directory" }` |
| `403` | The path resolves **outside the allowed roots** — including `../` escapes and symlinks that point out of the jail. | `{ "success": false, "error": "Path is outside the allowed roots" }` |
| `404` | The path does **not exist** / cannot be resolved by `realpath()`. | `{ "success": false, "error": "Path not found" }` |

The checks run in the order `404` → `400` → `403`, so a non-existent or
non-directory path reports the more specific `404`/`400` rather than `403`.

## Scanning a Library

Scanning indexes a library's filesystem for media and updates the catalog. As of
**Phase 1.1b the scan runs asynchronously** — off the HTTP request. The scan and
rescan endpoints no longer scan inline; they **enqueue a job** and return `202`
immediately, and a background [Library Scan Worker](../dev/library-scan-worker)
drains the queue. Use the [scan-status](#scan-status) endpoint to poll a job's
progress.

The [admin UI](#triggering-a-scan-or-rescan) wraps all four endpoints below:
per-row **Scan** / **Rescan** buttons hit the enqueue endpoints, the page polls
`scan-status` every 2 seconds (stopping on terminal status), and a **History**
modal shows the most recent jobs from `scan-history`.

All four endpoints below are **admin-gated** (the `scan-status` job row exposes a
server filesystem path in `current_path`), require a valid admin Bearer token
(`401` unauthenticated, `403` non-admin), and return `404` when the library does
not exist.

### Enqueue a scan

```http
POST /api/v1/libraries/{id}/scan
```

Queues an **incremental** scan. Returns `202 Accepted` with the new job id:

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440099",
  "status": "queued",
  "message": "Library scan queued"
}
```

### Enqueue a rescan

```http
POST /api/v1/libraries/{id}/rescan
```

Queues a **full rescan** (purge + rescan). Identical contract to `scan`, with a
`rescan`-typed job and the message `"Library rescan queued"`:

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440100",
  "status": "queued",
  "message": "Library rescan queued"
}
```

::: tip CLI is still synchronous
The `php bin/phlix library:scan {libraryId} [--rescan]` console command is
**unchanged** — it scans synchronously and blocks until done. Only the HTTP
endpoints became asynchronous.
:::

### Scan status {#scan-status}

```http
GET /api/v1/libraries/{id}/scan-status
```

Returns the **latest** scan job for the library, or `null` when the library has
never been scanned (still a valid `200`, not a `404`):

```json
{
  "scan_status": {
    "id": "550e8400-e29b-41d4-a716-446655440099",
    "library_id": "550e8400-e29b-41d4-a716-446655440001",
    "type": "scan",
    "status": "running",
    "items_found": 1280,
    "items_added": 0,
    "items_updated": 432,
    "items_removed": 0,
    "current_path": "/media/movies/Action/Heat (1995)/Heat.mkv",
    "error": null,
    "queued_at": "2026-05-27 12:00:00",
    "started_at": "2026-05-27 12:00:05",
    "completed_at": null
  }
}
```

A UI polls this endpoint after enqueueing to follow the job through its
lifecycle: `queued → running → completed` (or `failed`, where `error` carries the
exception message). `scan`, `rescan`, and `metadata` jobs all report onto the same
row, so the endpoint is type-agnostic — it returns whichever is the latest job.

::: tip Progress is per-file for scan / rescan / match
For `movie` / `series` / `video` libraries, `items_found` is the **total** media-file
count (the denominator) and `items_updated` is the **processed** count, so a live
percentage is `items_updated / items_found`; `current_path` is the file currently being
processed. (`items_added` / `items_removed` are not part of the streamed progress and
stay `0`.) The worker pre-counts the files and ticks once per file, coalescing writes to
at most one every 25 files (plus the final). `metadata` (match-metadata) jobs report the
same way. The specialised **music / photo / book / audiobook** scanners do **not** emit
per-file counts, so for those types the counters stay coarse and the lifecycle badge is
the live signal. See the
[Library Scan Worker](../dev/library-scan-worker#real-per-file-progress) developer page.
:::

### Scan history

```http
GET /api/v1/libraries/{id}/scan-history?limit=N
```

Returns recent scan jobs for the library, **newest first**. `limit` defaults to
`20` and is clamped to `[1, 100]`:

```json
{
  "history": [
    { "id": "…", "type": "scan", "status": "completed", "queued_at": "…", "completed_at": "…" }
  ]
}
```

Each entry has the same shape as the `scan_status` job row above.

## Allowed Roots

Directory listing is jailed to the roots declared in `config/filesystem.php`:

```php
return [
    'browse_roots' => ['/home', '/mnt', '/media', '/data'],
];
```

| Root | Purpose |
|------|---------|
| `/home` | User home directories. |
| `/mnt` | Mounted volumes. |
| `/media` | Removable / external media mounts. |
| `/data` | Application / library data volume. |

This list is the **security boundary** for the endpoint — keep it conservative.
There is intentionally **no environment-variable override**, so the boundary
stays explicit and auditable in code. Each root is canonicalised with
`realpath()` at startup; a configured root that does not resolve on the host is
silently dropped (it can never be browsed).

### The Traversal Jail

Every candidate `path` is canonicalised with `realpath()` before any check.
Because `realpath()` collapses `..` segments **and** resolves symlinks to their
real targets, a single prefix test against each root is enough to keep the
listing inside the jail:

```
$real === $root  ||  str_starts_with($real . '/', $root . '/')
```

The trailing-slash form is deliberate (a plain prefix check, **never**
`str_contains`): it ensures a sibling such as `/home-backup` cannot match the
`/home` root, while `/home/alice` does. The consequences:

- A `../` path escaping a root canonicalises to its real location and fails the
  prefix test → `403`.
- A symlink pointing outside the jail resolves to its real target via
  `realpath()` and fails the prefix test → `403`.
- A path under no configured root → `403`.

This mirrors the canonical path-jail pattern used elsewhere in the server (e.g.
`AudiobookController::validateMediaPath()`), so the browse endpoint cannot be
used to read directory structure outside the allowed roots.

## Fixing a single item's match

When a single movie, series, season, or episode is matched to the wrong metadata —
or never matched at all — an admin can correct it without re-scanning the whole
library. A **Match metadata** action appears (for admins only) on media cards across
Browse and library pages, and on the detail/series page hero.

Clicking it opens a modal that:

- **Auto-searches** TMDB on open using the item's current title and year (TV vs movie
  is derived from the item type — series/season/episode search TV, everything else
  searches movies).
- Lets you **refine the query** with a manual title and optional year and re-search.
- Shows the candidate results (poster, title, year, type badge, overview) with a
  **Use this** button per result.

Picking a result resolves and persists the chosen metadata for that item (and, for a
**series**, walks its seasons and episodes to enrich the whole subtree), then refreshes
the card/page in place with the new poster and details.

If TMDB has no API key configured, the modal shows a clear "configure a TMDB API key"
message instead of empty results.

This is backed by two admin-gated endpoints:

```http
GET  /api/v1/media/{id}/match/search?query=&year=&type=
POST /api/v1/media/{id}/match/apply
```

- `GET .../match/search` returns up to 20 candidates as
  `{ results: [ { tmdb_id, type, title, year, overview, poster_url, backdrop_url, vote_average } ], query, type, context }`.
  All query params are optional — the server derives `query`/`year`/`type` from the
  item when omitted.
  The `context` block provides source-file context for the current item:
  `{ original_filename?, path?, parsed_title?, year?, tags? }` — only non-null/non-empty
  keys are included. `original_filename` is the original raw filename or `basename(path)`;
  `path` is the file path (max 500 chars); `parsed_title` is the cleaned query string;
  `year` is the item's release year; `tags` is a normalized map of media-type-specific
  metadata (series/episode: show, season, episode, episode_title; audio: artist, album,
  genre, track, date, id3/Vorbis tags).
- `POST .../match/apply` with `{ tmdb_id, type? }` resolves and persists the match and
  returns the re-shaped item plus an `applied` summary
  (`{ item_id, mode, tmdb_id, matched, children_enriched }`).

::: tip Apply to the parent series for a full subtree
Applying a match to the parent **series** item reliably enriches the entire
season/episode subtree. A season- or episode-level apply only enriches that node and
depends on the item already knowing its season/episode number.
:::

## Merging duplicate series & movies

A series container is found-or-created by a synthetic path, and there is **no DB
UNIQUE constraint** on the items table, so any title-slug variance (separators, year
bleed, a parse failure, a flat→per-directory re-scan, or a concurrent-scan race) can
silently create a **second top-level row** for the same show or film — the classic
"100 episodes in one series + 1 stray episode in a near-duplicate" symptom.

### Prevention (automatic, at scan time)

The scanner resolves a container by a **canonical key** (a normalized form that
collapses separator/article/case variance and prefers a matched external id) in
addition to the exact path: `containerCache → exact path → canonical key`. On a
canonical hit with a different path, the existing container is reused instead of
creating a sibling. So new scans no longer manufacture duplicates from title-slug
drift — the merge tooling below is for **historical** duplicates created before this
landed.

### The admin Duplicates page

The admin console exposes a **Duplicates** page (near **Libraries** in the sidebar)
for cleaning up existing duplicates:

- Pick a **library** from the picker. The page calls
  `GET /api/v1/admin/libraries/{id}/duplicates` and lists each duplicate group.
- For every group the **primary** (the member with the most descendants) is shown
  **"Keep"-locked**, and the duplicates are pre-checked. Each row shows its
  **descendant count** (seasons/episodes for a series, none for a movie) so you can
  confirm the right primary.
- Clicking **Merge** calls `POST /api/v1/admin/media/merge` with
  `{ primary_id, duplicate_ids }`, then refreshes the list. For a series the
  episodes are re-parented onto the primary's matching season and the empty
  duplicate shells are deleted; for a movie, missing metadata is gap-filled onto the
  primary and the duplicate row is removed.

::: tip Re-parenting preserves watch progress
Merging re-parents episodes (keeping their ids), so continue-watching positions on
those episodes survive. Only empty shells and the duplicate movie row are deleted.
:::

The same logic is available offline as the
[`scripts/dedup-series.php`](../reference/cli#php-scripts-dedup-series-php-library-id-dry-run-apply)
CLI (`--dry-run` by default, `--apply` to merge). The API contract is documented at
[`POST /api/v1/admin/media/merge`](../reference/api#post-api-v1-admin-media-merge).

## See Also

- [Library Scan Worker](../dev/library-scan-worker) — how the async scan queue and worker work
- [TV Shows](../libraries/tv-shows) — series, seasons, and episodes
- [Server Settings](./server-settings) — server-wide settings store and admin API
- [Dashboard](./dashboard) — visual admin dashboard overview
- [Stats](./stats) — usage and activity statistics
