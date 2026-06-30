# Web Portal

**Since:** 0.18.0

> [!TIP]
> The Phlix web portal runs in any modern browser — no software to install. Navigate to your server's web address, sign in with your Hub account or enter a direct server URL, and start streaming immediately. Works on Chrome, Firefox, Safari, and Edge.

## Install / Store Links

- **No installation required** — open the URL in your browser and start using it
- **Supported browsers:** Chrome 110+, Firefox 115+, Safari 16+, Edge 110+
- **Mobile browsers:** Fully functional but optimized for desktop

Bookmark your server's web portal URL:
```
https://your-server-domain.com/web
```
Or for local access:
```
http://192.168.1.100:32400/web
```

## Platform-Specific Notes

- The web portal requires the server's web address to be reachable from your browser — either on the local network or via a Hub relay / reverse proxy.
- Some browser extensions (ad blockers, privacy extensions) may interfere with playback. If playback does not start, try disabling extensions or using an incognito/private window.
- For best playback performance, use a browser with hardware acceleration enabled (Chrome and Edge have this on by default).
- **Incompatible formats play automatically.** Titles your browser can't play directly — non-web containers like MKV, or codecs like HEVC (including **10-bit HEVC**) — are transcoded on the server on demand and streamed as HLS. The server transcodes them to 8-bit H.264 (High@4.1, yuv420p) so they decode in any modern browser. You'll see a brief "Preparing your stream…" message while the server starts the conversion, then playback begins. mp4/WebM titles play instantly with no conversion.

## Setup Steps

### Open the Web Portal

1. Open your browser and navigate to your server's web URL.
2. You land on the Phlix login screen.

### Sign In With Hub (Recommended for Multi-Server Users)

1. On the login screen, click **Sign in with Hub**.
2. Enter your Hub URL (e.g., `https://hub.phlix.example.com`) and press **Continue**.
3. Enter your Hub username and password, then click **Sign In**.
4. If your Hub account has multiple servers linked, a picker appears — select the server you want to access.
5. The portal loads your selected server's libraries.

### Sign In With Direct Server URL

1. On the login screen, click **Connect Directly**.
2. Enter your server's direct URL (e.g., `http://192.168.1.100:32400`) and press **Connect**.
3. Enter your server username and password.
4. The portal loads your server's libraries directly.

### No Downloads or Permissions

The web portal uses standard browser APIs and requires no plugins, extensions, or special permissions.

## Browsing Your Media

### Per-library Browse sections

The Browse home (`/app`) is organized as horizontal rails: a **Continue Watching** rail, any rows your server has configured for the home page, and then **one rail per library** — for example **Movies**, **TV**, and **Anime**. Libraries appear in the order the admin set (their display order), then alphabetically.

Each library rail has a **See all** link that opens a dedicated page for that library at `/app/library/<library-id>`. That page is the full grid for the single library, with the filter bar (search, genres, year range, ratings, cast) and pagination — so you can drill into one library at a time instead of one flat all-libraries grid. The media server's sidebar also shows a **Browse** link per library, so you can jump straight to any library's page from the nav.

> The hub's web UI has no libraries, so it shows no per-library rails or links — its home is **My Servers**.

### Adaptive Index Rail {#adaptive-index-rail}

The library page (`/app/library/<id>`) shows a **fixed vertical jump rail** on the right
edge of the grid. Clicking a rail button jumps the grid directly to that bucket's
first title — the same `ensureRange()` random-access mechanism that drives normal
scrolling, so jumped-to skeleton slots fill with the correct titles.

The rail **adapts its bucket labels to the current sort field**:

| Sort field | Rail shows | Default order |
|---|---|---|
| `name` | A–Z letters | asc |
| `year` | Decade buckets (1990s, 2000s, …) | desc |
| `rating` | MPAA rating buckets (G, PG, PG-13, R, …) | desc |
| `runtime` | Duration buckets (0–30 min, 30–60 min, …) | desc |
| `date_added` | Relative time buckets (Today, This week, …) | desc |

The rail re-fetches automatically whenever the sort field changes, so switching from
`name-asc` to `year-desc` swaps the A–Z rail for a decade rail.

> [!TIP]
> **Server compatibility:** On older servers that don't implement `GET /api/v1/media/index`,
> the rail silently hides (graceful 404 fallback). Browsing works normally.

### TV & anime series

A series-type library (e.g. **TV** or **Anime**) lists **shows**, not a flat dump
of every episode. Each card is a series; the rails and the library page show the
shows only.

Opening a show goes to its **series page**: a hero with the show artwork and
details, plus a **season grid** below it.

- The grid shows **one card per season** (and a **Specials** card, grouped last),
  each with the season poster, the "Season N" / "Specials" label, and the episode
  count.
