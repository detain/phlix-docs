# Phlix Media Server API Reference

**Phase:** N (End-User Documentation)
**Step:** N.21
**Since:** 0.18.0

## Overview

Phlix exposes a REST API at `/api/v1/` returning JSON. Authentication uses JWT Bearer tokens (except on `/api/v1/auth/*` endpoints, which are unauthenticated). If swagger-php is installed, the full OpenAPI 3.0 spec is auto-generated and available at `/api/v1/openapi.json`. An interactive Swagger UI explorer is at `/api/v1/docs`.

## Auth Endpoints

### POST /api/v1/auth/register

Register a new user account.

**Request body:**
```json
{
  "email": "user@example.com",
  "username": "username",
  "password": "strongpassword123"
}
```

**Response 201:**
```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "username": "username"
  },
  "access_token": "eyJ...",
  "refresh_token": "eyJ..."
}
```

**Response 422:** Validation error (missing fields, weak password, email already in use)

---

### POST /api/v1/auth/login

Authenticate and receive JWT tokens.

**Request body:**
```json
{
  "username": "user@example.com",
  "password": "strongpassword123"
}
```

**Response 200:**
```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "username": "username"
  },
  "access_token": "eyJ...",
  "refresh_token": "eyJ..."
}
```

**Response 401:** Invalid credentials

---

### POST /api/v1/auth/refresh

Refresh an expired access token using a valid refresh token.

**Request body:**
```json
{
  "refresh_token": "eyJ..."
}
```

**Response 200:**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ..."
}
```

**Response 401:** Refresh token expired or invalid

---

## Library Endpoints

### GET /api/v1/libraries

List all configured libraries.

**Auth:** Required (Bearer token)

**Response 200:**
```json
{
  "libraries": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "name": "Movies",
      "type": "movie",
      "path": "/mnt/media/movies",
      "item_count": 342
    }
  ]
}
```

---

### POST /api/v1/libraries

Create a new library.

**Auth:** Required (Bearer token)

**Request body:**
```json
{
  "name": "TV Shows",
  "type": "series",
  "path": "/mnt/media/tv"
}
```

**Response 201:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440002",
  "name": "TV Shows",
  "type": "series",
  "path": "/mnt/media/tv"
}
```

**Response 400:** Missing required fields or invalid type

## Media Endpoints

### GET /api/v1/media/`{id}`

Get a single media item by ID.

**Auth:** Required (Bearer token)

**Parameters:**
- `id` (path) — Media item UUID

