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

## Settings SPA

The admin console exposes a graphical Settings page at **`/admin/settings`**.
It consumes the GET/PUT `/api/v1/admin/settings` contract described below — no
new endpoints were added; the page is the UI layer on top of the 0.5 API.

### Access

Navigate to **`/admin/settings`** in the admin console sidebar (entry: **Settings**,
positioned after **Users**). Requires admin authentication.

### 8 Group Tabs

The page renders all settings keys split across tabbed sections (the **Access**
tab is shown first):

| Tab | Keys |
|-----|------|
| **Access** | `auth.signup_mode` |
| **Transcoding** | `hwaccel.enabled`, `hwaccel.prefer_hardware`, `hwaccel.probe_timeout` |
| **Metadata** | `tmdb.api_key`, `metadata.provider_priority`, `metadata.genres_mode` |
| **Matching** | `matching.noise_suffixes` |
| **Markers** | `marker_detection.similarity_threshold`, `marker_detection.intro_max_duration` |
| **Subtitles** | `subtitles.enabled`, `subtitles.default_language`, `subtitles.burn_in_by_default` |
| **Discovery** | `discovery.discovery_port` |
| **Trickplay** | `trickplay.enabled`, `trickplay.interval_seconds` |
| **Newsletter** | `newsletter.enabled`, `newsletter.send_hour` |
| **Port Forward** | `port-forward.port_forwarding.upnp_enabled` |

### Field Types

| Type | Control |
|------|---------|
| `bool` | Toggle switch |
| `int` / `float` | Number input with `min`/`max` from schema constraints |
| `string` | Text input; `tmdb.api_key` renders as a password field with Show/Hide toggle |
| `json` | A bespoke control (the generic string-coercing path is skipped). `metadata.provider_priority` renders a per-media-type **`SourcePriorityEditor`** (reorderable up/down source lists); `matching.noise_suffixes` renders as an editable string list. The Metadata tab also exposes a `metadata.genres_mode` enum select (`first` / `union`). These keys are saved verbatim through the same `PUT /api/v1/admin/settings` call (no stringification). |

### Overrides

Each key shows a **"custom" badge** (blue accent pill) when its effective value
comes from the `server_settings` DB table rather than the config-file default.
The `overridden` array returned by GET `/api/v1/admin/settings` drives this
indicator.

### Saving

The sticky **Save settings** footer button fires `PUT /api/v1/admin/settings`
with `{ settings: { key: value, ... } }`. On `200` the page re-renders with the
refreshed `overridden` list and shows a success toast. On `400` per-field
validation errors appear inline next to the relevant inputs. On `500` an error
toast is shown.

Overrides **persist across restarts** — the database is the durable store.

<!-- Screenshot: admin-settings-spa.png -->



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
`config/<file>.php` default it overrides. As of step 0.7 this allow-list is
**derived from the shared `server-settings.schema.json`** (bundled in
`detain/phlix-shared`); see [Shared schemas](../dev/shared-schemas).

| Key | Type | Backing config |
|-----|------|----------------|
| `auth.signup_mode` | `string` (enum) | `config/auth.php` |
| `hwaccel.enabled` | `bool` | `config/hwaccel.php` |
| `hwaccel.prefer_hardware` | `bool` | `config/hwaccel.php` |
| `hwaccel.probe_timeout` | `int` | `config/hwaccel.php` |
| `tmdb.api_key` | `string` | `config/tmdb.php` |
| `metadata.provider_priority` | `json` | `config/metadata.php` |
| `metadata.genres_mode` | `string` (enum) | `config/metadata.php` |
| `matching.noise_suffixes` | `json` | `config/matching.php` |
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
subtitles, discovery, trickplay, newsletter, port-forward/UPnP). The single
source of truth is the shared `server-settings.schema.json`; the controller's
`AdminSettingsController::allowedKeys()` derives this map from that schema at
runtime (replacing the former inline `ALLOWED_KEYS` constant).

## Signup mode (`auth.signup_mode`)

The **Access** tab exposes `auth.signup_mode`, which controls how new account
registrations are handled. It is an enum string with three values (the
config-file default is **`approval`**):

| Value | Behaviour |
|-------|-----------|
| `open` | New registrations become **active** immediately and receive a session — the classic open-signup behaviour. |
| `approval` | New registrations are created with status **pending**: no session/token is issued, and the user cannot log in or browse media until an admin approves them. Registering returns a `202` with a "your account is awaiting administrator approval" message. **(default)** |
| `disabled` | New registrations are rejected with a `403` — no account is created. |

Notes and caveats:

- **The first-ever registered user is always created active and admin**, regardless
  of the configured mode. This guarantees a server can be bootstrapped even when
  signups are set to `approval` or `disabled`.
- **Disabling an active user revokes their live session.** User status is
  re-checked on the token-refresh and token-validation paths, so a user who is
  set to `disabled` loses access on their next request — an already-issued access
  token (and its refresh token) stops working without waiting for expiry. A
  disabled **admin** also immediately loses admin access.
