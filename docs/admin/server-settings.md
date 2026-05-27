---
title: Server Settings
description: Server-wide settings store and admin settings API
---

# Server Settings

Phlix keeps server-wide configuration in two layers: the read-only `config/*.php`
files baked in at boot, and a DB-backed **settings store** that lets an admin
override individual values at runtime. The store is exposed through an admin JSON
API so settings can be read and changed without editing files or restarting the
server.

::: tip UI coming in Phase 1.3
This page documents the **API** only. The graphical settings screens in the admin
console land in Phase 1.3 — until then, settings are read and written through the
endpoints below.
:::

## The Effective-Value Model

Every editable setting has up to three layers:

| Layer | Source | Notes |
|-------|--------|-------|
| **Default** | the value in `config/<file>.php` | Baked in at boot, read-only. |
| **Override** | a row in the `server_settings` table | Written by `PUT /api/v1/admin/settings`. |
| **Effective** | the override when present, else the default | What the API returns and what the server uses. |

An override **survives a restart** because the database — not the process — is the
durable store. Removing an override (a future capability) would let the config-file
default win again.

### Dotted Keys

Settings are addressed with *dotted* keys. The first segment names the
`config/<file>.php` file; the remaining segments walk into the array that file
returns. For example:

- `hwaccel.enabled` → the `enabled` key of `config/hwaccel.php`.
- `port-forward.port_forwarding.upnp_enabled` → walks two levels into
  `config/port-forward.php`.

The leading file segment is restricted to `^[A-Za-z0-9_-]+$`, so a crafted key
can never escape the config directory.

## Authentication

Both endpoints sit in the `/api/v1/admin` route group and are gated by the admin
middleware. Send a valid admin JWT as a Bearer token:

```http
Authorization: Bearer <admin-access-token>
```

- An **unauthenticated** request returns `401`.
- A **non-admin** request returns `403`.

Both error responses are JSON.

## Read Settings

```http
GET /api/v1/admin/settings
```

Returns the effective value of every allow-listed key, the subset that is currently
overridden, and the type map.

```json
{
  "success": true,
  "data": {
    "settings": {
      "hwaccel.enabled": true,
      "hwaccel.probe_timeout": 5,
      "tmdb.api_key": "",
      "marker_detection.similarity_threshold": 0.85
    },
    "overridden": [
      "hwaccel.enabled"
    ],
    "types": {
      "hwaccel.enabled": "bool",
      "hwaccel.probe_timeout": "int",
      "tmdb.api_key": "string",
      "marker_detection.similarity_threshold": "float"
    }
  }
}
```

- `settings` — effective value per key (override or, failing that, config default).
- `overridden` — the keys whose effective value comes from a stored override.
- `types` — the declared type of each key (`string` | `int` | `bool` | `float` | `json`).

## Update Settings

```http
PUT /api/v1/admin/settings
Content-Type: application/json
```

```json
{
  "settings": {
    "hwaccel.enabled": true,
    "marker_detection.similarity_threshold": 0.9
  }
}
```

On success the overrides are persisted and the refreshed effective values are
returned:

```json
{
  "success": true,
  "message": "Settings updated.",
  "data": {
    "settings": { "hwaccel.enabled": true, "marker_detection.similarity_threshold": 0.9 },
    "overridden": [ "hwaccel.enabled", "marker_detection.similarity_threshold" ]
  }
}
```

### Validation Rules

Every submitted value is checked against a typed allow-list before anything is
written:

- The body must contain a **non-empty** `settings` object, or the request returns
  `400` (`Invalid payload`).
- An **unknown key** (not in the allow-list) returns `400` (`Validation failed`)
  with the offending key in `errors`.
- A **wrong-type value** returns `400` (`Validation failed`) with `Expected type <type>.`.
- Validation is **all-or-nothing**: if any key fails, *nothing* is persisted.

Numeric strings are accepted for `int`/`float`, and the canonical bool-ish set
(`true`/`false`/`1`/`0`, as bool, int, or string) is accepted for `bool` — values
are coerced to their canonical PHP type before storage.

Example validation-failure response:

```json
{
  "success": false,
  "error": "Validation failed",
  "errors": {
    "hwaccel.probe_timeout": "Expected type int.",
    "made.up.key": "Unknown setting key."
  }
}
```

## Editable Keys

The current allow-list maps each dotted key to its type and the
`config/<file>.php` default it overrides. (This inline allow-list is the
validation source while the shared settings JSON schema is still in progress; see
[Roadmap](#roadmap).)

| Key | Type | Backing config |
|-----|------|----------------|
| `hwaccel.enabled` | `bool` | `config/hwaccel.php` |
| `hwaccel.prefer_hardware` | `bool` | `config/hwaccel.php` |
| `hwaccel.probe_timeout` | `int` | `config/hwaccel.php` |
| `tmdb.api_key` | `string` | `config/tmdb.php` |
| `marker_detection.similarity_threshold` | `float` | `config/marker_detection.php` |
| `marker_detection.intro_max_duration` | `int` | `config/marker_detection.php` |
| `subtitles.enabled` | `bool` | `config/subtitles.php` |
| `subtitles.default_language` | `string` | `config/subtitles.php` |
| `subtitles.burn_in_by_default` | `bool` | `config/subtitles.php` |
| `discovery.discovery_port` | `int` | `config/discovery.php` |
| `trickplay.enabled` | `bool` | `config/trickplay.php` |
| `trickplay.interval_seconds` | `int` | `config/trickplay.php` |
| `newsletter.enabled` | `bool` | `config/newsletter.php` |
| `newsletter.send_hour` | `int` | `config/newsletter.php` |
| `port-forward.port_forwarding.upnp_enabled` | `bool` | `config/port-forward.php` |

This is a curated, representative slice of the Phase-1.3 settings groups
(transcoding/hardware acceleration, metadata providers, marker detection,
subtitles, discovery, trickplay, newsletter, port-forward/UPnP). The live source
of truth is the `ALLOWED_KEYS` constant on the admin settings controller.

## Storage

Overrides live in the `server_settings` table. Each row records the dotted
`setting_key` (unique), the `setting_value` as text, and a `value_type`
(`string` | `int` | `bool` | `float` | `json`) describing how to decode it back
into a PHP value. Writes use an upsert (`INSERT ... ON DUPLICATE KEY UPDATE`) so
re-saving a key replaces its previous override in place.

## Roadmap

- **Settings UI (Phase 1.3)** — graphical screens in the admin console for editing
  these groups will be added; this page will gain a UI walkthrough section then.
- **Shared schema (step 0.7)** — a shared `server-settings.schema.json` will become
  the single source of truth for key names, types, and validation, replacing the
  controller's inline allow-list.

## See Also

- [Dashboard](./dashboard) — visual admin dashboard overview
- [Stats](./stats) — usage and activity statistics
- [Backup](./backup) — server backup and restore