**Response 200:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440003",
  "name": "S01E01 - Pilot",
  "type": "episode",
  "path": "/mnt/media/tv/show/s01e01.mkv",
  "duration": 2520,
  "metadata": {
    "title": "Pilot",
    "year": 2020,
    "summary": "The pilot episode..."
  }
}
```

**Response 404:** Media item not found

## Playback Endpoints

### POST /api/v1/sessions/`{id}`/progress

Report playback progress for resume-from-position support.

**Auth:** Required (Bearer token)

**Parameters:**
- `id` (path) — Session ID

**Request body:**
```json
{
  "position_ticks": 1234567,
  "event": "progress"
}
```
- `position_ticks` — Current position in ticks (1 tick = 100 nanoseconds; 1 second = 10,000,000 ticks)
- `event` — One of: `start`, `progress`, `pause`, `complete`

**Response 200:**
```json
{
  "ok": true
}
```

## Session Endpoints

### GET /api/v1/me/sessions

List all active playback sessions for the authenticated user.

**Auth:** Required (Bearer token)

**Response 200:**
```json
{
  "sessions": [
    {
      "id": "sess-001",
      "media_id": "550e8400-e29b-41d4-a716-446655440003",
      "device_name": "Safari on macOS",
      "started_at": "2026-05-19T10:00:00Z",
      "position_ticks": 1234567
    }
  ]
}
```

---

### DELETE /api/v1/sessions/`{id}`

Terminate a specific playback session (e.g., remote control of another device).

**Auth:** Required (Bearer token)

**Parameters:**
- `id` (path) — Session ID

**Response 204:** Session terminated

**Response 404:** Session not found

## Hub Endpoints

### POST /api/v1/server-claims/new

Request a new server claim token from the Hub. Used by the server to initiate the claim flow. This is an unauthenticated bootstrap endpoint — the server proves possession of its Ed25519 keypair, there is no prior session.

**Auth:** None (Ed25519 keypair bootstrap)

**Request body:**
```json
{
  "hub_token": "claim-token-from-hub-ui"
}
```

**Response 201:**
```json
{
  "server_id": "550e8400-e29b-41d4-a716-446655440004",
  "hub_url": "https://hub.phlix.example.com",
  "enrolled": true
}
```

**Response 401:** Invalid or expired hub token

---

### GET /api/v1/me/servers

List all servers enrolled under the authenticated Hub account.

**Auth:** Required (Bearer token)

**Response 200:** Each entry is the `ServerInfoDto` payload from `phlix-shared`.

```json
{
  "servers": [
    {
      "serverId": "550e8400-e29b-41d4-a716-446655440004",
      "userId": "550e8400-e29b-41d4-a716-446655440000",
      "serverName": "Home Server",
      "version": "0.18.0",
      "lastSeenAt": 1747645200,
      "status": "online",
      "hostnameCandidates": ["https://192.168.1.100:32400"],
      "relayActive": true
    }
  ]
}
```

| Field | Type | Notes |
|-------|------|-------|
| `serverId` | string (UUID) | Hub-minted ID. |
| `userId` | string (UUID) | Owner. |
| `serverName` | string | From the original claim. |
| `version` | string | Server semver, refreshed by heartbeat. |
| `lastSeenAt` | int \| null | UNIX seconds; null when the server has never checked in. |
| `status` | string | One of `online`, `offline`, `claiming`, `disabled`. |
| `hostnameCandidates` | string[] | Last-known reachable hostnames. |
| `relayActive` | bool | `true` when a WSS reverse tunnel (entry in `relay_sessions` with `closed_at IS NULL`) is currently open. |

---

### GET /api/v1/me/servers/`{id}`/access-info

Return the best client-access URL for a single server, plus relay state.

**Auth:** Required (Bearer token)

**Response 200:**
```json
{
  "server_id": "550e8400-e29b-41d4-a716-446655440004",
  "direct_url": "https://192.168.1.100:32400",
  "relay_url": null,
  "relay_active": true
}
```

`direct_url` is the first non-empty entry from `hostnameCandidates`. `relay_url` is reserved for the relay-URL form (`https://{subdomain}.phlix.media`) once the relay is fully wired; until then it is `null` and clients should fall back to `direct_url` or initiate a relay tunnel via the `/relay/{server_id}` WebSocket endpoint.

**Response 403:** `{"error":"Forbidden","code":"server.not_owned"}` — token does not own this server.

**Response 404:** `{"error":"Not Found","code":"server.not_found"}` — no such server.

---

### DELETE /api/v1/me/servers/`{id}`

Unbind a claimed server from the authenticated Hub account. Returns 204 on success. Does not uninstall the server software.

**Auth:** Required (Bearer token)

**Response 204:** Empty body.

**Response 403/404:** Same `code` values as `/access-info`.

## Admin Endpoints

### GET /api/v1/admin/users

List all users on the server.

**Auth:** Required (admin Bearer token or API key)

**Response 200:**
```json
{
  "users": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "admin@example.com",
      "username": "admin",
      "role": "admin",
      "created_at": "2026-01-01T00:00:00Z"
    }
  ]
}
```

---

### POST /api/v1/admin/plugins

Install a plugin from a `plugin.json` manifest URL.

**Auth:** Required (admin Bearer token)

**Request body:**
```json
{
  "url": "https://example.com/plugin.json"
}
```

**Response 201:**
```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "enabled": false
}
```

**Response 400:** Invalid plugin manifest or signature

