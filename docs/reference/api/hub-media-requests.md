# Media Requests API Reference

Base URL: `/api/v1`

All endpoints return JSON. User endpoints require a valid bearer token.
Admin endpoints additionally require the authenticated user to have `is_admin = true`.

## Request Object

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "7a2c3b4d-5e6f-7890-abcd-ef1234567890",
  "type": "movie",
  "tmdb_id": 550,
  "title": "Fight Club",
  "poster_url": "https://image.tmdb.org/t/p/w500/...",
  "season": null,
  "episode": null,
  "status": "pending",
  "rejection_reason": null,
  "created_at": "2026-05-23T10:00:00+00:00",
  "updated_at": "2026-03-23T10:00:00+00:00"
}
```

| Field | Type | Description |
|---|---|---|
| `id` | `string` | UUID of the request. |
| `user_id` | `string` | UUID of the user who submitted the request. |
| `type` | `string` | `"movie"` or `"series"`. |
| `tmdb_id` | `integer` | TheMovieDB ID for the requested title. |
| `title` | `string` | Display title of the requested media. |
| `poster_url` | `string\|null` | Optional poster image URL. |
| `season` | `integer\|null` | Season number (series only). |
| `episode` | `integer\|null` | Episode number (series only). |
| `status` | `string` | One of `pending`, `approved`, `available`, `rejected`. |
| `rejection_reason` | `string\|null` | Present when status is `rejected`. |
| `created_at` | `string` | ISO 8601 creation timestamp. |
| `updated_at` | `string` | ISO 8601 last-update timestamp. |

---

## Endpoints

### Create Media Request

Submits a new media request for the authenticated user.

**Endpoint:** `POST /api/v1/me/requests`

**Headers:**
- `Authorization: Bearer <token>` (required)
- `Content-Type: application/json`

**Request Body:**
```json
{
  "type": "movie",
  "tmdb_id": 550,
  "title": "Fight Club",
  "poster_url": "https://image.tmdb.org/t/p/w500/...",
  "season": null,
  "episode": null
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `string` | Yes | `"movie"` or `"series"`. |
| `tmdb_id` | `integer` | Yes | Positive TMDB ID. |
| `title` | `string` | Yes | Display title. |
| `poster_url` | `string\|null` | No | Poster image URL. |
| `season` | `integer\|null` | No | Season number (required for series type). |
| `episode` | `integer\|null` | No | Episode number (required for series type). |

**Response (201):**
```json
{
  "request": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "7a2c3b4d-5e6f-7890-abcd-ef1234567890",
    "type": "movie",
    "tmdb_id": 550,
    "title": "Fight Club",
    "poster_url": "https://image.tmdb.org/t/p/w500/...",
    "season": null,
    "episode": null,
    "status": "pending",
    "rejection_reason": null,
    "created_at": "2026-05-23T10:00:00+00:00",
    "updated_at": "2026-05-23T10:00:00+00:00"
  },
  "message": "Request created successfully."
}
```

**Error Response (400):**
```json
{
  "error": "Bad Request",
  "code": "invalid_type",
  "message": "type must be \"movie\" or \"series\""
}
```

```json
{
  "error": "Bad Request",
  "code": "invalid_tmdb_id",
  "message": "tmdb_id must be a positive integer"
}
```

```json
{
  "error": "Bad Request",
  "code": "missing_title",
  "message": "title is required"
}
```

**Error Response (401):**
```json
{
  "error": "Unauthorized",
  "code": "auth.required"
}
```

---

### List My Requests

Returns all requests belonging to the authenticated user. Supports filtering by status via query parameter.

**Endpoint:** `GET /api/v1/me/requests`

**Headers:**
- `Authorization: Bearer <token>` (required)

**Query Parameters:**
- `status` (optional): `pending` | `available` | all (default: all statuses)

**Response (200):**
```json
{
  "requests": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "user_id": "7a2c3b4d-5e6f-7890-abcd-ef1234567890",
      "type": "movie",
      "tmdb_id": 550,
      "title": "Fight Club",
      "poster_url": "https://image.tmdb.org/t/p/w500/...",
      "season": null,
      "episode": null,
      "status": "available",
      "rejection_reason": null,
      "created_at": "2026-05-23T10:00:00+00:00",
      "updated_at": "2026-05-23T12:30:00+00:00"
    }
  ],
  "count": 1
}
```

---

### Get My Request

Returns a single request by ID, scoped to the authenticated user.

**Endpoint:** `GET /api/v1/me/requests/{id}`

**Headers:**
- `Authorization: Bearer <token>` (required)

**Path Parameters:**
- `id`: Request UUID

**Response (200):**
```json
{
  "request": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "7a2c3b4d-5e6f-7890-abcd-ef1234567890",
    "type": "movie",
    "tmdb_id": 550,
    "title": "Fight Club",
    "poster_url": "https://image.tmdb.org/t/p/w500/...",
    "season": null,
    "episode": null,
    "status": "pending",
    "rejection_reason": null,
    "created_at": "2026-05-23T10:00:00+00:00",
    "updated_at": "2026-05-23T10:00:00+00:00"
  }
}
```

**Error Response (403):**
```json
{
  "error": "Forbidden",
  "code": "not_request_owner"
}
```

**Error Response (404):**
```json
{
  "error": "Not Found",
  "code": "request_not_found"
}
```

---

### Delete My Request

Deletes one of the authenticated user's own requests. Only `pending` requests can be safely deleted.

**Endpoint:** `DELETE /api/v1/me/requests/{id}`

**Headers:**
- `Authorization: Bearer <token>` (required)

**Path Parameters:**
- `id`: Request UUID

**Response (204):** No body.

**Error Response (403):**
```json
{
  "error": "Forbidden",
  "code": "not_request_owner"
}
```

**Error Response (404):**
```json
{
  "error": "Not Found",
  "code": "request_not_found"
}
```

---

### Admin: List Requests

Returns requests for admin review. Defaults to pending-only.

**Endpoint:** `GET /api/v1/admin/requests`

**Headers:**
- `Authorization: Bearer <token>` (required, admin only)

**Query Parameters:**
- `status` (optional): `pending` | `available` | `all` (default: `pending`)

**Response (200):**
```json
{
  "requests": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "user_id": "7a2c3b4d-5e6f-7890-abcd-ef1234567890",
      "type": "movie",
      "tmdb_id": 550,
      "title": "Fight Club",
      "poster_url": "https://image.tmdb.org/t/p/w500/...",
      "season": null,
      "episode": null,
      "status": "pending",
      "rejection_reason": null,
      "created_at": "2026-05-23T10:00:00+00:00",
      "updated_at": "2026-05-23T10:00:00+00:00"
    }
  ],
  "count": 1
}
```

**Error Response (403):**
```json
{
  "error": "Forbidden",
  "code": "admin_required"
}
```

---

### Admin: Approve Request

Approves a pending request. On success, the hub calls Radarr (movie) or Sonarr (series) with the TMDB ID and transitions the request status to `approved`.

**Endpoint:** `POST /api/v1/admin/requests/{id}/approve`

**Headers:**
- `Authorization: Bearer <token>` (required, admin only)

**Path Parameters:**
- `id`: Request UUID

**Response (200):**
```json
{
  "message": "Request approved successfully.",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Error Response (404):**
```json
{
  "error": "Not Found",
  "code": "request_not_found"
}
```

**Error Response (500):**
```json
{
  "error": "Internal Server Error",
  "code": "approve_failed",
  "message": "Failed to approve. Check Radarr/Sonarr configuration."
}
```

---

### Admin: Deny Request

Denies a pending request with an optional reason. Transitions the request status to `rejected` and notifies the requesting user.

**Endpoint:** `POST /api/v1/admin/requests/{id}/deny`

**Headers:**
- `Authorization: Bearer <token>` (required, admin only)
- `Content-Type: application/json`

**Path Parameters:**
- `id`: Request UUID

**Request Body:**
```json
{
  "reason": "Content policy violation"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `reason` | `string` | No | Human-readable rejection reason. |

**Response (200):**
```json
{
  "message": "Request denied successfully.",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Error Response (404):**
```json
{
  "error": "Not Found",
  "code": "request_not_found"
}
```

**Error Response (500):**
```json
{
  "error": "Internal Server Error",
  "code": "deny_failed"
}
```

---

## Error Codes

| Code | HTTP Status | Description |
|---|---|---|
| `auth.required` | 401 | Missing or invalid bearer token. |
| `admin_required` | 403 | User is not an administrator. |
| `not_request_owner` | 403 | User does not own this request. |
| `request_not_found` | 404 | Request ID does not exist. |
| `invalid_type` | 400 | `type` must be `"movie"` or `"series"`. |
| `invalid_tmdb_id` | 400 | `tmdb_id` must be a positive integer. |
| `missing_title` | 400 | `title` is required. |
| `approve_failed` | 500 | Radarr/Sonarr not reachable or rejected the add. |
| `deny_failed` | 500 | Database update failed. |

---

## Request Lifecycle

```
pending  ──approve──▶  approved  ──import──▶  available
    │
    └──deny──▶  rejected
```

- A user can only see and manage their own requests via `/me/requests` endpoints.
- Only admins can view the full queue and approve/deny via `/admin/requests` endpoints.
- Once a request is `approved` or `rejected`, it cannot be modified.
- The `available` status is set by the hub when Arr reports the title has been imported. This may require a separate polling or webhook integration depending on the deployment.