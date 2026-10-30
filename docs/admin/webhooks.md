---
title: Webhooks
description: Configure webhook notifications for server events
---

# Webhooks

Webhooks allow Phlix to send real-time HTTP notifications to external services when events occur on your server. This enables integration with Slack, Discord, Telegram, MQTT brokers, and any HTTP endpoint that can verify a signature header — every delivery carries both the modern `X-Phlix-Signature-V2` and the legacy `X-Phlix-Signature`.

## What It Is

The webhook system dispatches events via signed HTTP POST requests to configured endpoints. Each request includes a JSON payload with event type, timestamp, and event-specific data. Webhook URLs can be registered, listed, tested, and deleted via the admin API. Retries (configurable, default 2) are attempted on failure, and failure counts are tracked per webhook.

## How to Configure

### Via API

All webhook management is under the `/api/v1/admin/webhooks` endpoint group, protected by admin
authentication: `401 {code: auth.required}` unauthenticated, `403 {code: auth.not_admin}` for a
non-admin, enforced by `AdminMiddleware` inside each handler of
`WebhookAdminController` — which since **S323** cannot be constructed without that gate
([Admin Gate Invariant](../dev/admin-gate-invariant)).

**Register a webhook**

```http
POST /api/v1/admin/webhooks
Content-Type: application/json

{
  "name": "My Discord Alerts",
  "url": "https://discord.com/api/webhooks/...",
  "secret": "your-secret-key",
  "events": ["playback.started", "playback.ended", "library.updated"]
}
```

> [!WARNING]
> Generate the `secret` with real randomness — for example `openssl rand -hex 32` — and
> treat the value above as a placeholder, not an example to keep. The server accepts any
> non-empty string and the whole verification scheme below is only as strong as this key:
> anyone who guesses or learns a weak secret can forge deliveries that pass
> `hash_equals` checks. Rotate by re-registering (the secret is stored as supplied,
> whitespace-trimmed — and is never returned by the list endpoint).

**Response** (201 Created):
```json
{
  "webhook": {
    "id": "a1b2c3d4-...",
    "name": "My Discord Alerts",
    "url": "https://discord.com/api/webhooks/...",
    "events": ["playback.started", "playback.ended", "library.updated"]
  }
}
```

**List all webhooks**

```http
GET /api/v1/admin/webhooks
```

**Test a webhook** — dispatches a `webhook.test` event to the target:

```http
POST /api/v1/admin/webhooks/{id}/test
```

**Delete a webhook**

```http
DELETE /api/v1/admin/webhooks/{id}
```

### Via config/webhooks.php

```php
<?php
return [
    'enabled'         => true,
    'timeout'         => 5,      // seconds before request times out
    'max_retries'     => 2,      // retries on failure
    'parallel_dispatch' => true,  // dispatch all webhooks concurrently
    'ca_bundle'        => '/etc/ssl/certs/ca-certificates.crt', // TLS CA bundle
];
```

## Available Event Types

Canonical catalog — `src/Webhooks/WebhookEventCatalog.php` (10 events). "Live" means the server emits it today; "declared" events are reserved in the catalog (and mirrored in the `phlix-shared` webhook-event schemas) but have no server-side emit site yet, so subscriptions to them simply never fire.

| Event | Status | Payload keys |
|-------|--------|--------------|
| `playback.started` | Live | `session_id`, `user_id`, `media_item_id`, `device_id`, `position_ticks` |
| `playback.ended` | Live | `session_id`, `user_id`, `media_item_id`, `device_id`, `final_position_ticks`, `reached_end` (covers both stop and completion) |
| `library.updated` | Live | `media_item_id`, `library_id`, `path`, `type` (fires when a media item is added) |
| `user.login` | Live | `user_id`, `session_id`, `ip_address`, `user_agent` |
| `user.logout` | Live | `user_id`, `session_id`, `reason` |
| `user.created` | Live | `user_id`, `username`, `email` |
| `download.complete` | Declared | — |
| `recording.started` | Declared | — |
| `recording.stopped` | Declared | — |
| `alert` | Declared | — |

**Legacy aliases.** Older subscription rows may carry `media.started` (→ `playback.started`), `media.played` / `media.stopped` (→ `playback.ended`), or `media.added` (→ `library.updated`); they keep receiving the mapped live events. New subscriptions are always written with the canonical name.

**`webhook.test`** is not a catalog event — the admin "send test" button posts an internal test payload directly to one webhook and cannot be subscribed to.

