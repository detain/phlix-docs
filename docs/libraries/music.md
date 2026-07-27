# Music Library Documentation

**Since:** 0.14.0

## Overview

Phlix supports music library browsing with ID3v2/MP4/Vorbis tag harvesting.
Music files are scanned, tagged, and made available via both a REST API and
a web portal interface.

## Supported Audio Formats

| Format | Extension | Tag Format | Notes |
|--------|-----------|------------|-------|
| MPEG-1/2/2.5 Audio Layer III | `.mp3` | ID3v2.3 / ID3v2.4 | Most common lossy format |
| Free Lossless Audio Codec | `.flac` | Vorbis Comment | Lossless, supported |
| MPEG-4 Audio | `.m4a`, `.aac` | MP4 atoms (iTunes-style) | AAC lossy or ALAC lossless |
| Ogg Vorbis | `.ogg`, `.oga` | Vorbis Comment | Open, royalty-free |
| Opus | `.opus` | Vorbis Comment | Interactive web audio |
| Waveform Audio | `.wav` | RIFF fmt chunk | Basic, limited tags |
| Windows Media Audio | `.wma` | ASF | Limited support |

## Tag Field Mapping

The audio scanner harvests the following tag fields:

| Tag Field | ID3v2 Frame | Vorbis Comment | MP4 Atom |
|-----------|-------------|----------------|----------|
| `title` | `TIT2` | `TITLE` | `\xA9nam` |
| `artist` | `TPE1` | `ARTIST` | `\xA9ART` |
| `album` | `TALB` | `ALBUM` | `\xA9alb` |
| `album_artist` | `TPE2` | `ALBUMARTIST` | `\xA9aART` |
| `year` | `TYER` / `TDRC` | `DATE` / `YEAR` | `\xA9day` |
| `genre` | `TCON` | `GENRE` | `\xA9gen` |
| `track_number` | `TRCK` | `TRACKNUMBER` | `\xA9trkn` |
| `disc_number` | `TPOS` | `DISCNUMBER` | `\xA9disk` |
| `composer` | `TCOM` | `COMPOSER` | `\xA9wrt` |
| `comment` | `COMM` | `COMMENT` | `\xA9cmt` |
| `duration_secs` | Calculated | Calculated | Calculated |
| `bitrate` | From frame header | N/A | From stsd atom |
| `sample_rate` | From frame header | N/A | From mp4a atom |
| `channels` | From frame header | N/A | From mp4a atom |

## Naming Conventions

The scanner uses file naming conventions to extract metadata when tags are
missing or incomplete:

### Track Files
- `01 - Track Name.mp3` — Track number and title
- `Track Name.mp3` — Title only
- `Artist - Album - 01 - Track Name.flac` — Full path-based metadata

### Album Organization
```
/music/
└── Artist Name/
    └── Album Name (Year)/
        ├── 01 - Track One.mp3
        ├── 02 - Track Two.mp3
        └── cover.jpg
```

## Scan and Rescan Behavior

### Initial Scan
When a music library is first created or rescanned:

1. **Discovery** — Scanner finds all audio files matching supported extensions
2. **Tag Harvesting** — Each file is parsed for ID3v2/Vorbis/MP4 tags
3. **Upsert** — Items are created or updated in the database
4. **Enrichment event** — a *genuinely new* track publishes a `MediaItemAdded`
   event, which the optional `musicbrainz` plugin subscribes to. It only runs if
   that plugin is installed and enabled, and only for tracks that were just
   inserted.

::: warning A rescan does not re-enrich existing tracks
There is no host-side MusicBrainz or AudioDB provider — `MusicBrainzProvider` /
`AudioDbProvider` were removed, and `MetadataManager` deliberately registers no
providers for the `artist` / `album` / `track` types, so a music metadata refresh
through it is a no-op. The only music-enrichment trigger left is the
`MediaItemAdded` event, and the scanner publishes it **only for a track it just
inserted**. A rescan of a library whose tracks already exist re-reads tags from
the files and re-parents them; it fetches nothing from any provider.
:::

### Scan vs Rescan

The two actions differ in exactly one thing — **which files get opened** — and for
a music library that difference is everything.

