# Troubleshooting & FAQ

**Since:** 0.18.0

## TL;DR

Phlix writes logs to `.logs/`. Most failures trace to file permissions, misconfigured settings, or a missing binary. Start every debugging session with `tail -f .logs/phlix.log` to see what is happening in real time. If playback fails, check that FFmpeg is installed and your GPU encoders are accessible. If the Hub won't connect, verify the JWKS URL is reachable and that your server can make outbound HTTPS connections.

## Shell Blocks

### Log locations

```
.logs/                           # Rotating application logs per channel
.logs/auth.log                  # AUTH channel — login attempts, token issues
.logs/http.log                  # HTTP channel — API requests, response codes
.logs/websocket.log             # WEBSOCKET channel — real-time connections
.logs/media.log                 # MEDIA channel — library scanner, metadata
.logs/session.log               # SESSION channel — playback sessions
.logs/streaming.log            # STREAMING channel — HLS segment writes
.logs/transcode/                # Per-job FFmpeg transcode logs (one file per job)
workerman.log                   # Workerman worker stdout (same dir as start command)
```

### Log tailing commands

```bash
tail -f .logs/phlix.log               # All channels combined
tail -f .logs/auth.log                # AUTH channel only
tail -f .logs/http.log                # HTTP channel only
tail -f .logs/websocket.log           # WEBSOCKET channel only
grep -i error .logs/phlix.log | tail -50   # Last 50 errors across all channels
tail -f .logs/auth.log                # Channel-specific tail (one file per channel)
```

### Server status checks

```bash
curl -s http://localhost:32400/api/v1/system/status   # Is server responding?
systemctl status phlix                                # systemd service status (Linux)
ps aux | grep -E 'phlix|workerman' | grep -v grep     # Running processes
lsof -i :32400                                        # Is port 32400 bound?
```

### Library / filesystem checks

```bash
chmod -R 755 /media               # Fix permissions on media directories
lsof data/phlix.db                # Check SQLite locks (if using SQLite)
php scripts/run-migrations.php    # Verify DB schema is up to date
```

### FFmpeg / transcoding checks

```bash
which ffmpeg                      # Is FFmpeg in PATH?
ffmpeg -version                   # Version + available encoders/decoders
ffmpeg -hwaccels                  # List HW acceleration methods (VAAPI, NVENC/cuda, QSV, VideoToolbox)
ls -l /dev/dri/                   # VAAPI/QSV render nodes present? (Linux)
iostat -x 1                       # Disk I/O bottleneck check (Linux)
```

### Hub connectivity checks

```bash
curl -v https://hub.phlix.example.com                         # Network reachability + TLS handshake
curl -v https://hub.phlix.example.com/.well-known/jwks.json  # JWKS endpoint reachable?
env | grep -i PHLIX_HUB                                      # Verify Hub env vars are set
```

### Debug logging

```bash
PHLIX_LOG_LEVEL=debug php public/index.php    # Start server with debug-level logging
# Valid levels: debug, info, notice, warning, error, critical, alert, emergency
```

### Admin password reset

There is no CLI command or self-service password-reset flow yet. To reset a
password, update the user's Argon2ID hash directly in the database. Generate a
new hash with PHP, then write it to the `users` table:

```bash
# Generate an Argon2ID hash for the new password
php -r 'echo password_hash("new-password-here", PASSWORD_ARGON2ID), "\n";'
```

```sql
-- Then update the row (use the hash printed above)
UPDATE users SET password_hash = '<hash-from-above>' WHERE email = 'admin@example.com';
```

Phlix hashes passwords with `PASSWORD_ARGON2ID`, so any replacement hash must use
the same algorithm.

## What Can Go Wrong

### A. Connection refused on port 32400

**Symptom:** Browser shows "Connection refused" or "Unable to connect" when accessing `http://server:32400`.

**Cause 1 — Server not running:** The Phlix Workerman process is not started.

**Fix:** Start the server in the foreground (for development):
```bash
php public/index.php
```
For production, use systemd:
```bash
systemctl start phlix
```

**Cause 2 — Wrong port:** The `config/server.php` `http_port` value differs from the URL being accessed.

**Fix:** Check the `port` key in `config/server.php` and ensure your URL uses the same port.

**Cause 3 — Firewall blocking:** Port 32400 is not open on the host firewall.

**Fix:**
```bash
# ufw (Debian/Ubuntu)
sudo ufw allow 32400

# firewalld (RHEL/CentOS)
sudo firewall-cmd --add-port=32400/tcp
```

---

### B. Library not scanning / files not appearing

**Symptom:** Media files exist on disk but do not appear in the library after triggering a rescan.

**Cause 1 — Wrong permissions:** The Phlix worker process (running as `phlix` or `www-data`) cannot read the media directory.

**Fix:**
```bash
chmod -R 755 /path/to/media
chown -R phlix:phlix /path/to/media
```

**Cause 2 — File naming not recognized:** The filename does not match the `(Year)` or `S01E02` patterns the scanner expects.

**Fix:** Rename files to match the conventions in [Movies library](libraries/movies.md) or [TV library](libraries/tv-shows.md). Check `.logs/media.log` for "unrecognized file" entries.

**Cause 3 — Database locked:** MySQL/MariaDB lock contention, or a stale SQLite lock on `data/phlix.db`.

**Fix:**
```bash
# For SQLite
lsof data/phlix.db

# For MariaDB/MySQL — check for lock-waiting threads
mysql -e "SHOW PROCESSLIST;"
```
Restart the Phlix service to clear stale locks.