---

### DELETE /api/v1/admin/plugins/`{id}`

Uninstall a plugin by name.

**Auth:** Required (admin Bearer token)

**Parameters:**
- `id` (path) — Plugin name

**Response 204:** Plugin removed

**Response 404:** Plugin not found

## Error Codes

All endpoints may return these standard error codes:

| Code | Meaning |
| --- | --- |
| `400` | Bad request — malformed JSON or missing required fields |
| `401` | Unauthorized — missing or invalid Bearer token |
| `403` | Forbidden — valid token but insufficient permissions |
| `404` | Not found — resource does not exist |
| `422` | Validation error — request body fails validation |
| `500` | Internal server error |

Error response body:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email address is already in use"
  }
}
```

---

## Marker Endpoints

### GET /api/v1/media/`{id}`/markers

Returns all markers (intro, outro, chapters) for a media item.

**Parameters:**
- `id` (path) — Media item ID

**Response 200:**
```json
{
  "intro": {
    "start": 0,
    "end": 90,
    "confidence": 85
  },
  "outro": {
    "start": 2310,
    "end": 2400,
    "confidence": 80
  },
  "chapters": [
    { "start": 0, "end": 90, "title": "Intro" },
    { "start": 90, "end": 300, "title": "Chapter 1" }
  ]
}
```

**Notes:**
- `intro` and `outro` are `null` if no marker is detected
- `chapters` is an empty array if no chapters are defined
- Read from formal marker columns first, falls back to metadata_json candidates

---

### GET /api/v1/media/`{id}`/markers/intro

Returns the intro marker for a media item.

**Parameters:**
- `id` (path) — Media item ID

**Response 200:**
```json
{
  "start": 0,
  "end": 90,
  "confidence": 85
}
```

**Response 404:** Intro marker not found for this media item

---

### GET /api/v1/media/`{id}`/markers/outro

Returns the outro marker for a media item.

**Parameters:**
- `id` (path) — Media item ID

**Response 200:**
```json
{
  "start": 2310,
  "end": 2400,
  "confidence": 80
}
```

**Response 404:** Outro marker not found for this media item

---

### GET /api/v1/shows/`{id}`/markers/bulk

Returns markers for all episodes of a show.

**Parameters:**
- `id` (path) — Show/series media item ID

**Response 200:**
```json
{
  "show_id": "show-123",
  "episodes": [
    {
      "id": "ep-1",
      "name": "Episode 1",
      "markers": {
        "intro": { "start": 0, "end": 90, "confidence": 85 },
        "outro": null,
        "chapters": []
      }
    }
  ]
}
```

**Notes:**
- Episodes are enumerated via `parent_id` relationship
- Introduced in Step F.3 (v0.12.0)

---

## Playback Endpoints

### GET /api/v1/media/`{id}`/playback-info

Returns playback information including stream URL and skip button markers.

**Parameters:**
- `id` (path) — Media item ID

**Response 200:**
```json
{
  "playback_info": {
    "id": "abc123",
    "name": "S1E01 - The Beginning",
    "type": "episode",
    "media_sources": [
      {
        "id": "default",
        "container": "mkv",
        "path": "/mnt/media/shows/show1/s01e01.mkv",
        "direct_play": true
      }
    ],
    "markers": {
      "skip_intro_start": 10,
      "skip_intro_end": 90,
      "skip_outro_start": 2340,
      "skip_outro_end": 2520
    }
  }
}
```

**Fields:**
- `markers.skip_intro_start` (int|null) — Intro start in seconds, null if no intro
- `markers.skip_intro_end` (int|null) — Intro end in seconds, null if no intro
- `markers.skip_outro_start` (int|null) — Outro start in seconds, null if no outro
- `markers.skip_outro_end` (int|null) — Outro end in seconds, null if no outro

**Notes:**
- Clients should show "Skip Intro" button when position is between `skip_intro_start` and `skip_intro_end`
- Clients should show "Skip Outro" button when position is between `skip_outro_start` and `skip_outro_end`
- Clicking a skip button should seek to the corresponding `_end` position
- Marker fields are `null` when no marker is detected
- Introduced in Step F.4 (v0.12.0)

---

## Marker Data Model

### IntroMarker / OutroMarker

| Field | Type | Description |
|-------|------|-------------|
| `start` | int | Start time in seconds |
| `end` | int | End time in seconds |
| `confidence` | int | Detection confidence 0-100 |

### ChapterMarker

| Field | Type | Description |
|-------|------|-------------|
| `start` | int | Chapter start time in seconds |
| `end` | int | Chapter end time in seconds |
| `title` | string\|null | Optional chapter title |

---

## Database Storage

Markers are stored in `media_items` table columns:

- `intro_start_seconds` — INT UNSIGNED NULL
- `intro_end_seconds` — INT UNSIGNED NULL
- `outro_start_seconds` — INT UNSIGNED NULL
- `outro_end_seconds` — INT UNSIGNED NULL
- `chapters_json` — JSON NULL

Before formal column population, markers are cached in `metadata_json` as:
- `intro_candidate` — `{ start_seconds, end_seconds, fingerprint, confidence }`
- `outro_candidate` — `{ start_seconds, end_seconds, fingerprint, confidence }`

Use `MarkerService.promoteCandidates()` to migrate candidates to formal columns.

---

## OPDS Feed Endpoints (Book Library)

OPDS 1.2 compliant feeds for third-party OPDS client integration.

### GET /opds/v1.2

Returns the root OPDS catalog feed.

**Auth:** Required (Bearer token)

**Response 200:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opds="http://opds-spec.org/2010/catalog">
  <title>Phlix Library</title>
  <updated>2024-01-15T10:30:00Z</updated>
  <id>urn:phlix:library:root</id>
  <link rel="self" href="http://localhost:8080/opds/v1.2" type="application/atom+xml;profile=opds-catalog"/>
  <link rel="alternate" href="http://localhost:8080/opds/v1.2/libraries" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
</feed>
```

