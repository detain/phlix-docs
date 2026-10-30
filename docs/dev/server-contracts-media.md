---
title: Media API Contract
description: Request and response contract for the media/user-facing API v1 endpoints (auth, shapes, pagination, endpoints)
---

# Media API Contract (API v1)

## Overview

This document describes the server contract for the media API, covering authentication, response shapes, and the media-related endpoints. It is the user-facing contract: the admin console API (`/api/v1/admin/*`) is documented separately, and the canonical machine-readable source of truth is the server's `openapi.yaml` (mirrored by the `@phlix/contracts` package).

---

## Authentication

Authenticated endpoints require a Bearer token via the `Authorization` header:

```http
Authorization: Bearer <token>
```

**Error Response (401 Unauthorized):**
When the token is missing or invalid, the auth middleware responds:

```json
{
  "error": "Unauthorized",
  "code": "auth.required"
}
```

(Some handlers do their own identity check and return the shorter
`{"error": "Unauthorized"}` form; treat `error` as the message and `code` —
when present — as the stable machine-readable identifier.)

---

## Response Shapes

There is **no universal `{success, data}` envelope on the user-facing API**.
Shapes are raw JSON per endpoint:

- **List endpoints** return the page object directly, e.g.
  `{"items": [...], "limit": 50, "offset": 0}`.
- **Mutations** return a small acknowledgement object, e.g.
  `{"message": "Added to favorites"}`.
- **Errors** return `{"error": "Human-readable message"}` plus a stable
  `code` where one exists in the error-code registry.

The `{success, ...}` style you may have seen documented here previously is
limited to parts of the **admin console API** (`/api/v1/admin/*`); it is not
the media-API contract.

---

## Pagination

List endpoints use a limit/offset pagination pattern:

| Parameter | Type    | Default | Description                     |
|-----------|---------|---------|---------------------------------|
| `limit`   | integer | 50      | Maximum items per page (clamped server-side) |
| `offset`  | integer | 0       | Number of items to skip         |

**Example:** `GET /api/v1/users/me/favorites?limit=20&offset=40`

---

## Media Endpoints

### GET /api/v1/media/facets

Returns library facets (genres, years, etc.) across all libraries.

**Handler:** registered on `Phlix\Server\WebPortal\WebPortalRouter` (`src/Server/WebPortal/WebPortalRouter.php`).

---

### GET /api/v1/media/facets?library_id={id} {#get-media-facets-library-id}

Returns library facets scoped to a specific library.

**Query Parameters:**
| Parameter    | Type    | Description          |
|-------------|---------|----------------------|
| `library_id` | integer | Filter by library ID |

**Handler:** registered on `Phlix\Server\WebPortal\WebPortalRouter` (`src/Server/WebPortal/WebPortalRouter.php`).

---

### GET /api/v1/libraries

Returns a list of all libraries accessible to the user.

**Handler:** registered on `Phlix\Server\WebPortal\WebPortalRouter` (`src/Server/WebPortal/WebPortalRouter.php`).

---

### GET /api/v1/libraries/{id} {#get-library-by-id}

Returns a single library by its ID.

**Path Parameters:**
| Parameter | Type    | Description     |
|-----------|---------|-----------------|
| `id`      | integer | Library ID      |

**Handler:** registered on `Phlix\Server\WebPortal\WebPortalRouter` (`src/Server/WebPortal/WebPortalRouter.php`).

---

### GET /api/v1/users/me/favorites

Returns the authenticated user's favorited media with pagination support.

**Query Parameters:**
| Parameter | Type    | Default | Description                |
|-----------|---------|---------|----------------------------|
| `limit`   | integer | 50      | Items per page             |
| `offset`  | integer | 0       | Number of items to skip    |

**Handler:** registered on `Phlix\Server\WebPortal\WebPortalRouter` (`src/Server/WebPortal/WebPortalRouter.php`).

---

### POST /api/v1/media/{id}/favorite {#add-media-favorite}

Adds a media item to the authenticated user's favorites.

**Path Parameters:**
| Parameter | Type    | Description  |
|-----------|---------|--------------|
| `id`      | integer | Media ID     |

**Handler:** registered on `Phlix\Server\WebPortal\WebPortalRouter` (`src/Server/WebPortal/WebPortalRouter.php`).

