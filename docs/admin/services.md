# Services

The Services page (`/admin/services`) in the admin console provides connect/disconnect
management for two scrobbling integrations: **Trakt.tv** (watch history sync) and
**Last.fm** (scrobbling during playback).

Both integrations live on the same page in two side-by-side cards. The page replaces
the orphaned Smarty `admin/lastfm.tpl` template; that template is now unreachable once
the SPA page is live.

---

## Trakt.tv

Trakt.tv integration syncs your watch history and progress with your Trakt account.

### What it does

- Shows whether a Trakt token is currently stored (connected vs. not connected).
- **Connect** navigates the browser to `/api/v1/oauth/trakt` — Trakt's OAuth authorization
  page. After the user approves, Trakt redirects back to `/admin/services` and the
  page refreshes to show the connected state.
- **Disconnect** calls `POST /api/v1/admin/services/trakt/disconnect` to clear the stored
  token and shows a success toast.

The `client_secret` never leaves the server. The SPA navigates via `window.location.href`
rather than `fetch()` for the OAuth redirect endpoints.

### Managing Trakt in the UI

| Action | How |
|--------|-----|
| Check status | Card shows **Connected** or **Not connected** badge |
| Connect | Click **Connect** → `window.location.href = '/api/v1/oauth/trakt'` → browser navigates to Trakt authorization |
| Disconnect | Click **Disconnect** → `POST /api/v1/admin/services/trakt/disconnect` → success toast → status refreshes |

### API contract

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/admin/services/trakt/status` | Returns `{ connected: bool }` — checks whether an access token is stored |
| `GET` | `/api/v1/oauth/trakt` | Redirects (302) to Trakt.tv authorize URL — never fetched by the SPA |
| `GET` | `/api/v1/oauth/trakt/callback?code=...&state=...` | OAuth callback; redirects (302) to `/admin/services` — never fetched by the SPA |
| `POST` | `/api/v1/admin/services/trakt/disconnect` | Clears the stored Trakt tokens; returns `{ message }` |

---

## Last.fm scrobbling

Last.fm scrobbling automatically records your playback activity to your Last.fm profile
during playback.

### What it does

- Shows whether a Last.fm session exists for the current user (connected vs. not connected).
- **Connect** navigates to `/admin/lastfm` — the existing Last.fm OAuth flow (the same
  Smarty page that was the only UI before step 1.4c). After authorizing, Last.fm
  redirects back to `/admin/services`.
- **Disconnect** calls `POST /api/v1/admin/services/lastfm/disconnect` to clear the
  per-user session and refreshes the status.

### Managing Last.fm in the UI

| Action | How |
|--------|-----|
| Check status | Card shows **Connected** (with username) or **Not connected** badge |
| Connect | Click **Connect** → `window.location.href = '/admin/lastfm'` → existing Last.fm OAuth page |
| Disconnect | Click **Disconnect** → `POST /api/v1/admin/services/lastfm/disconnect` → status refreshes |

### API contract

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/admin/services/lastfm/status` | Returns `{ connected: bool, username?: string }` |
| `GET` | `/admin/lastfm` | Server-side OAuth redirect to Last.fm authorize URL — never fetched by the SPA |
| `POST` | `/api/v1/admin/services/lastfm/disconnect` | Clears the Last.fm session for the current user; returns `{ message }` |

### Relationship to the Smarty template

`GET /admin/lastfm` (Smarty) and `GET /admin/lastfm/callback` (Smarty) remain registered
in `LastfmController` and are unchanged. They are now only reachable via the **Connect**
button on the SPA page, since the SPA replaces the standalone Smarty UI. The
`POST /admin/lastfm/disconnect` Smarty handler also remains but is unused by the SPA
(the SPA uses the JSON `apiDisconnect()` variant instead).
