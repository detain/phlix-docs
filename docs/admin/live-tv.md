# Live TV / DVR API

The Live TV / DVR API provides admin-gated endpoints for managing TV tuners, channels,
electronic program guide (EPG) data, DVR recordings, and series recording rules. All
endpoints are under `/api/v1/admin/livetv` and require admin authentication.

> **Note:** DVB-T support is deferred to a future step. The DVB-T tuner driver
> endpoints (`DvbtTunerDriver::performChannelScan` and related) are not implemented.

> **Note:** Step 2.5 adds a React SPA page (`LiveTvPage`) at `/admin/live-tv` that
> consumes these endpoints.

---

## Tuners

### List tuners

```http
GET /api/v1/admin/livetv/tuners
```

Returns all known TV tuners.

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "tuner_id": "tuner-1",
      "type": "iptv",
      "name": "IPTV Tuner",
      "host": "192.168.1.100",
      "port": 554,
      "device_id": "abc123",
      "enabled": true,
      "last_seen": "2026-05-28T12:00:00Z",
      "status": "online",
      "capabilities": ["streaming", "zapping"],
      "discovered_at": "2026-05-01T00:00:00Z",
      "created_at": "2026-05-01T00:00:00Z"
    }
  ]
}
```

### Get tuner

```http
GET /api/v1/admin/livetv/tuners/{tunerId}
```

### Scan for channels

```http
POST /api/v1/admin/livetv/tuners/{tunerId}/scan
```

Triggers a channel scan on the specified tuner.

### Update tuner

```http
PUT /api/v1/admin/livetv/tuners/{tunerId}
```

Accepts `name`, `enabled`, `host`, `port` (partial update).

### Delete tuner

```http
DELETE /api/v1/admin/livetv/tuners/{tunerId}
```

---

## Channels

### List channels

```http
GET /api/v1/admin/livetv/channels
```

Returns all TV channels, optionally filtered by `tuner_id`.

### Get channel

```http
GET /api/v1/admin/livetv/channels/{channelId}
```

### Update channel

```http
PUT /api/v1/admin/livetv/channels/{channelId}
```

Accepts `name`, `number`, `enabled` (maps to visibility field).

### Stream channel

```http
GET /api/v1/admin/livetv/channels/{channelId}/stream
```

Retunes the stream URL for a channel and redirects to it.

---

## Guide (EPG)

### List guide

```http
GET /api/v1/admin/livetv/guide
```

Returns program guide entries, optionally filtered by `channel_id`, `start_time`, and `end_time`.

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "program_id": "prog-1",
      "channel_id": "ch-1",
      "title": "Evening News",
      "description": "Daily news bulletin.",
      "start_time": "2026-05-28T18:00:00Z",
      "end_time": "2026-05-28T18:30:00Z",
      "season": null,
      "episode": null,
      "year": null,
      "rating": "PG",
      "poster": null,
      "category": "News",
      "series_id": null,
      "episode_number": null,
      "episode_title": null,
      "rating_system": "AU",
      "series_episode": null,
      "is_repeat": false,
      "is_film": false
    }
  ]
}
```

### Get program

```http
GET /api/v1/admin/livetv/guide/programs/{programId}
```

Returns details for a specific program.

### Refresh guide

```http
POST /api/v1/admin/livetv/guide/refresh
```

Triggers an EPG guide refresh.

---

## Recordings

### List recordings

```http
GET /api/v1/admin/livetv/recordings
```

Returns all DVR recordings.

### Get recording

```http
GET /api/v1/admin/livetv/recordings/{recordingId}
```

### Create recording

```http
POST /api/v1/admin/livetv/recordings
```

Body: `{ channel_id, program_id, start_time, end_time, quality?, title? }`

### Delete recording

```http
DELETE /api/v1/admin/livetv/recordings/{recordingId}
```

### List upcoming recordings

```http
GET /api/v1/admin/livetv/recordings/upcoming
```

Returns scheduled recordings that have not yet started.

### List by series

```http
GET /api/v1/admin/livetv/recordings/series/{seriesRuleId}
```

Returns all recordings made under a series rule.

---

## Series Rules

Series rules define automatic recording behaviour for a TV series.

### List series rules

```http
GET /api/v1/admin/livetv/series-rules
```

Returns all series recording rules.

### Get series rule

```http
GET /api/v1/admin/livetv/series-rules/{ruleId}
```

### Create series rule

```http
POST /api/v1/admin/livetv/series-rules
```

Body: `{ channel_id, series_id, title, schedule_type, start_time, end_time, days?, priority?, quality? }`

### Update series rule

```http
PUT /api/v1/admin/livetv/series-rules/{ruleId}
```

Partial update accepting any combination of rule fields.

### Delete series rule

```http
DELETE /api/v1/admin/livetv/series-rules/{ruleId}
```

---

## Database

Migration `028_livetv_base.sql` creates 6 tables:

| Table | Purpose |
|-------|---------|
| `livetv_tuners` | Registered TV tuners (IPTV / DVB-T / ATSC) |
| `livetv_channels` | Channel lineup with numbers, transport, and modulation |
| `livetv_programs` | EPG entries with title, time window, and series metadata |
| `livetv_favorites` | Per-user favourite channels |
| `livetv_lineups` | Channel lineups (antenna / cable / satellite) |
| `livetv_lineup_channels` | Mapping of lineups to channels with guide numbers |