## Verifying the Signature

Every delivery carries **two** signature headers over the identical raw request-body bytes:

| Header | Format | Status |
|--------|--------|--------|
| `X-Phlix-Signature-V2` | `t=<unix-seconds>,v1=<hex>` | **Preferred.** Timestamped (Stripe-style), replay-resistant. |
| `X-Phlix-Signature` | `sha256=<hex>` | Legacy. Kept byte-identical so already-deployed receivers keep working. |

### Verifying `X-Phlix-Signature-V2` (recommended)

`v1` is `HMAC-SHA256("<t>.<raw body>", secret)` — the timestamp is folded into the signed
string, so a captured request cannot be replayed later. Your receiver should:

1. Split the header into its `t=` and `v1=` parts.
2. **Reject** the delivery when `t` is more than 300 seconds away from now — in either
   direction (a future stamp is just as suspicious as a stale one). 300 s is the reference
   tolerance, `WebhookEvent::DEFAULT_TOLERANCE_SECONDS`.
3. Recompute the HMAC over `"$t.$body"` and compare with `hash_equals` (constant time —
   never `==`).

```php
$body   = file_get_contents('php://input');
$header = $_SERVER['HTTP_X_PHLIX_SIGNATURE_V2'] ?? '';

parse_str(str_replace(',', '&', $header), $parts);
$timestamp = (int) ($parts['t'] ?? 0);
$signature = (string) ($parts['v1'] ?? '');

if ($signature === '' || abs(time() - $timestamp) > 300) {
    http_response_code(401);
    exit('Signature missing or outside tolerance window');
}

$expected = hash_hmac('sha256', "$timestamp.$body", $secret);
if (!hash_equals($expected, $signature)) {
    http_response_code(401);
    exit('Invalid signature');
}
```

Phlix stamps a **fresh timestamp on every retry attempt**, so each delivery — including the
final successful one after retries — carries a current `t=` and simply ages out of your
window if someone tries to resend it.

### Legacy header (deprecated — replayable)

`X-Phlix-Signature: sha256=<hex>` is `hash_hmac('sha256', <raw body>, secret)` over the
payload **only**. Because nothing in it is tied to time, a request captured once can be
replayed forever and your endpoint cannot tell. Verify it as follows only if you must keep
an existing integration running; new receivers should use the V2 header above.

```php
$payload   = file_get_contents('php://input');
$signature = $_SERVER['HTTP_X_PHLIX_SIGNATURE'] ?? '';
$expected  = 'sha256=' . hash_hmac('sha256', $payload, $secret);

if (!hash_equals($expected, $signature)) {
    http_response_code(401);
    exit('Invalid signature');
}
```

## Where to Look

| UI Location | Description |
|------------|-------------|
| Admin UI → Settings → Webhooks | List, add, test, and delete webhooks |
| Admin UI → Logs → Webhooks | View dispatch logs (response codes, errors) |

| API Endpoint | Description |
|-------------|-------------|
| `GET /api/v1/admin/webhooks` | List all registered webhooks |
| `POST /api/v1/admin/webhooks` | Register a new webhook |
| `POST /api/v1/admin/webhooks/{id}/test` | Dispatch a test event |
| `DELETE /api/v1/admin/webhooks/{id}` | Remove a webhook |
| `GET /api/v1/admin/stats/playback` | Playback time-series |
| `GET /api/v1/admin/stats/top-users` | Top users by watch time |
| `GET /api/v1/admin/stats/top-media` | Top media by play count |

## Notification Plugins

Built-in plugins handle formatting for popular services. These are configured via `config/webhooks.php` under the `plugins` key:

| Plugin | Supported Events |
|--------|----------------|
| DiscordPlugin | `playback.started`, `playback.ended`, `library.updated` |
| SlackPlugin | `playback.started`, `playback.ended`, `library.updated` |
| TelegramPlugin | `playback.started`, `playback.ended`, `library.updated` |
| NtfyPlugin | `playback.started`, `playback.ended`, `library.updated` |
| PushoverPlugin | `playback.started`, `playback.ended`, `library.updated` |
| ApprisePlugin | `playback.started`, `playback.ended`, `library.updated` |
| MqttPlugin | `playback.started`, `playback.ended`, `library.updated` |

## See Also

- [Dashboard](./dashboard) — view webhook activity in the admin dashboard
- [Stats](./stats) — detailed playback and library statistics
