# Music Library Documentation

**Since:** 0.14.0

## Overview

Phlix indexes music files into a normalized Artist → Album → Track hierarchy
(the `music_artists` / `music_albums` / `music_tracks` tables) and serves it
through a REST API and the web player's Music pages.

The scanner that actually runs is `MusicLibraryScanner`
(`src/Media/Music/MusicLibraryScanner.php`), reached from
`LibraryManager::scanLibrary()` → `scanMusicLibrary()`
(`src/Media/Library/LibraryManager.php:531-532`, `:640`). An older
`AudioScanner` class also exists and is described in places as the music
scanner; it is **not** on the scan path — see
[The `AudioScanner` / `MusicLibraryType` pair is dormant](#the-audioscanner-musiclibrarytype-pair-is-dormant).

::: tip What on this page is cited, and what is not
Every claim below that names a `file:line` was checked against `phlix-server`
`0a2b95d0`. The wall-clock figures under
[Scan and Rescan Behavior](#scan-and-rescan-behavior) are dated observations of
one production library on one box, carried over from an earlier revision and
**not** re-measured — they are labelled as such in place.
:::

## Supported Audio Formats

A music library indexes exactly these five extensions, from
`MusicLibraryScanner::AUDIO_EXTENSIONS` (`MusicLibraryScanner.php:87`), applied
by `audioFileIterator()` at `:1557`:

| Format | Extension | Notes |
|--------|-----------|-------|
| MPEG-1/2/2.5 Audio Layer III | `.mp3` | ID3v1/ID3v2 tags |
| Free Lossless Audio Codec | `.flac` | Vorbis Comment |
| MPEG-4 Audio | `.m4a` | MP4 atoms (iTunes-style); AAC or ALAC |
| Ogg Vorbis | `.ogg` | Vorbis Comment |
| Waveform Audio | `.wav` | Usually untagged; see the warning below |

::: warning `.aac`, `.oga`, `.opus` and `.wma` are NOT indexed
Earlier revisions of this page listed them. They are members of the *other*
class's set (`AudioScanner::AUDIO_EXTENSIONS`,
`src/Media/Library/AudioScanner.php:31-39`), which no scan uses. A file with one
of those extensions is skipped by `audioFileIterator()` and never produces a
row — it does not appear in the library at all.
:::

## Tag Field Mapping

Tags are read by getID3 first and by `ffprobe` only when getID3 returns nothing
usable (`MusicLibraryScanner::probeMetadata()`, `:1576`). Both paths produce the
**same eight-field array**, and nothing else is read:

| Field | getID3 comment key(s) (`mapId3Comments()`, `:1718-1745`) | ffprobe format tag (`probeViaFfprobe()`, `:1810-1857`) |
|---|---|---|
| `artist` | `artist`, else `band` / `album_artist` / `albumartist` | `artist`, else `album_artist` |
| `album` | `album` | `album` |
| `title` | `title` | `title` |
| `track_number` | `track_number` / `track` (leading integer) | `track` (leading integer) |
| `disc_number` | `part_of_a_set` / `disc`, default `1` | `disc`, default `1` |
| `duration_secs` | `playtime_seconds`, floored | `format.duration`, floored |
| `year` | `year` / `date` / `recording_time` | `date` |
| `genre` | `genre` | `genre` |

::: warning Only five of those eight fields are ever stored
`music_tracks` has columns for `title`, `track_number`, `disc_number` and
`duration_secs` only (`migrations/065_music_library.sql:72-104`), and the INSERT
writes exactly those (`MusicLibraryScanner.php:2705-2708`, `:2749-2752`).
`artist` and `album` are used to *group* and to key the `music_artists` /
`music_albums` rows; `year` lands on the album row. **`genre` is read and then
discarded** — there is no genre column anywhere in the music schema, which is
why `GET /music/tracks` always returns `"genre": null`
(`MusicController::formatTrack()`, `:709-737`).

There is likewise no `composer`, `comment`, `bitrate`, `sample_rate`,
`channels` or `album_artist` field: those were never read by this scanner.
`album_artist` appears above only as a *fallback source* for `artist`, not as a
stored value — `formatTrack()` echoes `artist` back under the `album_artist`
key.
:::

## Naming Conventions

::: danger The filename is a last-resort title, not a metadata source
`fallbackMetadataFromFilename()` (`MusicLibraryScanner.php:1866-1880`) runs only
when both getID3 and ffprobe fail, and it returns the **whole filename stem as
`title`** with `artist`, `album`, `year` and `genre` all `null` and
`track_number` null. There is no `01 - Track Name` parser, no
`Artist - Album - Track` parser and no directory-name parser: a name like
`01 - Track Name.mp3` becomes the literal title `01 - Track Name`.

Two consequences follow, both worth knowing before organising a library:

- **A track with no readable artist tag is dropped.** A missing `artist` becomes
  the literal `'Unknown Artist'` (`:873`), and `flushAlbum()` **skips the whole
  album batch** when the artist name is empty or `'Unknown Artist'`
  (`:1261-1268`) — the files are counted as skipped and no row is written.
- **A missing album tag falls back to the file's own basename** (`:874`), so
  untagged files in one folder become one album *per file*, not one album per
  folder.
:::

Albums are grouped on the **tag** identity `md5(artist|album)` (`:879`), not on
the directory, which is what keeps an album split across several folders in one
album row. So the layout below is a readability convention rather than something
the scanner parses:

```
/music/
└── Artist Name/
    └── Album Name (Year)/
        ├── 01 - Track One.mp3
        ├── 02 - Track Two.mp3
        └── cover.jpg
```

`cover.jpg` and its siblings are not read — see
[Known Limitations](#known-limitations).

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
pays the whole wall clock a second time. Full-read mode refuses every skip for the
whole scan, so a rescan has nothing to skip — including the files the interrupted
run had already read.

What the interrupted run's work *does* buy is fewer writes, not fewer reads. The
identity stamps it left behind are honoured by the re-run, which therefore does not
re-write the rows it already stamped; it still opens and tag-reads every one of
their files.

Trigger one from **Admin → Libraries → Rescan**, from
`POST /api/v1/libraries/{id}/rescan`, or from the CLI with
`php bin/phlix library:scan {libraryId} --rescan` (see the
[CLI reference](../reference/cli#library-scan)).

### When a plain Scan still opens every file

The unchanged-file skip is not unconditional. Two separate things have to line up:
the skip index has to be **loaded**, and the scanner has to be **allowed to skip**.

`MusicLibraryScanner::scanDirectory()` loads the index when `$readEveryFile` is
set, **or** when neither `$mayAdopt` nor `$needsHealing` holds. It is then allowed
to skip a file only when `canSkip()` — `!$mayAdopt && !$readEveryFile` — is true
*and* the loaded index reports the file unchanged. An index that was never loaded
reports every file as changed, so leaving it unloaded also forces a full read.

That splits the three flags into two different roles:

- **`$readEveryFile`** — the operator asked for a rescan. This is the only one of
  the three you control, and it is the one that does **not** work by unloading the
  index. See [Rescan loads the index on purpose](#rescan-loads-the-index-on-purpose)
  below.
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

### Rescan loads the index on purpose

A rescan **loads** the skip index rather than leaving it unloaded, and that is not
an oversight — it is the point.

Both designs re-read every file. The difference is what they do to the database
afterwards. The scanner records an identity stamp — the file's `(mtime, size)` — on
each row it processes. With the index unloaded, nothing can tell that a stamp is
already correct, so every single file read issued a stamp `UPDATE` that changed no
byte: on the production library that is **61,135 no-op row rewrites per rescan**.

Loading the index costs one `SELECT` and about **10.90 MiB** held for the walk, and
buys back all of those writes: a stamp is only written when the recorded identity
actually differs.

⚠ **This cannot weaken the full-read guarantee, and the reason is worth
understanding before changing anything here.** Reach and stamping are decided by
two different questions. `canSkip()` is `!$mayAdopt && !$readEveryFile`, so during a
rescan it is false for the entire scan and **no index entry can suppress a read** —
the loaded index is consulted only for the stamping decision. The same `canSkip()`
also gates the read-ahead, so the prefetcher and the main walk cannot disagree about
which files get opened.

### Streaming, not slurping

The walk never holds the library in memory. `audioFileIterator()`
(`MusicLibraryScanner.php:1544-1567`) is a PHP `Generator` over a
`RecursiveIteratorIterator`, so files arrive one at a time, and the scanner
keeps at most `MAX_OPEN_ALBUMS = 32` albums open (`:119`), flushing the
least-recently-used one to the database when a 33rd appears and flushing again
every `MAX_TRACKS_PER_FLUSH = 250` tracks (`:132`). The artist and album caches
are separately bounded at 512 entries each (`:144`, `:147`).

That per-album flush is also why an interrupted rescan keeps everything it had
already written.

::: warning This is **not** `AudioScanner::scanMusicLibrary()`
That method exists (`src/Media/Library/AudioScanner.php:107`) and does return a
`Generator`, but it is on the dormant class — see
[below](#the-audioscanner-musiclibrarytype-pair-is-dormant). Earlier revisions of
this page credited it with the streaming behaviour described here.
:::

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

All seven routes sit under `/api/v1` and all require a signed-in user
(`Application::loadMusicRoutes()` registers the whole group behind `AuthMiddleware` —
`src/Server/Core/Application.php:2012-2030` at `0a2b95d0`).

| Endpoint | Method | Query parameters | Description |
|----------|--------|------------------|-------------|
| `/music/artists` | GET | `limit`, `offset` | Page of artists, with `total` |
| `/music/artists/{artist_name}` | GET | — | One artist plus their album titles |
| `/music/albums` | GET | `artist`, `limit`, `offset` | Page of albums, with `total` |
| `/music/albums/{album_title}` | GET | `artist` | One album plus its track listing |
| `/music/tracks` | GET | `limit`, `offset` | Page of tracks, with `total` |
| `/music/tracks/{id}` | GET | — | One track, by `media_items` UUID |
| `/music/now-playing` | GET | — | Current playback state — see the warning below |

**All three listings are paged, not just tracks.** `limit` is clamped server-side into
`[1, 100]`, where **100 is both the default and the hard ceiling** (`PageLimit::MAX`,
`src/Common/Http/PageLimit.php:51`); `offset` is clamped to `>= 0`. Each listing returns
a real `total` counted over the whole matching set, so `offset + limit < total` is the
"there is another page" test.

::: warning These are name-keyed routes — there is no `mbid` anywhere
`music_artists` and `music_albums` have AUTO_INCREMENT primary keys that no client ever
sees. The detail routes take the artist **display name** and the album **title** (exact,
case-insensitive) — the server's route table spells the placeholder `{mbid}`, but no
music response contains an `mbid` field and no MusicBrainz ID is accepted. Tracks are
keyed by their `media_items` UUID. The only server-side filter is `?artist=`; an
unknown query parameter is silently ignored and returns **unfiltered** results.

Full field-by-field reference: [Music Endpoints](/reference/api#music-endpoints).
:::

::: danger `/music/now-playing` always returns `{"now_playing": null}`
The handler looks for `current_media_id` / `position_ticks` / `playback_state` on a
`sessions` row, and the `sessions` table has none of those columns. See
[the API reference](/reference/api#get-api-v1-music-now-playing) for the citation.
:::

## The `AudioScanner` / `MusicLibraryType` pair is dormant

`MusicLibraryType` (`src/Media/Music/MusicLibraryType.php:34`) implements
`LibraryTypeInterface` and its `getScanner()` returns an `AudioScanner`
(`:70-89`) — and its own class docblock says it "is automatically discovered by
the library type registry" (`:25-26`).

**There is no such registry.** Verified at `0a2b95d0` by `git grep` over every
tracked file: no `LibraryTypeRegistry`, no `registerLibraryType()`, nothing that
enumerates `LibraryTypeInterface` implementations. `MusicLibraryType` is
constructed in exactly one place in the repository —
`tests/Unit/Media/Library/MusicLibraryManagerTest.php:165` — and
`AudioScanner` is constructed only by `MusicLibraryType::getScanner()`
(`MusicLibraryType.php:88`), i.e. by nothing that runs. `LibraryManager.php:19`
carries a `use Phlix\Media\Music\MusicLibraryType;` import whose class name
appears nowhere in that file's body: an unused import, not a wiring.

Routing to the music scanner is instead a literal type test in
`LibraryManager::scanLibrary()` (`if ($library->type === 'music')`,
`LibraryManager.php:531`), which calls `MusicLibraryScanner`.

**Consequence:** `AudioScanner`'s per-format `harvest*Tags()` methods and its
seven-extension format list are covered by green unit tests while contributing
nothing to a real scan. Do not read `AudioScannerTest` passing as evidence that
`.opus` or `.wma` files are indexed. The same shape is documented for photos and
books — see [Photos](/libraries/photos#why-the-exif-code-exists-but-never-runs)
and [Books](/libraries/books#why-the-harvesters-exist-but-never-run).

## Database Schema

A music library writes to **two** places, and the API reads the second:

1. **`media_items`**, one row per track with `type = 'track'` — the row that
   owns the file path, the UUID and the signed stream URL. Migration
   `011_music_library.sql` added `track` to the `media_items.type` ENUM, the
   composite `idx_media_items_library_type`, and three `metadata_json`
   expression indexes (artist, album, genre).
2. **`music_artists` / `music_albums` / `music_tracks`** (migration
   `065_music_library.sql`) — the normalized hierarchy. Every `/api/v1/music/*`
   response is served from these tables via `MusicLibraryService`; none of them
   has a `library_id` column, which is why no music endpoint takes one.

::: warning Migration 011's `metadata_json` indexes no longer serve the music API
They index `metadata_json->>'$.artist'` / `'$.album'` / `'$.genre'` on
`media_items`. Since the normalized tables landed, artist/album lookups run
against `music_artists.name` and `music_albums.title` (both have their own
`idx_name` / `idx_title`), and the scanner writes no `genre` at all. The 011
indexes still exist on the column and still cost write time; they are simply not
what the music endpoints use.
:::

## Where the music UI lives

Music browsing is rendered by the Vue SPA in `phlix-ui`, not by a server-side
template. There are no `music/*.tpl` files anywhere in `phlix-server` — earlier
revisions of this page listed six of them.

The routes are `/app/music` (the combined artists → albums → tracks browser,
`MusicLibraryPage.vue`) plus five standalone pages registered by the server's SPA
entry point (`phlix-server/web-ui/src/main.ts:72-76`): `/app/music/artists`,
`/app/music/artist/:name`, `/app/music/album/:name`, `/app/music/tracks` and
`/app/music/player`. See the [web client page](/clients/web) for the full route
table.

## Configuration

There is no music-specific configuration file. Tag reading uses the bundled
pure-PHP getID3 library with `ffprobe` as a fallback, and both work with no
setup.

::: warning There is no `config/music_providers.php`
Earlier revisions of this page showed a `musicbrainz` / `audiodb` config array
in a file of that name. No such file exists, and no host-side music provider
reads one — see [Metadata Provider Priority](#metadata-provider-priority) above.
MusicBrainz enrichment is configured through the optional `musicbrainz`
**plugin**'s own settings (Admin → Plugins), and AudioDB is not wired to
anything.
:::

## Adding New Audio Formats

To make a new extension index, change the scanner that runs:

1. Add the extension to `MusicLibraryScanner::AUDIO_EXTENSIONS`
   (`MusicLibraryScanner.php:87`) — that constant is the only gate
   (`audioFileIterator()`, `:1557`).
2. Confirm getID3 or `ffprobe` can read the format's tags; there is no
   per-format parser to write, because `probeMetadata()` (`:1576`) delegates to
   both and maps whatever comes back through the eight-field shape above.
3. Add test cases for the new format.

Adding it to `AudioScanner::AUDIO_EXTENSIONS` instead changes nothing that runs.

## Known Limitations

Each item below is a property of `MusicLibraryScanner` at `0a2b95d0`, not of the
dormant `AudioScanner`.

- **`.wma`, `.opus`, `.aac` and `.oga` are not indexed at all** — they are not in
  `AUDIO_EXTENSIONS` (`:87`), so the walk skips them silently. This is stronger
  than the "basic WMA parsing" this page used to claim.
- **No album artwork is stored.** `music_albums.album_art_url` exists in the
  schema (`migrations/065_music_library.sql:50`) but nothing ever writes it, so
  every album response carries `"album_art_url": null`. Embedded cover art is
  read off the wire by getID3 and then deliberately discarded
  (`option_save_attachments = false`, `MusicLibraryScanner.php:1976`); sidecar
  files such as `cover.jpg` / `folder.jpg` are not audio extensions and are
  never opened.
- **`genre` is read and thrown away** — no column exists for it. See the tag
  mapping above.
- **ReplayGain tags are not parsed.** `replaygain` appears nowhere in
  `phlix-server/src/`.
- **No DRM handling exists.** There is no DRM branch in the music scanner; a
  protected file simply yields no readable tags, and a file with no artist tag
  is skipped (see [Naming Conventions](#naming-conventions)).
- **Enrichment is plugin-only.** See
  [Metadata Provider Priority](#metadata-provider-priority).