---

### DELETE /api/v1/media/{id}/favorite {#remove-media-favorite}

Removes a media item from the authenticated user's favorites.

**Path Parameters:**
| Parameter | Type    | Description  |
|-----------|---------|--------------|
| `id`      | integer | Media ID     |

**Handler:** registered on `Phlix\Server\WebPortal\WebPortalRouter` (`src/Server/WebPortal/WebPortalRouter.php`).

---

### POST /api/v1/media/{id}/watched {#mark-media-watched}

Marks a media item as watched.

**Path Parameters:**
| Parameter | Type    | Description  |
|-----------|---------|--------------|
| `id`      | integer | Media ID     |

**Handler:** registered on `Phlix\Server\WebPortal\WebPortalRouter` (`src/Server/WebPortal/WebPortalRouter.php`).

---

### POST /api/v1/media/{id}/unwatched {#mark-media-unwatched}

Marks a media item as unwatched (removes watched status).

**Path Parameters:**
| Parameter | Type    | Description  |
|-----------|---------|--------------|
| `id`      | integer | Media ID     |

**Handler:** registered on `Phlix\Server\WebPortal\WebPortalRouter` (`src/Server/WebPortal/WebPortalRouter.php`).

---

### PUT /api/v1/media/{id}/like {#set-media-like}

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

**Handler:** registered on `Phlix\Server\WebPortal\WebPortalRouter` (`src/Server/WebPortal/WebPortalRouter.php`).

---

### GET /api/v1/users/me/next-up

Returns the "Continue Watching" rail for the authenticated user.

**Handler:** registered on `Phlix\Server\WebPortal\WebPortalRouter` (`src/Server/WebPortal/WebPortalRouter.php`).

---

### GET /api/v1/media/{id}/similar {#get-media-similar}

Returns similar media items (More Like This) for a given media item.

**Path Parameters:**
| Parameter | Type    | Description  |
|-----------|---------|--------------|
| `id`      | integer | Media ID     |

**Handler:** registered on `Phlix\Server\WebPortal\WebPortalRouter` (`src/Server/WebPortal/WebPortalRouter.php`).

---

### GET /api/v1/media/{id}/missing-episodes {#get-media-missing-episodes}

Returns a report of missing episodes for a TV series.

**Path Parameters:**
| Parameter | Type    | Description  |
|-----------|---------|--------------|
| `id`      | integer | Media ID     |

**Handler:** registered in `Phlix\Server\Core\Application` route loading (`src/Server/Core/Application.php`).

---

### GET /api/v1/media/{id}/trickplay {#get-media-trickplay}

Returns trickplay sprite URLs for fast-forward thumbnail generation.

**Path Parameters:**
| Parameter | Type    | Description  |
|-----------|---------|--------------|
| `id`      | integer | Media ID     |

**Handler:** registered in `Phlix\Server\Core\Application` route loading (`src/Server/Core/Application.php`).

---

### GET /api/v1/media/{id}/playback-info {#get-media-playback-info}

Returns stream URLs and playback information for a media item.

**Path Parameters:**
| Parameter | Type    | Description  |
|-----------|---------|--------------|
| `id`      | integer | Media ID     |

**Handler:** registered in `Phlix\Server\Core\Application` route loading (`src/Server/Core/Application.php`).

---

## Error Handling

Errors on the user-facing API are flat JSON objects:

```json
{
  "error": "Human-readable message",
  "code": "stable.identifier"
}
```

The `code` key accompanies most (not all) error responses; the values come from
the shared error-code registry (see the references below).

| HTTP Status | Condition                              |
|-------------|----------------------------------------|
| 401         | Missing or invalid authentication token (`auth.required`) |
| 400         | Bad request / invalid parameters       |
| 404         | Resource not found                     |
| 503         | Feature not configured on this server (e.g. favorites) |
| 500         | Internal server error                  |

---

## Version

This document covers **API v1** (`/api/v1/...`) endpoints. The canonical,
complete surface is the server's `openapi.yaml`; this page is an orientation
document for the media/user subset.

## See Also

- [API Reference](/reference/api.md) — how the reference material is organized
- [Arr API Clients](/dev/arr-clients) — machine clients of the same surface