---

### GET /opds/v1.2/libraries

Returns a navigation feed listing all book libraries.

**Auth:** Required (Bearer token)

**Response 200:** OPDS Atom XML with navigation links to library acquisition feeds.

---

### GET /opds/v1.2/libraries/`{id}`

Returns an acquisition feed listing all books in a library.

**Auth:** Required (Bearer token)

**Parameters:**
- `id` (path) — Library ID
- `offset` (query) — Pagination offset (default: 0)
- `limit` (query) — Maximum items per page (default: 50, max: 100)

**Response 200:** OPDS Atom XML with book entries, pagination links (previous/next).

---

## Book Endpoints

### GET /api/v1/books

Returns a list of all books.

**Auth:** Required (Bearer token)

**Query parameters:**
- `library_id` (optional) — Filter by library
- `limit` (optional) — Maximum items (default: 50)
- `offset` (optional) — Pagination offset (default: 0)

**Response 200:**
```json
{
  "books": [
    {
      "id": "book-123",
      "name": "Book Title",
      "type": "book",
      "path": "/path/to/book.epub",
      "metadata": {
        "title": "Book Title",
        "author": "Author Name"
      }
    }
  ],
  "limit": 50,
  "offset": 0
}
```

---

### GET /api/v1/books/`{id}`

Returns a single book by ID.

**Auth:** Required (Bearer token)

**Parameters:**
- `id` (path) — Book ID

**Response 200:**
```json
{
  "book": {
    "id": "book-123",
    "name": "Book Title",
    "type": "book",
    "path": "/path/to/book.epub",
    "metadata": {}
  }
}
```

**Response 404:** Book not found

---

### GET /api/v1/books/`{id}`/cover

Returns the book's cover image.

**Auth:** Required (Bearer token)

**Parameters:**
- `id` (path) — Book ID

**Response 200:** JPEG/PNG image with appropriate Content-Type header.

