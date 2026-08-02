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
| **Automatically generate collections from TMDB box sets** | (movie libraries only) Toggle whether the scanner auto-creates collections from TMDB box sets — see [Auto-generated collections](#auto-generated-collections-movie-libraries) below. Default **on**. |

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
folder-derived title/year onto existing series rows, so re-scanning is enough —
nothing has to be deleted first.
:::

::: warning `book` is deliberately not offered
The `libraries.type` ENUM in migration `001_initial_schema.sql` is exactly
`movie|series|music|photo|video`. The PHP controller `LibraryController::create()`
*also lists* `book` in its `$validTypes`, but a `book` insert would `500` at the DB
ENUM — so the UI excludes it. The controller/DB mismatch is a known pre-existing
backend bug tracked as a carry-over for a later step.
:::

### Auto-generated collections (movie libraries)

A **movie** library can toggle whether the scanner **automatically generates
collections from TMDB box sets**. When enabled (the default), each scanned film
that TMDB places in a box set — e.g. *The Lord of the Rings Collection* — is
grouped into the matching collection during the scan. Turning it off stops that
generation from the **next scan onward** (existing collections are left as-is).

The switch appears in the add/edit form **only for movie libraries** — TMDB box
sets are a movie concept, and the scanner only syncs collections for movie items.

::: tip Setting the option
The flag can be sent at the top level of the create/update body — as a bare boolean
(`autoCollections: true`) or a map (`autoCollections: { "enabled": false }`) — or
nested inside `options`; either way it is normalised to the canonical
`{ "enabled": bool }` shape and merged into the library's `options` blob (so it
coexists with `series_per_directory`, `metadata_priority`, and `image_types`). It
**defaults to enabled when absent**, so libraries created before this option existed
keep generating collections until you explicitly turn it off — only an explicit
stored `false` disables generation. The library payload surfaces the effective value
under a top-level `auto_collections: { "enabled": bool }` block.
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
| **Scan** | Adds new files and updates changed ones, **keeping** existing items. On a music library it will usually **skip** any file whose `(mtime, size)` is unchanged since the last scan, without opening it — but see [when the skip does not fire](#when-a-plain-music-scan-still-opens-every-file). | The routine, everyday update after dropping in new media. |
| **Rescan** | Re-walks the tree, indexes files at paths that are not yet in the catalogue, backfills missing source metadata on the `video` / `movie` / `episode` / `audio` / `audiobook` rows that already exist, then prunes the items whose source file has disappeared. Non-destructive **except** where a file was moved — see [Moving a file](#moving-a-file). On a **music** library it *additionally* re-reads every file's tags — on every other library type it does not. | To drop items whose files are gone, and — on a **music** library — after **retagging**. ⚠ **Not** the tool to reach for after moving files around; see [Moving a file](#moving-a-file). |
| **Match metadata** | Re-fetches posters / details for items **already** in the library (no filesystem changes). Visits **only** `movie`, `video` and `series` rows — see [what it skips](#what-match-metadata-skips). | When a **movie or series** is unmatched, or its art/details are missing or stale. On its own it does **not** repair a match that resolved to the *wrong* title — see [Fixing a wrong match](#fixing-a-wrong-match). |

::: tip Rescan is NOT destructive
A rescan does **not** delete the library's items first. It has been
non-destructive since the DELETE-then-rescan data-loss fix: a file that still
exists updates its **existing** row in place — same UUID, so every watch-history
and `user_item_data` row that references it survives — and the pass that follows
removes **only** items whose source file is gone (plus any series/season container
left empty by that removal). Watch history, continue-watching positions,
favourites and fetched metadata are all preserved.

The prune is guarded: if the library's configured roots are not present on disk
(an unmounted vault, a permissions fault), pruning is **skipped entirely** rather
than treating the whole library as deleted.

If you really do want every item removed, that is a separate, explicitly-confirmed
action — `POST /api/v1/libraries/{id}/delete-all` with `confirm=true`, which
returns `400` without the flag.

⚠ There is **one exception**, and it is a real data-loss path: an item whose file
was **moved without being renamed** is deleted by that prune, because the scanner
never learns the new path. Read [Moving a file](#moving-a-file) before you
reorganise storage.
:::

#### Moving a file {#moving-a-file}

::: danger A move without a rename loses a top-level item for one rescan
This is a scanner defect, tracked as **S158** — not a behaviour to work around.
It affects **parent-less (top-level) rows only**: `movie`, `video`, `photo`,
`book` and `audiobook`. **Episodes are unaffected** — they hang off a season
parent and never take the branch below, so a moved episode is simply indexed at
its new path. **Music libraries are also outside this** — they are walked by a
different scanner (`MusicLibraryScanner`), which has no canonical-key reuse branch
at all.

**What happens.** When the scanner meets a file whose path is not in the
catalogue, it looks the file up by path (a miss, since the path changed) and
then, for a parent-less row, by a **canonical key** derived from the title and
year alone. That key is path-independent, so a file that moved but kept its name
still matches its existing row. The scanner treats that as "this item already
exists" and returns without writing — it **never updates the row's `path`
column**, and nothing is indexed at the new location.

What you observe then depends on which action you ran:

| Action | Result for the moved item |
|---|---|
| **Scan** (`scan` job) | No prune runs. The row survives, still pointing at the path the file no longer occupies — the item is listed but will not play. |
| **Rescan** (`rescan` job), or the standalone `prune` job | The prune runs in the same job. The old path is gone from disk and its root still holds present items, so the guard does not fire and the row is `DELETE`d — taking its `user_item_data` (watch history, resume position, favourite) with it via `ON DELETE CASCADE`. |

So a moved-but-not-renamed movie, photo, book or audiobook **disappears from the
library for one rescan**. Once the prune has removed the row, the *next* scan or
rescan finds the file at its new path with no row left to reuse and inserts it — as
a **new item with a new UUID**, no watch state and no resume position. (The
cascade is a real foreign key: `user_item_data.item_id REFERENCES media_items(id)
ON DELETE CASCADE`.)

Note the asymmetry: a plain **Scan** never recovers on its own, because it never
prunes — the stale row survives every scan and keeps shadowing the file at its new
path. Only a rescan clears it, and clearing it is the data loss.

**There is no safe alternative today.** Renaming as part of the move does not
avoid the loss: a different name is a different canonical key, so the file is
inserted as a new row and the old row is pruned — a new UUID and lost watch state
again, just without the one-rescan disappearance. Both `Scan` and `Rescan` (and
`bin/phlix library:scan --rescan`) go through the same scanner, so neither
behaves differently. If you must reorganise storage, expect to lose the watch
state of every top-level item you move, and take a database backup first — see
[Backup and restore](/advanced/backup-restore).
:::

::: danger "A rescan re-reads every file" applies to MUSIC libraries only
`rescanLibrary()` is an ordinary scan carrying a `readEveryFile: true` flag, plus
the prune pass — and **only the music scanner consumes that flag**. The comment
sits at the exact point `LibraryManager::scanLibrary()` branches away from the
music path:

> `$readEveryFile` is deliberately unused from here down: every other scanner has
> no skip index, so there is nothing for the flag to switch off. It is consumed by
> the music path above and by nothing else.

So on a **movie, TV, photo, book or audiobook** library a rescan does **not**
re-derive a row that is already indexed. A path already in the catalogue takes the
existing-item branch, which performs a *missing*-source-metadata backfill and
nothing else — no filename re-parse, no title/year re-derivation, no metadata
re-fetch, no re-match. Even that backfill is type-gated: it runs only for `video`,
`movie`, `episode`, `audio` and `audiobook` rows, so on a **photo** or **book**
library the existing-item branch does nothing at all.

**A rescan will therefore not repair a wrong or duplicated match on those types.**
What to reach for instead depends on the type, and the metadata jobs are **not** a
universal answer:

- **Movie / TV** — [Match metadata](#enqueue-a-metadata-match) when the item was
  never matched; the [single-item match](#fixing-a-single-items-match) or the
  [clear-then-match sequence](#fixing-a-wrong-match) when it matched the *wrong*
  title.
- **Photo / book / audiobook** — there is no re-match operation for these types at
  all, and queueing one is a silent no-op. See
  [what Match metadata skips](#what-match-metadata-skips).
:::

::: warning A rescan is what fixes a mis-filed music track
If a track's `ARTIST` or `ALBUM` tag was edited after it was indexed, a **rescan**
is what moves it to the right album/artist. A plain **Scan** normally cannot,
because the incremental skip fires *before* the file is ever opened, so the
corrected tags are never read and the row is never re-parented. (A Scan *will*
open the file when the skip index is not in play — see
[below](#when-a-plain-music-scan-still-opens-every-file) — but that depends on
unrelated database state, so it is not something to rely on.) This is the single
most common reason to reach for Rescan on a music library.
:::

::: warning Rescan of a music library takes far longer than a scan
Every file is opened and tag-read, so the cost scales with the whole library, not
with what changed.

**Measured example — the production music library, 61,135 tracks, one box:**

| when | job | wall clock |
|---|---|---|
| before the scan-lookup fix (2026-07-25) | `d8e21a1b` | **9 h 55 m** |
| after it (2026-07-27) | `238ba78d` | **28 m 41 s** (`items_failed: 0`) |

⚠ **Treat 28 m 41 s as one measurement, not a guarantee, and do not divide it by
the track count to get a rate.** Throughput within that same run fell from roughly
90 files/sec at the start to roughly 1.3 files/sec in the tail, so a per-track
figure derived from the average describes no part of the run. Your own library,
storage and box will differ.

An interrupted rescan loses no committed work — the scanner writes each album out
as it goes, and re-running is idempotent. But it does **not** resume: a re-run
starts again from the first file and pays the whole wall clock again, because
full-read mode refuses every skip for the whole scan. The identity stamps the
interrupted run left behind spare the re-run those rows' `UPDATE`s, but not their
reads — every file is opened and tag-read again.
:::

**Match metadata** is the per-library counterpart of the single-item
[Match metadata action](#fixing-a-single-items-match) described below; it is a third
job type (`metadata`) alongside `scan` and `rescan`, enqueued via
[`POST /api/v1/libraries/{id}/match-metadata`](#enqueue-a-metadata-match). It skips
items that already have metadata; a fourth job type, `metadata_refresh`
([`POST .../refresh-metadata`](#force-a-metadata-re-match)), forces those to be
re-matched too. Both job types visit **only** `movie`, `video` and `series` rows —
read [what Match metadata skips](#what-match-metadata-skips) before you reach for
either on any other kind of library.

#### When a plain music Scan still opens every file

The unchanged-file skip is not unconditional, and two separate things have to line
up for it to fire: the skip index has to be **loaded**, and `canSkip()` —
`!$mayAdopt && !$readEveryFile` — has to allow a skip.

`MusicLibraryScanner::scanDirectory()` loads the index when `$readEveryFile` is set,
**or** when neither `$mayAdopt` nor `$needsHealing` holds. So on a plain Scan
(`$readEveryFile` false) either of the two database-state flags below leaves the
index unloaded, an unloaded index reports every file as changed, and the Scan then
costs the same as a rescan:

- **`$mayAdopt`** — the library owns at least one orphaned `artist`/`album`
  `media_items` row that no `music_artists`/`music_albums` row references yet, so
  the scan must flush albums in order to adopt it. This flag is also re-read *per
  file*, so an orphan created by a caught write failure mid-walk switches the fast
  path off for the remainder of that scan.
- **`$needsHealing`** — some `music_artists` or `music_albums` row still has
  `media_item_id IS NULL` and is waiting on the S96(e) backfill. This query is
  **not scoped to one library** (neither table has a `library_id` column), so one
  unhealed row anywhere on the box disables the fast path for every music library
  on it.

Both gates **fail open**: if either query throws, the scanner logs a warning and
assumes the worst ("do not skip"). A skip that cannot be justified would silently
miss a change; a probe that was not needed is only slow.

The practical consequence: a plain Scan on a music library can occasionally cost
hours rather than minutes, and the states that cause it are not self-clearing on
their own schedule. The operational advice is unchanged — reach for **Rescan**
when you need a guaranteed full re-read.

### Triggering a scan or rescan

Each row has **Scan** and **Rescan** buttons. Both call the [async scan
endpoints](#scanning-a-library) and return immediately with a `202` + a `job_id`. The
page shows a "queued" toast with the returned message and starts polling status for that
library.

- **Scan** runs an **incremental** scan (new + changed files).
- **Rescan** re-walks the tree and then prunes items whose file is gone. It does not
  delete anything else — with the one exception of an item whose file was **moved**
  ([Moving a file](#moving-a-file)). On a **music** library it also re-reads every
  file's tags; on every other library type it leaves already-indexed rows alone (see
  [above](#scan-vs-rescan-vs-match-metadata)).

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

The [admin UI](#triggering-a-scan-or-rescan) wraps the enqueue and status
endpoints below: per-row **Scan** / **Rescan** buttons hit the enqueue endpoints,
the page polls `scan-status` every 2 seconds (stopping on terminal status), and a
**History** modal shows the most recent jobs from `scan-history`.
`refresh-metadata` currently has no button — call it directly.

Every endpoint below is **admin-gated** (the `scan-status` job row exposes a
server filesystem path in `current_path`), requires a valid admin Bearer token
(`401` unauthenticated, `403` non-admin), and returns `404` when the library does
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

Queues a full re-walk followed by the prune pass, as a `rescan`-typed job —
identical contract to `scan`. On a **music** library this re-reads every file's
tags; on every other library type the `readEveryFile` flag is ignored and
already-indexed rows are not re-derived (see
[the scoping note above](#scan-vs-rescan-vs-match-metadata)).

⚠ Do not queue this after relocating media: a top-level item whose file was moved
without being renamed is pruned rather than re-indexed. See
[Moving a file](#moving-a-file).

The `message` is operator-facing help text that the admin console renders
verbatim, so it spells out the cost. Note that it describes the music case, which
is the expensive one:

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440100",
  "status": "queued",
  "message": "Library rescan queued: every file will be re-read. This repairs tracks filed under the wrong album or artist and can take hours on a large music library. Use Scan for an incremental refresh."
}
```

::: tip The CLI is synchronous, but no longer invisible
`php bin/phlix library:scan {libraryId} [--rescan]` still scans **synchronously**
and blocks until done — it does not enqueue. What changed is that the command now
creates and maintains its own `library_scan_jobs` row, so a CLI scan shows up on
this page with a live *running* badge and advancing progress exactly like a
web-triggered one, and lands `completed` / `failed` when it exits.

It also **refuses to start** when the library already has a `queued` or `running`
job, exiting non-zero with an explanatory message; `--force` overrides that. See
the [CLI reference](../reference/cli#library-scan).
:::

### Enqueue a metadata match {#enqueue-a-metadata-match}

```http
POST /api/v1/libraries/{id}/match-metadata
```

Queues a `metadata`-typed job. The background worker runs
`LibraryMetadataMatcher::matchLibrary()`, which resolves details from each item's
stored name/year/external ids and, on a hit, merges the result into
`metadata_json` and stamps `metadata_refreshed_at`. It **skips items that already
carry a `metadata_refreshed_at` stamp**, so this is the operation to reach for when
an item is *unmatched* — including on movie and TV libraries, where a rescan will
not touch an already-indexed row at all.

Because it skips stamped items, it is **not** the way to correct an item that was
matched to the wrong title: that item already carries a stamp, so a `metadata` job
steps straight over it. See [Fixing a wrong match](#fixing-a-wrong-match).

Same contract as `scan`: `202` with `{ job_id, status: "queued", message }`,
`404` for a missing library, admin-gated. The message is the literal
`"Metadata match queued"`. Progress streams onto the same job row and the same
[`scan-status`](#scan-status) endpoint as a scan.

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440101",
  "status": "queued",
  "message": "Metadata match queued"
}
```

### Force a metadata re-match {#force-a-metadata-re-match}

```http
POST /api/v1/libraries/{id}/refresh-metadata
```

Queues a `metadata_refresh`-typed job: the same matcher run with force-refresh
enabled, so it re-processes items that were **already** matched
(`metadata_refreshed_at IS NOT NULL`) instead of skipping them. It is an addition to
[match-metadata](#enqueue-a-metadata-match), not a replacement for it.

Use it to:

- **backfill fields added by a newer release** (per-episode stills, for instance),
  which a plain `metadata` job would skip over on already-matched items; and
- **pick up a changed metadata provider priority** — the effective per-library
  `PriorityConfig` is passed into every resolve call, so a re-run reflects it.

Do **not** use it on its own to correct an item that matched the *wrong* title —
it will re-fetch the same wrong title. See [Fixing a wrong match](#fixing-a-wrong-match).

The response is the same `202` shape with the literal message
`"Metadata refresh queued"`.

::: warning `metadata.overwrite_existing` gates the force path
If the `metadata.overwrite_existing` setting is turned **off**, any item that
already carries a `metadata_refreshed_at` stamp is skipped wholesale — there is no
per-field provenance in the pipeline, so "do not overwrite" can only mean a
whole-item skip. At the shipped default (overwrite on) nothing is skipped. An item
that was never resolved is enriched either way.
:::

### Clear a library's metadata {#clear-a-librarys-metadata}

```http
POST /api/v1/libraries/{id}/clear-metadata
```

Queues a `clear_metadata`-typed job. For **every** item in the library it strips the
provider-fetched keys out of `metadata_json` — poster/backdrop/logo/still URLs,
trailers, overview and tagline, cast/crew, genres and tags, ratings and votes,
provider dates and alternate titles, and the **external identifiers**
(`tmdb_id`, `imdb_id`, `tvdb_id`, `external_ids`) — and NULLs `metadata_refreshed_at`
so the item counts as un-matched again.

It **does not delete rows**. Paths, filename-derived titles, types, the
series/season parent hierarchy, `user_item_data` and watch history are all
preserved, as are the filesystem/probe-derived keys (name, year, season, episode,
`canonical_key`, `source`, duration, streams).

Same `202` contract as `scan`, admin-gated, `404` for a missing library. The message
is the literal `"Metadata clear queued"`.

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440103",
  "status": "queued",
  "message": "Metadata clear queued"
}
```

::: warning It is library-wide and it discards good matches too
There is no per-item variant of this endpoint and no dry run. Every item in the
library loses its provider metadata, including the ones that were matched
correctly. If only a handful of titles are wrong, use the
[single-item match](#fixing-a-single-items-match) instead.
:::

### Fixing a wrong match {#fixing-a-wrong-match}

A **missing** match and a **wrong** match are different problems with different
remedies. Reaching for the wrong one produces a job that completes successfully and
changes nothing.

| Symptom | Remedy |
|---|---|
| Item has **no** metadata at all (never matched) | [`match-metadata`](#enqueue-a-metadata-match) |
| Item is matched, but fields are stale or a new release added fields | [`refresh-metadata`](#force-a-metadata-re-match) |
| An item matched the **wrong** title | [Single-item match](#fixing-a-single-items-match) — `GET /api/v1/media/{id}/match/search`, then `POST /api/v1/media/{id}/match/apply` |
| A **movie** library was matched off a bad external id (e.g. a wrong `tmdbid`/`imdbid` in an NFO) | [`clear-metadata`](#clear-a-librarys-metadata) **then** [`match-metadata`](#enqueue-a-metadata-match) |

::: danger Neither library-wide job undoes a wrong match by itself
- [`match-metadata`](#enqueue-a-metadata-match) **skips** the item: a wrongly
  matched item carries a `metadata_refreshed_at` stamp, and the plain `metadata` job
  steps over every stamped item.
- [`refresh-metadata`](#force-a-metadata-re-match) **visits** the item but arrives at
  the same answer. For a **movie** it re-seeds the resolve from the item's own stored
  `external_ids` — the ids the bad match wrote — and the movie resolver performs a
  title search *only* when no IMDb id is present; with one present it resolves the
  TMDB id **by that id** and never searches. For a **series** the resolver takes no
  ids at all and always searches by title, but it searches with the same stored
  title/year as last time, so it lands on the same record.

Both jobs report success either way.
:::

**Which one to reach for.** Prefer the **single-item match** whenever you know which
title is correct. It is the only path that supplies an explicit `tmdb_id` rather than
re-deriving one, so it is the only path that cannot land on the same wrong record
again — and for a series it re-enriches the whole season/episode subtree.

A library-wide job can only produce a *different* answer if one of its **inputs**
changed. That gives exactly three cases where re-running one is worth doing:

1. **A stale external id was the cause.** Only [`clear-metadata`](#clear-a-librarys-metadata)
   removes it — `external_ids`, `tmdb_id`, `imdb_id` and `tvdb_id` are all among the
   keys it strips, and it NULLs the stamp as well, so the following
   [`match-metadata`](#enqueue-a-metadata-match) both visits the item again and
   searches by title again. This is the movie case; a series match never used the id,
   so clearing changes nothing for it.
2. **The filename or folder name was the cause.** The matcher derives its search
   title and year from the item's stored, filesystem-derived name. Rename the file on
   disk and [rescan](#enqueue-a-rescan): the renamed path is indexed as a **new row**
   (and the old one is pruned, taking its watch state with it), which the next
   `match-metadata` then matches from the corrected name.
3. **The provider priority changed.** The effective per-library `PriorityConfig` is
   passed into every resolve, so [`refresh-metadata`](#force-a-metadata-re-match)
   does reflect a changed priority order. Note that this changes *which provider's
   value wins for each field*, not *which record the item resolves to* — it will
   repopulate an item's fields from a different source, but it will not move a movie
   off an id it already carries.

If none of those three apply, no library-wide job will change the result — fix the
item individually.

### What Match metadata skips {#what-match-metadata-skips}

Both `match-metadata` and `refresh-metadata` run the same per-item filter, and it
admits only three `media_items.type` values: `movie`, `video` and `series`. Every
other row — `season`, `episode`, `artist`, `album`, `track`, `photo`, `book`,
`audiobook` — is skipped before any provider is consulted. (Season and episode rows
are still enriched, but as part of their parent `series`, not on their own.)

::: danger On a photo, book or audiobook library these jobs do nothing
The job enqueues, returns `202`, runs, and reaches `completed` having processed
**zero** items. Nothing fails and nothing warns — so a `completed` badge here is not
evidence that anything was re-matched.

The one visible tell is the progress bar. The denominator (`items_found`) is counted
from the library's *top-level* rows without applying the type filter, so it is
non-zero, while the numerator (`items_updated`) only ever counts rows the filter
admitted. A job that sits at `0 / n` for its whole life and then completes has
matched nothing.

There is no other operation that re-derives them either. The server ships **no
metadata-fetching provider for photo, book or audiobook items** — the only resolvers
that call out to a provider are the movie and series resolvers. (There is one
photo-typed provider class, `ExifProvider`, but it makes no external calls at all:
its `search()`, `getDetails()` and `getImages()` all return empty, and it only reads
back EXIF the scanner already stored.)

So those items carry what the scanner wrote when the row was first inserted. A later
scan or rescan takes the existing-item branch, which for `photo` and `book` rows does
nothing at all and for `audiobook` rows only backfills a *missing* duration / stream
summary.

The single-item match is not an answer either: it is a TMDB search, and it maps any
type that is not `series`/`season`/`episode` to a **movie** search — so applying it
to a book would write film metadata onto it.

The only way to re-derive such an item is to make the scanner insert it afresh, and
there are exactly two ways to do that:

- **Rename the file**, then scan. A new name is a new canonical key, so the file is
  inserted as a new row; the old row is removed by the next rescan's prune.
- **`DELETE /api/v1/media/{id}`** (admin), then scan.

Both produce a **new row with a new UUID**, so the watch state and `user_item_data`
attached to the old row go with it.

⚠ **Moving the file is not a third option.** A move that keeps the filename keeps
the canonical key, so the scanner reuses the old row instead of inserting anything —
and a rescan then prunes that row because its recorded path is gone. See
[Moving a file](#moving-a-file).
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

::: warning It is a TMDB search, so it only makes sense for video items
The `tv` mode is chosen for `series` / `season` / `episode`; **every other type falls
through to a movie search**, including `photo`, `book`, `audiobook` and the music
types. Applying it to one of those would write film metadata onto the item. It is not
a remedy for those libraries — see
[what Match metadata skips](#what-match-metadata-skips).
:::

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

### The item ⋯ menu metadata actions

On every media card (Browse, Library, Explore, Recommendations) and on the
detail/series page, the admin **⋯ ("More actions")** menu exposes three
metadata-related actions. All three are **admin-only**:

- **Match metadata** — opens the metadata-match modal described above.
- **Edit metadata** — opens the **same** metadata-match modal. There is no
  separate metadata-editing API surface, so "Edit metadata" and "Match metadata"
  are currently functionally identical: both auto-search TMDB and let you apply a
  match.
- **Explore item data** — opens a **read-only inspector** that shows the item's
  stored data as indented JSON, with a **Copy JSON** button. This is a purely
  **client-side** view of the data already loaded in the browser — it makes **no
  network request** and never changes anything. Use it to see exactly which fields
  (ids, art URLs, tags, provider ids, season/episode structure) the app holds for
  an item when diagnosing a wrong match or missing artwork.

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
