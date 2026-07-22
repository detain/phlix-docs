---
title: Stats
description: Phlix statistics collection and access
---

# Stats

Phlix collects usage and activity statistics — playback events, library changes, user activity, and storage snapshots — and exposes them via the admin API for dashboards, analytics, and retention planning.

## What It Is

The `StatsCollector` service records events into `stats_*` tables (`stats_playback_events`, `stats_library_changes`, `stats_user_activity`, `stats_storage`). The `DashboardService` then aggregates this data into now-playing streams, top users, top media, and storage summaries. All stats are queryable via REST endpoints under `/api/v1/admin/stats/`.

## What Stats Are Collected

| Table | Events | Fields |
|-------|--------|--------|
| `stats_playback_events` | Playback start/end | `user_id`, `media_item_id`, `media_type`, `device_id`, `started_at`, `ended_at`, `duration_seconds`, `completed` |
| `stats_library_changes` | Library scans, item add/remove | `change_type`, `media_item_id`, `library_id`, `user_id`, `changed_at`, `details_json` |
| `stats_user_activity` | Login, logout, search, profile change | `user_id`, `activity_type`, `ip_address`, `occurred_at`, `details_json` |
| `stats_storage` | Hourly storage snapshots by media type | `media_type`, `item_count`, `total_bytes`, `transcode_cache_bytes`, `recorded_at` |

Playback completion is marked when a user watches ≥90% of a media item.

## How to Access

### Playback Stats (Time-Series)

```http
GET /api/v1/admin/stats/playback?from=2024-01-01&to=2024-01-31
```

```json
{
  "data": [
    {
      "date": "2024-01-01",
      "play_count": 47,
      "total_duration": 142300,
      "completed_count": 38
    }
  ]
}
```

Relative dates are supported: `?from=-30%20days&to=now`.

### Top Users by Watch Time

```http
GET /api/v1/admin/stats/top-users?limit=10&since=2024-01-01
```

```json
{
  "data": [
    {
      "user_id": "a1b2c3d4-...",
      "total_watch_time": 86400,
      "play_count": 23
    }
  ]
}
```

Omit `since` to get all-time rankings.

### Top Media by Play Count

```http
GET /api/v1/admin/stats/top-media?limit=10&since=-30%20days
```

```json
{
  "data": [
    {
      "media_item_id": "e5f6g7h8-...",
      "play_count": 45,
      "total_duration": 54000
    }
  ]
}
```

::: tip Deleted items and users are excluded
The Top Media and Top Users leaderboards only rank items and users that still
exist. `StatsCollector::getTopMedia()` / `getTopUsers()` `INNER JOIN media_items` /
`users`, so playback events whose media item or user has since been deleted are
dropped at the query level (with a defense-in-depth null-skip in `DashboardService`).
Orphaned rows are **hidden**, not shown as a "(deleted item)" placeholder, so you no
longer see blank-title / blank-username rows carrying an old play count. Watch-time
and play-count totals for surviving items/users are unchanged. The historical
`stats_playback_events` rows for deleted items/users are retained (not purged) — they
are only omitted from the leaderboards.
:::

### Storage Snapshots

```http
GET /api/v1/admin/stats/storage
```

```json
{
  "data": [
    {
      "id": "...",
      "recorded_at": "2024-01-15T00:00:00Z",
      "library_id": null,
      "media_type": "movie",
      "item_count": 234,
      "total_bytes": 50000000000,
      "transcode_cache_bytes": 2000000000
    }
  ]
}
```

## Retention Policy

Storage snapshots are taken hourly and retained indefinitely in `stats_storage`. Playback and activity events are retained for **90 days** by default. Old events are automatically purged by a scheduled cleanup job. Configure retention in `config/server.php`:

```php
'stats' => [
    'retention_days' => 90,
    'storage_snapshot_interval_hours' => 1,
],
```

## Dashboard Integration

The admin dashboard at **Admin UI → Dashboard** shows:

- **Now Playing** — active streams with user, media title, progress, and device
- **Top Users** — leaderboard by total watch time (last 30 days)
- **Top Media** — most-played items (last 30 days)
- **Storage Summary** — bytes used per media type + transcode cache
- **Recent Activity** — combined feed of playback completions, library changes, and auth events

All of these use the `DashboardService` which calls `StatsCollector` internally.

## Where to Look

| Location | Description |
|----------|-------------|
| Admin UI → Dashboard | Visual stats, now playing, leaderboards |
| Admin UI → Stats | Raw playback, top users, top media, storage |
| `GET /api/v1/admin/stats/playback` | Playback time-series |
| `GET /api/v1/admin/stats/top-users` | Top users by watch time |
| `GET /api/v1/admin/stats/top-media` | Top media by play count |
| `GET /api/v1/admin/stats/storage` | Storage usage snapshots |

## See Also

- [Dashboard](./dashboard) — visual admin dashboard overview
- [Webhooks](./webhooks) — receive notifications on playback and library events
- [Backup](./backup) — backup stats data and database