**Response 404:** Cover not found or book not found

---

### GET /api/v1/books/`{id}`/read

Returns an HTML reader page for the book.

**Auth:** Required (Bearer token)

**Parameters:**
- `id` (path) — Book ID

**Response 200:** HTML page with embedded book reader.

**Response 404:** Book not found

---

### GET /api/v1/books/`{id}`/download

Returns the book file for download.

**Auth:** Required (Bearer token)

**Parameters:**
- `id` (path) — Book ID

**Response 200:** Book file with Content-Disposition: attachment header.
- EPUB: `application/epub+zip`
- PDF: `application/pdf`
- CBZ: `application/vnd.comicbook+zip`

**Response 404:** File not found

---

## Music Endpoints

Music library browsing with ID3v2/MP4/Vorbis tag harvesting and MusicBrainz metadata enrichment.

### GET /api/v1/music/artists

List all music artists.

**Auth:** Required (Bearer token)

**Query parameters:**
- `limit` (optional) — Maximum items (default: 50)
- `offset` (optional) — Pagination offset (default: 0)

**Response 200:**
```json
{
  "artists": [
    {
      "mbid": "550e8400-e29b-41d4-a716-446655440001",
      "name": "Artist Name",
      "album_count": 5,
      "track_count": 42
    }
  ],
  "limit": 50,
  "offset": 0
}
```

---

### GET /api/v1/music/artists/`{mbid}`

Get artist details with albums.

**Auth:** Required (Bearer token)

**Parameters:**
- `mbid` (path) — MusicBrainz ID for the artist

**Response 200:**
```json
{
  "artist": {
    "mbid": "550e8400-e29b-41d4-a716-446655440001",
    "name": "Artist Name",
    "sort_name": "Artist Name",
    "albums": [
      {
        "mbid": "550e8400-e29b-41d4-a716-446655440002",
        "name": "Album Name",
        "year": 2024,
        "track_count": 10
      }
    ]
  }
}
```

**Response 404:** Artist not found

---

### GET /api/v1/music/albums

List all music albums.

**Auth:** Required (Bearer token)

**Query parameters:**
- `artist_mbid` (optional) — Filter by artist MusicBrainz ID
- `limit` (optional) — Maximum items (default: 50)
- `offset` (optional) — Pagination offset (default: 0)

**Response 200:**
```json
{
  "albums": [
    {
      "mbid": "550e8400-e29b-41d4-a716-446655440002",
      "name": "Album Name",
      "artist_mbid": "550e8400-e29b-41d4-a716-446655440001",
      "artist_name": "Artist Name",
      "year": 2024,
      "track_count": 10
    }
  ],
  "limit": 50,
  "offset": 0
}
```

---

### GET /api/v1/music/albums/`{mbid}`

Get album details with track listing.

**Auth:** Required (Bearer token)

**Parameters:**
- `mbid` (path) — MusicBrainz ID for the album

**Response 200:**
```json
{
  "album": {
    "mbid": "550e8400-e29b-41d4-a716-446655440002",
    "name": "Album Name",
    "artist_mbid": "550e8400-e29b-41d4-a716-446655440001",
    "artist_name": "Artist Name",
    "year": 2024,
    "genre": "Rock",
    "tracks": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440003",
        "title": "Track Title",
        "track_number": 1,
        "duration_secs": 245,
        "path": "/mnt/media/music/Artist/Album/01 - Track Title.flac"
      }
    ]
  }
}
```

**Response 404:** Album not found

---

### GET /api/v1/music/tracks

List all music tracks (paginated).

**Auth:** Required (Bearer token)

**Query parameters:**
- `album_mbid` (optional) — Filter by album MusicBrainz ID
- `artist_mbid` (optional) — Filter by artist MusicBrainz ID
- `limit` (optional) — Maximum items (default: 50)
- `offset` (optional) — Pagination offset (default: 0)

