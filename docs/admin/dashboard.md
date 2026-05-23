---
title: Dashboard
description: Admin dashboard overview and metrics
---

# Dashboard

The admin dashboard provides a real-time overview of server activity: who is watching what, usage leaderboards, storage consumption, and a combined activity feed.

## What It Is

The `DashboardService` aggregates data from `StatsCollector`, `SessionManager`, and `StreamManager` to produce five dashboard panels:

1. **Now Playing** — all currently active playback sessions with user, media, progress, and device info
2. **Top Users** — ranked list of users by total watch time over the last 30 days
3. **Top Media** — ranked list of media items by play count over the last 30 days
4. **Storage Summary** — bytes used per media type (movie, series, music, photo) plus transcode cache
5. **Recent Activity** — unified feed of playback completions, library changes, and login/logout events

## How to Access

### Via Admin UI

Navigate to **Admin UI → Dashboard** (the default admin landing page). All five panels are visible without navigating away.

### Via API

All dashboard endpoints are under `/api/v1/admin/` and require admin authentication.

**Now Playing**

```http
GET /api/v1/admin/dashboard/now-playing
```

```json
{
  "data": [
    {
      "stream_id": "abc123",
      "user_id": "user-456",
      "username": "alice",
      "media_item_id": "media-789",
      "media_title": "The Matrix (1999)",
      "media_type": "movie",
      "poster_url": "/meta/movies/789/poster.jpg",
      "position_ticks": 3600000000,
      "duration_ticks": 10560000000,
      "progress_percent": 34.1,
      "status": "playing",
      "device_name": "Living Room TV",
      "device_type": "tv"
    }
  ]
}
```

**Top Users**

```http
GET /api/v1/admin/dashboard/top-users?limit=10&days=30
```

```json
{
  "data": [
    {
      "user_id": "user-456",
      "username": "alice",
      "total_watch_time": 86400,
      "play_count": 23,
      "avatar_url": null
    }
  ]
}
```

**Top Media**

```http
GET /api/v1/admin/dashboard/top-media?limit=10&days=30
```

```json
{
  "data": [
    {
      "media_item_id": "media-789",
      "title": "The Matrix (1999)",
      "type": "movie",
      "poster_url": "/meta/movies/789/poster.jpg",
      "play_count": 45,
      "total_duration": 54000
    }
  ]
}
```

**Storage Summary**

```http
GET /api/v1/admin/dashboard/storage
```

```json
{
  "data": {
    "movie_bytes": 50000000000,
    "series_bytes": 120000000000,
    "music_bytes": 80000000000,
    "photo_bytes": 20000000000,
    "transcode_cache_bytes": 2000000000,
    "items": [
      {
        "media_type": "movie",
        "item_count": 234,
        "total_bytes": 50000000000,
        "transcode_cache_bytes": 0,
        "formatted_total": "46.57 GB",
        "formatted_cache": "0 B"
      }
    ],
    "formatted_transcode_cache": "1.86 GB"
  }
}
```

**Recent Activity**

```http
GET /api/v1/admin/dashboard/activity?limit=20
```

```json
{
  "data": [
    {
      "id": "evt-001",
      "event_type": "playback_completed",
      "category": "playback",
      "user_id": "user-456",
      "username": "alice",
      "details": {
        "media_title": "The Matrix",
        "duration_seconds": 7200,
        "completed": true
      },
      "occurred_at": "2024-01-15T22:30:00Z"
    }
  ]
}
```

## Available Metrics

| Metric | Source | Description |
|--------|--------|-------------|
| Active streams | `StreamManager` | Currently playing media sessions |
| User watch time | `stats_playback_events` | Total seconds watched per user |
| Media play count | `stats_playback_events` | Number of starts per media item |
| Storage by type | `stats_storage` | Most recent snapshot per media type |
| Playback completions | `stats_playback_events` | Events where `completed = true` |
| Library changes | `stats_library_changes` | `item_added`, `item_removed`, `metadata_updated` |
| Auth events | `stats_user_activity` | Login and logout events |

## Refreshing Data

Dashboard data is computed on request. For real-time monitoring, refresh the page or poll the API endpoints. WebSocket push for now-playing status is planned for a future release.

## Where to Look

| Location | Description |
|----------|-------------|
| Admin UI → Dashboard | Main dashboard with all five panels |
| `GET /api/v1/admin/dashboard/now-playing` | Active streams |
| `GET /api/v1/admin/dashboard/top-users` | User leaderboard |
| `GET /api/v1/admin/dashboard/top-media` | Media popularity |
| `GET /api/v1/admin/dashboard/storage` | Storage breakdown |
| `GET /api/v1/admin/dashboard/activity` | Recent events feed |
| `GET /api/v1/admin/stats/playback` | Playback time-series |
| `GET /api/v1/admin/stats/top-users` | Raw top users data |
| `GET /api/v1/admin/stats/top-media` | Raw top media data |

## See Also

- [Stats](./stats) — detailed statistics API reference
- [Webhooks](./webhooks) — get notified on playback and library events
- [Backup](./backup) — backup dashboard data and server state
