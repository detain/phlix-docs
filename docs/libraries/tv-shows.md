# TV Shows Library Setup

**Step:** N.8
**Since:** 0.14.0

## TL;DR

A TV library organizes your episodic content by show, season, and episode — with chapter markers, resume positions, and episode artwork all tracked per-user. Drop episodes into a `Season 01/` folder structure, add the folder to Phlix, and Phlix matches episode info from TVDB, Fanart.tv, and TMDB.

```bash
# Structure: /TV/Show Name/Season 01/Show Name S01E01.ext
# Add to Phlix: Libraries → Add Library → Type: TV Shows → point to /path/to/TV → Scan
```

Supported formats: `.mkv`, `.mp4`, `.ts`, and most common video containers.

## 1. Folder and File Naming Conventions

### 1a. Standard Season/Episode Format (Recommended)

```
/TV/Show Name/Season 01/Show Name S01E01.episode-title.ext
/TV/Show Name/Season 02/Show Name S02E03.ext
```

- `Season 01/` — **zero-padded two-digit** season number is required (not `Season 1/`)
- Filename includes `S01E01` — zero-padded season and episode numbers
- `.` or `-` separator between show name and episode code is accepted
- Episode title after the code is parsed and displayed in the UI

### 1b. Compact Flat-File Format

```
/TV/Show Name/S01E01.ext
/TV/Show Name/S01E02.ext
```

- No season folder; all episodes of a show in the same directory
- Scanner detects show boundaries by shared show name prefix

### 1c. Absolute Episode Numbering

```
/TV/Show Name/1x01.ext
/TV/Show Name/1x02.ext
```

- Used by some anime and older series that use consecutive numbering instead of season/episode
- `1x01` means episode 1 of season 1
- Also supported: `Episode 001.ext`

### 1d. Air-Date Naming

```
/TV/Show Name/Show Name - 2012-03-02.ext
/TV/Show Name/Show Name - 2012-03-09.ext
```

- Episode identified by original broadcast date — `YYYY-MM-DD` suffix
- Scanner matches the air date against TVDB records to pull episode title and description

### 1e. Multi-Version Episodes

```
/TV/Show Name (2020)/S01E01 - directors-cut.ext
/TV/Show Name (2020)/S01E01 - unrated.ext
/TV/Show Name (2020)/S01E01 - 4k-restored.ext
```

- Parentheses disambiguate shows with the same name from different production years
- Version tag after the episode code creates a separate library entry per version
- Each version maintains its own playback state and resume position

## 2. Specials and Bonus Episodes

### Season 00

```
/TV/Show Name/Season 00/Show Name S00E01.pilot.ext
/TV/Show Name/Season 00/Show Name S00E02.behind-the-scenes.ext
```

- Special episodes belong in `Season 00/` (preferred) or `Specials/`
- Listed in the Specials season in the UI

### Specials Folder Alias

```
/TV/Show Name/Specials/S00E01.ext
```

- `Specials/` is accepted as an alias for `Season 00/` — both are merged into the same specials grouping in the UI

## 3. Episode Title Parsing from Filename

| Filename | Extracted Title |
|----------|-----------------|
| `Show Name S01E01.ext` | (none — uses metadata) |
| `Show Name S01E01.Pilot.ext` | "Pilot" |
| `Show Name S01E01 - The Pilot.ext` | "The Pilot" |
| `Show Name - 2012-03-02.ext` | (none — uses air-date metadata) |

- Separator between episode code and title: `.`, `-`, or space
- Title is shown in the episode list in the UI

## 4. Metadata Sources and Priority

| Priority | Source | Notes |
|----------|--------|-------|
| 1 (highest) | Local NFO | `show.nfo` at show root, `episode.nfo` alongside video |
| 2 | TVDB | Primary TV metadata; strong episode-level data |
| 3 | Fanart.tv | Show logos, clearart, background images (UI chrome) |
| 4 | TMDB | Fallback; limited episode data but strong show-level |
| 5 (lowest) | Filename parsing | Season/episode numbers and title as last resort |