**Response 200:**
```json
{
  "tracks": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440003",
      "title": "Track Title",
      "artist_name": "Artist Name",
      "album_name": "Album Name",
      "track_number": 1,
      "duration_secs": 245
    }
  ],
  "limit": 50,
  "offset": 0
}
```

---

### GET /api/v1/music/tracks/`{id}`

Get single track details.

**Auth:** Required (Bearer token)

**Parameters:**
- `id` (path) — Track ID

**Response 200:**
```json
{
  "track": {
    "id": "550e8400-e29b-41d4-a716-446655440003",
    "title": "Track Title",
    "artist_name": "Artist Name",
    "album_name": "Album Name",
    "track_number": 1,
    "disc_number": 1,
    "duration_secs": 245,
    "bitrate": 1411,
    "sample_rate": 44100,
    "channels": 2,
    "path": "/mnt/media/music/Artist/Album/01 - Track Title.flac",
    "metadata": {
      "title": "Track Title",
      "artist": "Artist Name",
      "album": "Album Name",
      "year": 2024,
      "genre": "Rock"
    }
  }
}
```

**Response 404:** Track not found

---

### GET /api/v1/music/now-playing

Get current playback state.

**Auth:** Required (Bearer token)

**Response 200:**
```json
{
  "now_playing": {
    "track_id": "550e8400-e29b-41d4-a716-446655440003",
    "title": "Track Title",
    "artist_name": "Artist Name",
    "album_name": "Album Name",
    "position_secs": 120,
    "duration_secs": 245,
    "playing": true
  }
}
```

**Notes:**
- Returns `now_playing: null` when nothing is playing
- `position_secs` indicates current playback position
- `playing` is `true` for playing, `false` for paused

---

## Audiobook Endpoints

Chapter-aware audiobook playback with per-user progress tracking.

### GET /api/v1/audiobooks

List all audiobooks.

**Auth:** Required (Bearer token)

**Query parameters:**
- `library_id` (optional) — Filter by library
- `limit` (optional) — Maximum items (default: 50)
- `offset` (optional) — Pagination offset (default: 0)

**Response 200:**
```json
{
  "audiobooks": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "name": "Audiobook Title",
      "author": "Author Name",
      "narrator": "Narrator Name",
      "duration_secs": 36000,
      "chapter_count": 25,
      "progress_percent": 45.5
    }
  ],
  "limit": 50,
  "offset": 0
}
```

---

### GET /api/v1/audiobooks/`{id}`

Get audiobook with chapters.

**Auth:** Required (Bearer token)

**Parameters:**
- `id` (path) — Audiobook ID

**Response 200:**
```json
{
  "audiobook": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "name": "Audiobook Title",
    "author": "Author Name",
    "narrator": "Narrator Name",
    "duration_secs": 36000,
    "chapters": [
      {
        "index": 0,
        "title": "Chapter 1: The Beginning",
        "start_ms": 0,
        "end_ms": 1440000
      }
    ]
  }
}
```

**Response 404:** Audiobook not found

---

### GET /api/v1/audiobooks/`{id}`/chapters

Get chapter list for an audiobook.

**Auth:** Required (Bearer token)

**Parameters:**
- `id` (path) — Audiobook ID

**Response 200:**
```json
{
  "audiobook_id": "550e8400-e29b-41d4-a716-446655440001",
  "chapters": [
    {
      "index": 0,
      "title": "Chapter 1: The Beginning",
      "start_ms": 0,
      "end_ms": 1440000
    },
    {
      "index": 1,
      "title": "Chapter 2: The Journey",
      "start_ms": 1440000,
      "end_ms": 2880000
    }
  ]
}
```

---

### GET /api/v1/audiobooks/`{id}`/progress

Get authenticated user's progress for an audiobook.

**Auth:** Required (Bearer token)

**Parameters:**
- `id` (path) — Audiobook ID

**Response 200:**
```json
{
  "audiobook_id": "550e8400-e29b-41d4-a716-446655440001",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "position_ms": 1800000,
  "current_chapter_index": 1,
  "completed_chapters": [0],
  "percent_complete": 5.0,
  "last_played_at": 1747645200
}
```

