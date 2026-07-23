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

### Group Tabs

The page renders every settings key split across tabbed sections. **Tabs are not
hardcoded** — `SettingsPage.vue:159-163` builds them from the distinct `group`
values of the keys the server actually returned, and `humanizeGroup()` derives
each label by replacing `_`/`-` with spaces and title-casing. Adding a key with a
new `group` in the schema therefore creates a new tab with no UI change.

::: warning Previously documented as "8 Group Tabs" with a hand-written key list
That section listed ten rows under an "8" heading, named tabs that do not exist
(**Markers**, **Discovery**, **Port Forward**), and referenced seven keys that
have since been deleted. Tab names come from the schema's `group` field, not from
the key prefix — `hwaccel.*` and `transcoding.*` share the `transcoding` group,
for instance.
:::

Current groups, from `server-settings.schema.json`:

| Tab | `group` value | Keys |
|-----|---------------|------|
| **Auth** | `auth` | 18 |
| **General** | `general` | 2 |
| **Infrastructure** | `infrastructure` | 4 |
| **Integrations** | `integrations` | 1 |
| **Matching** | `matching` | 1 |
| **Metadata** | `metadata` | 4 |
| **Newsletter** | `newsletter` | 2 |
| **Port Forward** | `port-forward` | 1 |
| **Scrobblers** | `scrobblers` | 6 |
| **Subsystem** | `subsystem` | 11 |
| **Subtitles** | `subtitles` | 1 |
| **Transcoding** | `transcoding` | 13 |
| **Trickplay** | `trickplay` | 1 |

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
      "transcoding.preset": "veryfast",
      "tmdb.api_key": "",
      "auth.password.min_length": 8
    },
    "overridden": [
      "hwaccel.enabled"
    ],
    "types": {
      "hwaccel.enabled": "bool",
      "transcoding.preset": "string",
      "tmdb.api_key": "string",
      "auth.password.min_length": "int"
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
    "transcoding.crf_h264": 20
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
    "settings": { "hwaccel.enabled": true, "transcoding.crf_h264": 20 },
    "overridden": [ "hwaccel.enabled", "transcoding.crf_h264" ]
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
    "transcoding.crf_h264": "Expected type int.",
    "made.up.key": "Unknown setting key."
  }
}
```

## Editable Keys

The allow-list is **derived at runtime from the shared
`server-settings.schema.json`** bundled in `detain/phlix-shared` —
`AdminSettingsController::allowedKeys()` reads it rather than carrying an inline
constant. See [Shared schemas](../dev/shared-schemas).

::: warning The schema is the source of truth, not this page
This table is a snapshot, regenerated from the schema. If it disagrees with the
running server, the schema wins. An earlier version of this page hand-listed
19 keys and **seven of them had since been deleted** — including
`hwaccel.probe_timeout`, `discovery.discovery_port` and `trickplay.interval_seconds`,
all removed for having no consumer. Documenting a setting that does not exist is
the same class of error as shipping one that nothing reads.
:::

**Tier** controls visibility: `standard` keys are always shown, `advanced` keys
appear only when the Settings page's **Advanced** switch is on. **Restart** marks
a key whose value is captured at container-build time and therefore only takes
effect after the server restarts — the page badges these.

**72 keys** in `phlix-shared` v0.45.0. This table is a regenerated snapshot and
may lag the schema for a release or two; the schema is the source of truth.

#### `access.*`

| Key | Type | Tier | Restart |
|-----|------|------|---------|
| `access.default_concurrent_streams` | `int` | standard | no |

#### `artwork.*`

| Key | Type | Tier | Restart |
|-----|------|------|---------|
| `artwork.download_enabled` | `bool` | standard | no |

#### `auth.*`

| Key | Type | Tier | Restart |
|-----|------|------|---------|
| `auth.access_ttl` | `int` | advanced | no |
| `auth.max_profiles` | `int` | standard | no |
| `auth.password.min_length` | `int` | standard | no |
| `auth.refresh_ttl` | `int` | advanced | no |
| `auth.signup_mode` | `string (enum)` | standard | no |

#### `casting.*`

| Key | Type | Tier | Restart |
|-----|------|------|---------|
| `casting.airplay.enabled` | `bool` | standard | no |
| `casting.chromecast.enabled` | `bool` | standard | no |
| `casting.roku.enabled` | `bool` | standard | no |

#### `dlna.*`

| Key | Type | Tier | Restart |
|-----|------|------|---------|
| `dlna.allowed_cidrs` | `json` | advanced | no |
| `dlna.cds_enabled` | `bool` | advanced | yes |
| `dlna.enabled` | `bool` | standard | yes |
| `dlna.friendly_name` | `string` | standard | yes |
| `dlna.restrict_to_lan` | `bool` | advanced | no |

#### `ffmpeg.*`

| Key | Type | Tier | Restart |
|-----|------|------|---------|
| `ffmpeg.max_concurrent_scan_probes` | `int` | advanced | yes |
| `ffmpeg.max_concurrent_transcodes` | `int` | advanced | yes |
| `ffmpeg.transcode_timeout` | `int` | advanced | yes |

#### `hwaccel.*`

| Key | Type | Tier | Restart |
|-----|------|------|---------|
| `hwaccel.enabled` | `bool` | standard | yes |
| `hwaccel.prefer_hardware` | `bool` | advanced | yes |

#### `lastfm.*`

| Key | Type | Tier | Restart |
|-----|------|------|---------|
| `lastfm.api_key` | `string` | standard | no |
| `lastfm.enabled` | `bool` | standard | no |
| `lastfm.shared_secret` | `string` | standard | no |

#### `matching.*`

| Key | Type | Tier | Restart |
|-----|------|------|---------|
| `matching.noise_suffixes` | `json` | advanced | no |

#### `metadata.*`

| Key | Type | Tier | Restart |
|-----|------|------|---------|
| `metadata.genres_mode` | `string (enum)` | standard | no |
| `metadata.provider_priority` | `json` | standard | no |

#### `metrics.*`

| Key | Type | Tier | Restart |
|-----|------|------|---------|
| `metrics.enabled` | `bool` | advanced | yes |

#### `newsletter.*`

| Key | Type | Tier | Restart |
|-----|------|------|---------|
| `newsletter.enabled` | `bool` | standard | no |
| `newsletter.send_hour` | `int` | standard | no |

#### `port-forward.*`

| Key | Type | Tier | Restart |
|-----|------|------|---------|
| `port-forward.port_forwarding.upnp_enabled` | `bool` | standard | no |

#### `process.*`

| Key | Type | Tier | Restart |
|-----|------|------|---------|
| `process.library-scan.enabled` | `bool` | standard | yes |
| `process.marker-detection.enabled` | `bool` | standard | yes |
| `process.media-asset.enabled` | `bool` | standard | yes |
| `process.plugin-auto-update.enabled` | `bool` | standard | yes |
| `process.similarity.enabled` | `bool` | standard | yes |

#### `relay.*`

| Key | Type | Tier | Restart |
|-----|------|------|---------|
| `relay.ping_interval` | `int` | advanced | no |
| `relay.reconnect_delay` | `int` | advanced | no |

#### `scanner.*`

| Key | Type | Tier | Restart |
|-----|------|------|---------|
| `scanner.ignore_patterns` | `json` | advanced | no |

#### `server.*`

| Key | Type | Tier | Restart |
|-----|------|------|---------|
| `server.hls.cache_max_age` | `int` | advanced | yes |
| `server.hls.cache_max_bytes` | `int` | advanced | yes |
| `server.hls.max_concurrent_segments` | `int` | advanced | yes |
| `server.hls.segment_seconds` | `int` | advanced | yes |
| `server.rate_limit.jwks.max` | `int` | advanced | yes |
| `server.rate_limit.jwks.window` | `int` | advanced | yes |
| `server.rate_limit.refresh.max` | `int` | advanced | yes |
| `server.rate_limit.refresh.window` | `int` | advanced | yes |
| `server.rate_limit.register.max` | `int` | advanced | yes |
| `server.rate_limit.register.window` | `int` | advanced | yes |
| `server.rate_limit.webauthn_finish.max` | `int` | advanced | yes |
| `server.rate_limit.webauthn_finish.window` | `int` | advanced | yes |
| `server.rate_limit.webauthn_start.max` | `int` | advanced | yes |
| `server.rate_limit.webauthn_start.window` | `int` | advanced | yes |
| `server.rate_limit.ws_connect.max` | `int` | advanced | yes |
| `server.rate_limit.ws_connect.window` | `int` | advanced | yes |

#### `stats.*`

| Key | Type | Tier | Restart |
|-----|------|------|---------|
| `stats.enabled` | `bool` | standard | no |

#### `subtitles.*`

| Key | Type | Tier | Restart |
|-----|------|------|---------|
| `subtitles.default_language` | `string` | standard | no |

#### `tmdb.*`

| Key | Type | Tier | Restart |
|-----|------|------|---------|
| `tmdb.api_key` | `string` | standard | no |

#### `theme_music.*`

| Key | Type | Tier | Restart |
|-----|------|------|---------|
| `theme_music.enabled` | `bool` | advanced | yes |
| `theme_music.source` | `string (enum)` | advanced | yes |

#### `trakt.*`

| Key | Type | Tier | Restart |
|-----|------|------|---------|
| `trakt.client_id` | `string` | standard | no |
| `trakt.client_secret` | `string` | standard | no |
| `trakt.redirect_uri` | `string` | standard | no |

#### `transcoding.*`

| Key | Type | Tier | Restart |
|-----|------|------|---------|
| `transcoding.audio_bitrate` | `string` | advanced | no |
| `transcoding.crf_h264` | `int` | advanced | no |
| `transcoding.prefer_hdr_output` | `bool` | standard | no |
| `transcoding.preferred_accelerator` | `string (enum)` | advanced | yes |
| `transcoding.preset` | `string (enum)` | advanced | no |
| `transcoding.tone_mapping_mode` | `string (enum)` | standard | no |

#### `trickplay.*`

| Key | Type | Tier | Restart |
|-----|------|------|---------|
| `trickplay.enabled` | `bool` | standard | no |

#### `webhooks.*`

| Key | Type | Tier | Restart |
|-----|------|------|---------|
| `webhooks.enabled` | `bool` | standard | no |

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

## DLNA access control (`dlna.allowed_cidrs`, `dlna.restrict_to_lan`) {#dlna-access-control}

The DLNA ContentDirectory (browse/stream) routes carry **no authentication** — the
protocol has no concept of credentials — so once `dlna.cds_enabled` is on, these two
keys are the gate that decides who can reach the whole library over DLNA. Both take
effect **immediately** (no restart).

| Key | Type | Default | Meaning |
|-----|------|---------|---------|
| `dlna.allowed_cidrs` | `json` (array of CIDR strings) | `[]` | IP ranges explicitly permitted to reach the DLNA CDS routes. A matching entry always wins, even with the LAN restriction off. |
| `dlna.restrict_to_lan` | `bool` | `true` | When on, a caller that matches no explicit CIDR is still allowed if it is on the local network (loopback, RFC1918, IPv4 link-local, IPv6 loopback/ULA/link-local). When off, an explicit `allowed_cidrs` match is the *only* way in. |

::: danger An empty allowlist is NEVER "allow all"
No combination of these settings ever means "anyone can reach DLNA":

- **Defaults (`allowed_cidrs = []`, `restrict_to_lan = true`)** → DLNA CDS is
  **LAN-only**. Only loopback and the private/local ranges are admitted; everything
  off-LAN is denied.
- **`restrict_to_lan = false` with no matching CIDR** → **everything is denied**. An
  empty allowlist with the LAN restriction off locks DLNA down completely — a valid,
  deliberate state, not a way to open it up.
- Add a `/32` host or a subnet/VPN range to `allowed_cidrs` to permit a specific
  address the LAN default would not already cover.
:::

**Trusted-proxy / spoofing caveat.** The client IP is resolved spoof-resistantly via
`getTrustedClientIp()`, so a forged `X-Forwarded-For` from an off-LAN caller cannot
smuggle a LAN identity past the gate — only trusted proxies (loopback by default) may
set the forwarded address. If you front DLNA with a reverse proxy that is **not** on
loopback, add that proxy's address to `TRUSTED_PROXIES`, otherwise every request will
appear to originate from the proxy and the allowlist/LAN check will be evaluated
against the proxy's IP instead of the real client. See
[DLNA Server (advanced)](../advanced/dlna#access-control) and
[Reverse proxy](../advanced/reverse-proxy).

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
