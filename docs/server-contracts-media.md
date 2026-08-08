# Media API Contract (API v1)

## Overview

This document describes the server contract for the media API, covering authentication, request/response envelope format, and all media-related endpoints.

---

## Authentication

All API endpoints require Bearer token authentication via the `Authorization` header:

```
Authorization: Bearer <token>
```

**Error Response (401 Unauthorized):**
When authentication fails or the session has expired, the server returns:

```json
{
  "success": false,
  "message": "SessionExpiredMsg"
}
```

---

## Envelope Format

All API responses follow a consistent envelope format:

### Success Response

```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response

```json
{
  "success": false,
  "message": "Error description"
}
```

---

## Pagination

List endpoints use a limit/offset pagination pattern:

| Parameter | Type    | Default | Description                     |
|-----------|---------|---------|---------------------------------|
| `limit`   | integer | 100     | Maximum items per page          |
| `offset`  | integer | 0       | Number of items to skip         |

**Example:** `GET /api/v1/users/me/favorites?limit=20&offset=40`

---

## Media Endpoints

### GET /api/v1/media/facets

Returns library facets (genres, years, etc.) across all libraries.

**Source:** `src/Api/ApiClient.php:202`

---

### GET /api/v1/media/facets?library_id={id}

Returns library facets scoped to a specific library.

**Query Parameters:**
| Parameter    | Type    | Description          |
|-------------|---------|----------------------|
| `library_id` | integer | Filter by library ID |

**Source:** `src/Api/ApiClient.php:202`

---

### GET /api/v1/libraries

Returns a list of all libraries accessible to the user.

**Source:** `src/Api/ApiClient.php:202`

---

### GET /api/v1/libraries/{id}

Returns a single library by its ID.

**Path Parameters:**
| Parameter | Type    | Description     |
|-----------|---------|-----------------|
| `id`      | integer | Library ID      |

**Source:** `src/Api/ApiClient.php:202`

---

### GET /api/v1/users/me/favorites

Returns the authenticated user's favorited media with pagination support.

**Query Parameters:**
| Parameter | Type    | Default | Description                |
|-----------|---------|---------|----------------------------|
| `limit`   | integer | 100     | Items per page             |
| `offset`  | integer | 0       | Number of items to skip    |

**Source:** `src/Api/ApiClient.php:202`

---

### POST /api/v1/media/{id}/favorite

Adds a media item to the authenticated user's favorites.

**Path Parameters:**
| Parameter | Type    | Description  |
|-----------|---------|--------------|
| `id`      | integer | Media ID     |

**Source:** `src/Api/ApiClient.php:202`

---

### DELETE /api/v1/media/{id}/favorite

Removes a media item from the authenticated user's favorites.

**Path Parameters:**
| Parameter | Type    | Description  |
|-----------|---------|--------------|
| `id`      | integer | Media ID     |

**Source:** `src/Api/ApiClient.php:202`

---

### POST /api/v1/media/{id}/watched

Marks a media item as watched.

**Path Parameters:**
| Parameter | Type    | Description  |
|-----------|---------|--------------|
| `id`      | integer | Media ID     |

**Source:** `src/Api/ApiClient.php:202`

---

### POST /api/v1/media/{id}/unwatched

Marks a media item as unwatched (removes watched status).

**Path Parameters:**
| Parameter | Type    | Description  |
|-----------|---------|--------------|
| `id`      | integer | Media ID     |

**Source:** `src/Api/ApiClient.php:202`

---

### PUT /api/v1/media/{id}/like

Sets the like level for a media item.

**Path Parameters:**
| Parameter | Type    | Description  |
|-----------|---------|--------------|
| `id`      | integer | Media ID     |

**Request Body:**
```json
{
  "level": 1
}
```

| Field | Type    | Description                            |
|-------|---------|----------------------------------------|
| `level` | integer | Like level (e.g., 0 = none, 1 = like) |

**Source:** `src/Api/ApiClient.php:202`

---

### GET /api/v1/users/me/next-up

Returns the "Continue Watching" rail for the authenticated user.

**Source:** `src/Api/ApiClient.php:202`

---

### GET /api/v1/media/{id}/siblings

Returns siblings of a media item (related items in the same library/season) with pagination.

**Path Parameters:**
| Parameter | Type    | Description  |
|-----------|---------|--------------|
| `id`      | integer | Media ID     |

**Query Parameters:**
| Parameter | Type    | Default | Description                |
|-----------|---------|---------|----------------------------|
| `limit`   | integer | 100     | Items per page             |
| `offset`  | integer | 0       | Number of items to skip    |

**Source:** `src/Api/ApiClient.php:202`

---

### GET /api/v1/media/similar/{id}

Returns similar media items (More Like This) for a given media item.

**Path Parameters:**
| Parameter | Type    | Description  |
|-----------|---------|--------------|
| `id`      | integer | Media ID     |

**Source:** `src/Api/ApiClient.php:202`

---

### GET /api/v1/media/{id}/missing-episodes

Returns a report of missing episodes for a TV series.

**Path Parameters:**
| Parameter | Type    | Description  |
|-----------|---------|--------------|
| `id`      | integer | Media ID     |

**Source:** `src/Api/ApiClient.php:202`

---

### GET /api/v1/media/trickplay/{id}

Returns trickplay sprite URLs for fast-forward thumbnail generation.

**Path Parameters:**
| Parameter | Type    | Description  |
|-----------|---------|--------------|
| `id`      | integer | Media ID     |

**Source:** `src/Api/ApiClient.php:202`

---

### GET /api/v1/media/{id}/playback-info

Returns stream URLs and playback information for a media item.

**Path Parameters:**
| Parameter | Type    | Description  |
|-----------|---------|--------------|
| `id`      | integer | Media ID     |

**Source:** `src/Api/ApiClient.php:202`

---

## Error Handling

All errors follow the standard envelope format:

```json
{
  "success": false,
  "message": "Error description"
}
```

| HTTP Status | Condition                              |
|-------------|----------------------------------------|
| 401         | Missing or invalid authentication token (returns `SessionExpiredMsg`) |
| 400         | Bad request / invalid parameters       |
| 404         | Resource not found                     |
| 500         | Internal server error                  |

---

## Version

This document covers **API v1** endpoints.