**Response 404:** No progress found for this user/audiobook combination

---

### POST /api/v1/audiobooks/`{id}`/progress

Save playback progress for the authenticated user.

**Auth:** Required (Bearer token)

**Parameters:**
- `id` (path) — Audiobook ID

**Request body:**
```json
{
  "position_ms": 1800000,
  "current_chapter_index": 1
}
```

**Response 200:**
```json
{
  "ok": true,
  "percent_complete": 5.0
}
```

**Notes:**
- Progress is saved every 10 seconds during playback
- `position_ms` is the current position within the chapter (milliseconds)
- `current_chapter_index` is 0-based

---

### GET /api/v1/audiobooks/`{id}`/read

Returns an HTML player page for the audiobook.

**Auth:** Required (Bearer token)

**Parameters:**
- `id` (path) — Audiobook ID

**Response 200:** HTML page with embedded audiobook player.

**Response 404:** Audiobook not found

---

### GET /api/v1/audiobooks/`{id}`/stream

Stream audiobook file directly as raw bytes. Supports HTTP Range requests for seeking and resume.

**Auth:** Required (Bearer token)

**Parameters:**
- `id` (path) — Audiobook ID

**Request headers (optional):**
- `Range` — Byte range request (e.g., `bytes=1000-5000`). Returns 206 Partial Content.

**Response 200:**
- **Content-Type:** Detected from file extension (`audio/mp4`, `audio/mpeg`, `audio/aac`, etc.)
- **Accept-Ranges:** `bytes`
- **Content-Length:** Total file size in bytes

**Response 206 (Partial Content):**
- **Content-Type:** Detected from file extension
- **Content-Range:** `bytes {start}-{end}/{total}`
- **Content-Length:** Bytes served in this range

**Response 403:** Path validation failed (invalid path traversal attempt)

**Response 404:** Audiobook not found

**Example range request:**
```
GET /api/v1/audiobooks/550e8400-e29b-41d4-a716-446655440001/stream
Range: bytes=1000-5000
```

**Example response headers (200):**
```
Accept-Ranges: bytes
Content-Length: 36000000
Content-Type: audio/mp4
```

**Example response headers (206):**
```
Accept-Ranges: bytes
Content-Range: bytes 1000-5000/36000000
Content-Length: 4001
Content-Type: audio/mp4
```

**Notes:**
- Returns raw audio bytes, not base64-encoded data
- Supports M4B, M4A, MP3, AAC, OGG, FLAC, WAV formats
- MIME type detected from file extension
- Path validation prevents directory traversal attacks
- Clients should send `Range` header for seeking/resume support

---

## Photo Endpoints

Photo browsing with EXIF metadata extraction, album organization, and slideshow functionality.

### GET /api/v1/photo/albums

List all photo albums (grouped by date taken).

**Auth:** Required (Bearer token)

**Query parameters:**
- `limit` (optional) — Maximum items (default: 50)
- `offset` (optional) — Pagination offset (default: 0)

**Response 200:**
```json
{
  "albums": [
    {
      "id": "album-2024-05-15",
      "date": "2024-05-15",
      "photo_count": 42,
      "cover_photo": {
        "id": "550e8400-e29b-41d4-a716-446655440001",
        "thumbnail_url": "/api/v1/photo/photos/550e8400-e29b-41d4-a716-446655440001/thumbnail?w=300&h=300&fit=cover"
      }
    }
  ],
  "limit": 50,
  "offset": 0
}
```

---

### GET /api/v1/photo/albums/`{id}`

Get specific album with photos.

**Auth:** Required (Bearer token)

**Parameters:**
- `id` (path) — Album ID (date string in YYYY-MM-DD format)

