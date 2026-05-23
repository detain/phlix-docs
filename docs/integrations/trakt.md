# Trakt.tv Integration

**Since:** 0.14.0
**Plugin type:** `scrobbler`

::: info Note
Trakt.tv integration is a built-in server plugin. No separate install is required.
:::

## Overview

The Trakt.tv integration provides **two-way watch-history synchronization** and **real-time scrobbling** for movies and TV shows.

- **Two-way sync:** Completed items (≥ 90% watched) are pushed from Phlix to Trakt; items watched on other Trakt-connected apps are pulled into Phlix.
- **Scrobbling:** Uses Trakt's 3-state scrobble protocol (`start` / `pause` / `stop`) to track playback in real time.
- **Authentication:** OAuth2 with PKCE — no password is stored.

---

## What Gets Synced

| Direction | Trigger | Data |
| -------- | ------- | ---- |
| Phlix → Trakt | Playback stops at ≥ 90% completion | Watched-history entry |
| Trakt → Phlix | Scheduled sync run | Watched-history entries not yet ≥ 90% in Phlix |

::: warning Note
Trakt → Phlix sync requires matching Trakt items to local media items via TMDB/TVDB/IMDB IDs. This lookup is stubbed in 0.14.0 and returns null, so the pull direction is a no-op until it is wired up. The push direction (Phlix → Trakt) works fully.
:::

---

## Connecting Your Account

### Prerequisites

You need a Trakt application with credentials:

1. Go to [https://trakt.tv/apps](https://trakt.tv/apps)
2. Click **Register a New Application**
3. Set the **Redirect URI** to match your server's callback URL (see `config/scrobblers/trakt.php` `redirect_uri`)
4. Copy the **Client ID** and **Client Secret**

### Connect Flow

1. Open **Settings → Integrations → Trakt.tv** in the Phlix web UI
2. Click **Connect with Trakt**
3. You are redirected to Trakt's authorization page — approve access
4. Phlix receives the callback, exchanges the code for tokens, and stores them
5. Your Trakt username is displayed as confirmation

The OAuth flow uses PKCE (`S256` code challenge method). Tokens are stored per-user in the plugins settings table and are refreshed automatically on 401 responses.

---

## Configuration

### Environment / Config File

The server-side config lives in `config/scrobblers/trakt.php`:

```php
// config/scrobblers/trakt.php
return [
    'client_id'     => getenv('TRAKT_CLIENT_ID') ?: '',
    'client_secret' => getenv('TRAKT_CLIENT_SECRET') ?: '',
    'redirect_uri'  => 'https://your-server.com/api/v1/oauth/trakt/callback',
    'sync_interval' => 30,   // minutes between Trakt→Phlix sync runs
];
```

| Key | Source | Description |
| --- | ------ | ----------- |
| `client_id` | `TRAKT_CLIENT_ID` env var or direct | Trakt app Client ID |
| `client_secret` | `TRAKT_CLIENT_SECRET` env var or direct | Trakt app Client Secret |
| `redirect_uri` | Direct in config | Must match what is registered in your Trakt app |
| `sync_interval` | Direct in config | Minutes between scheduled sync runs (default: `30`, min: `5`, max: `1440`) |

### Per-User Settings

These are stored in the plugins settings JSON for each user:

| Key | Type | Default | Description |
| --- | ---- | ------- | ----------- |
| `enabled` | bool | `false` | Master on/off switch |
| `username` | string | `''` | Trakt username for attribution |
| `access_token` | string | `null` | OAuth access token |
| `refresh_token` | string | `null` | OAuth refresh token |
| `expires_at` | int | `null` | Unix timestamp when access token expires |
| `sync_enabled` | bool | `true` | Whether two-way history sync runs |
| `sync_interval_minutes` | int | `30` | How often Trakt→Phlix sync fires |
| `scrobble_enabled` | bool | `true` | Whether real-time scrobbling is active |

---

## Scheduled Sync Behaviour

The Trakt → Phlix sync runs on a configurable interval (default 30 minutes):

1. Fetches the user's full watched history from Trakt (paginated, up to 100 items per page)
2. For each Trakt item, looks up the corresponding local media item (stubbed — returns null until ID resolution is wired up)
3. If the local item exists and is **below** the 90% completion threshold, writes a completed entry to the local watch history
4. Items already ≥ 90% complete in Phlix are skipped (last-write-wins on the 90% threshold)

The push direction (Phlix → Trakt) is triggered immediately on `PlaybackStopped` when the item has reached ≥ 90% completion — it does not wait for the scheduled sync.

---

## Troubleshooting

### "Scrobble failed (auth)" in logs

**Cause:** Access token expired and refresh failed (e.g., refresh token revoked).

**Fix:** Disconnect and reconnect the account in **Settings → Integrations → Trakt.tv**.

### Sync runs but nothing is written

**Cause:** The Trakt → Phlix media-item ID lookup is stubbed in 0.14.0. Items that exist in Trakt but not in the local library are correctly skipped; items in the local library are also skipped because the lookup currently returns null.

**Fix:** This is a known limitation. The TMDB/TVDB resolver is tracked as a future enhancement.

### "Plugin not configured" in logs

**Cause:** Either `client_id` / `client_secret` are empty in `config/scrobblers/trakt.php`, or the user has not connected their Trakt account in the UI.

**Fix:** Verify the config file has valid credentials, then connect the account in the web UI.

### Token refresh fails with 401

**Cause:** The user revoked the application's access from their Trakt account page.

**Fix:** The user must disconnect and reconnect from **Settings → Integrations → Trakt.tv**.

---

## See Also

- [Scrobbler Plugin Guide](../developers/scrobbler-plugins.md) — Plugin architecture and event reference
- [WatchHistory Reference](../reference/env-vars.md) — Local history tracking and the 90% threshold
