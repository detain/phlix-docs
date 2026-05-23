# Last.fm Scrobbling

**Since:** 0.15.0
**Plugin type:** `scrobbler`

::: info Note
Last.fm scrobbling is a built-in server plugin. No separate install is required.
:::

## Overview

The Last.fm integration submits **scrobbles** (listening records) to your Last.fm profile when you finish watching a track or video in Phlix. It also optionally sends **Now Playing** notifications when playback starts.

Unlike Trakt.tv's 3-state protocol, Last.fm uses a simple **2-state model**:

| Event | Last.fm Action |
| ----- | -------------- |
| Playback started | `updateNowPlaying` (optional, off by default) |
| Playback stopped (≥ 30s AND > 50% played) | `scrobble` |

Last.fm session keys are **per-user** and stored in the `lastfm_sessions` database table. Multiple users on the same Phlix server can each connect their own Last.fm account.

---

## What Gets Scrobbled

Scrobbling is limited to media items that carry both an **artist** and a **title** in their metadata. This typically covers:

- Music tracks and albums
- Music videos
- Audiobooks (if tagged with an artist)

Movies, TV shows, and other content without artist/title metadata do **not** trigger scrobbles, as Last.fm does not accept scrobbles without this information.

### Scrobble Rules

Last.fm's official scrobble rules are enforced **before** submission:

| Rule | Value |
| ---- | ----- |
| Minimum track duration | > 30 seconds |
| Minimum played fraction | > 50% of total duration |

If either condition is not met, the scrobble is silently skipped. Tracks with unknown duration are also skipped, as a conservative measure.

---

## Connecting Your Account

### Prerequisites

You need a Last.fm API account:

1. Go to [https://www.last.fm/api/account/create](https://www.last.fm/api/account/create)
2. Enter an app name (e.g., "Phlix Media Server")
3. Copy the **API Key** and **Shared Secret**

### Connect Flow

1. Open **Settings → Integrations → Last.fm** in the Phlix web UI
2. Click **Connect with Last.fm**
3. You are redirected to Last.fm's authorization page — approve access
4. Phlix receives the token, exchanges it for a long-lived session key via `auth.getSession`, and stores it
5. Your Last.fm username is displayed as confirmation

---

## Configuration

### Environment Variables

The Last.fm plugin reads its config from `config/lastfm.php`, which maps environment variables:

```bash
LASTFM_ENABLED=1              # Set to 1 to enable the plugin
LASTFM_API_KEY=your_api_key     # From https://www.last.fm/api/account/create
LASTFM_SHARED_SECRET=your_secret # From the same page
LASTFM_CALLBACK_URL=https://your-server.com/api/v1/oauth/lastfm/callback
LASTFM_USERNAME=your_username   # Display name shown in the UI
LASTFM_SUBMIT_NOW_PLAYING=1    # Set to 0 to disable Now Playing updates
```

### Config File Reference

`config/lastfm.php` wraps these environment variables:

| Key | Env Var | Default | Description |
| --- | ------- | ------- | ----------- |
| `enabled` | `LASTFM_ENABLED` | `false` | Master on/off switch |
| `api_key` | `LASTFM_API_KEY` | `''` | Last.fm API key |
| `shared_secret` | `LASTFM_SHARED_SECRET` | `''` | Last.fm API secret (used for request signing) |
| `callback_url` | `LASTFM_CALLBACK_URL` | `''` | OAuth callback URL (must match Last.fm app settings) |
| `username` | `LASTFM_USERNAME` | `''` | Display-only username for the "Connected as X" panel |
| `submit_now_playing` | `LASTFM_SUBMIT_NOW_PLAYING` | `true` | Send `track.updateNowPlaying` on playback start |
| `session_key` | `LASTFM_SESSION_KEY` | `''` | Legacy single-user session key (unused by per-user scrobbler) |

---

## How Scrobbling Works

### 1. Playback Started

When playback begins, the plugin calls `track.updateNowPlaying` if `submit_now_playing` is enabled. This updates your Last.fm profile to show what you are listening to right now. It does **not** create a scrobble.

### 2. Playback Stopped

When playback stops:

1. The scrobbler resolves the media item's **artist**, **title**, **album**, and **duration** from the local item repository
2. It checks the two Last.fm rules (> 30s duration AND > 50% played)
3. If both pass, it submits a `track.scrobble` with:
   - `artist` — the track artist
   - `track` — the track title
   - `album` — album name (if available)
   - `timestamp` — Unix timestamp of when playback started (`now - played_seconds`)

The scrobble timestamp is backdated to when you actually started listening, not when the track ended.

---

## Per-User Sessions

Unlike a single shared API key, Last.fm scrobbling uses **per-user session keys** stored in the `lastfm_sessions` table:

| Column | Description |
| ------ | ----------- |
| `user_id` | Phlix user UUID (FK to `users`) |
| `session_key` | Last.fm session key |
| `username` | Last.fm display name |
| `created_at` | When the session was created |

When a scrobble is submitted, the plugin looks up the session key for the **current Phlix user** who started the playback. Multiple users on the same Phlix server can each have their own Last.fm account connected simultaneously.

---

## Troubleshooting

### Scrobbles not appearing on Last.fm

**Check 1 — Rules not met:** Verify the track is longer than 30 seconds and you played more than 50% of it. Enable debug logging (`PHLIX_LOG_LEVEL=debug`) and look for `Last.fm scrobble skipped: rule not satisfied` in `.logs/app.log`.

**Check 2 — No artist metadata:** Scrobbles require artist and title metadata on the media item. If the item has no artist field, the scrobble is silently skipped. Check the media item's metadata in the library view.

**Check 3 — Session expired:** If `LastfmSessionRepository` returns null, the session key may have been deleted from the database. Reconnect the account in **Settings → Integrations → Last.fm**.

### "Last.fm plugin not enabled: config incomplete or disabled" in logs

**Cause:** Either `LASTFM_ENABLED` is not set to `1`, or `LASTFM_API_KEY` / `LASTFM_SHARED_SECRET` are empty.

**Fix:** Set the three environment variables and restart the server.

### Now Playing not updating

**Cause:** `submit_now_playing` is set to `0`, or the media item lacks artist/title metadata (required for `track.updateNowPlaying`).

**Fix:** Set `LASTFM_SUBMIT_NOW_PLAYING=1` in the environment and verify the media item has artist metadata tagged.

### API signature errors

**Cause:** The `shared_secret` in the config does not match the one registered with your Last.fm API key.

**Fix:** Regenerate the secret from [https://www.last.fm/api/account](https://www.last.fm/api/account) and update `LASTFM_SHARED_SECRET`.

---

## See Also

- [Last.fm Plugin Developer Guide](../developers/lastfm-plugin.md) — Internal architecture and protocol details
- [Scrobbler Plugin Guide](../developers/scrobbler-plugins.md) — Plugin type definition and event reference
