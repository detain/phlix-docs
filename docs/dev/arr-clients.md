# Arr API clients developer guide

> **Note** — The `Arr/` classes are the sole exception to the `phlix-shared`
> "Zero I/O" policy. They perform real HTTP/cURL calls because they model
> cross-repository integration for media indexers (Sonarr, Radarr, Prowlarr,
> Bazarr). See [`phlix-shared/AGENTS.md`](https://github.com/detain/phlix-shared/blob/main/AGENTS.md)
> for the full rationale.

## Overview

Phlix integrates with four *arr* applications via their v3 REST APIs:

| Application | Role | Default port |
|------------|------|--------------|
| **Sonarr** | TV series management (monitoring, search, download) | 8989 |
| **Radarr** | Movie management (monitoring, search, download) | 7878 |
| **Prowlarr** | Indexer management (handles multiple indexer APIs) | 9696 |
| **Bazarr** | Subtitle management (search, download subtitles) | 6767 |

All eight classes live in `src/Arr/` under the `Phlix\Shared\Arr` namespace
and ship in the `detain/phlix-shared` Composer package.

## The eight classes

### `ArrClientInterface` (`ArrClientInterface.php`)

Common contract implemented by Sonarr and Radarr clients. Defines four methods:

```php
interface ArrClientInterface
{
    public function getQueue(): array;              // paginated `{records, page, pageSize, totalRecords}`
    public function getQualityProfiles(): array;     // `array<int, array<string, mixed>>`
    public function getTagList(): array;            // `array<int, array<string, mixed>>`
    public function testConnection(): bool;        // hits /api/v3/system/status
}
```

Sonarr and Radarr share this interface. Prowlarr and Bazarr are separate
because they serve different purposes and do not expose quality profiles
or tag lists in the same way.

---

### `SonarrClient` (`SonarrClient.php`)

Implements `ArrClientInterface`. Wraps the Sonarr v3 API using cURL.

**Key methods beyond the interface:**

| Method | Description |
|--------|-------------|
| `getSeries()` | All tracked series |
| `getSeriesById(int $sonarrSeriesId)` | Single series |
| `getEpisodeFile(int $episodeId)` | Episode file metadata |
| `getWantedMissing(int? $startSeason)` | Missing episodes (wanted) |
| `addSeries(int\|array $tvdbId, int $qualityProfileId, int $rootFolder, ?string $monitor)` | Add series to Sonarr |
| `triggerDownload(int $episodeId): bool` | Force search for a specific episode |
| `testConnection(): bool` | Returns `true` if `/api/v3/system/status` returns a `version` key |

---

### `RadarrClient` (`RadarrClient.php`)

Implements `ArrClientInterface`. Wraps the Radarr v3 API using cURL.

**Key methods beyond the interface:**

| Method | Description |
|--------|-------------|
| `getMovies()` | All tracked movies |
| `getMovieById(int $radarrId)` | Single movie |
| `getCustomFormats()` | All custom formats |
| `createCustomFormat(array $payload): int` | Create a custom format, return its ID |
| `updateCustomFormat(int $id, array $payload): bool` | Update a custom format |
| `deleteCustomFormat(int $id): bool` | Delete a custom format |
| `createQualityProfile(array $payload): int` | Create a quality profile |
| `updateQualityProfile(int $id, array $payload): bool` | Update a quality profile |
| `addMovie(int\|array $tmdbId, int $qualityProfileId, string $rootFolder, bool $monitored)` | Add movie to Radarr |
| `triggerDownload(int $movieId): bool` | Force search for a specific movie |
| `testConnection(): bool` | Returns `true` if `/api/v3/system/status` returns a `version` key |

---

### `ProwlarrClient` (`ProwlarrClient.php`)

Standalone client (does **not** implement `ArrClientInterface`). Wraps the
Prowlarr v1 API using cURL.

| Method | Description |
|--------|-------------|
| `getIndexers()` | All configured indexers |
| `getIndexerStats(int $indexerId)` | Statistics for one indexer |
| `getHealth()` | Health check results |
| `triggerReindexerCheck(int $indexerId): bool` | Re-trigger indexer check |
| `testConnection(): bool` | Returns `true` if `/api/v1/system/status` returns a `version` key |

---

### `BazarrClient` (`BazarrClient.php`)

Standalone client (does **not** implement `ArrClientInterface`). Wraps the
Bazarr v1 API using cURL.

| Method | Description |
|--------|-------------|
| `getSubtitles(string $sonarrSeriesId, ?int $episodeFileId)` | Subtitles for a series/episode |
| `getSubtitleLanguages(string $videoFilePath)` | Available subtitle languages for a file |
| `downloadSubtitle(string $videoFilePath, string $languageCode): array` | Download a subtitle |
| `getLanguages()` | All configured subtitle languages |
| `testConnection(): bool` | Returns `true` if `/api/v1/system` returns a `version` or `bazarr` key |

---

### `SyncResult` (`SyncResult.php`)

Value object (no I/O) representing the outcome of a TRaSH-Guides sync
operation.

```php
readonly class SyncResult
{
    public function __construct(
        public readonly int $customFormatsAdded,
        public readonly int $customFormatsUpdated,
        public readonly int $qualityProfilesAdded,
        public readonly int $qualityProfilesUpdated,
        public readonly string $version,           // git SHA
        public readonly DateTimeImmutable $syncedAt,
    );

    public function getTotalCustomFormatsChanged(): int;
    public function getTotalQualityProfilesChanged(): int;
    public function getTotalChanges(): int;
    public function isEmpty(): bool;
    public function toArray(): array;           // for serialization
}
```

---

### `TrashGuidesProvider` (`TrashGuidesProvider.php`)

Fetches and parses TRaSH-Guides quality profiles and custom formats JSON from
GitHub raw URLs. **This class performs real HTTP I/O** — it is the only other
I/O class besides the four clients.

Features:
- 24-hour static cache (`CACHE_TTL_SECONDS = 86400`)
- Graceful fallback defaults pointing at the `main` branch TRaSH-Guides
  JSON files if `config/trash_guides.php` is absent
- `clearCache()` to force a refresh
- `getQualityProfiles()`, `getCustomFormats()`, `getVersion()`

---

### `ArrClientFactory` (`ArrClientFactory.php`)

Factory that builds `SonarrClient` or `RadarrClient` from a configuration
array. Returns `null` if the target is disabled or has an empty API key.

```php
class ArrClientFactory
{
    public function __construct(
        /**
         * @param array{
         *     sonarr?: array{url?: string, api_key?: string, enabled?: bool},
         *     radarr?: array{url?: string, api_key?: string, enabled?: bool}
         * } $config
         */
        private readonly array $config
    ) {}

    public function createSonarrClient(?LoggerInterface $logger = null): ?SonarrClient;
    public function createRadarrClient(?LoggerInterface $logger = null): ?RadarrClient;
}
```

> Prowlarr and Bazarr are not yet wired through `ArrClientFactory`. Direct
> instantiation with `new ProwlarrClient($url, $apiKey)` /
> `new BazarrClient($url, $apiKey)` is currently required.

---

## Configuration

```php
// config/arr.php  (read by ArrClientFactory)
return [
    'sonarr' => [
        'enabled' => true,
        'url'     => 'http://localhost:8989',
        'api_key' => 'your-sonarr-api-key',
    ],
    'radarr' => [
        'enabled' => true,
        'url'     => 'http://localhost:7878',
        'api_key' => 'your-radarr-api-key',
    ],
];
```

Pass this array to `ArrClientFactory`, then call the factory methods to
obtain client instances. All clients accept an optional
`Psr\Log\LoggerInterface` as the last constructor argument for error/warning
logging.

```php
$factory = new ArrClientFactory($config['arr'] ?? []);

$sonarr = $factory->createSonarrClient($logger);
if ($sonarr !== null) {
    $profiles = $sonarr->getQualityProfiles();
}
```

### TRaSH-Guides configuration

`TrashGuidesProvider` reads `config/trash_guides.php` if present. Without it,
it uses built-in defaults pointing at the current `main` branch:

```php
// config/trash_guides.php
return [
    'enabled'              => true,
    'auto_sync_interval'   => 86400,               // 24 h
    'custom_formats_url'   => 'https://raw.githubusercontent.com/TRaSH-'
                               . '/Guides/main/docs/json/radarr/'
                               . 'radarr-collection-of-custom-formats.json',
    'quality_profiles_url' => 'https://raw.githubusercontent.com/TRaSH-'
                               . '/Guides/main/docs/json/radarr/'
                               . 'radarr-setup-quality-profiles-parent.json',
];
```

---

## Error handling

All four clients throw `RuntimeException` on:

| Condition | Message pattern |
|-----------|----------------|
| cURL fails to initialize or call | `cURL error: {message}` |
| HTTP 401 | `{App} API authentication failed (401)` |
| HTTP 404 | `{App} API resource not found (404): {path}` |
| HTTP ≥ 400 | `{App} API error: HTTP {code}` |
| Empty or invalid JSON response | `Invalid JSON response from {App}` |

`testConnection()` and `triggerDownload()` / `triggerReindexerCheck()` are
the only methods that swallow exceptions — they return `false` instead.

**Always wrap I/O calls in try/catch** unless you are using those
lower-risk convenience methods.

```php
use Phlix\Shared\Arr\RadarrClient;
use Psr\Log\NullLogger;

$client = new RadarrClient('http://localhost:7878', 'your-key', new NullLogger());

try {
    $movies = $client->getMovies();
} catch (RuntimeException $e) {
    // log and fall back
    $logger->error('Radarr unavailable: ' . $e->getMessage());
    $movies = [];
}
```

---

## Architecture note — why I/O in phlix-shared

The `phlix-shared` package maintains a **"Zero I/O" policy**: no filesystem
reads, no network calls, no database, no logging side-effects. It ships
_only_ interfaces and value objects.

The `Arr/` classes are an explicit exception to this rule. The rationale:

1. **Cross-repo integration point.** Both `phlix-server` and the
   `phlix-hub` daemon need to talk to Sonarr/Radarr/Prowlarr/Bazarr.
   Putting the client classes in `phlix-shared` avoids duplicating HTTP
   integration logic across two repositories.
2. **Typed DTOs for responses.** `SyncResult` and the paginated queue
   response shapes are genuine shared contracts, not server-specific.
3. **cURL is a system-level primitive.** The clients use raw `curl_*`
   functions (no Guzzle, no Httplug), keeping the dependency footprint
   minimal and avoiding framework lock-in.

> A future refactor may extract the I/O classes into a new
> `phlix-arr-client` package, leaving `phlix-shared` entirely I/O-free.
> Track this in the [phlix issue tracker](https://github.com/detain/phlix/issues).