- Click a season card to open its **per-season page**, which lists that season's
  **episodes** in order — episode number, title, and runtime — with a back link to
  the series page.
- Click any episode (or its play button) to start it. **Play** on the series hero
  starts the first episode.

Searching inside a series library still matches episodes by title — the
"shows only" view applies to browsing, not to search.

### Media-type sections

Each media type also has a dedicated set of browsing pages:

| Section | Pages | Entry URL |
| --- | --- | --- |
| **Music** | Albums, album detail, artists, artist detail, all-tracks, and a standalone player | `/music` (albums), `/music/artists`, `/music/tracks`, `/music/player` |
| **Books** | Library grid, book detail, and a built-in reader | `/books`, `/books/{id}`, `/books/{id}/read` |
| **Audiobooks** | Library grid, detail with chapter list, and the player | `/audiobooks`, `/audiobooks/{id}`, `/audiobooks/{id}/read` |
| **Photos** | Date-grouped album grid, album view, single-photo view with EXIF, and a slideshow | `/photo/albums`, `/photo/album/{id}`, `/photo/photo/{id}`, `/photo/slideshow` |

Notes:

- The album and slideshow photo pages need a `library_id` query parameter; the links generated within the portal include it automatically.
- Book covers and downloads are served from `/books/{id}/cover` and `/books/{id}/download`; photo thumbnails and full-size images from `/photo/photos/{id}/thumbnail` and `/photo/photos/{id}/full`.
- The music section uses generated cover-art placeholders; embedded album art is not yet rendered.

## Playback

The web player runs in the browser and handles both direct-play (mp4/WebM) and
on-demand transcoded (HLS) titles.

### Autoplay

Opening a title from a **Play** click starts playback automatically as soon as the
stream is ready — no extra click on the player. If your browser blocks autoplay
with sound, playback retries **muted**; you can unmute from the player's volume
control. If even muted autoplay is blocked, the center play button remains as a
tap-to-play affordance.

### Previous / Next episode

When you're watching an episode, the player shows **Previous** and **Next episode**
buttons flanking play/pause. They follow the show's order and roll over across
seasons — the last episode of a season is followed by the first of the next.
**Specials are excluded from the auto-advance chain** (they remain reachable from
the series page), and the buttons are hidden at the very first / last episode and
for movies.

### Subtitles

Embedded **text** subtitle tracks (ASS/SRT) in a transcoded title are extracted on
the server to WebVTT and offered as selectable tracks in the player's captions menu,
each with a language and label. Pick a track or turn captions off from the menu; your
choice is remembered. (Bitmap subtitle formats such as PGS/dvdsub are not extracted.)

### Player controls

The player's control menus (such as the speed and quality selectors) use a
translucent dark styling that matches the player chrome.

### Page titles

The browser tab title updates as you navigate — it reflects the current page or the
title of the media you're viewing or playing (for example `Assassination Classroom · Phlix`),
so tabs and history entries are easy to tell apart.

## Hub Connection

1. Click **Sign in with Hub** on the login screen.
2. Enter your Hub URL → authenticate → select a server.
3. The Hub relay provides remote access automatically — no router port forwarding or VPN required.
4. When signed in with Hub, switch between your Hub-linked servers from the user menu in the top-right corner.

Hub login is the recommended way to access your server remotely because the Hub relay handles the connection without exposing your server directly to the internet.

## What Can Go Wrong

### Browser not supported

**Symptom:** The page looks broken or displays a banner "Browser not supported."

**Fix:** Your browser is outdated. Update to the latest version of Chrome, Firefox, Safari, or Edge. Internet Explorer is not supported — use Edge or another modern browser instead.

### WebSocket blocked by network proxy

**Symptom:** The page loads and you can see the library, but playback never starts and the console shows "WebSocket connection error."

**Fix:** Your network is blocking WebSocket connections (`ws://` or `wss://`). Try opening the portal from a different network. If you must use a restricted network, ask your network administrator to allow WebSocket traffic on port 443. As a workaround, use the Phlix mobile or desktop client.

### SSL certificate invalid or self-signed

**Symptom:** The browser shows "Your connection is not private" and refuses to load the page.

**Fix:** Your server is using a self-signed SSL certificate. For production, replace it with a properly signed certificate — [Let's Encrypt](https://letsencrypt.org) provides free automatic certificates. For local testing over HTTPS with a self-signed cert, type `thisisunsafe` on the Chrome warning page to proceed (Chrome only).

## Next Steps

- [Mobile app](./mobile.md) — iOS and Android
- [Windows client](./windows.md) — desktop app with system tray and media key support
- [First-run wizard](../first-run.md) — complete server setup after your first login
