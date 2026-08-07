# Movies Library Setup

**Since:** 0.14.0

## TL;DR

A movies library turns your video collection into a browsable, searchable catalog with posters, synopses, and cast info pulled from online databases. Drop your video files into a folder, add that folder to Phlix as a Movies library, and Phlix handles the rest — matching titles, fetching artwork, and tracking your watch progress across devices.

```bash
# Add your movies folder, scan, and you're ready
# Libraries → Add Library → Type: Movies → point to /path/to/movies → Scan
```

## 1. Supported Formats

| Format | Extension | Playback Notes |
|--------|-----------|----------------|
| Matroska | `.mkv` | Most common; supports many codecs |
| MPEG-4 | `.mp4`, `.m4v` | Wide device compatibility |
| AVI | `.avi` | Legacy format; some files may need transcoding |
| QuickTime | `.mov` | Common for iTunes content |
| Windows Media | `.wmv` | May require transcoding on non-Windows clients |
| MPEG Transport Stream | `.ts` | Used for broadcast recordings |

Container format matters less than the codec inside. Phlix streams directly when your player supports the codec; transcoding falls back automatically when needed.

## 2. Naming Conventions

### 2a. Flat-File Naming (Simplest)

```
Avatar (2009).mkv
The Matrix (1999).mp4
```

- `Movie Name (Year).ext` — Phlix uses the year in parentheses as the primary identifier for metadata matching
- Year range accepted by the scanner: 1900 through 5 years in the future

### 2b. Folder-Based Naming

```
/Movies/
  The Matrix (1999)/
    Matrix, The.mp4
  Avatar (2009)/
    Avatar.mkv
```

- Folder name follows `Movie Name (Year)/` — the article ("The", "A", "An") sorts to the end of the folder name: `The Matrix` becomes `Matrix, The`
- The video file inside can be named anything; the folder name is what matters

### 2c. Multi-Version Movies

```
Avatar (2009) - directors-cut.mkv
Avatar (2009) - extended.mkv
Avatar (2009) - 4k-restored.mkv
```

- A version tag (` - directors-cut`, ` - extended`, ` - 4k-restored`) after the year creates a separate library entry per version
- Each version has its own playback state and resume position

### 2d. Disc Folder Structure

```
Movie Name (2020)/
  movie.mkv
  trailer.mkv
  extras/
    Behind the Scenes.mkv
```

- `movie.mkv` is the main feature; files named `-trailer` or `-sample` are excluded from the main library count but associated with the item
- The `extras/` subfolder is scanned as associated extras; naming inside is free-form

## 3. NFO Sidecar Files

Kodi-style NFO files let you lock metadata to a specific online record or add custom local data.

### Per-Movie NFO

Place `movie.nfo` alongside the video file:

```xml
<movie>
  <title>Avatar</title>
  <year>2009</year>
  <tmdbid>241</tmdbid>
  <plot>Jake Sully lives with the Na'vi on Pandora...</plot>
</movie>
```

- `tmdbid` is the primary lookup key — when present, Phlix fetches metadata directly from TMDB without title/year matching
- Local NFO always takes priority when `metadata_source` is set to `local` in the library configuration
- The filename is **case-sensitive** on Linux: must be exactly `movie.nfo`, not `Movie.nfo` or `MOVIE.NFO`

### What Goes in an NFO

| Field | Description |
|-------|-------------|
| `title` | Movie title |
| `year` | Release year (4 digits) |
| `tmdbid` | TMDB movie ID (e.g., `241` for Avatar) |
| `tvdbid` | TVDB ID (fallback) |
| `plot` | Synopsis text |
| `genre` | Genre tags |
| `director` | Director name |
| `rating` | Content rating (MPAA or custom) |

## 4. Metadata Sources and Priority

| Priority | Source | Notes |
|----------|--------|-------|
| 1 (highest) | Local NFO | `movie.nfo` in the same folder |
| 2 | TMDB | Primary online metadata; free account at themoviedb.org |
| 3 | TVDB | Fallback when TMDB has no match |
| 4 | Filename parsing | Year and title extracted from file/folder name as last resort |

