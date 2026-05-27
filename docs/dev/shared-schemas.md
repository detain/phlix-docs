# Shared schemas & catalogs developer guide

> **Note** — The schema files described here are **data**, not PHP. They ship
> bundled under `phlix-shared/schemas/` and are located at runtime through the
> pure `Phlix\Shared\Schema\SchemaPaths` helper. Reading the files is left to
> the consumer (phlix-server, the admin SPA) — `phlix-shared` itself stays
> [Zero I/O](./arr-clients#architecture-note-why-i-o-in-phlix-shared); see
> [`phlix-shared/AGENTS.md`](https://github.com/detain/phlix-shared/blob/main/AGENTS.md)
> for the full charter.

## Overview

`phlix-shared` (the `detain/phlix-shared` Composer package) bundles two
machine-readable documents under its `schemas/` directory so that the server,
the admin SPA, and any other consumer share a **single source of truth**
instead of duplicating constants:

| File | Kind | Purpose |
|------|------|---------|
| `schemas/server-settings.schema.json` | JSON Schema (draft 2020-12) | Describes the editable server settings exposed by `/api/v1/admin/settings`. |
| `schemas/webhook-events.json` | Plain JSON data catalog | Enumerates the supported webhook event types a subscription may select. |

Both files were added in **phlix-shared v0.7.0** (tagged `v0.7.0`).

## Locating the files — `SchemaPaths`

`Phlix\Shared\Schema\SchemaPaths` is a `final` class of pure static path
resolvers. It performs **string computation only** — no `is_file()`,
`realpath()`, or `file_get_contents()` — so it honours the package's Zero-I/O
charter. The returned paths are correct whether the package is checked out for
development or installed under `vendor/detain/phlix-shared/`.

```php
use Phlix\Shared\Schema\SchemaPaths;

SchemaPaths::dir();             // /…/phlix-shared/schemas
SchemaPaths::serverSettings();  // /…/phlix-shared/schemas/server-settings.schema.json
SchemaPaths::webhookEvents();   // /…/phlix-shared/schemas/webhook-events.json
```

The depth is `dirname(__DIR__, 2) . '/schemas'`: `SchemaPaths.php` lives at
`src/Schema/`, two levels up is the package root, then `/schemas`. The class
cannot be instantiated (private constructor) — call the static methods.

## `server-settings.schema.json`

A standard JSON Schema (`$schema` = draft 2020-12,
`$id` = `https://phlix.tv/schemas/server-settings.schema.json`,
`type: object`, `additionalProperties: false`). Each **property key is a literal
dotted setting key** (for example `hwaccel.enabled`) and carries:

- a JSON-Schema `type` (`boolean` | `integer` | `number` | `string`),
- a human-readable `description`,
- a non-standard `"group"` annotation grouping related keys for the settings UI,
- and sensible validation constraints where meaningful (`minimum` / `maximum`).

Runtime **default values are intentionally NOT declared** here — defaults live
in phlix-server's `config/*.php` and are returned by the GET endpoint. The
schema describes the writable allow-list and its shape, not the live values.

### The 15 settings

| Key | JSON-Schema type | Internal type | Group | Constraints |
|-----|------------------|---------------|-------|-------------|
| `hwaccel.enabled` | `boolean` | `bool` | transcoding | |
| `hwaccel.prefer_hardware` | `boolean` | `bool` | transcoding | |
| `hwaccel.probe_timeout` | `integer` | `int` | transcoding | `minimum: 0` |
| `tmdb.api_key` | `string` | `string` | metadata | |
| `marker_detection.similarity_threshold` | `number` | `float` | markers | `minimum: 0`, `maximum: 1` |
| `marker_detection.intro_max_duration` | `integer` | `int` | markers | `minimum: 0` |
| `subtitles.enabled` | `boolean` | `bool` | subtitles | |
| `subtitles.default_language` | `string` | `string` | subtitles | |
| `subtitles.burn_in_by_default` | `boolean` | `bool` | subtitles | |
| `discovery.discovery_port` | `integer` | `int` | discovery | `minimum: 1`, `maximum: 65535` |
| `trickplay.enabled` | `boolean` | `bool` | trickplay | |
| `trickplay.interval_seconds` | `integer` | `int` | trickplay | `minimum: 1` |
| `newsletter.enabled` | `boolean` | `bool` | newsletter | |
| `newsletter.send_hour` | `integer` | `int` | newsletter | `minimum: 0`, `maximum: 23` |
| `port-forward.port_forwarding.upnp_enabled` | `boolean` | `bool` | port-forward | |

### How phlix-server consumes it

As of **phlix-server PR #135 (step 0.7)**, `AdminSettingsController` no longer
carries a hardcoded `ALLOWED_KEYS` constant. It **derives** its editable-settings
allow-list from the vendored schema:

1. `SchemaPaths::serverSettings()` resolves the bundled file path.
2. The controller reads + `json_decode`s it and iterates `properties`.
3. Each property's JSON-Schema `type` is mapped to the controller's internal
   validation vocabulary:

   | JSON-Schema type | Internal type |
   |------------------|---------------|
   | `boolean` | `bool` |
   | `integer` | `int` |
   | `number` | `float` |
   | `string` | `string` |
   | `array` / `object` | `json` |

   The current schema only uses the first four; `array`/`object` → `json` is
   present for forward compatibility.

The result is exposed through `AdminSettingsController::allowedKeys()` (cached in
a static after first load — it is immutable config, not request state). The
**GET and PUT behavior of `/api/v1/admin/settings` is unchanged**: GET still
returns the same `types` map (now equal to `allowedKeys()`), and PUT still
validates and coerces each value with the unchanged `valueMatchesType()` /
`coerce()` helpers. A lock-in unit test asserts the schema-derived map equals the
prior 15 keys/types verbatim, so the schema is the de-facto single source of
truth for the validation allow-list.

> If the vendored schema is ever unreadable or malformed, the loader fails
> **safe** to an empty allow-list rather than throwing on every request. The
> lock-in test + CI fail loudly on a genuinely broken schema, so this degraded
> arm never silently masks a real defect — it only avoids a hard crash.

The admin settings UI (landing in **Phase 1.3** — see
[Server Settings](../admin/server-settings)) renders its settings form from the
same schema (keys, types, groups, descriptions, constraints).

## `webhook-events.json`

A plain JSON **data catalog** — note it deliberately has **no `$schema` meta key**
(it is not itself a JSON Schema). It carries `$id`, `title`, `description`, an
`events` array, and a `reserved` array. It is the canonical vocabulary a webhook
subscription's `events[]` may select, intended for the admin SPA webhook picker
and for future server-side validation of submitted `events[]`.

### The 7 supported event types

| `type` | `group` | `label` |
|--------|---------|---------|
| `playback.started` | playback | Playback started |
| `playback.ended` | playback | Playback ended |
| `library.updated` | library | Library updated |
| `download.complete` | downloads | Download complete |
| `recording.started` | recordings | Recording started |
| `recording.stopped` | recordings | Recording stopped |
| `alert` | system | Alert |

The `reserved` array holds a single internal entry, `webhook.test`
(`"internal": true`) — fired only by the admin "Test webhook" action and **not**
user-subscribable; it is excluded from the picker list.

### Honest emission reality

::: warning Supported vocabulary — not yet emitted
These 7 types are the **supported and styled** webhook vocabulary (they appear in
the notification plugins' `match($event->eventType)` arms, and the picker will
offer them). However, **most are not actually emitted by the server yet**: the
only `WebhookEvent` constructed anywhere in phlix-server today is `webhook.test`
(from the admin Test action). Wiring real event emission for the 7 supported types
is an unfinished **backend gap deferred to Phase 1.4**. The catalog gives the SPA
picker and future `events[]` validation a real, agreed-upon list now; it does not
imply the events fire today.

Today the webhook `create` endpoint accepts arbitrary `events[]` strings with no
validation against this catalog — that validation is part of the same Phase-1.4
carry-over.
:::

## Three distinct event taxonomies

Phlix has **three** separate event vocabularies. They are intentionally distinct
— do not conflate them:

| Taxonomy | Where it lives | Audience / channel | In this catalog? |
|----------|----------------|--------------------|------------------|
| **Plugin events** | `Phlix\Shared\Events\*` + `Phlix\Shared\Plugin\EventNameMap` (12 `phlix.*` aliases) | In-process PSR-14 subscriptions by plugins | No — see [Event reference](./event-reference) |
| **Webhook events** | `schemas/webhook-events.json` (this catalog, 7 types) | Outbound signed HTTP POST to external services | **Yes** — see [Webhooks](../admin/webhooks) |
| **WebSocket events** | `WebSocketEvents` constants (phlix-server) | Real-time push to the user's own browser/app clients | No — by design |

Key points:

- **Plugin events** are `phlix.*` aliases mapped by `EventNameMap` for PSR-14
  dispatch; this is what *plugins* subscribe to. The webhook catalog is **not**
  `EventNameMap` and does not mirror it.
- **Webhook events** are the *outbound* vocabulary subscribers pick. The string
  `type` values in the catalog match the dispatcher's literal comparison strings
  exactly.
- **WebSocket events** are a different delivery channel (the client's own WS
  connection — e.g. `playback_progress`, `syncplay_*`) with their own single
  source of truth (`WebSocketEvents`). A webhook subscriber picking
  `playback_progress` would be nonsensical, so WS events are deliberately **not**
  in the webhook catalog and were out of scope for step 0.7.

## See Also

- [Event reference](./event-reference) — the plugin PSR-14 event catalog and `EventNameMap` aliases.
- [Webhooks](../admin/webhooks) — the admin webhook API and event payloads.
- [Server Settings](../admin/server-settings) — the settings store and admin settings API.
- [Arr API clients](./arr-clients) — the other developer-facing `phlix-shared` surface.