- See [User Management](./user-management) for the approval queue and the
  `approve` / `disable` / `reject` admin actions.

## Metadata source priority (`metadata.provider_priority`)

The **Metadata** tab exposes `metadata.provider_priority`, which controls the
**order in which metadata sources are consulted, per field, per media type**. The
matching pipeline normalizes each source's payload into a canonical field set and
then, for every field, takes the **first non-empty value** walking the configured
source order. External IDs are merged (earlier source wins on conflict).

The value is a JSON object mapping a media type to an **ordered array of source
names**:

```json
{
  "movie":  ["tmdb", "imdb"],
  "series": ["tmdb", "imdb"],
  "anime":  ["anidb", "myanimelist", "tvdb", "fanart", "local"]
}
```

Config-file defaults (`config/metadata.php`, mirrored byte-for-byte from the shared
schema):

| Media type | Default order |
|------------|---------------|
| `movie` | `["tmdb", "imdb"]` |
| `series` | `["tmdb", "imdb"]` — **deliberately no `tvdb`** |
| `anime` | `["anidb", "myanimelist", "tvdb", "fanart", "local"]` |

Notes and caveats:

- The override is stored as a `json` value via the settings store; an absent
  (un-overridden) type falls back to the config-file default for that type. The
  controller merges per-type so overriding one type never drops the others.
- Available source names come from the live
  [`GET /api/v1/admin/metadata/sources`](../reference/api) endpoint — the built-ins
  (`tmdb`, `imdb`, `tvdb`, `fanart`, `local`) plus any enabled metadata-provider
  plugin's source name (e.g. `anidb`, `myanimelist`). The editor only offers real,
  registered names.
- The `SourcePriorityEditor` is a pure up/down reorder control (no drag-drop
  dependency); each media type gets its own list.

::: warning Series ordering does not yet flow into live series matching
As shipped, `SeriesMetadataResolver` builds its records under a **fixed `['tmdb']`
order** and does not consume the configured series order — this is intentional (it
avoids surfacing a phantom rating from a lower-priority source). The
`provider_priority` setting and its editor are fully wired through the API and the
movie resolver; making the configured *series* order take effect in live matching
is a deliberate future behavior change, not part of this release.
:::

## Genres mode (`metadata.genres_mode`)

`metadata.genres_mode` controls how genres are combined across sources during
resolution. It is an enum string (config-file default **`first`**):

| Value | Behaviour |
|-------|-----------|
| `first` | Use the genre list from the first source (in priority order) that supplies one. **(default)** |
| `union` | Merge genres from every source into a de-duplicated union. |

## Noise-suffix list (`matching.noise_suffixes`)

`matching.noise_suffixes` is the admin-extensible list of trailing "noise" phrases
that are stripped from a filename-derived title **before** it is sent to a metadata
provider for matching. Multi-word edition markers such as `Directors Cut`,
`UNCUT & UNRATED`, `ALTERNATE ENDING`, `Extended Cut`, `Remastered`, and scene tags
like `YIFY` / `DC` would otherwise survive into the search query and depress the
match hit-rate.

- The value is a JSON **array of strings**. It is a **replace-not-merge** override:
  setting it replaces the code defaults wholesale. An **empty** override (`[]`)
  falls back to the built-in code defaults (the defaults are also mirrored in
  `config/matching.php`).
- The list is applied longest-phrase-first, end-anchored, on word boundaries, and a
  single-token noise word will never empty a title (the original title is kept as a
  fallback). The original filename (`raw`) is never mutated — only the
  match/search title.
- Both the movie filename normalizer (`SceneFilenameNormalizer`) and the series
  parser (`EpisodeFilenameParser::cleanSeries()`) consume the same effective list
  via the shared `TitleSuffixStripper` (single source of truth).

## Storage

Overrides live in the `server_settings` table. Each row records the dotted
`setting_key` (unique), the `setting_value` as text, and a `value_type`
(`string` | `int` | `bool` | `float` | `json`) describing how to decode it back
into a PHP value. Writes use an upsert (`INSERT ... ON DUPLICATE KEY UPDATE`) so
re-saving a key replaces its previous override in place.

## Roadmap

- **Settings UI (Phase 1.3)** — graphical screens in the admin console for editing
  these groups will be added; this page will gain a UI walkthrough section then.
- **Shared schema (step 0.7)** ✅ *shipped* — the shared `server-settings.schema.json`
  (in `detain/phlix-shared`) is now the single source of truth for key names and
  types; `AdminSettingsController` derives its allow-list from it. See
  [Shared schemas](../dev/shared-schemas).

## See Also

- [User Management](./user-management) — the signup approval queue and user statuses
- [Dashboard](./dashboard) — visual admin dashboard overview
- [Stats](./stats) — usage and activity statistics
- [Backup](./backup) — server backup and restore
