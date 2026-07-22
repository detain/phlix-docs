# Signed media URLs

Phlix gates every endpoint that serves **media bytes** — video, audio, images,
book files and adaptive-streaming manifests/segments — behind proof of an
authenticated session. Because a `<video>`/`<img>`/`<audio>` element, an e-reader,
or a TV/console player **cannot attach an `Authorization: Bearer` header** to the
request it makes, Phlix mints short-lived **signed URLs** that carry the proof in
the query string instead.

This page explains the scheme for operators and client developers. The JSON
listing/search/detail API is gated separately by the normal Bearer-token
middleware and is unaffected.

## Why

The browse/search/detail JSON endpoints require a logged-in user. The byte-serving
routes used to be reachable by anyone who knew an item's (UUID) id — which is only
discoverable through the now-gated listings, but still a real residual gap. Signed
URLs close it without breaking media elements that can't send a header.

Gated routes:

| Route | Serves |
| --- | --- |
| `GET /media/{id}/stream` | Direct-play video/audio (HTTP `Range` supported) |
| `GET /hls/{job}/**` · `GET /dash/{job}/**` | Adaptive-streaming manifests + segments |
| `GET /api/v1/books/{id}/{read,cover,download}` | Book reader payload, cover, file download |
| `GET /opds/v1.2/**` | OPDS catalog feeds + cover/acquisition links |
| `GET /api/v1/audiobooks/{id}/{read,stream}` | Audiobook player payload + audio stream |
| `GET /api/v1/photo/photos/{id}/{thumbnail,full}` | Photo thumbnail + full-resolution image |

## How a request is authorized

A request to any gated route is allowed if it satisfies **any one** of the
following (checked in this order):

1. **An authenticated session.** The HTTP entry point resolves a user from an
   `Authorization: Bearer <token>` header **or** the `phlix_session` cookie before
   dispatch. This is what lets the in-browser player keep working untouched:
   `hls.js` attaches the Bearer token to every segment request via `xhrSetup`, and
   a same-origin `<img>`/`<video>` sends the session cookie automatically.
2. **A valid signed URL.** A `?exp=<unix-seconds>&sig=<token>` pair minted by the
   gated JSON detail endpoints (see below). This covers cookieless / headerless
   contexts: native apps, casting, and cross-origin embeds.
3. **HTTP Basic** — for the OPDS feeds only (see [OPDS](#opds-feeds)).

Anything else gets `401 {"error":"Unauthorized","code":"auth.required"}`.

## The signature

```
sig = base64url( HMAC-SHA256( key, "phlix-signed-url-v1\n" + resource + "\n" + exp ) )
```

- **`resource`** is the request path with the query string removed. For HLS/DASH it
  is the **per-job directory prefix** (`/hls/{job}` or `/dash/{job}`), so a single
  signature on the master-playlist URL authorizes every variant playlist, segment
  and sidecar subtitle under that job. For every other route it is the exact path.
- **`exp`** is an absolute Unix expiry timestamp. Verification rejects an expired
  token, a malformed/missing `exp`/`sig`, and any tampering (constant-time compare).
- Only the path is signed — never the runtime query params (a photo's `w`/`h`/`fit`,
  an audiobook's `chapter`/`offset`), so a client may vary those freely.
- **`key`** comes from [`PHLIX_SIGNED_URL_SECRET`](/reference/env-vars); when unset
  it is derived from `JWT_SECRET` via a domain-separated HMAC, so a signed-URL token
  can never be replayed as — or brute-forced against — a JWT, and vice-versa.
- The token lifetime defaults to **6 hours**, configurable via
  [`PHLIX_SIGNED_URL_TTL`](/reference/env-vars).

A minted URL looks like:

```
/media/2f1c…/stream?exp=1750531200&sig=Yp3K8…
/api/v1/photo/photos/9a…/thumbnail?w=400&h=400&fit=cover&exp=1750531200&sig=Qm2…
/hls/job-7/master.m3u8?exp=1750531200&sig=Le9…
```

## Where URLs are minted

The now-gated JSON detail endpoints embed the signed URL in the field the client
already reads:

| Endpoint | Signed field(s) |
| --- | --- |
| `GET /api/v1/media/{id}` | `stream_url` (direct play) |
| `POST /api/v1/media/{id}/transcode` · `…/status` | `master_url`, `hls_url`, and each subtitle track `url` (no `dash_url` — DASH is not currently produced; see updates.md #57 / S56-S60) |
| `getBook` / `readBook` | `cover_url`, `read_url`, `download_url` |
| `getAudiobook` / `readAudiobook` | `stream_url`, `read_url` |
| `getPhoto` / list / album / slideshow | `thumbnail_url`, `full_url` |

A client fetches the (authenticated) detail endpoint, then hands the signed field
straight to the player / `<img>` / download link.

## OPDS feeds

OPDS e-reader clients authenticate with **HTTP Basic** (`Authorization: Basic`),
not a Bearer token, and re-send it on every feed, cover and download request. The
OPDS routes therefore accept Basic in addition to a session or a signed URL:

- Valid credentials for an **active** account are accepted (validated without
  creating a session).
- A missing or bad credential returns `401` with
  `WWW-Authenticate: Basic realm="Phlix OPDS"`, so the reader prompts for a login.

Point your reader at `https://<server>/opds/v1.2` and enter your Phlix username (or
email) and password.

## Client developer notes

- **Web player / browser** — no action needed beyond consuming the signed field:
  the SPA player points its `<video src>` at `stream_url` from `GET /api/v1/media/{id}`,
  and `hls.js` attaches the Bearer token to segment requests via `xhrSetup`. Posters
  from external providers (e.g. TMDB) are **not** signed — they aren't Phlix routes.
- **Native clients** (Roku, Tizen, Windows, mobile) — prefer the server-minted signed
  URL (`stream_url`) for the player source rather than building a bare
  `/media/{id}/stream` path. A client whose player can attach an `Authorization`
  header may instead send the Bearer token, which the session check accepts.
- **Casting / DLNA** — the receiver fetches the URL with no Phlix auth context, so it
  must be a signed URL. Hand the cast target the signed `stream_url` / `master_url`.
- **Expiry** — signed URLs are short-lived. Mint them just before playback; if a
  long-paused session resumes after a token expires, re-fetch the detail endpoint for
  a fresh URL.

## Operator checklist

- Set a strong, unique [`JWT_SECRET`](/reference/env-vars) (the signing key derives
  from it by default). Set [`PHLIX_SIGNED_URL_SECRET`](/reference/env-vars) only if
  you want to rotate stream tokens independently of JWTs.
- Tune [`PHLIX_SIGNED_URL_TTL`](/reference/env-vars) if 6 hours doesn't fit your
  playback patterns (longer = fewer re-fetches on long pauses; shorter = smaller
  leak window if a URL is shared).
- Rotating the signing key (or bumping the scheme version) invalidates all
  outstanding signed URLs immediately — clients simply re-fetch the detail endpoint.
