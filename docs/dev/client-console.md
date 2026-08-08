# Console client build guide

> Developer build spec for the Phlix terminal (TUI) client — PHP 8.3+, SugarCraft stack.
> For end-user install and setup, see [Console Client](/clients/console).

## Table of Contents

1. [Overview](#_1-overview)
2. [Development Environment](#_2-development-environment)
3. [Project Structure](#_3-project-structure)
4. [Architecture](#_4-architecture)
5. [API Client Implementation](#_5-api-client-implementation)
6. [Rendering Pipeline](#_6-rendering-pipeline)
7. [Screen System](#_7-screen-system)
8. [Testing](#_8-testing)
9. [Building a PHAR](#_9-building-a-phar)
10. [Implementation Checklist](#_10-implementation-checklist)

---

## 1. Overview

### 1.1 Platform Capabilities

The console client renders in any modern terminal using:

- **Graphics protocols**: sixel, kitty, iTerm2 — real image rendering
- **Cell modes**: half-block, quarter-block, ascii, ansi256, truecolor — character-based fallback
- **ANSI escape codes**: cursor control, colors, position

### 1.2 Key Libraries

| Library | Purpose |
|---------|---------|
| `sugarcraft/sugar` | Core TUI framework |
| `sugarcraft/input` | Keyboard/raw input handling |
| `sugarcraft mosaic | Mosaic grid layout |
| `sugarcraft/poster` | Poster image rendering |
| `sugarcraft/video` | Video frame decoding |

---

## 2. Development Environment

### 2.1 Required Software

```
1. PHP 8.3+ (CLI)
2. Composer 2.x
3. Git
4. ffmpeg + ffprobe (video decode)
5. ffplay or mpv (audio playback)
6. A terminal emulator with graphics protocol support:
   - iTerm2 (macOS) — native sixel/iTerm2 support
   - Kitty — native kitty protocol
   - WezTerm — sixel support
   - Windows Terminal — sixel support (Windows 11 22H2+)
```

### 2.2 Project Setup Commands

```bash
# Clone the repository
git clone https://github.com/detain/phlix-console-client.git
cd phlix-console-client

# Install dependencies
composer install

# Verify installation
./bin/phlix doctor
```

---

## 3. Project Structure

```
phlix-console-client/
├── bin/
│   └── phlix                 # CLI entrypoint
├── src/
│   ├── Api/
│   │   ├── ApiClient.php    # Base API client
│   │   └── Admin/
│   │       └── AdminClient.php  # Admin API endpoints
│   ├── Config/
│   │   ├── Config.php       # Application configuration
│   │   ├── TokenStore.php   # Auth token persistence
│   │   ├── ServerEntry.php  # Server configuration entry
│   │   └── TokenBundle.php  # Auth token bundle
│   ├── Console/
│   │   ├── App.php          # Main application
│   │   ├── Capabilities.php # Terminal capability detection
│   │   └── ColorPalette.php # ANSI color handling
│   ├── Media/
│   │   ├── PosterLoader.php  # Poster image loading
│   │   └── MosaicFactory.php # Mosaic grid factory
│   ├── Screen/
│   │   ├── Screen.php       # Base screen interface
│   │   ├── HomeScreen.php   # Home/library rail screen
│   │   ├── GridScreen.php   # Virtualized poster grid
│   │   ├── DetailScreen.php # Media detail view
│   │   ├── PlayerScreen.php # Video player
│   │   └── AdminUsersScreen.php # Admin user management
│   ├── Spike/
│   │   ├── PosterSpike.php  # Poster rendering spike
│   │   └── VideoSpike.php   # Video frame extraction
│   ├── Store/
│   │   ├── AuthStore.php    # Authentication state
│   │   ├── LibrariesStore.php # Libraries cache
│   │   └── MediaStore.php   # Media items cache
│   └── Msg/
│       ├── Msg.php          # Base message
│       ├── NavigateBackMsg.php
│       ├── OpenLibraryMsg.php
│       ├── OpenDetailMsg.php
│       └── ...              # Other messages
├── tests/
│   ├── Unit/
│   └── Integration/
├── docs/
│   └── images/              # Render mode screenshots
├── composer.json
├── phpstan.neon
└── README.md
```

---

## 4. Architecture

### 4.1 Application Flow

```
bin/phlix
  └── buildContainer()    — Build DI container
        └── App::boot()   — Bootstrap application
              └── Program::run() — Main event loop

Event Loop:
  Input → Dispatch → Screen → Render → Output
```

### 4.2 Screen System

Screens implement `Screen` interface and use `ThemedScreen` trait:

```php
interface Screen
{
    public function render(): string;           // Render the screen
    public function handle(Msg $msg): ?Screen;  // Handle a message, return next screen
    public function columns(): int;             // Terminal columns
    public function rows(): int;               // Terminal rows
}
```

### 4.3 Message Passing

Screens communicate via immutable messages:

```php
// Navigate to a library
$navigateMsg = new OpenLibraryMsg($libraryId);

// Open media detail
$detailMsg = new OpenDetailMsg($mediaId);

// Go back
$backMsg = new NavigateBackMsg();
```

---

## 5. API Client Implementation

### 5.1 ApiClient Class

```php
// src/Api/ApiClient.php

class ApiClient
{
    public function __construct(string $serverUrl)
    {
        $this->baseUrl = rtrim($serverUrl, '/');
        $this->token = TokenStore::default()->load()?->accessToken;
    }

    public function request(string $method, string $path, array $body = null): mixed
    {
        $url = $this->baseUrl . '/api/v1' . $path;
        $headers = ['Content-Type: application/json'];

        if ($this->token !== null) {
            $headers[] = 'Authorization: Bearer ' . $this->token;
        }

        // ... HTTP request via cURL
    }

    // Authentication
    public function login(string $username, string $password): array;
    public function logout(): void;

    // Libraries
    public function getLibraries(): array;
    public function getLibraryItems(string $libraryId, array $options = []): array;

    // Media
    public function getItem(string $itemId): array;
    public function getPlaybackInfo(string $itemId): array;
    public function getPoster(string $itemId, int $width = 400): string;

    // User data
    public function updateUserData(string $itemId, array $data): void;
    public function getProgress(string $itemId): ?array;
    public function saveProgress(string $itemId, array $progress): void;

    // Search
    public function search(string $query, array $options = []): array;
}
```

---

## 6. Rendering Pipeline

### 6.1 Mosaic Grid

Posters are rendered in a mosaic grid using `MosaicFactory`:

```php
// Create a mosaic for the poster grid
$mosaic = MosaicFactory::forPosterGrid($mode); // $mode = 'sixel', 'halfblock', etc.

// Render a single poster
$poster = $posterLoader->load($mediaItem, $width, $height);

// Render the grid
$grid = $mosaic->renderGrid($posters, $columns, $rows);
```

### 6.2 Render Modes

```php
// Cell modes (tile as colored text)
halfblock  → 24-bit color half-block characters (▀)
quarterblock → dense color blocks (▘▝▖▗)
ascii      → monochrome character ramp
ansi256    → 256-color character ramp
truecolor  → 24-bit color character ramp

// Graphics modes (real images tiled)
sixel     → Sixel protocol
kitty     → Kitty protocol
iterm2    → iTerm2 inline images
auto      → Half-block by default, graphics on demand
```

### 6.3 Video Frame Extraction

Video frames are decoded via `VideoSpike`:

```php
// Probe a video file
$report = $videoSpike->probeReport($path);
// Returns: duration, resolution, codecs, etc.

// Extract frames
$frames = $videoSpike->frames($path, $count = 1, $cols = 60, $rows = 20, $mode = 'halfblock');
// Yields ANSI-escaped strings for each frame
```

---

## 7. Screen System

### 7.1 Home Screen

The home screen displays library rails:

```
┌─ Phlix ─────────────────────────────────────────────┐
│                                                     │
│  Movies   TV Shows   Music   Audiobooks   Photos   │
│  ████████████████████████████████████████           │
│  [poster] [poster] [poster] [poster] [poster]       │
│                                                     │
│  [poster] [poster] [poster] [poster] [poster]       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 7.2 Grid Screen

Virtualized poster grid with filtering and sorting:

- Scroll handling (↑↓←→, Page Up/Down, Home/End)
- A–Z jump bar
- Filter by genre, year, etc.
- Sort by name, date added, rating

### 7.3 Detail Screen

Media detail with:

- Large hero poster
- Metadata (title, year, rating, duration, synopsis)
- Cast list with ANSI avatars
- Play button and action menu

### 7.4 Player Screen

In-terminal video player:

- Direct play through ffmpeg (HEVC/MKV/AV1 support)
- Scrubber with chapter ticks
- Resume from last position
- Progress reporting to server
- Up-next auto-advance
- On-demand subtitles
- Transcode fallback

---

## 8. Testing

```bash
# Run all tests
composer test

# Run unit tests only
vendor/bin/phpunit --testsuite Unit

# Run with coverage
vendor/bin/phpunit --coverage-html coverage-report/

# Static analysis
composer phpstan
```

---

## 9. Building a PHAR

```bash
# Install box PHAR builder
composer require --dev humbug/box

# Build
./scripts/build-phar.sh

# Output: build/phlix.phar
```

The PHAR is a self-contained executable containing all dependencies.

---

## 10. Implementation Checklist

- [x] C0: Project bootstrap, composer.json, autoloader
- [x] C1: Config/TokenStore, Config::dir(), Config::load()
- [x] C2: ApiClient skeleton + GET /libraries
- [x] C3: HomeScreen with library rails
- [x] C4: GridScreen (virtualized poster grid)
- [x] C5: DetailScreen (hero, metadata, cast)
- [x] C6: PlayerScreen (ffmpeg direct play, scrubber, resume)
- [x] C7: Search, Command Palette, Toasts
- [x] C8: Admin sections (Dashboard, Users, Plugins, etc.)
- [x] C9: Music/Audiobook/Photo/Book browsers
- [x] C10: Polish, theming, Now-Playing bar, metrics HUD
