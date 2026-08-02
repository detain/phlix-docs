# Books Library Documentation

**Since:** 0.17.0

The books library provides support for electronic book formats (EPUB, PDF, CBZ) with OPDS 1.2 feed generation for third-party client compatibility.

::: danger A book scan extracts NO metadata from the book file
Scanning a book library indexes files and nothing more. `LibraryManager::scanLibrary()`
routes `type = 'book'` to `scanBookLibrary()`, which calls the plain `MediaScanner`
(`phlix-server` `96dbb3a4`, `src/Media/Library/LibraryManager.php:808-826`, the
`$this->scanner->scan($libraryId, $path, 'book')` call at `:820`). That method's own
docblock says *"using BookScanner"* — it does not.

`MediaScanner` opens no archive and parses no document: there is no `ZipArchive`, no
`content.opf` read, no `ComicInfo.xml` read and no `exif_read_data()` anywhere in it. So
**no title, author, publisher, ISBN, language, publication date, description, subject,
keywords, producer, series, volume, page count or cover image is ever written for a
book.**

The harvesters do exist — `BookScanner::harvestEpub()` / `harvestPdf()` /
`harvestCbz()` (`src/Media/Library/BookScanner.php:132`, `:296`, `:400`) — but nothing on
the scan path calls them; see
[Why the harvesters exist but never run](#why-the-harvesters-exist-but-never-run).
:::

## Supported Formats

A book library indexes exactly these extensions, from the hardcoded `book` extension
class at `src/Media/Library/MediaScanner.php:565`:

| Format | Extension | Metadata extraction today |
|--------|-----------|---------------------------|
| EPUB | epub | ❌ None |
| PDF | pdf | ❌ None |
| CBZ (Comic Book Archive) | cbz | ❌ None |

## What a scan actually stores

For each indexed book the scanner writes one `media_items` row
(`MediaScanner::processFile()` → `ItemRepository::upsertByPath()`,
`src/Media/Library/MediaScanner.php:1633-1640`) with:

| Column / key | Value |
|---|---|
| `library_id`, `path` | The library and the absolute file path |
| `type` | `book` |
| `name` | The filename without extension, run through the scene-name normalizer |
| `parent_id` | Always `null` |
| `metadata_json.raw_filename` | The un-normalized filename stem |
| `metadata_json.name` | Same as `name` |
| `metadata_json.canonical_key` | Title+year dedup key (`MediaScanner.php:1553`) |

That is the whole record (`MediaScanner::parseNaming()`, `:3392-3426`). Note that `year`
is only parsed for `type = 'movie'` (`:3407-3409`), so a `Title (Year).epub` filename
does **not** yield a `year` field.

::: warning Downstream readers expect fields that are never written
`OpdsFeedBuilder` reads `metadata_json.isbn`
(`src/Media/Metadata/OpdsFeedBuilder.php:333`) and `BookController::getCover()` reads
`metadata_json.cover_path` (`src/Server/Http/Controllers/BookController.php:595`). The
only writers of those keys are inside `BookScanner` (`:208-213`, `:258`), which never
runs — so the OPDS feed carries no ISBN, and `GET /api/v1/books/{id}/cover` takes the
`$coverPath === null` branch and answers **404 for every book**
(`BookController.php:600-602`; there is no fallback cover).
:::

## OPDS Feed URL

The OPDS feed is available at `/opds/v1.2`. This follows the OPDS 1.2 specification and is compatible with:

- **Uboiquity** (macOS/Windows/Linux)
- **Komga** (self-hosted)
- **Kore** (Android)
- **Moon+ Reader** (Android)
- **Apple Books** (iOS/macOS) — via third-party OPDS integration

## OPDS Endpoints

### Root Feed
```
GET /opds/v1.2
```
Returns the root OPDS catalog with links to libraries.

### Libraries Navigation
```
GET /opds/v1.2/libraries
```
Returns a navigation feed listing all book libraries.

### Library Acquisition Feed
```
GET /opds/v1.2/libraries/{library_id}?offset=0&limit=50
```
Returns an acquisition feed listing all books in a library with pagination support.

## Web Portal Endpoints

Registered under `/api/v1` (`src/Server/Core/Application.php:1968-1978`); the short forms
below omit the prefix.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/books` | GET | List all books |
| `/books/{id}` | GET | Get book details |
| `/books/{id}/cover` | GET | Get cover image — **404 for every book today**, see above |
| `/books/{id}/read` | GET | Open reader stub |
| `/books/{id}/download` | GET | Download book file |

## Naming Conventions

The filename is the **only** source of a book's title, so name files for readability
rather than for a parser. The stem (minus extension) is normalized by the scene-filename
normalizer and stored as the item's `name`; the raw stem is kept as
`metadata_json.raw_filename`.

```
Author - Title.epub
Title.pdf
Series Name v01.cbz
```

::: warning A `(Year)` suffix is not parsed for books
`MediaScanner::parseNaming()` only extracts a year when the library type is `movie`
(`src/Media/Library/MediaScanner.php:3407-3409`), so `Title (2020).epub` stores the year
as part of the name, not as a field.

Also note the episode parser runs unconditionally (`:3415`), so a book filename that
happens to look like `S01E02` will have `season` / `episode` stamped into its
`metadata_json` — harmless, but it is not a book field.
:::

## Metadata Fields Extracted

**None.** Every field this page previously listed for EPUB, PDF and CBZ —
`title`, `author`, `publisher`, `isbn`, `language`, `pub_date`, `description`,
`subject`, `keywords`, `creator`, `producer`, `creation_date`, `page_count`,
`series`, `volume`, `authors`, `cover_page`, `cover_path` — is written **only** by
`BookScanner`, and `BookScanner` is never invoked by a scan. The full field list is
retained in that class's source (`src/Media/Library/BookScanner.php`) rather than
repeated here, so this page cannot drift back into describing a contract that does not
run.

## Why the harvesters exist but never run

`BookScanner` (`src/Media/Library/BookScanner.php`) is a complete, tested harvester:
`harvestEpub()` parses `content.opf` (`:132-294`), `harvestPdf()` reads PDF metadata and
counts pages (`:296-349`, `:351-398`), `harvestCbz()` parses `ComicInfo.xml` and extracts
a cover (`:400-506`), and `scanBookLibrary()` is a generator over all three (`:508`).
It is not deleted and it is not broken — it is **not on the scan path**.

Traced at `phlix-server` `96dbb3a4`:

- Those methods are reachable only from `BookLibraryManager::rescanLibrary()`
  (`src/Media/Library/BookLibraryManager.php:116`) and `::upsertBook()` (`:170-172`).
- `BookLibraryManager` is constructed in exactly one place:
  `BookLibraryType::getLibraryManager()` (`src/Media/Music/BookLibraryType.php:100`).
- `BookLibraryType` is never instantiated. `LibraryManager.php:20` carries a
  `use Phlix\Media\Music\BookLibraryType;` import, but the class name appears nowhere in
  that file's body — it is an unused import. There is no `LibraryTypeInterface` registry
  anywhere in the repository.
- `BookController` takes the generic `LibraryManager`, not `BookLibraryManager`
  (`src/Server/Http/Controllers/BookController.php:43`, `:93`), so no HTTP route reaches
  the harvesters either.
- `AudiobookLibraryManager extends BookLibraryManager` and *is* constructed
  (`src/Server/Core/Application.php:4209`), but `AudiobookController` only calls
  `getProgress()` / `saveProgress()` (`:243`, `:314`, `:377`), both overridden in the
  subclass. The audiobook scan path has the same shape:
  `LibraryManager::scanAudiobookLibrary()` calls the plain `MediaScanner`
  (`LibraryManager.php:849`), so `AudiobookScanner`'s M4B chapter extraction does not run
  either.

Search scope for the above: every tracked file at `master` (`git grep` with no pathspec,
covering `src/`, `tests/`, `config/`, `scripts/`, `bin/`, `public/`, `web-ui/`,
`migrations/`, `examples/`, `docker/`, `install/`, `k8s/`, `deploy/`) plus a recursive
grep of the untracked `vendor/` tree. The only `vendor/` hits are
`vendor/composer/autoload_classmap.php` and `autoload_static.php`, i.e. Composer's
generated class map. The only non-`src/` callers are the unit tests
`tests/Unit/Media/Library/BookScannerTest.php` and `BookLibraryManagerTest.php`, which
construct the scanner directly.

**Consequence:** these classes are covered by green unit tests while contributing nothing
to a real scan. Do not read `BookScannerTest` passing as evidence that EPUB/PDF/CBZ
metadata extraction works.

## Metadata matching writes FILM metadata onto books

There is no book metadata provider. The library-wide *Match metadata* /
*Refresh metadata* jobs skip books — their batch filter keeps only
`MOVIE_TYPES = ['movie', 'video']` and `series`
(`src/Media/Metadata/LibraryMetadataMatcher.php:67`, `:2827-2833`) — but the
**per-item admin match** does not:
`MediaMatchController::search()` and `::apply()` load the item by id with no type filter
and derive the search mode from `LibraryMetadataMatcher::modeForType()`
(`src/Server/Http/Controllers/MediaMatchController.php:87-95`, `:160-177`).

`modeForType()` returns `'tv'` for `series` / `season` / `episode` and **`'movie'` for
everything else** (`src/Media/Metadata/LibraryMetadataMatcher.php:698-701`) — including
`book`. So running the interactive match on a book searches TMDB's *movie* index and, on
apply, writes film metadata onto the book row. This requires an admin to initiate it; it
does not happen automatically.

## Reader Stub

The built-in reader stub at `/books/{id}/read` provides:

- Paginated HTML view (intentionally minimal)
- Font size controls (A- / A+)
- Theme switching (light / sepia / dark)
- Keyboard navigation (← / →)

**Note:** Full EPUB rendering with text flow is planned for a future release. The current reader stub displays metadata and book information.

## Third-Party OPDS Client Setup

### Uboiquity (Recommended for desktop)
1. File → Add Catalog
2. Enter OPDS feed URL: `http://your-server:8080/opds/v1.2`
3. Browse and download books

### Komga
1. Add server with your Phlix URL
2. Libraries are automatically discovered via OPDS

### Moon+ Reader
1. Menu → Online catalog
2. Add custom catalog
3. Enter OPDS feed URL