---

### C. Transcoding fails / playback stutters

**Symptom:** Playback starts but freezes, buffers continuously, or the player shows a transcode error.

**Cause 1 — FFmpeg not found:** The `ffmpeg` binary is not in `PATH` or `config/ffmpeg.php` `ffmpeg_path` points to a non-existent location.

**Fix:** Install FFmpeg:
```bash
# Debian/Ubuntu
sudo apt install ffmpeg

# Verify
which ffmpeg
ffmpeg -version
```
If FFmpeg is installed to a non-standard path, set `ffmpeg_path` in `config/ffmpeg.php`.

**Cause 2 — Hardware acceleration not working:** GPU encode/decode is unavailable and software transcode is too slow.

**Fix:** Probe for available hardware with FFmpeg directly:
```bash
ffmpeg -hwaccels            # methods FFmpeg was built with
ffmpeg -encoders | grep -E 'nvenc|vaapi|qsv|videotoolbox'   # available HW encoders
ls -l /dev/dri/             # VAAPI/QSV render nodes (Linux)
```
Review the output for available adapters (VAAPI, NVENC, QSV, VideoToolbox). Set `hwaccel.enabled` in `config/ffmpeg.php` and ensure the correct device node is accessible (e.g., `/dev/dri/renderD128` for VAAPI on Linux).

**Cause 3 — Disk I/O bottleneck:** Slow storage causes HLS segment writes to block, starving the player.

**Fix:** Check disk utilization:
```bash
iostat -x 1   # Linux — if %util on the relevant disk is ≥ 90%, that disk is saturated
```
Move transcode output to a faster volume (tmpfs, SSD) by setting `transcode_dir` in `config/ffmpeg.php`.

---

### D. Hub not connecting / claim fails

**Symptom:** Server appears offline in the Hub admin UI, or the claim code fails to connect.

**Cause 1 — Server cannot reach Hub URL:** Outbound HTTPS to `hub.phlix.example.com` is blocked by a corporate firewall or VPS egress filter.

**Fix:** Test connectivity from the server:
```bash
curl -v https://hub.phlix.example.com
```
If it times out or is rejected, check egress rules on your firewall or VPS panel. See [Remote access without Hub](advanced/remote-access-without-hub.md) for alternatives such as a reverse tunnel or VPN.

**Cause 2 — Claim code expired:** Claim codes are single-use and valid for 15 minutes after generation.

**Fix:** Re-generate a fresh claim code in the server's admin UI under Hub → Generate Claim Code.

**Cause 3 — JWT validation fails:** The server's JWKS URL (`PHLIX_HUB_JWKS_URL` env var) points to the wrong endpoint, or the Hub's signing key was rotated.

**Fix:** Verify the `PHLIX_HUB_JWKS_URL` environment variable is set to:
```
https://hub.phlix.example.com/.well-known/jwks.json
```
If the Hub signing key was rotated, re-trigger the Hub handshake from the admin UI or restart the server to clear the JWKS cache.

---

## FAQ

**Q: Can I run Phlix in a subfolder instead of at the root domain?**
A: Not natively. Phlix serves all routes relative to the root of the configured port. Running in a subfolder (e.g., `https://example.com/phlix/`) requires a reverse proxy (nginx, Caddy, or Apache) to rewrite the path before forwarding to Phlix. See [Reverse proxy](advanced/reverse-proxy.md).

**Q: How many concurrent streams can Phlix handle?**
A: It depends on your hardware and playback mode. Direct play (no transcoding) uses minimal CPU — a single-core server can serve 10 or more concurrent direct-play sessions. Transcoding is CPU-bound; a modern 8-core server typically handles 2–4 simultaneous 1080p transcode streams. 4K HEVC transcoding requires significantly more CPU. Enable hardware acceleration to improve throughput.

**Q: How do I reset the admin password?**
A: There is no CLI or self-service reset yet. Generate an Argon2ID hash and write
it directly to the `users` table (see [Admin password reset](#admin-password-reset)
above):
```bash
php -r 'echo password_hash("new-password-here", PASSWORD_ARGON2ID), "\n";'
# then: UPDATE users SET password_hash = '<hash>' WHERE email = 'admin@example.com';
```
Restart the server after resetting the password to clear existing sessions.

**Q: How do I enable debug logging?**
A: Set the `PHLIX_LOG_LEVEL` environment variable before starting the server:
```bash
PHLIX_LOG_LEVEL=debug php public/index.php
```
Valid levels (in order of verbosity): `debug`, `info`, `notice`, `warning`, `error`, `critical`, `alert`, `emergency`. Restart the server for the change to take effect.

**Q: My media is not being found after adding new files. What do I do?**
A: (1) Check that the media directory has correct permissions (`chmod -R 755 /path/to/media`). (2) Trigger a manual rescan from the web UI (Library → Scan) or check `.logs/media.log` for scanner activity. (3) Verify your file naming matches the conventions in [Movies library](libraries/movies.md) or [TV library](libraries/tv-shows.md). If the scanner logs show "unrecognized file", rename the file to match the expected pattern.

**Q: Where are the Workerman/FFmpeg logs?**
A: Workerman stdout is written to `workerman.log` in the directory where you ran `php public/index.php`. FFmpeg transcode logs are in `.logs/transcode/`, one file per job. Phlix application logs are in `.logs/` split by channel (AUTH, HTTP, WEBSOCKET, MEDIA, SESSION, STREAMING).
