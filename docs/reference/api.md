# Phlix Media Server API Reference

**Since:** 0.18.0

## Overview

Phlix exposes a REST API at `/api/v1/` returning JSON. Authentication uses JWT Bearer tokens (except on `/api/v1/auth/*` endpoints, which are unauthenticated). The API is documented by this hand-maintained reference page; there is no auto-generated OpenAPI spec or interactive API explorer at this time.

> **Future work:** A machine-readable OpenAPI specification may be provided in a future release. It is not available today.

## Auth Endpoints

> **Rate limiting (SV-4.15).** `register`, `refresh`, and the WebAuthn login
> `start`/`finish` endpoints (and the public JWKS endpoint) are rate-limited per
> surface. Over-limit requests return **`429 Too Many Requests`** with a
> `Retry-After` header and body `{"error":"Too Many Requests","code":"rate_limited"}`.
> Limits are tunable via `RATE_LIMIT_*` and keyed on the real client IP — set
> `TRUSTED_PROXIES` behind a proxy. See
> [Auth rate limiting](/reference/env-vars#auth-rate-limiting-sv-4-15) and
> [Security hardening](/security/hardening#_11-auth-rate-limiting-built-in).

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

List all configured libraries, ordered by `display_order` then name. The SPA
Browse home renders one rail per library in this order (and the media server's
nav renders one Browse link per library — see below).

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

**Movie-library option — `autoCollections`:** movie libraries accept an optional
`autoCollections` field (a bare boolean, or `{ "enabled": bool }`) at the body top
level — or nested in `options` — that gates the scanner's TMDB box-set
auto-collection generation. It is normalised to `{ "enabled": bool }`, stored in the
library's `options` blob, and **defaults to enabled when absent**. The same field is
accepted on the library update (`PUT /api/v1/libraries/{id}`), where it is merged into
the existing options. Every library object returned by `GET /api/v1/libraries` carries
the effective value under a top-level `auto_collections: { "enabled": bool }` block.
See [Auto-generated collections](../admin/library-management#auto-generated-collections-movie-libraries).

---

### POST /api/v1/libraries/`{id}`/scan

Enqueue an **incremental** scan of a library. As of Phase 1.1b the scan runs
**asynchronously** — this endpoint queues a job and returns immediately; a
background worker performs the scan. Poll `GET .../scan-status` for progress.

**Auth:** Admin (Bearer token) — `401` unauthenticated, `403` non-admin

**Response 202:**
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440099",
  "status": "queued",
  "message": "Library scan queued"
}
```

**Response 404:** Library not found

---

### POST /api/v1/libraries/`{id}`/rescan

Enqueue a **full rescan** (purge + rescan). Same contract as `scan` with a
`rescan`-typed job and the message `"Library rescan queued"`.

**Auth:** Admin (Bearer token)

**Response 202:**
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440100",
  "status": "queued",
  "message": "Library rescan queued"
}
```

**Response 404:** Library not found

---

### GET /api/v1/libraries/`{id}`/scan-status

Return the **latest** scan job for the library, or `null` when it has never been
scanned (still a `200`). The endpoint is type-agnostic (`scan`, `rescan`, and
`metadata`/match jobs all report onto the same row). For `movie`/`series`/`video`
libraries the job streams **live per-file progress**: `items_found` is the total
media-file count and `items_updated` the processed count (`items_updated /
items_found` is the percentage), with `current_path` the file being processed.
`items_added`/`items_removed` are not streamed (stay `0`); the specialised
music/photo/book/audiobook scanners stay coarse (`status` is the live signal).

**Auth:** Admin (Bearer token)

**Response 200:**
```json
{
  "scan_status": {
    "id": "550e8400-e29b-41d4-a716-446655440099",
    "library_id": "550e8400-e29b-41d4-a716-446655440001",
    "type": "scan",
    "status": "running",
    "items_found": 1280,
    "items_added": 0,
    "items_updated": 432,
    "items_removed": 0,
    "current_path": "/media/movies/Action/Heat (1995)/Heat.mkv",
    "error": null,
    "queued_at": "2026-05-27 12:00:00",
    "started_at": "2026-05-27 12:00:05",
    "completed_at": null
  }
}
```

**Response 404:** Library not found

---

### GET /api/v1/libraries/`{id}`/scan-history

Return recent scan jobs for the library, **newest first**. `limit` defaults to
`20` and is clamped to `[1, 100]`. Each entry has the same shape as the
`scan_status` job row.

**Query Parameters:** `limit` (optional, default `20`, clamped `1`–`100`)

**Auth:** Admin (Bearer token)

**Response 200:**
```json
{
  "history": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440099",
      "type": "scan",
      "status": "completed",
      "queued_at": "2026-05-27 12:00:00",
      "completed_at": "2026-05-27 12:03:11"
    }
  ]
}
```

**Response 404:** Library not found

## Media Endpoints

### GET /api/v1/media

List media items across all libraries, or scoped to a single library. This is the
endpoint that backs the SPA Browse rails and the per-library Browse grid.

**Auth:** Required (Bearer token)

**Query parameters** (all optional):

| Parameter | Type | Notes |
| --- | --- | --- |
| `libraryId` | UUID | Scope results **and** `total` to a single library. Absent or blank = all libraries (the default — unchanged). |
| `parentId` | UUID | Scope to the **direct children** of one item — the seasons/episodes of a series (or the episodes of a season). Drives the series detail drill-down. Mutually exclusive with `topLevel`. |
| `topLevel` | `1`/`true` | Return only **top-level** items (those with no parent: movies + series), excluding seasons and episodes. Browse rails and library grids set this so a series library shows shows, not a flat dump of every episode. Ignored when `search` is set (so search still spans the whole library). Mutually exclusive with `parentId`. |
| `search` | string | Free-text title match. |
| `genres[]` | string[] | Filter by one or more genres. |
| `yearFrom` / `yearTo` | int | Release-year range. |
| `ratings[]` | string[] | Filter by one or more content ratings. |
| `actors[]` | string[] | Filter by one or more cast members. |
| `sort` | string | Sort field (e.g. `name`, `year`, `added`). |
| `order` | string | `asc` or `desc`. |
| `limit` / `offset` | int | Pagination window (`limit` is capped at 100). |

**Response 200:**
```json
{
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440003",
      "name": "The Matrix",
      "type": "movie",
      "poster_url": null,
      "genres": ["Action", "Sci-Fi"],
      "year": 1999,
      "rating": "R",
      "runtime": 8160,
      "overview": "A hacker learns the truth...",
      "actors": ["Keanu Reeves"],
      "director": "The Wachowskis",
      "parent_id": null,
      "season_number": null,
      "episode_number": null,
      "episode_title": null,
      "created_at": "2026-01-01T00:00:00+00:00",
      "updated_at": "2026-01-02T00:00:00+00:00"
    }
  ],
  "total": 342
}
```

When `libraryId` is supplied, `total` reflects the count **within that one
library** (used to drive per-library pagination on `/app/library/:id`).

#### Series hierarchy fields

Every item carries the series→season→episode hierarchy (all `null` for flat
content such as movies):

| Field | Type | Notes |
| --- | --- | --- |
| `type` | string | `movie` · `series` · `season` · `episode` · `audio` · `image`. `series`/`season`/`episode` form the TV/anime tree. |
| `parent_id` | UUID \| null | Parent item (episode → season → series). `null` for top-level items (movies, series). |
| `season_number` | int \| null | Season this item belongs to (from metadata). Season `0` / a `null` number on a series episode = **Specials**. |
| `episode_number` | int \| null | Episode number within its season; orders episodes. |
| `episode_title` | string \| null | Per-episode title, distinct from `name` (which may be the series name). |

**Drilling into a series.** The SPA shows series libraries as a list of shows
(`topLevel=1`); opening a series fetches its tree:

```http
GET /api/v1/media?parentId=<seriesId>&limit=100
```

Episodes are grouped client-side by `season_number` (Specials last) and ordered
by `episode_number`. When a server models seasons as their own `type: "season"`
rows, the client fetches each season's children (`parentId=<seasonId>`) and
flattens them, so grouping is uniformly by `season_number` either way.

---

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
  },
  "user_data": {
    "favorite": false,
    "rating": null,
    "like_level": 0
  }
}
```

The **`user_data`** block is **add-only** and per-user (account-level, keyed on
`user_id` — not per-profile). It is present only on this single-item detail
response (and on the favorites list below); browse/list rows do not carry it.

- `favorite` (`boolean`) — whether the current user has favorited the item.
- `rating` (`int 1-10 | null`) — the current user's personal rating (`null` when unset).
- `like_level` (`int 0-3`) — the current user's multi-level "Love" value
  (`0` = not loved … `3` = most loved). **Since:** 0.57.0.

`user_data` is `null` when the request is unauthenticated; when authenticated
with no stored row it defaults to `{ "favorite": false, "rating": null, "like_level": 0 }`.

**Response 404:** Media item not found

---

### GET /api/v1/media/most-watched

The **Most Watched** rail — the media items most-watched across the **whole
server**. This is a **global "trending"** list (server-wide popularity), **not a
per-user history**: every signed-in user sees the same list. It reuses the same
all-time, cross-user aggregate the admin **Top Media** report reads, ordered by
play count (descending). Playback events are counted from the finish signal
(`POST /api/v1/sessions/{id}/complete`) and progress reporting.

**Auth:** Required (Bearer token) — same audience as `GET /api/v1/media`.

**Query parameters:**
- `limit` (optional) — number of items to return. Default `20`, clamped to a hard
  ceiling of `100`.

**Response 200:**
```json
{
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440003",
      "name": "The Popular One",
      "type": "movie",
      "poster_url": "https://…"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

Items are shaped exactly like `GET /api/v1/media` (poster/artwork signed URLs are
re-minted at response time and the `type` is the item's real media type).
Since-deleted items are silently dropped, so the rail never references a missing
row. `offset` is always `0` (this is a fixed top-N rail, not a paginated list) and
`total` reflects the number of returned items.

> The endpoint is available for any client to render a Most Watched row. Wiring it
> into the web home screen as a visible rail is a separate, forthcoming step; until
> then this endpoint can be consumed directly.

## User Item Data Endpoints

Per-user favorites, personal ratings, and the multi-level **Love** value for any
media item. All routes require authentication (Bearer token). Favorites/ratings/Love
are **account-level** (keyed on `user_id`, like user settings) — **not per-profile**.
Each write returns a `{ "message": "..." }` envelope.

> **Hub relay caveat:** when a server is browsed through the hub's relay proxy,
> these **write** endpoints degrade — the relay proxy allowlists `GET`/`HEAD` only,
> so `POST .../favorite` returns `403 proxy.scope_denied` and `PUT .../like` +
> `DELETE .../favorite` are not routed. Favorites and Love writes only persist over
> a **direct** session to the server. Tracked as phlix-hub issue
> [#122](https://github.com/detain/phlix-hub/issues/122).

### POST /api/v1/media/`{id}`/favorite

Mark a media item as one of the current user's favorites.

**Auth:** Required · **Body:** none · **Response 200:** `{ "message": "Added to favorites" }`

### DELETE /api/v1/media/`{id}`/favorite

Remove a media item from the current user's favorites.

**Auth:** Required · **Body:** none · **Response 200:** `{ "message": "Removed from favorites" }`

### PUT /api/v1/media/`{id}`/rating

Set the current user's personal rating for the item.

**Auth:** Required

**Body:**
```json
{ "rating": 8 }
```
- `rating` (`int 1-10 | null`) — `null` clears the rating.

**Response 200:** `{ "message": "Rating saved" }`
**Response 400:** non-numeric or out-of-range rating
**Response 404:** media item not found

### DELETE /api/v1/media/`{id}`/rating

Clear the current user's personal rating.

**Auth:** Required · **Body:** none · **Response 200:** `{ "message": "Rating saved" }`

### PUT /api/v1/media/`{id}`/like

Set the current user's multi-level **Love** value for the item.

**Since:** 0.57.0

**Auth:** Required

**Body:**
```json
{ "level": 2 }
```
- `level` (`int 0-3`, **required**) — `0` = not loved … `3` = most loved. The
  `level` field is required (there is no "clear" / null branch — set `0` to unset).
  The 0-3 range is enforced in PHP (no DB `CHECK` constraint), and `like_level` is a
  **separate axis** from `favorite` (boolean) and `rating` (1-10).

**Response 200:** `{ "message": "Love level saved" }`
**Response 400:** missing/non-integer `level`, or a value outside `0-3`
**Response 401:** unauthenticated
**Response 404:** media item not found

### GET /api/v1/users/me/favorites

List the current user's favorited items.

**Auth:** Required

**Query parameters:**
- `limit` (optional) — clamped to `1-100` (default `50`).
- `offset` (optional) — floored at `0` (default `0`).

**Response 200:**
```json
{
  "items": [ /* shaped media items, each with a `user_data` block */ ],
  "limit": 50,
  "offset": 0
}
```
Each item carries the same add-only `user_data: { favorite, rating, like_level }`
block as the detail response (with `favorite: true`). The response has **no `total`**
field (unlike the browse list).

---

### GET /api/v1/users/me/continue-watching

_Also available as **`GET /api/v1/me/continue-watching`** — the same handler
(`PlaybackController::getContinueWatching`) backs both routes and returns the
identical shape._

List media items the current user has started but not finished (the **Continue
Watching** rail on the home screen). Items with `percent_complete >= 95` are
excluded — they are considered finished. The same title watched across several
sessions/devices is de-duplicated to a single row (the most recently updated) via
a `ROW_NUMBER()` window before the limit is applied.

> **How an item leaves this rail.** Besides crossing the 95% threshold, a title
> also drops out the moment the player sends the explicit finish signal
> ([`POST /api/v1/sessions/{id}/complete`](#post-api-v1-sessions-id-complete)) — the
> web SPA player and mini-player fire this automatically on the media `ended`
> event, so a fully-watched title clears itself with no manual "mark watched"
> step. **Native clients (Roku, mobile, Tizen, Windows) do not yet send this
> signal**, so a title finished on those clients may linger until it independently
> crosses 95% on a progress tick. This is a tracked follow-up.

**Auth:** Required

**Response 200:**

Each entry is a **shaped media item** (produced by `MediaItemShaper::shape()`,
the same shape the `/app` SPA `MediaCard` and console clients render), with
playback-progress fields re-attached at the top level. Top-level `id` is the
**media item id** (not the playback-state id), so it navigates directly to the
detail page. For **episodes**, `poster_url` / `poster_srcset` resolve to the
**series** poster (falling back to the season poster, then the episode's own
poster) rather than the TMDB still frame, so the rail shows real cover art.

```json
{
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440003",
      "name": "Attack on Titan",
      "type": "episode",
      "poster_url": "https://image.tmdb.org/t/p/w500/series-poster.jpg",
      "poster_srcset": "https://.../w342/series-poster.jpg 342w, https://.../w500/series-poster.jpg 500w",
      "runtime": 24,
      "year": 2023,
      "genres": ["Animation", "Action"],
      "rating": "TV-MA",
      "parent_id": "season-uuid",
      "season_number": 4,
      "episode_number": 75,
      "episode_title": "Sparks",
      "created_at": "2026-01-01T00:00:00+00:00",
      "updated_at": "2026-01-02T00:00:00+00:00",
      "media_item_id": "550e8400-e29b-41d4-a716-446655440003",
      "position_ticks": 4200000000,
      "duration_ticks": 14400000000,
      "metadata": { "poster_url": "https://image.tmdb.org/t/p/w500/series-poster.jpg", "...": "..." }
    }
  ]
}
```

The response is a bare `{ "items": [...] }` object — there is **no** `limit`,
`offset`, or `total` field. Key fields:

| Field | Notes |
| --- | --- |
| `id` | Media item id (top level). Equals `media_item_id`. Use for detail navigation. |
| `poster_url` | Series poster for episodes (resolved before shaping); fallback season → own poster. |
| `poster_srcset` | Responsive `srcset` string when an `ArtworkStorage` cache exists (SV-3.4). |
| `runtime` | Runtime in **minutes** (from metadata). |
| `year`, `rating`, `genres` | Standard shaped fields (`rating` = official/content rating). |
| `parent_id` | Parent container id — the **season** for episodes. |
| `position_ticks` | Raw playback position in ticks (re-attached; the SPA `useResumeSync` reads this). |
| `duration_ticks` | Raw total duration in ticks (re-attached). |
| `media_item_id` | Media item id; the rating gate filters on this key, and the console `fromContinueWatching` mapper reads it. |
| `metadata` | Full metadata map, preserved (episode entries carry the resolved series `poster_url`). |

> The account-level rating gate is applied per active profile: over-cap titles
> (by effective rating) are dropped, keyed on `media_item_id`.

> **Up Next for series.** When an episode is completed, the next episode in the
> series is automatically surfaced at the top of Continue Watching (if it exists
> and is available). See [Recommendations & Discovery → Up Next](../advanced/recommendations.md#up-next).

### GET /api/v1/users/me/next-up

The **Next Up** rail — a sibling to Continue Watching. Where Continue Watching
lists the _in-progress_ items you can resume, Next Up lists, **for each series you
have started, the single next episode to play**: the fresh episode to begin next
rather than one already part-watched. It is the classic Plex/Jellyfin "Next Up"
row.

**Auth:** Required

**Query parameters:**
- `limit` (optional) — number of series to return a next episode for. Default `20`,
  clamped to `1-50`. (Internally the server scans up to `max(limit × 3, 50)` of the
  most-recently-touched started series so a run of finished series does not starve
  the rail; the returned list is still capped at `limit`.)

**How the next episode is chosen.** For each series the profile has started
(most-recently watched series first), the server looks at the profile's playback
history for that series and picks one episode:

- An **in-progress** episode (playing/paused, between 0% and 95% of its duration)
  resumes _that_ episode.
- A **finished** episode (stopped at position 0, or watched to ≥95% of its
  duration) advances to the **next numbered episode**, rolling into the next
  numbered season when the current season is exhausted.
- A series whose episodes are **all watched** yields **no entry** (nothing is left
  to play next).
- Only **numbered seasons** are walked — Specials / season-less content are
  excluded from the ordering.

The watched/in-progress signal comes **only** from playback state (the same source
the live Continue Watching rail reads) — the manual "mark watched" flag and the
legacy watch-history table are deliberately not consulted. Results pass the active
profile's parental **rating gate**: over-cap episodes (by effective rating) are
dropped for a gated profile, while the account owner sees the unfiltered list.

**Response 200:**

Each entry is a **shaped media item** (produced by `MediaItemShaper::shape()`, the
same shape Continue Watching returns), so S37's home rail can render it identically.
For episodes, `poster_url` / `poster_srcset` resolve to the **series** poster
(falling back to the season poster, then the episode's own poster). Because a
Next-Up pick is a fresh episode, `position_ticks` and `duration_ticks` are always
`0`. Two extra keys carry the series context so the rail can label
"Next Up: _\<Series\>_ S02E01".

```json
{
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440007",
      "name": "The Wolf and the Lion",
      "type": "episode",
      "poster_url": "https://image.tmdb.org/t/p/w500/series-poster.jpg",
      "poster_srcset": "https://.../w342/series-poster.jpg 342w, https://.../w500/series-poster.jpg 500w",
      "runtime": 55,
      "year": 2011,
      "genres": ["Drama", "Fantasy"],
      "rating": "TV-MA",
      "parent_id": "season-uuid",
      "season_number": 1,
      "episode_number": 5,
      "episode_title": "The Wolf and the Lion",
      "created_at": "2026-01-01T00:00:00+00:00",
      "updated_at": "2026-01-02T00:00:00+00:00",
      "media_item_id": "550e8400-e29b-41d4-a716-446655440007",
      "position_ticks": 0,
      "duration_ticks": 0,
      "series_id": "series-uuid",
      "series_name": "Game of Thrones",
      "metadata": { "poster_url": "https://image.tmdb.org/t/p/w500/series-poster.jpg", "...": "..." }
    }
  ]
}
```

The response is a bare `{ "items": [...] }` object — there is **no** `limit`,
`offset`, or `total` field. In addition to every field the Continue Watching item
carries, Next Up adds:

| Field | Notes |
| --- | --- |
| `series_id` | Id of the parent **series** the episode belongs to. |
| `series_name` | Display name of the parent series (for the rail label). |
| `position_ticks` | Always `0` — a Next-Up pick is a fresh episode, not a resume. |
| `duration_ticks` | Always `0` for the same reason. |
| `media_item_id` | The episode's media item id; the rating gate filters on this key. |

**Response (no active profile):** `200` with an empty list — `{ "items": [] }`.

**Response 401:** unauthenticated (no Bearer token).

**Response 503:** the watch-history service is not configured on this server.

## Transcoding Endpoints

Files the browser can't direct-play (non-web containers like MKV, or codecs like
HEVC) are transcoded on demand to **HLS** and played via hls.js. The flow is:
`POST .../transcode` → poll `GET /api/v1/transcode/{jobId}/status` until
`playlist_ready` → play `master_url` (served by the HLS routes below).

> **Client capability negotiation (SV-3.3).** Clients may send an
> `X-Phlix-Client-Capabilities` request header — a JSON codec-support map
> (e.g. `{"eac3":false}`) — on playback-info requests. When present, the
> server's `direct_play` verdict is set from whether the client can decode the
> item's audio codec (a client that can't decode the audio is steered to
> transcode); an absent/empty/malformed header keeps the prior always-`true`
> behavior. See [Player Quality & Audio → Client Capability Negotiation](/player/player-quality-audio#client-capability-negotiation).

### POST /api/v1/media/`{id}`/transcode

Start (or reuse) an on-demand HLS transcode job for a media item. Idempotent: a
still-valid job for the same item + profile is reused instead of starting a
second FFmpeg. The encode runs detached, so this returns immediately.

**Parameters:**
- `id` (path) — Media item UUID
- `profile` (query, optional) — Device profile: `web` (default), `generic`,
  `mobile-low`, `mobile-high`, `tv-4k`. Controls the max resolution the variant
  is downscaled to.

**Response 200:**
```json
{
  "job_id": "1f2e3d4c-....",
  "master_url": "/hls/1f2e3d4c-..../master.m3u8",
  "hls_url": "/hls/1f2e3d4c-..../master.m3u8",
  "status": "running",
  "reused": false
}
```

The on-demand pipeline currently produces **HLS only** — a multi-variant ABR
ladder played via hls.js (or native HLS on Safari/iOS). It does **not** emit a
DASH manifest, so the response no longer includes a `dash_url` (removed in
updates.md #11 / S11: the advertised `/dash/{job}/manifest.mpd` is never written
and always 404'd). Real DASH output is tracked for a later milestone
(updates.md #57 / S56-S60).

**Response 404:** Media item not found
**Response 503:** Maximum concurrent transcodes reached (retry shortly)

### GET /api/v1/transcode/`{jobId}`/status

Report a transcode job's readiness — used by the client to poll until the first
HLS segments exist, then start playback.

**Parameters:**
- `jobId` (path) — Transcode job UUID

**Response 200:**
```json
{
  "job_id": "1f2e3d4c-....",
  "status": "running",
  "segments": 3,
  "playlist_ready": true,
  "progress": 3.0,
  "master_url": "/hls/1f2e3d4c-..../master.m3u8"
}
```

`status` is one of `running`, `completed`, `failed`, `cancelled`. Begin playback
once `playlist_ready` is `true` (or `status` is `completed`).

**Response 404:** Job not found

### HLS delivery routes

Served from the transcoded HLS output on disk (no auth header is required,
mirroring direct play, so a `<video>` / hls.js request works):

| Endpoint | Description |
|----------|-------------|
| `GET /hls/{jobId}/master.m3u8` | HLS master playlist (multi-variant ABR ladder) |
| `GET /hls/{jobId}/{file}` | HLS media playlist / segment (`media_v{rung}.m3u8`, `seg-v{rung}-NNNNN.ts`) |

> **DASH is not currently available.** The `/dash/{jobId}/manifest.mpd` and
> `/dash/{jobId}/{file}` routes are registered but the on-demand transcode
> pipeline does not populate a DASH job directory (it emits HLS only), so those
> routes return `404` today. The DASH server code is reserved for real DASH
> support tracked as updates.md #57 / S56-S60. Do not rely on a DASH manifest URL.

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

---

### POST /api/v1/sessions/`{id}`/complete

Explicit **playback-finished** signal. Progress ticks alone only ever leave a
session in a `playing`/`paused` state, so a finished title would otherwise linger
in Continue Watching and its watch-time stats would never finalize. A client
player POSTs here when the media reaches its natural end (or is deliberately
stopped) to run the server-side finalize path: the item is removed from Continue
Watching and its `duration_seconds` + playback-stats event are finalized (feeding
Top Users watch time and the [Most Watched](#get-api-v1-media-most-watched) rail).

**Auth:** Required (Bearer token) — the authenticated user must own the session
(same posture as `POST .../progress`).

**Parameters:**
- `id` (path) — Session ID (from `POST /api/v1/sessions`)

**Request body:**
```json
{
  "media_item_id": "550e8400-e29b-41d4-a716-446655440003",
  "reached_end": true
}
```
- `media_item_id` (string, **required**) — the media item that just finished.
- `reached_end` (bool, optional, default `true`):
  - `true` — mark the item **watched**: the `playback_state` row is set to
    `stopped` with `position_ticks = 0`, the item leaves Continue Watching, and the
    stats event is recorded as completed.
  - `false` — clear the resume point: the `playback_state` row is deleted and the
    stats event is recorded as not completed (also removes the item from Continue
    Watching).

**Response 200:**
```json
{
  "message": "Playback completed",
  "reached_end": true
}
```

**Response 400:** `{"error": "Missing required field: media_item_id"}`
**Response 403:** `{"error": "Forbidden"}` — the session belongs to another user
**Response 404:** `{"error": "Session not found"}`

::: tip Which clients send this today
The web SPA sends this automatically: both the full player and the persistent
mini-player POST `/complete` (with `reached_end: true`) on the browser `ended`
event, so a title watched to the end in the web app leaves Continue Watching on
its own. **Native clients (Roku, mobile, Tizen, Windows) do not call this endpoint
yet** — titles finished on those clients will still linger in Continue Watching and
will not finalize watch-time until each client is updated to POST `/complete`.
This is a tracked follow-up.
:::

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

Initiate the claim flow. Called by the **server** (not the user) to start pairing — it is an unauthenticated bootstrap endpoint (the server has no JWT yet) but requires the protocol header `Accept-Phlix-Protocol: v1`. The request body is a `Phlix\Shared\Hub\ClaimRequest` (camelCase); the response is a `ClaimResponse` carrying a short human-readable claim code the user then redeems. See [Hub architecture → Pairing protocol](../dev/architecture-hub.md#pairing-protocol-internals) for the full flow and DTO shapes.

**Auth:** None — but `Accept-Phlix-Protocol: v1` is required (400 `HUB_PROTOCOL_UNSUPPORTED` otherwise).

**Request body** (`ClaimRequest`):
```json
{
  "serverName": "Alice's NAS",
  "version": "0.18.0",
  "publicKeysJwk": { "keys": [{ "kty": "OKP", "crv": "Ed25519", "x": "...", "kid": "..." }] },
  "hostnameCandidates": ["nas.alice.com", "192.168.1.100"],
  "protocolVersion": "v1"
}
```

| Field | Type | Notes |
|-------|------|-------|
| `serverName` | string | Operator-chosen friendly name. |
| `version` | string | Server semver. |
| `publicKeysJwk` | object | JWKS the server publishes for hub-minted token validation. |
| `hostnameCandidates` | string[] | Hostnames/IPs the server thinks it is reachable at. |
| `protocolVersion` | string | Spec version — `"v1"`. |

**Response 200** (`ClaimResponse`):
```json
{
  "claimCode": "ABCD-1234",
  "expiresIn": 600,
  "claimId": "550e8400-e29b-41d4-a716-446655440009",
  "hubBaseUrl": "https://hub.phlix.example.com"
}
```

| Field | Type | Notes |
|-------|------|-------|
| `claimCode` | string | Short human code the user pastes in the SPA to redeem. |
| `expiresIn` | int | Seconds the claim code is valid (default 600). |
| `claimId` | string (UUID) | Opaque token the server stores so it can poll claim status. |
| `hubBaseUrl` | string | Where the server should send heartbeats once enrolled. |

**Response 400:** `HUB_PROTOCOL_UNSUPPORTED` (missing/wrong protocol header) or malformed `ClaimRequest`.

---

### GET /api/v1/server-claims/`{claimId}`

Poll claim status. Called by the **server** while it waits for the user to redeem the code; public, because the server still has no JWT — the `claimId` UUID is itself the bearer secret. A `claimed` response returns the one-time enrollment material (the Ed25519 enrollment JWT + the hub JWKS URL).

**Auth:** None (the unguessable `claimId` in the path is the secret). `Accept-Phlix-Protocol: v1` required.

**Parameters:**
- `claimId` (path) — the UUID returned by `/server-claims/new`.

---

### POST /api/v1/server-claims/claim

Redeem a claim code. Called by the **user** from the SPA (**My Servers**, `/app/servers`) to bind a pending server to their account. This is the only step in the pairing flow that requires user auth.

**Auth:** Required (Bearer token). `Accept-Phlix-Protocol: v1` required.

**Request body:**
```json
{
  "claim_code": "ABCD-1234"
}
```

**Response 200:**
```json
{
  "enrollment_jwt": "eyJ...",
  "hub_jwks_url": "https://hub.phlix.example.com/.well-known/jwks.json",
  "server_id": "550e8400-e29b-41d4-a716-446655440004"
}
```

**Response 404 / 410 / 409:** `CLAIM_CODE_NOT_FOUND` / `CLAIM_CODE_EXPIRED` / `CLAIM_CODE_ALREADY_CLAIMED`.

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

## Admin Endpoints (media server)

> **Scope:** the endpoints in this section are served by the **media server** (`phlix-server`). The **hub** exposes a different `/api/v1/admin/*` surface — see [Hub admin API](#hub-admin-api) below. The hub has no plugin subsystem, so the `/admin/plugins` endpoints are server-only.

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

---

### GET /api/v1/admin/libraries/`{id}`/duplicates

Preview the **duplicate groups** in one library. The server pages the library's
top-level items, buckets them by a canonical key (separator/year/external-id
normalized), and returns only the groups with two or more members (singletons
excluded). An empty library — or one with no duplicates — returns `{ "groups": [] }`
(`200`, not `404`).

**Auth:** Required (admin Bearer token). `401` unauthenticated, `403` non-admin.

**Parameters:**
- `id` (path) — Library UUID.

**Response 200:**
```json
{
  "groups": [
    {
      "canonical_key": "hunterexhunter",
      "type": "series",
      "library_id": "550e8400-e29b-41d4-a716-446655440001",
      "primary":    { "id": "…", "title": "Hunter x Hunter", "descendant_count": 100 },
      "duplicates": [ { "id": "…", "title": "Hunter.x.Hunter", "descendant_count": 1 } ]
    }
  ]
}
```

The **primary** is the group member with the most descendants (ties broken by
smaller id); the rest are **duplicates**. `descendant_count` lets the UI show how
many seasons/episodes (or none, for a movie) hang off each row.

---

### POST /api/v1/admin/media/merge

Apply a merge: collapse the duplicates into the primary. For a **series**, episodes
are re-parented onto the primary's matching season (re-parent-before-delete), then
the empty duplicate season/series shells are deleted. For a **movie**, richer
metadata is gap-filled onto the primary (add-only — non-empty primary fields are
never overwritten) and the duplicate row is deleted. The whole operation runs inside
one real DB transaction.

**Auth:** Required (admin Bearer token). `401` unauthenticated, `403` non-admin.

**Request body:**
```json
{
  "primary_id": "550e8400-…",
  "duplicate_ids": ["…", "…"]
}
```

**Response 200:**
```json
{ "moved": 1, "deleted": 2 }
```

- `moved` — number of children re-parented onto the primary.
- `deleted` — number of empty shell / duplicate rows removed.

**Errors:**
- `400` — `primary_id` empty/missing, `duplicate_ids` not a non-empty array, a
  self-merge (primary id listed in `duplicate_ids`), or a duplicate that is in a
  **different library** or of a **different type** than the primary.
- `404` — primary item not found.
- `503` — the merge is unavailable because no transaction-capable database
  connection is bound (the read-only `…/duplicates` preview is unaffected).

This is the backend for the admin SPA **Duplicates** page; the same merge logic is
exposed offline as the [`scripts/dedup-series.php`](./cli#php-scripts-dedup-series-php-library-id-dry-run-apply)
CLI.

---

### GET /api/v1/admin/metadata/sources

List the metadata **source names** available for the per-media-type priority editor:
the built-ins plus any enabled metadata-provider plugin's registered source name.

**Auth:** Required (admin Bearer token). `401` unauthenticated, `403` non-admin.

**Response 200:**
```json
{ "sources": ["tmdb", "imdb", "tvdb", "fanart", "local", "anidb", "myanimelist"] }
```

The built-ins (`tmdb`, `imdb`, `tvdb`, `fanart`, `local`) are listed first in a
stable order, followed by any extra plugin source names from the live
`SourceRegistry` (registered when a metadata-provider plugin is enabled, deregistered
on disable). Names are de-duplicated, so a plugin re-using a built-in name does not
appear twice. This feeds the [Metadata source priority](../admin/server-settings#metadata-source-priority-metadata-provider-priority)
editor.

## Hub admin API

> **Scope:** these endpoints are served by the **hub** (`phlix-hub`), not the media server. They are the JSON backend for the hub's gated Admin console (the Vue SPA at `/app/admin/*`). All routes are gated by **auth + admin** middleware (`401` when unauthenticated, `403` when authenticated but not an admin). The first user to register is auto-promoted to admin.

The hub admin API is mounted under `/api/v1/admin/*`. Most read shapes follow the `{ success, data: … }` envelope used by the shared `@phlix/ui` admin pages.

### Logs

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/admin/logs` | List the hub's log files. |
| `GET` | `/api/v1/admin/logs/tail` | Tail a single log file. |
| `GET` | `/api/v1/admin/logs/tail-all` | Tail all log files merged into one chronological stream. |

### Settings

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/admin/settings` | Read effective hub settings. |
| `PUT` | `/api/v1/admin/settings` | Persist hub setting overrides. |

### Users

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/admin/users` | List users. |
| `POST` | `/api/v1/admin/users` | Create a user. |
| `GET` | `/api/v1/admin/users/{id}` | Get one user. |
| `PUT` | `/api/v1/admin/users/{id}` | Update a user. |
| `DELETE` | `/api/v1/admin/users/{id}` | Delete a user. |
| `POST` | `/api/v1/admin/users/{id}/set-admin` | Grant/revoke admin. |
| `POST` | `/api/v1/admin/users/{id}/reset-password` | Reset a user's password. |
| `GET` | `/api/v1/admin/users/{id}/profiles` | Per-user profiles — always returns `[]` on the hub (no profiles subsystem; present for SPA parity). |
| `GET` | `/api/v1/admin/users/{id}/bandwidth` | Read a user's current-period relay usage + caps (includes `throttle_bps`). |
| `PUT` | `/api/v1/admin/users/{id}/quota` | Set a user's monthly byte caps + concurrent-stream cap (`0` = unlimited). |
| `PUT` | `/api/v1/admin/users/{id}/throttle` | Set a user's durable relay bandwidth throttle (`throttle_bps`; `0` = Unlimited). |

> The per-user relay **bandwidth** endpoints above (`/bandwidth`, `/quota`, `/throttle`) plus the
> self endpoint `GET /api/v1/me/bandwidth` are documented in full — bodies, allow-listed throttle
> levels, `0` = Unlimited semantics, and the durable-vs-monthly distinction — in
> [Relay Tuning](../hub-admin/relay-tuning#per-user-bandwidth-quotas-concurrent-stream-cap).

### Dashboard

#### GET /api/v1/admin/dashboard/summary

Hub-scoped headline counters, aggregated from existing tables.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "servers": { "total": 12, "online": 9, "offline": 3 },
    "active_relay_sessions": 4,
    "pending_requests": 2,
    "user_count": 37
  }
}
```

#### GET /api/v1/admin/dashboard/activity?limit=

Recent audit events as the dashboard activity feed. `limit` caps the number of rows returned.

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440010",
      "action": "login_success",
      "actor": "admin@example.com",
      "target": "user:550e8400-…",
      "created_at": "2026-06-04T12:00:00Z"
    }
  ]
}
```

### Media requests

The hub also exposes an admin queue for member media requests at `/api/v1/admin/requests` (list) plus `/{id}/approve` and `/{id}/deny`. These are documented in full, with the member-facing `/api/v1/me/requests` surface, in [Hub media requests](./api/hub-media-requests.md).

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
