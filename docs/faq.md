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
2. Run a manual rescan: **Admin → Library → Rescan** or use `php scripts/run-library-scan-worker.php` on the command line.
3. If metadata is still wrong, delete the item from the library and re-add it after checking the filename matches the expected pattern.
4. For TV shows, verify season/episode folders are named correctly — nested folders with an `S01E01` file inside a `Season 1` folder are supported.

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

Metadata shapes change between releases. After a major upgrade, run a full library rescan:

```bash
# Preserve your env file (DB_PASSWORD, PHLIX_SECRET_KEY survive if you skip this step)
sudo -u phlix php scripts/run-library-scan-worker.php --full-rescan
```

See [/install/upgrade](/install/upgrade) for the full upgrade procedure including migration steps.

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
