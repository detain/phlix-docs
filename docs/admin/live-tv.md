# Live TV / DVR API

The Live TV / DVR API provides admin-gated endpoints for managing TV tuners, channels,
electronic program guide (EPG) data, DVR recordings, and series recording rules. All
endpoints are under `/api/v1/admin/livetv` and require admin authentication.

> **Note:** DVB-T support is deferred to a future step. The DVB-T tuner driver
> endpoints (`DvbtTunerDriver::performChannelScan` and related) are not implemented.

> **Note:** Step 2.5 adds a React SPA page (`LiveTvPage`) at `/admin/live-tv` that
> consumes these endpoints. See the [UI Usage](#ui-usage) section below.

---

## UI Usage

The Live TV / DVR SPA page at `/admin/live-tv` is the UI complement to the
step 2.4 API. It is organized into **four collapsible sections**:

### Tuners

Lists all registered TV tuners as a card grid. Each card shows the tuner's
type badge (e.g. `IPTV`), a status dot (green = online, red = offline), the
tuner name, host address, and last-seen timestamp. Two action buttons per card:
**Scan** triggers a channel scan via `POST .../tuners/{id}/scan`; **Delete**
removes the tuner via `DELETE .../tuners/{id}`. An **Add Tuner** button at the
section header opens a modal for `POST .../tuners`.

Enable/disable is controlled by a toggle on each card that calls
`PUT .../tuners/{id}` with `{ enabled: true/false }`. All buttons set
`aria-busy` and show a loading label (e.g. `Scanning…`) while in-flight.
API errors surface as error toasts.

### Guide / EPG

Displays programme listings in a scrollable grid. A **date picker** at the
top switches between Today, +1 Day, and +2 Day — clicking a date button calls
`GET /api/v1/admin/livetv/guide?start_time=…&end_time=…` with the appropriate
ISO time window. Each programme card shows the title, start/end time, category
badge, and a rating indicator.

Clicking a programme card **expands it in-place** to show the full description,
season/episode info, and a **Record** button. The Record button opens the
**Schedule Recording** modal pre-filled with the programme's channel and time
range. A **Refresh Guide** button at the section header triggers
`POST /api/v1/admin/livetv/guide/refresh`.

### Recordings

Three tabs filter the recording list:

| Tab | API | Shows |
|-----|-----|-------|
| **All** | `GET /api/v1/admin/livetv/recordings` | Every recording |
| **Upcoming** | `GET /api/v1/admin/livetv/recordings/upcoming` | Scheduled but not started |
| **By Series** | `GET /api/v1/admin/livetv/recordings/series/{ruleId}` | Recordings grouped under a series rule |

Recording cards show the title, channel, scheduled time, status badge
(`recording` / `completed` / `failed`), and a **Delete** button
(`DELETE .../recordings/{id}`). A **Schedule Recording** button at the
section header opens the modal described above.

### Series Rules

Lists all series recording rules as rows, each showing the rule title, target
channel, and priority indicator. An **Add Rule** button opens a modal that
accepts: channel, series ID, title, schedule type (`once` / `daily` /
`weekly`), start/end time, and optional priority and quality. It posts to
`POST /api/v1/admin/livetv/series-rules`.

Each row has **Edit** and **Delete** actions (respectively `PUT` and `DELETE`
on `/api/v1/admin/livetv/series-rules/{id}`). When the section expands it
loads channels in parallel with the rules via `GET /api/v1/admin/livetv/channels`
— channel data is needed to populate the channel picker in the Add Rule modal.

### Expand / collapse

All four sections start **collapsed**. Their content loads lazily when the
section heading is clicked, following the same expand-then-fetch pattern as
`RemoteAccessPage` (section 17).

### Scheduling a recording

To schedule a recording from the Guide:

1. Navigate to the **Guide / EPG** section.
2. Select a date to load programmes for that day.
3. Click a programme card to expand it.
4. Click **Record** — the Schedule Recording modal opens pre-filled with the
   programme's `channel_id`, `program_id`, and time window.
5. Adjust the time window if needed and click **Schedule**. This calls
   `POST /api/v1/admin/livetv/recordings`.

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
