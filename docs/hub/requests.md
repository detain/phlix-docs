# Media Requests (Radarr / Sonarr Integration)

## TL;DR

Hub's media request system lets users request movies and TV shows through a Jellyseerr-class UI. When an admin approves a request, the hub automatically adds the title to Radarr (movies) or Sonarr (series) for download and import into the library.

---

## 1. Overview

The request system bridges three components:

```
User submits request
       │
       ▼
 Hub stores request (status: pending)
       │
 Admin approves ──── or ──── Admin denies
       │                        │
       ▼                        ▼
 Radarr/Sonarr API         Hub marks rejected
 called with TMDB id      (user notified)
       │
       ▼
 Hub marks approved
 (user notified)
       │
       ▼
 Arr imports title → library
       │
       ▼
 Hub marks available
 (user notified)
```

### Request statuses

| Status | Meaning |
|---|---|
| `pending` | Submitted, awaiting admin review |
| `approved` | Approved and sent to Radarr/Sonarr |
| `available` | Arr has imported the title to the library |
| `rejected` | Denied by an admin (with optional reason) |

---

## 2. Configuration

### Environment variables

Radarr and Sonarr are configured via environment variables on the Hub. See [Hub environment variables](../reference/env-vars.md#hub--arr-integration) for the full list.

| Variable | Required | Default | Description |
|---|---|---|---|
| `HUB_RADARR_URL` | Yes | `http://localhost:7878` | Radarr instance base URL |
| `HUB_RADARR_API_KEY` | Yes | — | Radarr API key |
| `HUB_RADARR_ENABLED` | No | `0` | Set to `1` to enable Radarr integration |
| `HUB_SONARR_URL` | Yes | `http://localhost:8989` | Sonarr instance base URL |
| `HUB_SONARR_API_KEY` | Yes | — | Sonarr API key |
| `HUB_SONARR_ENABLED` | No | `0` | Set to `1` to enable Sonarr integration |

> **Prerequisite:** Radarr or Sonarr must be running and reachable from the Hub host. The Hub uses the Arr API (v3) to add titles and query quality profiles and root folders.

### Generating API keys

**Radarr:**
1. Log into Radarr → **Settings → General**
2. Under **Security**, copy the **API Key**

**Sonarr:**
1. Log into Sonarr → **Settings → General**
2. Under **Security**, copy the **API Key**

### Quick-start Docker Compose snippet

```yaml
services:
  hub:
    environment:
      HUB_RADARR_URL: "http://radarr:7878"
      HUB_RADARR_API_KEY: "your-radarr-api-key"
      HUB_RADARR_ENABLED: "1"
      HUB_SONARR_URL: "http://sonarr:8989"
      HUB_SONARR_API_KEY: "your-sonarr-api-key"
      HUB_SONARR_ENABLED: "1"
```

---

## 3. How Media Requests Work

### 3.1 User submits a request

A logged-in user sends `POST /api/v1/me/requests` with:

```json
{
  "type": "movie",
  "tmdb_id": 550,
  "title": "Fight Club",
  "poster_url": "https://image.tmdb.org/t/p/w500/..."
}
```

Or for a series:

```json
{
  "type": "series",
  "tmdb_id": 1396,
  "title": "Breaking Bad",
  "poster_url": "https://image.tmdb.org/t/p/w500/...",
  "season": 1,
  "episode": 1
}
```

The hub stores the request with status `pending` and returns the created request object. The user receives a confirmation notification.

### 3.2 Admin reviews the queue

Admins view all pending requests at `GET /api/v1/admin/requests` (or filter by `?status=pending`).

Each request shows:
- The requesting user's ID
- Media type (`movie` or `series`)
- TMDB ID and title
- Poster URL
- Submitted timestamp

### 3.3 Admin approves or denies

**Approve** — `POST /api/v1/admin/requests/{id}/approve`

The hub calls the appropriate Arr API:

- **Movie** → `POST /api/v3/movie` on Radarr with the TMDB ID
- **Series** → `POST /api/v3/series` on Sonarr with the TMDB ID

Both use the first available quality profile and the existing root folder from the Arr instance. The request status transitions to `approved`.

**Deny** — `POST /api/v1/admin/requests/{id}/deny`

```json
{
  "reason": "Content policy violation"
}
```

The request status transitions to `rejected` with the optional reason stored. The requesting user receives a rejection notification.

### 3.4 Arr imports the title

Radarr or Sonarr downloads and imports the media. When the hub is notified (or polls) that the title is in the library, the request status transitions to `available`. The user receives an availability notification.

---

## 4. Admin UI / Dashboard

The hub provides a built-in admin view for request management:

1. Log into the hub as an administrator
2. Navigate to **Admin → Media Requests**
3. Review pending requests, approve, deny, or view history

The admin view supports:
- Filtering by status (`pending`, `approved`, `available`, `rejected`)
- Search by title or TMDB ID
- View per-request history (submitted, approved/denied timestamp, admin who took action)

---

## 5. CLI Management

Hub administrators can also manage requests via the API using `curl` or any HTTP client:

```bash
# List all pending requests
curl -H "Authorization: Bearer <admin-token>" \
  https://hub.example.com/api/v1/admin/requests?status=pending

# Approve a request
curl -X POST -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"reason":""}' \
  https://hub.example.com/api/v1/admin/requests/<request-id>/approve

# Deny a request
curl -X POST -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Quality or rights issue"}' \
  https://hub.example.com/api/v1/admin/requests/<request-id>/deny
```

---

## 6. What Can Go Wrong

### Radarr/Sonarr not reachable

**Symptom:** Admin approves a request but it returns HTTP 500 `approve_failed`.

**Diagnosis:**
```bash
# Test Radarr connectivity from the Hub host
curl -s -o /dev/null -w "%{http_code}" http://localhost:7878/api/v3/qualityprofile

# Test Sonarr connectivity
curl -s -o /dev/null -w "%{http_code}" http://localhost:8989/api/v3/qualityprofile
```

**Fix:** Verify the `HUB_RADARR_URL` / `HUB_SONARR_URL` is correct, the Arr instance is running, and the Hub host can reach it over HTTP/HTTPS.

---

### Wrong API key

**Symptom:** Approve returns `approve_failed` with no Arr error logged.

**Diagnosis:**
```bash
# Verify API key is correct — this should return quality profiles
curl -H "X-Api-Key: your-api-key" \
  http://localhost:7878/api/v3/qualityprofile
```

**Fix:** Update `HUB_RADARR_API_KEY` or `HUB_SONARR_API_KEY` and restart the Hub.

---

### No quality profiles or root folder in Arr

**Symptom:** Approve succeeds in the hub but the title never appears in the library.

**Fix:** Log into Radarr or Sonarr, create at least one quality profile (e.g., "HD-1080p") and set a root folder (e.g., `/movies`). The hub uses the first available profile and root folder automatically.

---

### TMDB ID not found in Arr

**Symptom:** Approve returns an Arr API error about missing metadata.

**Diagnosis:** Some titles may not exist in Radarr/Sonarr's search index (rare, usually TMDB ID drift).

**Fix:** Verify the correct TMDB ID using The Movie Database or The TV DB, then resubmit the request.

---

## 7. Next Steps

- [API Reference: Media Requests](../reference/api/hub-media-requests.md) — full endpoint and response shapes
- [What is the Hub](./what-is-the-hub.md) — overview of hub features and access management
- [Shared Libraries with Friends](./share-with-friends.md) — share libraries after requests are fulfilled