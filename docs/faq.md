# FAQ

**Since:** 0.18.0

Common questions from operators and end users. Each answer links to the relevant page for fuller context.

---

## Library & Media

### Which file formats does Phlix play directly, and which need transcoding?

Phlix uses FFmpeg for playback. Direct-play (no transcoding) depends on your client's codec support, but common direct-play formats include H.264/AAC in MP4/MKV for most modern clients, and HEVC (H.265) where the client hardware supports it. Formats that typically require transcoding include WMV, FLV, and any container with an unsupported audio codec (e.g. DTS or FLAC without prior setup).

See [/advanced/hardware-transcoding](/advanced/hardware-transcoding) for hardware-accelerated transcoding and [/reference/config-files](/reference/config-files) for FFmpeg path and codec configuration.

### A library item is unmatched / not found — how do I fix it?

1. Check the file naming convention. Phlix matches movies by `MovieName (Year).ext` and TV by `ShowName S01E01.ext`. See [/libraries/movies](/libraries/movies) and [/libraries/tv-shows](/libraries/tv-shows) for exact patterns.
2. **Fix one title:** use the per-item **Match metadata** action (admin-only, on the media card's ⋯ menu and on the detail page hero). It searches TMDB and applies the result you pick, and for a series it enriches the whole season/episode subtree. This is the most reliable remedy for a single wrong or missing match. See [Fixing a single item's match](/admin/library-management#fixing-a-single-items-match).
3. **Fix a whole library:** `POST /api/v1/libraries/{id}/match-metadata` queues a background match over every item that has **no** metadata yet. It is the tool for *unmatched* items; it will **not** correct an item that matched the *wrong* title, and neither will `refresh-metadata` on its own — see [Fixing a wrong match](/admin/library-management#fixing-a-wrong-match). Both jobs visit `movie`, `video` and `series` rows only. See [Enqueue a metadata match](/admin/library-management#enqueue-a-metadata-match).
4. If the filename itself is wrong, rename it to match the expected pattern first — the matcher works from the title and year parsed out of the path, so nothing downstream can recover from a name it cannot parse. After renaming, run a **Rescan** (**Admin → Libraries → Rescan**, or `php bin/phlix library:scan {libraryId} --rescan`; `php bin/phlix library:list` prints the ids) so the renamed file is indexed as a new row, then run the metadata match from step 3. Note that this leaves the old row to be pruned, so the item's watch history and resume position do not survive the rename. Rename in place — do **not** also move the file, or the item disappears for a rescan; see [Moving a file](/admin/library-management#moving-a-file).
5. For TV shows, verify season/episode folders are named correctly — nested folders with an `S01E01` file inside a `Season 1` folder are supported.

::: warning A rescan will not re-match an already-indexed movie or episode
Only the **music** scanner acts on a rescan's "read every file" flag. On a movie,
TV, photo, book or audiobook library a path that is already in the catalogue is
not re-parsed and not re-matched — the rescan does a missing-source-metadata
backfill on that row and moves on (and not even that on a `photo` or `book` row,
where the backfill is skipped by type). For a **movie or TV** library, reach for the
metadata-match actions above rather than Rescan. See
[Scan vs Rescan vs Match metadata](/admin/library-management#scan-vs-rescan-vs-match-metadata).
:::

::: danger Photo, book and audiobook items cannot be re-matched at all
The steps above are TMDB-backed and apply to movies and TV only. The server ships
no metadata-fetching provider for `photo`, `book` or `audiobook` items, and both
`match-metadata` and `refresh-metadata` skip those rows outright — the job reaches
`completed` having processed **zero** items, with no error to tell you so. Such an
item keeps whatever the scanner wrote when it was first indexed; the only way to
change it is to **rename** the file (or delete the item) and scan again, which
creates a **new row** and loses the old row's watch state. **Moving** the file is
not an alternative — it creates no new row at all and the next rescan prunes the
existing one; see [Moving a file](/admin/library-management#moving-a-file). See also
[what Match metadata skips](/admin/library-management#what-match-metadata-skips).
:::

### Why does playback not resume where I left off?

Continue-watching tracks positions per user profile. Make sure:
- You are logged into the same profile.
- You have completed at least 90% of the previous session (the threshold for marking "watched").
- The `session.log` shows a `PlaybackState` save — check `tail -f .logs/session.log` during playback.

If a resume position is wrong, seeking to the correct point and letting it play for a few seconds updates the record.

---

## Hub & Remote Access

### Is the Hub required for remote access?

No. The Hub is optional. Without it, you can still access Phlix directly over the internet by configuring a reverse proxy with your own TLS certificate. See [/advanced/remote-access-without-hub](/advanced/remote-access-without-hub) and [/advanced/reverse-proxy](/advanced/reverse-proxy).

The Hub provides a simpler experience: it handles TLS, allocates a `*.phlix.media` subdomain, and maintains a persistent tunnel so you do not need to expose ports or manage your own certificate.

See [/hub/what-is-the-hub](/hub/what-is-the-hub) for the full comparison.

---

## Hardware & Performance

### What are the minimum hardware requirements?

**Minimum:** 2 CPU cores / 4 GB RAM for a single-stream, software-transcoded setup.

**Recommended for multiple concurrent streams or 4K:** 4+ cores, 8 GB RAM, and a GPU (NVIDIA NVENC, Intel Quick Sync, or AMD VAAPI) for hardware-accelerated transcoding.

Without a GPU, 4K HEVC transcoding will be slow and CPU-intensive. See [/advanced/hardware-transcoding](/advanced/hardware-transcoding) for supported encoders.

### FFmpeg transcoding is very slow / CPU maxed out

1. Verify a GPU is detected: `ffmpeg -hide_banner -encoders 2>&1 | grep -i nvenc` (NVIDIA) or `vainfo` (VAAPI).
2. If no GPU output, hardware acceleration is not active. See [/advanced/hardware-transcoding](/advanced/hardware-transcoding) to enable it.
3. Check the transcode log at `.logs/transcode/<job-id>.log` for FFmpeg errors.
4. Lower the quality preset in **Admin → Server Settings → Transcoding** — a CRF of 28 (lower quality, faster) vs 23 (higher quality, slower) makes a large difference on CPU-only systems.

---

## Installation & Configuration

### I updated Phlix and now library items are missing or playback fails

For **missing items**, re-walk the library so every file at a path that is not yet in
the catalogue is indexed and anything whose file is gone is pruned:

```bash
sudo -u phlix php bin/phlix library:list                       # get the library ids
sudo -u phlix php bin/phlix library:scan {libraryId} --rescan  # one library at a time
```

This is non-destructive for items still sitting at their recorded path. It is **not** safe if you moved media files as part of the upgrade — a top-level item whose file moved without being renamed is pruned rather than re-indexed; see [Moving a file](/admin/library-management#moving-a-file). See [/install/upgrade](/install/upgrade) for the full upgrade procedure including migration steps.

For **metadata** that changed shape between releases, a rescan is the wrong tool: it does not re-fetch metadata for rows that are already indexed. Queue a forced re-match instead, which re-resolves items that already carry metadata:

```bash
curl -X POST http://localhost:8096/api/v1/libraries/{id}/refresh-metadata \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

This applies to **movie and TV** libraries — the job visits `movie`, `video` and
`series` rows only. See
[Force a metadata re-match](/admin/library-management#force-a-metadata-re-match).

### Can I use a remote MySQL database instead of localhost?

Yes. `config/database.php` reads every connection parameter from environment variables. Set `DB_HOST`, `DB_PORT`, `DB_DATABASE`, and `DB_USER` to point at your remote instance. See [/reference/config-files](/reference/config-files) and [/reference/env-vars](/reference/env-vars) for all supported variables and their defaults.

---

## Security

### How do I enable passkey/WebAuthn authentication?

Phlix supports passkeys as a passwordless authentication method. See [/security/passkeys](/security/passkeys) for setup instructions.

### How do signed media URLs work, and should I change the secret?

Every stream request is gated by a time-limited signed URL. The signing secret is derived from `JWT_SECRET` by default. Rotating it independently is possible — see [/security/signed-media-urls](/security/signed-media-urls).

### I see failed login attempts in the AUTH log — is my server under attack?

Failed login attempts are normal. The AUTH log (`auth.log`) records every attempt. If you see a high volume of failures from the same IP, consider:
- Setting up a reverse proxy with fail2ban or similar rate limiting (see [/advanced/reverse-proxy](/advanced/reverse-proxy)).
- Enabling `PHLIX_HUB_TLS_ENABLED=1` and using the Hub's tunnel instead of exposing port 8096 directly.
- Using passkeys instead of passwords ([/security/passkeys](/security/passkeys)).

---

## Integrations

### How do I integrate Sonarr/Radarr with Phlix?

Sonarr (TV) and Radarr (Movies) can be configured as clients pointing at Phlix. See the developer guide at [/dev/arr-clients](/dev/arr-clients) for API endpoint details, or [/advanced/arr-integration](/advanced/arr-integration) for the end-user setup guide.