All remote metadata is cached for 24 hours. Click **Refresh Metadata** on any item to force an immediate re-fetch.

### NFO File Formats

Show-level (`show.nfo` at show root):

```xml
<tvshow>
  <title>Show Name</title>
  <year>2020</year>
  <tvdbid>81249</tvdbid>
  <tmdbid>123456</tmdbid>
</tvshow>
```

Episode-level (`episode.nfo` alongside the video file):

```xml
<episodedetails>
  <title>Episode Title</title>
  <season>1</season>
  <episode>1</episode>
  <aired>2020-01-15</aired>
  <plot>Episode plot text.</plot>
</episodedetails>
```

- `tvdbid` is the primary remote lookup key
- `tmdbid` is used as fallback when TVDB ID is not available

## 5. Scanner Behavior

### Show vs. Movie Detection

| Pattern in Filename | Classification | Example |
|--------------------|----------------|---------|
| `S01E01`, `1x01` in filename | TV episode | `Show Name S01E01.mkv` |
| `(Year)` only, no episode code | Movie | `Avatar (2009).mkv` |
| `Season 00/` or `Specials/` folder | TV (specials) | `Season 00/` |
| `/TV/Show Name/` flat directory | TV show | All files in show folder |
| Both episode code AND year | TV (episode number wins) | `Show (2020) S01E01.mkv` |

Files matching the wrong library type are logged and skipped with a warning in the scan log.

### Scan Triggering

- **Manual**: Click **Scan Library** in the library's UI settings
- **Automatic**: Folder watcher detects `mtime` changes and queues an incremental rescan
- **First add**: Full recursive scan of the library root

### Incremental Rescans

mtime-based checksum — only files whose modification time changed since the last scan are reprocessed. Show-level metadata (poster, fanart) is re-fetched only when `metadata_refreshed_at` is older than 24 hours.

## 6. Content Rating and Parental Controls

Each user profile has a rating filter set in **Settings → Profiles**: G / PG / PG-13 / R / NC-17 / X / UNRATED. TV shows rated above the profile's filter are hidden from that profile's library view. TV ratings from TVDB are mapped to the MPAA equivalent scale.

## What Can Go Wrong

### Incorrect Season Folder Naming

**Symptom:** Episodes show under a separate show entry, or are not grouped at all.

**Cause:** Using `Season 1/` instead of `Season 01/` — the scanner requires zero-padded two-digit season numbers.

**Fix:** Rename all season folders to `Season 01`, `Season 02`, etc. (zero-padded two digits). Note: `Season 00` is correct for specials — not `Season 0` or `Specials/Season 00/`.

---

### Episode Number Conflicts

**Symptom:** Clicking one episode plays a different episode; the episode list shows wrong titles or duplicates.

**Cause:** Two episodes with the same `S01E01` code in the same show directory from a multi-version setup where version tags are missing.

**Fix:** Add a version tag to distinguish files: `Show Name S01E01 - directors-cut.mkv` vs. `Show Name S01E01.mkv`. Verify each `SxxExx` code is unique per show.

---

### Metadata Not Matching (TVDB vs. TMDB ID Mismatch)

**Symptom:** Wrong show information appears, or no metadata is found despite correct episode numbers.

**Cause:** TVDB and TMDB use different IDs for some shows; country-specific variants (e.g., "The Office" UK vs. US) can cross-match incorrectly.

**Fix:** Create a `show.nfo` in the show root with the correct `tvdbid` (or `tmdbid` as fallback) to lock metadata to the correct provider record. Re-scan to apply.

---

### Duplicate Shows from Different Paths

**Symptom:** The same show appears twice (or more) in the library, each with a partial episode list.

**Cause:** The same show root folder was added via two different library paths (e.g., symlinks or copies).

**Fix:** Use a single library path per show. Run **Empty Library** then re-scan with a single path per show.

## Next Steps

- [Movies library setup](movies.md) — film organization, NFO metadata, extras handling
- [Music library setup](music.md) — album art, FLAC/MP3 tagging, compiled albums
- [DLNA / Play To](../users/dlna.md) — stream TV episodes to DLNA-compatible TVs and speakers
