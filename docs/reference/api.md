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

### GET /api/v1/media/{id}

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

### GET /api/v1/playback/{id}/stream

Get an HLS stream URL for a media item. Returns `404` if the item is not found, `403` if the user has no access.

**Auth:** Required (Bearer token)

**Parameters:**
- `id` (path) — Media item UUID

**Response 200:**
```json
{
  "stream_url": "/hls/550e8400-e29b-41d4-a716-446655440003/master.m3u8",
  "expires_in": 3600
}
```

**Response 404:** Media item not found

---

### POST /api/v1/playback/{id}/progress

Report playback progress for resume-from-position support.

**Auth:** Required (Bearer token)

**Parameters:**
- `id` (path) — Media item UUID

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

### GET /api/v1/sessions

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

### DELETE /api/v1/sessions/{id}

Terminate a specific playback session (e.g., remote control of another device).

**Auth:** Required (Bearer token)

**Parameters:**
- `id` (path) — Session ID

**Response 204:** Session terminated

**Response 404:** Session not found

## Hub Endpoints

### POST /api/v1/server-claims/new

Request a new server claim token from the Hub. Used by the server to initiate the claim flow.

**Auth:** Required (Bearer token)

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

**Response 200:**
```json
{
  "servers": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440004",
      "name": "Home Server",
      "version": "0.18.0",
      "claimed": true,
      "last_seen": "2026-05-19T09:00:00Z"
    }
  ]
}
```

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

### DELETE /api/v1/admin/plugins/{id}

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

### GET /api/v1/media/{id}/markers

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

### GET /api/v1/media/{id}/markers/intro

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

### GET /api/v1/media/{id}/markers/outro

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

### GET /api/v1/shows/{id}/markers/bulk

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

### GET /api/v1/media/{id}/playback

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

### GET /opds/v1.2/libraries

Returns a navigation feed listing all book libraries.

**Response 200:** OPDS Atom XML with navigation links to library acquisition feeds.

### GET /opds/v1.2/libraries/{id}

Returns an acquisition feed listing all books in a library.

**Parameters:**
- `id` (path) — Library ID
- `offset` (query) — Pagination offset (default: 0)
- `limit` (query) — Maximum items per page (default: 50, max: 100)

**Response 200:** OPDS Atom XML with book entries, pagination links (previous/next).

---

## Book Endpoints

### GET /books

Returns a list of all books.

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

### GET /books/{id}

Returns a single book by ID.

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

### GET /books/{id}/cover

Returns the book's cover image.

**Response 200:** JPEG/PNG image with appropriate Content-Type header.

**Response 404:** Cover not found or book not found

### GET /books/{id}/download

Returns the book file for download.

**Response 200:** Book file with Content-Disposition: attachment header.
- EPUB: `application/epub+zip`
- PDF: `application/pdf`
- CBZ: `application/vnd.comicbook+zip`

**Response 404:** File not found