| | **Scan** | **Rescan** |
|---|---|---|
| Files opened | Usually only those whose `(mtime, size)` changed since the last scan — but see [when the skip does not fire](#when-a-plain-scan-still-opens-every-file) | **Every** file, always |
| Repairs a track filed under the wrong album/artist after a retag | ❌ Not reliably | ✅ Yes |
| Deletes items | No | No — it prunes **only** items whose source file is gone |
| Cost on a large library | Usually minutes | Hours (see below) |

### Rescan

A rescan re-reads every file from disk, re-derives each track's album and artist
from its tags, and then prunes the items whose source file has disappeared. It is
**non-destructive**: a file that still exists updates its existing row in place
(same UUID, so all referencing user data survives), nothing else is deleted, and
watch history, favourites and fetched metadata are preserved. If the library's
configured roots are not present on disk, the prune is skipped entirely rather
than treating the whole library as removed.

::: warning A rescan is what fixes a mis-filed track
If you edit a file's `ARTIST` or `ALBUM` tag *after* it has been indexed, a plain
**Scan** normally cannot move the track to the right album or artist. The
incremental skip fires before the file is opened — the file's `(mtime, size)` is
checked, the file is skipped, and the corrected tags are never read.

A Scan *will* open the file when the skip index is not in play (see
[below](#when-a-plain-scan-still-opens-every-file)), but that depends on unrelated
database state you have no control over, so it is not something to rely on. A
rescan opens the file unconditionally.
:::

Because every file is opened and tag-read, a rescan costs the whole library rather
than just what changed.

**Measured example — the production music library, 61,135 tracks, one box:**

| when | job | wall clock |
|---|---|---|
| before the scan-lookup fix (2026-07-25) | `d8e21a1b` | **9 h 55 m** |
| after it (2026-07-27) | `238ba78d` | **28 m 41 s**, `items_failed: 0` |

⚠ **That is one measurement of one library on one machine, not a guarantee, and it
should not be turned into a per-track rate.** Throughput inside that same run fell
from roughly 90 files/sec at the start to roughly 1.3 files/sec in the tail, so
dividing the total by the track count describes no part of the run. Your storage,
tag sizes and hardware will give a different number.

An interrupted rescan loses no committed work: the scanner writes each album out
as it goes, so everything indexed before the interruption stays indexed, and
re-running is idempotent (rows are upserted by path).

⚠ **It does not resume, though.** A re-run starts again from the first file and
pays the whole wall clock a second time. Full-read mode is implemented by leaving
the unchanged-file skip index *unloaded*, and an unloaded index reports every file
as changed — so a rescan has nothing to skip, including the files the interrupted
run had already read and stamped. The stamps it left behind only speed up a later
plain **Scan**.

Trigger one from **Admin → Libraries → Rescan**, from
`POST /api/v1/libraries/{id}/rescan`, or from the CLI with
`php bin/phlix library:scan {libraryId} --rescan` (see the
[CLI reference](../reference/cli#library-scan)).

### When a plain Scan still opens every file

The unchanged-file skip is not unconditional. `MusicLibraryScanner::scanDirectory()`
loads the skip index only when **all three** of `!$readEveryFile && !$mayAdopt &&
!$needsHealing` hold, and an unloaded index reports every file as changed:

- **`$readEveryFile`** — the operator asked for a rescan. This is the only one of
  the three you control.
- **`$mayAdopt`** — the library owns at least one orphaned `artist`/`album`
  `media_items` row that no `music_artists`/`music_albums` row references yet. The
  scan must flush albums so that orphan can be adopted. The flag is re-read *per
  file*, so an orphan created by a caught write failure part-way through switches
  the fast path off for the remainder of that scan.
- **`$needsHealing`** — some `music_artists` or `music_albums` row still has
  `media_item_id IS NULL`, awaiting the S96(e) backfill. That query is **not scoped
  to one library** — neither table has a `library_id` column — so a single unhealed
  row anywhere on the box disables the fast path for every music library on it.

Both gates **fail open**: if either query throws, the scanner logs a warning and
assumes the worst ("do not skip"), on the reasoning that an unjustified skip could
silently miss a change while an unnecessary probe is merely slow.

So a plain Scan on a music library can occasionally cost hours rather than minutes.
When you need a guaranteed full re-read, ask for one — use **Rescan**. The measured
figures above are **rescan** measurements; they are not the cost of a plain Scan.

### Generator-based Processing
`AudioScanner::scanMusicLibrary()` uses a PHP Generator to process tracks one
at a time, avoiding memory issues with large libraries (10,000+ tracks).

## Metadata Provider Priority

Music enrichment is **not** a host-side provider cascade. The server ships no
music metadata provider at all: `MetadataManager` omits `artist` / `album` /
`track` from its provider-priority map on purpose, so a music refresh through it
finds no providers and returns without fetching anything.

- **Local tags** are the base, and on a stock server they are the *only* source.
- **MusicBrainz** enrichment comes from the optional `musicbrainz` plugin, which
  subscribes to `MediaItemAdded` and therefore only ever sees newly inserted
  tracks.
- **AudioDB** is not wired to anything on the server.

The library-wide `match-metadata` / `refresh-metadata` jobs are no help either: they
visit `movie`, `video` and `series` rows only, so `artist`, `album` and `track` rows
are skipped before any provider is consulted. See
[what Match metadata skips](/admin/library-management#what-match-metadata-skips).

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/music/artists` | GET | List all artists |
| `/music/artists/{mbid}` | GET | Get artist details with albums |
| `/music/albums` | GET | List all albums |
| `/music/albums/{mbid}` | GET | Get album details with track listing |
| `/music/tracks` | GET | List all tracks (paginated) |
| `/music/tracks/{id}` | GET | Get single track details |
| `/music/now-playing` | GET | Get current playback state |

## Library Type Plugin

Music is registered as a library type via `MusicLibraryType` implementing
`LibraryTypeInterface`. This allows the system to:

- Return the correct scanner (`AudioScanner`) for music libraries
- Route library operations to `MusicLibraryManager`

```php
// In library type registry
final class MusicLibraryType implements LibraryTypeInterface
{
    public const TYPE = 'music';

    public function getType(): string
    {
        return self::TYPE;
    }

    public function getLabel(): string
    {
        return 'Music';
    }

    public function getScanner(
        Connection $db,
        ItemRepository $itemRepo,
        ?LoggerInterface $logger = null
    ): AudioScanner {
        return new AudioScanner($db, $itemRepo, $logger);
    }
}
```

## Database Schema

Music items are stored in the existing `media_items` table with `type = 'track'`.

### Required Indexes

The following indexes improve music library query performance:

```sql
-- Efficient library + type queries
CREATE INDEX idx_media_items_library_type ON media_items (library_id, type);

-- Artist/album lookups from metadata JSON
CREATE INDEX idx_media_items_metadata_artist
    ON media_items ((CAST(metadata_json->>'$.artist' AS CHAR(255))));

CREATE INDEX idx_media_items_metadata_album
    ON media_items ((CAST(metadata_json->>'$.album' AS CHAR(255))));
```

These indexes are created automatically by migration `011_music_library.sql`.

## Web Portal Views

The web portal provides Smarty templates for music browsing:

- `music/artists.tpl` — Artist grid view
- `music/artist.tpl` — Artist detail with album list
- `music/albums.tpl` — Album grid view
- `music/album.tpl` — Album detail with track listing
- `music/tracks.tpl` — Paginated track list
- `music/player.tpl` — Embedded music player

## Configuration

No additional configuration is required. Music scanning uses built-in
pure-PHP tag parsers that work out of the box.

### Optional: Metadata Provider API Keys

For enhanced metadata enrichment:

```php
// config/music_providers.php
return [
    'musicbrainz' => [
        'enabled' => true,
        'rate_limit' => 1, // requests per second
        'user_agent' => 'Phlix/1.0 (https://phlix.example.com)',
    ],
    'audiodb' => [
        'enabled' => true,
        'api_key' => 'YOUR_API_KEY', // Optional
    ],
];
```

## Adding New Audio Formats

To add support for a new audio format:

1. Add extension to `AudioScanner::AUDIO_EXTENSIONS`
2. Implement `harvest{FORMAT}Tags()` method
3. Add case to `harvestTags()` switch statement
4. Add test cases for the new format

## Known Limitations

- WMA/ASF parsing is basic; duration only
- DRM-protected files are not supported
- Album artwork extraction is not yet implemented
- ReplayGain tags are not parsed