To re-fetch an item's metadata, click **Match metadata** on it in the UI (admins
only) and pick a result — see
[Fixing a single item's match](/admin/library-management#fixing-a-single-items-match).

**Provider responses are cached in memory for one hour.** Every TMDB, TVDB and
Fanart.tv call goes through a shared HTTP client that stores each successful `2xx`
JSON body against the endpoint and its query parameters, with a **1-hour TTL**
(`MetadataHttpClient::CACHE_TTL_MS`) and LRU eviction at 4096 entries. The provider
objects are container singletons, so that cache lives for the life of the worker
process — it spans requests **and** jobs. A re-match issued within the hour can
therefore return byte-identical data without any HTTP request being made; restarting
the server clears it.

There is no *item*-level freshness window on this path: the library match visits
whichever items you ask it to and calls the resolver each time. (The 24-hour rule
that exists elsewhere in the tree, `MetadataManager::hasRecentMetadata()`, is a
per-provider gate on a different refresh path that movie items do not take.)

## 5. Scanner Behavior

### How Phlix Distinguishes Movies from TV Episodes

| Pattern in Filename | Classification | Example |
|--------------------|----------------|---------|
| `(Year)` only, no episode code | Movie | `Avatar (2009).mkv` |
| `S01E01` or `1x01` | TV episode | `Show Name S01E01.mkv` |
| `Season 00/` or `Specials/` folder | TV (specials) | `Season 00/` |
| Both episode code AND year | TV (episode number wins) | `Show (2020) S01E01.mkv` |

### Scan Triggering

- **Manual**: Click **Scan** (or **Rescan**) on the library's row in **Admin → Libraries**, or `POST /api/v1/libraries/{id}/scan`, or `php bin/phlix library:scan {libraryId}`
- **First add**: Creating a library queues a full recursive scan of its roots in the background

There is **no scheduled or filesystem-triggered scan**. Creating a library registers
its roots with `FolderWatcher`, but the method that would actually compare directory
checksums and act on a change — `FolderWatcher::checkForChanges()` — has **no
production caller**, so it never runs. Nothing polls the filesystem, nothing queues a
scan from a change on disk, and the `LibraryUpdated` event that would refresh smart
playlists is never dispatched. New files appear after you scan.

### What a rescan does — and does not — do

The movie scanner has **no per-file skip index and does not look at mtime at all**.
It decides by *path*: a file whose path is already in the catalogue takes the
existing-item branch, which backfills any missing source technical metadata
(duration, the `metadata_json['source']` summary, `media_streams` rows) and then
moves on. A file whose path is new is parsed, probed and inserted. Afterwards the
prune pass removes items whose source file has disappeared.

The `--rescan` / **Rescan** "re-read every file" flag is consumed by the **music**
scanner only; on a movie library it is inert. So a rescan is the right tool after
files are **added or deleted**, and the wrong tool for a **wrong or missing
match** — it will not re-parse the filename or re-fetch metadata for a row that
already exists.

::: tip A rescan handles a MOVED file, but not a RENAMED one (S158)
**Renaming** a movie file inserts a new row (new UUID, no watch state) and the prune
removes the old one — the new name is a different canonical key, so nothing links
the two. **Moving** a movie file without renaming it is safe: the scanner matches it
to the existing row by a canonical key built from title and year alone, and the prune
in the same rescan re-points that row at the new path instead of deleting it, keeping
the UUID, watch history and resume position. Episodes were never affected.

After reorganising storage run a **Rescan**, not a standalone **Prune** — a prune
does not scan and so deletes the rows it cannot match. See
[Moving a file](/admin/library-management#moving-a-file).
:::

For a match problem, which remedy you want depends on which problem it is:

- **Never matched** (no metadata at all) —
  [`match-metadata`](/admin/library-management#enqueue-a-metadata-match), which
  visits exactly the items carrying no `metadata_refreshed_at` stamp.
- **Matched to the wrong film** — the
  [per-item match action](/admin/library-management#fixing-a-single-items-match).
  `refresh-metadata` will **not** correct it: it re-seeds the resolve from the
  item's own stored `external_ids` and the resolver skips its title search whenever
  an IMDb id is present, so the same wrong film comes back. See
  [Fixing a wrong match](/admin/library-management#fixing-a-wrong-match).

## 6. Content Rating and Parental Controls

Each user profile has a rating filter set in **Settings → Profiles**: G / PG / PG-13 / R / NC-17 / X / UNRATED. Movies rated above the profile's filter are hidden from that profile's library view.

- Ratings are pulled from TMDB or TVDB metadata
- Items sourced from NFO without a rating default to UNRATED (visible to all profiles)
- You can manually set a content rating on any item from the item detail page

## What Can Go Wrong

### Duplicate Entries or Split Library

**Symptom:** The same movie appears 2–4 times in the library after a rescan.

**Cause:** Mixing flat-file and folder-based naming for the same movie; inconsistent year in filenames.

**Fix:** Pick one naming style per library. Run **Empty Library** from library settings, then re-scan. For multi-version movies, keep all versions in the same folder with distinct version tags.

---

### Metadata Not Found or Wrong Match

**Symptom:** Movie shows as "Unknown Title" or matches a different film.

**Cause:** Year mismatch between your filename and the TMDB record; special characters or non-English titles break parsing.

**Fix:** Rename the file to `Movie Name (Year).ext` with the exact year from TMDB. Or create a `movie.nfo` with the correct `tmdbid` to bypass title/year matching entirely.

---

### NFO File Ignored

**Symptom:** Custom poster, plot, or genre tags from your NFO are not appearing in Phlix.

**Cause:** NFO filename is not exactly `movie.nfo` (Linux is case-sensitive), or the NFO file contains malformed XML.

**Fix:** Rename to `movie.nfo` with a lowercase `m`. Validate your XML at [xmlvalidation.com](https://www.xmlvalidation.com). Ensure the root element is `<movie>`.

---

### Metadata Fetch Failure or Rate Limit

**Symptom:** Newly scanned movies show "No metadata" despite correct filenames.

**Cause:** TMDB API rate limit exceeded, or the server cannot reach TMDB.

**Fix:** Wait 10 seconds and click **Match metadata** on the item. For large initial scans, add a TMDB API key in library settings. Check server network connectivity to `api.themoviedb.org`.

---

### Parental Control Content Leaking Through

**Symptom:** Restricted content is visible on a child profile.

**Cause:** Profile rating filter set too high; or the media item has UNRATED metadata and is not filtered.

**Fix:** Lower the profile's rating filter in **Settings → Profiles**. From the item's detail page, manually set the content rating if it shows as UNRATED.

## Next Steps

- [TV Shows library setup](tv-shows.md) — organize episodes by season with S01E01 naming
- [Music library setup](music.md) — album art, FLAC/MP3 tagging, compiled albums
- [DLNA / Play To](../clients/dlna.md) — stream movies to DLNA-compatible TVs and speakers