**Response 200:**
```json
{
  "album": {
    "id": "album-2024-05-15",
    "date": "2024-05-15",
    "photos": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440001",
        "name": "IMG_0001.jpg",
        "width": 4032,
        "height": 3024,
        "date_taken_unix": 1715784000,
        "thumbnail_url": "/api/v1/photo/photos/550e8400-e29b-41d4-a716-446655440001/thumbnail?w=300&h=300&fit=cover"
      }
    ]
  }
}
```

**Response 404:** Album not found

---

### GET /api/v1/photo/photos

List all photos.

**Auth:** Required (Bearer token)

**Query parameters:**
- `album_id` (optional) — Filter by album
- `limit` (optional) — Maximum items (default: 50)
- `offset` (optional) — Pagination offset (default: 0)

**Response 200:**
```json
{
  "photos": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "name": "IMG_0001.jpg",
      "width": 4032,
      "height": 3024,
      "date_taken_unix": 1715784000,
      "thumbnail_url": "/api/v1/photo/photos/550e8400-e29b-41d4-a716-446655440001/thumbnail?w=300&h=300&fit=cover"
    }
  ],
  "limit": 50,
  "offset": 0
}
```

---

### GET /api/v1/photo/photos/`{id}`

Get photo with full EXIF data.

**Auth:** Required (Bearer token)

**Parameters:**
- `id` (path) — Photo ID

**Response 200:**
```json
{
  "photo": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "name": "IMG_0001.jpg",
    "path": "/mnt/media/photos/2024-05-15/IMG_0001.jpg",
    "width": 4032,
    "height": 3024,
    "date_taken_unix": 1715784000,
    "exif": {
      "camera_make": "Apple",
      "camera_model": "iPhone 15 Pro",
      "lens": "iPhone 15 Pro back camera 6.765mm f/1.78",
      "aperture": "f/1.78",
      "iso": 100,
      "shutter_speed": "1/1234",
      "focal_length": "6.765mm",
      "gps_lat": 37.7749,
      "gps_lng": -122.4194,
      "gps_alt": 10.5
    }
  }
}
```

**Response 404:** Photo not found

---

### GET /api/v1/photo/photos/`{id}`/thumbnail

Get resized thumbnail.

**Auth:** Required (Bearer token)

**Parameters:**
- `id` (path) — Photo ID
- `w` (query, optional) — Width in pixels (default: 300)
- `h` (query, optional) — Height in pixels (default: 300)
- `fit` (query, optional) — Fit mode: `cover` (crop to fill, default) or `contain` (letterbox)

**Response 200:** JPEG image with appropriate Content-Type header.

**Response 404:** Photo not found

**Notes:**
- Thumbnails are generated on-demand using PHP's GD library
- Served with `Cache-Control: public, max-age=86400` (1 day)

---

### GET /api/v1/photo/photos/`{id}`/full

Get full-resolution photo.

**Auth:** Required (Bearer token)

**Parameters:**
- `id` (path) — Photo ID

**Response 200:** Original image file (JPEG/PNG/TIFF/WebP/HEIC) with appropriate Content-Type header.

**Response 404:** Photo not found

**Notes:**
- Served with `Cache-Control: public, max-age=31536000` (1 year)
- HEIC/HEIF format requires ImageMagick extension; returns 500 if unavailable

---

### GET /api/v1/photo/slideshow

Get slideshow data for an album.

**Auth:** Required (Bearer token)

**Query parameters:**
- `album_id` (optional) — Album ID; if omitted, uses most recent album
- `interval` (query, optional) — Seconds between slides (default: 5)

**Response 200:**
```json
{
  "slideshow": {
    "album_id": "album-2024-05-15",
    "interval": 5,
    "photos": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440001",
        "full_url": "/api/v1/photo/photos/550e8400-e29b-41d4-a716-446655440001/full",
        "thumbnail_url": "/api/v1/photo/photos/550e8400-e29b-41d4-a716-446655440001/thumbnail?w=300&h=300",
        "caption": "Apple iPhone 15 Pro - 2024-05-15"
      }
    ]
  }
}
```

**Notes:**
- Returns photos in chronological order
- Caption shows camera info and date taken
