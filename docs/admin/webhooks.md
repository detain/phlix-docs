---
title: Webhooks
description: Configure webhook notifications for server events
---

# Webhooks

Webhooks allow Phlix to send real-time HTTP notifications to external services when events occur on your server. This enables integration with Slack, Discord, Telegram, MQTT brokers, and any HTTP endpoint that can verify the `X-Phlix-Signature` header.

## What It Is

The webhook system dispatches events via signed HTTP POST requests to configured endpoints. Each request includes a JSON payload with event type, timestamp, and event-specific data. Webhook URLs can be registered, listed, tested, and deleted via the admin API. Retries (configurable, default 2) are attempted on failure, and failure counts are tracked per webhook.

## How to Configure

### Via API

All webhook management is under the `/api/v1/admin/webhooks` endpoint group, protected by admin authentication.

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

| Event | Description | Payload keys |
|-------|-------------|--------------|
| `playback.started` | User began playing media | `user_id`, `media_item_id`, `media_type`, `device_id` |
| `playback.ended` | Playback stopped or completed | `user_id`, `media_item_id`, `media_type`, `duration_seconds`, `completed` |
| `library.updated` | Library scan completed or item added/removed | `change_type` (`item_added`\|`item_removed`\|`metadata_updated`), `media_item_id`, `library_id` |
| `webhook.test` | Sent only when manually testing a webhook | `message`, `webhook_id` |

## Verifying the Signature

Every request includes an `X-Phlix-Signature` header with format `sha256=<hmac>`. Compute `hmac_sha256(json_payload, secret)` to verify:

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
