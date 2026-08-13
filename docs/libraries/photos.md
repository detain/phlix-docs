# Photos Library Documentation

**Since:** 0.16.0

The photos library provides photo browsing, thumbnailing and slideshow playback.

::: danger A photo scan extracts NO metadata from the image file
Scanning a photo library indexes files and nothing more. `LibraryManager::scanLibrary()`
routes `type = 'photo'` to `scanPhotoLibrary()`, whose own comment reads *"For now, fall
back to basic scanning"* — it calls the plain `MediaScanner`
(`phlix-server` `96dbb3a4`, `src/Media/Library/LibraryManager.php:777-797`, the
`$this->scanner->scan($libraryId, $path, 'image')` call at `:791`).

`MediaScanner` contains **no** `exif_read_data()`, `getimagesize()` or any other image
inspection, and images are excluded from its `DURATION_PROBE_TYPES` probe set
(`src/Media/Library/MediaScanner.php:172`, `:1023-1028`). So **no camera make/model,
lens, aperture, ISO, shutter speed, focal length, dimensions, orientation, capture date
or GPS coordinate is ever written for a photo.**

An EXIF harvester does exist — `PhotoScanner::harvestExif()`
(`src/Media/Library/PhotoScanner.php:85-179`) — but nothing on the scan path calls it;
see [Why the EXIF code exists but never runs](#why-the-exif-code-exists-but-never-runs).
:::

## Supported Formats

A photo library indexes exactly these extensions, from the hardcoded `image` extension
class at `src/Media/Library/MediaScanner.php:564` (selected for `libraries.type =
'photo'` by `extensionsForLibraryType()` at `:614-632`):

`jpg`, `jpeg`, `png`, `gif`, `bmp`, `webp`, `tiff`, `tif`

Note two things this list does **not** match:

- **`gif` and `bmp` are indexed**, though earlier revisions of this page did not mention them.
- **`heic` / `heif` are NOT indexed.** They appear in `PhotoScanner`'s own
  `SUPPORTED_EXTENSIONS` (`PhotoScanner.php:37`), but that constant is on the class the
  scan path never uses. A `.heic` file in a photo library is skipped entirely — no row is
  created. This page previously claimed HEIC worked "via ImageMagick"; there is no
  ImageMagick call anywhere in the photo code.

Every indexed format is treated identically: none of them yields metadata.

## What a scan actually stores

For each indexed image the scanner writes one `media_items` row
(`MediaScanner::processFile()` → `ItemRepository::upsertByPath()`,
`src/Media/Library/MediaScanner.php:1633-1640`) with:

| Column / key | Value |
|---|---|
| `library_id`, `path` | The library and the absolute file path |
| `type` | `photo` (the scanner's `image` label is translated at `MediaScanner.php:3091-3092`) |
| `name` | The filename without extension, run through the scene-name normalizer |
| `parent_id` | Always `null` — photos are never nested |
| `metadata_json.raw_filename` | The un-normalized filename stem |
| `metadata_json.name` | Same as `name` |
| `metadata_json.canonical_key` | Title+year dedup key (`MediaScanner.php:1553`) |

That is the whole record. `metadata_json` for a photo carries no image-derived field of
any kind (`MediaScanner::parseNaming()`, `:3392-3426`).

## Album Organization

Photos are grouped into date albums by `PhotoLibraryManager::getPhotosGroupedByDate()`
(`src/Media/Library/PhotoLibraryManager.php:239-268`), which buckets each photo by
`date('Y-m-d', metadata_json.date_taken_unix)` and falls back to the literal key
`'Unknown'` when that value is absent (`:256-258`).

::: warning In practice every photo lands in the single "Unknown" album
`date_taken_unix` is only ever written by `PhotoScanner::harvestExif()` /
`harvestBasicImageMetadata()`, which the scan path never calls. A repo-wide search at
`96dbb3a4` finds exactly one writer of that key (`PhotoScanner.php:162`, `:203`) and
three readers (`PhotoLibraryManager.php:248`, `ExifProvider.php:137`,
`PhotoController.php:509`). With no writer reachable, the `'Unknown'` fallback is the
only branch that fires, so date-based albums do not currently separate anything.
:::

## API Endpoints

All routes are registered under `/api/v1` (`src/Server/Core/Application.php:2052-2064`);
the short forms below omit that prefix.

### Albums

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/photo/albums?library_id=…` | List date albums. `library_id` is **required** — 400 without it. |
| GET | `/photo/albums/{id}?library_id=…` | One album. `{id}` is `md5()` of the album's date key, so with no capture dates stored the only reachable id is `md5('Unknown')`. |

### Photos

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/photo/photos` | List photos |
| GET | `/photo/photos/{id}` | Get one photo. The `exif` block is `ExifProvider::getPhotoMetadata()` reading `metadata_json` back out of the row — with nothing extracted at scan time it contains only the scanner's filename fields. |
| GET | `/photo/photos/{id}/thumbnail?w=300&h=300&fit=cover` | Resized thumbnail |
| GET | `/photo/photos/{id}/full` | Full-resolution photo |

### Slideshow

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/photo/slideshow?library_id=…&album_id=xxx&interval=5` | Slideshow data. `library_id` is **required**; `album_id` optional (all photos when omitted); `interval` clamped to `[1, 300]`, default 5. |

## Thumbnail Generation

Thumbnails are generated on-demand with PHP's GD extension
(`PhotoController::getThumbnail()` → `imagecreatefrom*()` at
`src/Server/Http/Controllers/PhotoController.php:660-664` and `imagecopyresampled()` at
`:623`):

- Default size 300×300; `w` and `h` are each clamped to `[1, 2000]` (`:277-283`)
- Fit modes: `cover` (crop to fill, the default) or `contain` (letterbox) (`:285`)
- Thumbnails: `Cache-Control: public, max-age=86400` (`:317`)
- Full photos: `Cache-Control: private, max-age=86400` (`:398`) — **not** a public
  one-year cache; the full-resolution route is user-scoped

## Slideshow Player

The slideshow player features:

- **Auto-advance**: Configurable interval (default 5 seconds, server-clamped to 1–300)
- **Keyboard controls**: Arrow keys (←/→), Space (play/pause), Escape (exit)
- **Touch/swipe**: Swipe left/right on mobile devices
- **Thumbnail strip**: Quick navigation at bottom
- **Caption display**: the server builds each caption as
  `camera_model ?? name`, then appends `date_taken_unix` when present
  (`PhotoController.php:507-513`). Because neither EXIF key is ever written, **the
  caption is always just the photo's filename-derived name** — no camera info, no date

## Why the EXIF code exists but never runs

`PhotoScanner` (`src/Media/Library/PhotoScanner.php`) is a complete, tested EXIF
harvester: `harvestExif()` (`:85-179`), a `getimagesize()` fallback
(`harvestBasicImageMetadata()`, `:189-219`), GPS rational conversion (`:278-364`) and a
`scanPhotoLibrary()` generator (`:392-434`). It is not deleted, and its logic is
exercised by unit tests — it is simply **not on the scan path**.

Traced at `phlix-server` `96dbb3a4`:

- Those methods are reachable only from `PhotoLibraryManager::rescanLibrary()`
  (`src/Media/Library/PhotoLibraryManager.php:128`) and `::upsertPhoto()` (`:193`, `:201`).
- `PhotoLibraryManager` **is** constructed and injected into `PhotoController`
  (`src/Server/Core/Application.php:4231`,
  `src/Common/Container/Providers/WebPortalServicesProvider.php:292`), but the controller
  only ever calls `getPhotosGroupedByDate()` (`PhotoController.php:72`, `:117`, `:487`).
  Neither `rescanLibrary()` nor `upsertPhoto()` has a caller anywhere in the repository.
- `PhotoLibraryType` (`src/Media/Music/PhotoLibraryType.php:35`) would wire
  `PhotoScanner` in as the photo library's scanner, but there is no
  `LibraryTypeInterface` registry — the class is referenced by nothing outside its own
  file, and its `MusicLibraryType` sibling records the same fact in its own source
  (`MusicLibraryManager.php:120`: *"`getLibraryManager()` has no caller today"*).

Search scope for the above: every tracked file at `master` (`git grep` with no pathspec,
covering `src/`, `tests/`, `config/`, `scripts/`, `bin/`, `public/`, `web-ui/`,
`migrations/`, `examples/`, `docker/`, `install/`, `k8s/`, `deploy/`) plus a recursive
grep of the untracked `vendor/` tree. The only `vendor/` hits are
`vendor/composer/autoload_classmap.php` and `autoload_static.php`, i.e. Composer's
generated class map — no vendored or plugin code calls these classes. The only
non-`src/` callers are the unit tests `tests/Unit/Media/Library/PhotoScannerTest.php`
and `PhotoLibraryManagerTest.php`, which construct the scanner directly.

**Consequence:** these classes are covered by green unit tests while contributing nothing
to a real scan. Do not read `PhotoScannerTest` passing as evidence that photo EXIF works.

### Wiring it up needs `ext-exif`, which the published image lacked until S314

`harvestExif()` calls `@exif_read_data()` (`PhotoScanner.php:95`) with no
`function_exists()` guard, and `@` does **not** suppress the `Error` PHP raises for an
undefined function. The published Docker images did not enable the extension:
`php:8.3-cli-alpine` ships without it, and `ext-exif` was only declared in
`composer.json` (`:11`) and installed in the base image
(`docker/Dockerfile.base:100`) by **S314** (`6a8f07c5`, 2026-08-10), which also makes a
missing extension fail the build rather than the runtime
(`composer check-platform-reqs`, `docker/Dockerfile:75-76`).

So there were two independent reasons a photo scan produced no EXIF, and it matters
which one applied:

| | |
|---|---|
| **Why no EXIF is extracted** | The harvester is not called. This is the operative reason, and it is unchanged by S314. |
| **What would have happened if it *were* called, pre-S314** | An immediate fatal `Error: Call to undefined function exif_read_data()` on the first JPEG. |

Because nothing on the scan path reaches the call, **no photo scan ever hit that fatal**
— the `scanPhotoLibrary()` fallback comment predates the extension work by weeks
(`LibraryManager.php` at `641602bc`, 2026-07-15). S314 removed the latent hazard; it did
not change what a photo scan extracts, which is still nothing.

## Metadata matching writes FILM metadata onto photos

The library-wide *Match metadata* / *Refresh metadata* jobs skip photos — their batch
filter keeps only `MOVIE_TYPES = ['movie', 'video']` and `series`
(`src/Media/Metadata/LibraryMetadataMatcher.php:67`, `:2827-2833`).

The **per-item admin match** does not filter by type.
`MediaMatchController::search()` / `::apply()` load the item by id and derive the mode
from `LibraryMetadataMatcher::modeForType()`
(`src/Server/Http/Controllers/MediaMatchController.php:87-95`, `:160-177`), which returns
`'tv'` for `series` / `season` / `episode` and **`'movie'` for everything else**
(`LibraryMetadataMatcher.php:698-701`) — including `photo`. Running the interactive match
on a photo therefore searches TMDB's movie index and, on apply, writes film metadata onto
the photo row. An admin has to initiate it; it does not happen automatically.

## Deferred Features

The following features are planned for future releases:

- **EXIF extraction**: wiring `PhotoScanner` into the scan path so the fields above are
  actually harvested — the prerequisite for most of the rest of this list
- **Geotag clustering / map view**: needs EXIF extraction first; no GPS is stored today
- **Thumbnail caching**: Disk-based cache for generated thumbnails
- **Photo editing**: Basic editing (rotate, crop)
- **Sharing**: Generate shareable links for photos/albums
- **Backup integration**: Export photos to cloud storage

## Configuration

No special configuration is required for the photos library. The following optional settings may be added in `config/server.php`:

```php
// Future photo library settings (not yet implemented)
'photo' => [
    'thumbnail_size' => 300,
    'slideshow_interval' => 5,
    'enable_map_view' => false, // Future: Enable geotag clustering
],
```

## Known Limitations

1. **No metadata extraction at all**: a photo scan records the file and its name, nothing
   more. See the warning at the top of this page.
2. **No HEIC/HEIF support**: `.heic` / `.heif` are not in the scanner's indexed extension
   set, so those files are skipped and never appear in the library. There is no
   ImageMagick integration.
3. **No video support**: video files in photo libraries are ignored
4. **No map view, and no coordinates to plot**: GPS is neither extracted nor stored, so
   the map feature below needs an extraction path before it needs a UI
5. **No thumbnail cache**: thumbnails are regenerated on each request
6. **No face detection**: people/face tagging not supported
7. **Date albums do not separate anything**: with no capture date stored, every photo
   falls into the single `Unknown` bucket
