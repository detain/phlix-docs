---
title: Troubleshooting & FAQ
description: Where the logs live and how to work through common server, playback, and network problems
---

# Troubleshooting & FAQ

**Since:** 0.18.0

## TL;DR

Phlix writes logs to `.logs/`. Most failures trace to file permissions, misconfigured settings, or a missing binary. Start every debugging session with `tail -f .logs/app.log` to see what is happening in real time — the server funnels every log channel there. If playback fails, check that FFmpeg is installed and your GPU encoders are accessible. If the Hub won't connect, verify the JWKS URL is reachable and that your server can make outbound HTTPS connections.

## Shell Blocks

### Log locations

```text
.logs/                           # Rotating application logs (Monolog, size-bounded)
.logs/app.log                    # ALL channels, info and above — the general log
.logs/error.log                  # ALL channels, error and above — start here for failures
.logs/events.log                 # EVENTS channel only (audited events; env-gated)
.logs/plugins.log                # PLUGINS channel — plugin lifecycle
workerman.log                    # Workerman worker stdout (same dir as start command)
```

There is deliberately one file per *sink*, not one per *channel*: auth, session,
HTTP, websocket, media and streaming records all land in `app.log` (and, for
errors, `error.log`). Transcode jobs additionally write an `ffmpeg.log` next to
their segment output directory.

### Log tailing commands

```bash
tail -f .logs/app.log                 # Everything, info and above
tail -f .logs/error.log               # Failures only
grep -i '"channel":"auth"' .logs/app.log | tail -50   # Recent auth records
tail -f .logs/plugins.log             # Plugin lifecycle only
```

### Server status checks

```bash
curl -s http://localhost:8096/health  # Is server responding? (status, timestamp, version)
systemctl status phlix-server                              # systemd service status (Linux)
ps aux | grep -E 'phlix|workerman' | grep -v grep   # Running processes
lsof -i :8096                                       # Is port 8096 bound?
```

### Library / filesystem checks

```bash
chmod -R 755 /media               # Fix permissions on media directories
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
PHLIX_LOG_LEVEL=debug php start.php start    # Start server with debug-level logging
# Valid levels: debug, info, notice, warning, error, critical, alert, emergency
```

### Admin password reset

Use the CLI command — it looks the account up by username first, then by email,
and stores the new password as an Argon2ID hash:

```bash
# Preferred: generates a strong random password and prints it once
php bin/phlix user:reset-password admin@example.com

# Or set a specific password (it is not echoed back)
php bin/phlix user:reset-password admin --password='S3cret!Passphrase'
```

The generated form is the safer default: a password typed on the command line
sits in your shell history and in the process listing while the command runs.

The reset itself revokes every existing session for that account (the command
stamps `tokens_not_valid_after` on the user row), so no server restart is
needed. If the account carried a forced-password-change flag, the reset clears
it — whoever ran the command holds the new password. Writing the hash straight
into the `users` table is **not** supported: it skips the revocation stamp and
the flag handling. The command's full semantics are in the
[CLI Reference](reference/cli.md).

## What Can Go Wrong

### A. Connection refused on port 8096

**Symptom:** Browser shows "Connection refused" or "Unable to connect" when accessing `http://server:8096`.

**Cause 1 — Server not running:** The Phlix Workerman process is not started.

**Fix:** Start the server in the foreground (for development):
```bash
php start.php start
```
For production, use systemd:
```bash
systemctl start phlix-server
```

**Cause 2 — Wrong port:** The `config/server.php` `http_port` value differs from the URL being accessed.

**Fix:** Check the `port` key in `config/server.php` and ensure your URL uses the same port.

**Cause 3 — Firewall blocking:** Port 8096 is not open on the host firewall.

**Fix:** Open it for the network your clients actually live on — 8096 is
plaintext HTTP, so a rule with no source restriction exposes logins and tokens
to everyone who can route to the host (see
[Hardening §3 — Restrict network exposure](/security/hardening#_3-restrict-network-exposure)):

```bash
# ufw (Debian/Ubuntu) — LAN-scoped; adjust the subnet to yours
sudo ufw allow from 192.168.0.0/16 to any port 8096 proto tcp

# firewalld (RHEL/CentOS) — same LAN-scoping idea
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="192.168.0.0/16" port port="8096" protocol="tcp" accept'
sudo firewall-cmd --reload
```

If the check that brought you here came from **outside** the LAN, opening the
port wider is the wrong fix — put a TLS reverse proxy in front instead of
exposing the plaintext port.

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

**Fix:** Rename files to match the conventions in [Movies library](libraries/movies.md) or [TV library](libraries/tv-shows.md). Check `.logs/app.log` for "unrecognized file" entries (the scanner logs on the media channel).

**Cause 3 — Database locked:** MySQL/MariaDB lock contention. Phlix stores everything in
MySQL/MariaDB — every install path uses it, and there is no SQLite mode to be in.

**Fix:**
```bash
# Check for lock-waiting threads (MySQL/MariaDB)
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
Review the output for available adapters (VAAPI, NVENC, QSV, VideoToolbox). Set `hwaccel.enabled` in `config/ffmpeg.php` and ensure the correct device node is accessible (e.g. `/dev/dri/renderD128` for VAAPI on Linux).

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
```text
https://hub.phlix.example.com/.well-known/jwks.json
```
If the Hub signing key was rotated, re-trigger the Hub handshake from the admin UI or restart the server to clear the JWKS cache.

---

## FAQ

**Q: Can I run Phlix in a subfolder instead of at the root domain?**
A: Not natively. Phlix serves all routes relative to the root of the configured port. Running in a subfolder (e.g. `https://example.com/phlix/`) requires a reverse proxy (nginx, Caddy, or Apache) to rewrite the path before forwarding to Phlix. See [Reverse proxy](advanced/reverse-proxy.md).

**Q: How many concurrent streams can Phlix handle?**
A: It depends on your hardware and playback mode. Direct play (no transcoding) uses minimal CPU — a single-core server can serve 10 or more concurrent direct-play sessions. Transcoding is CPU-bound; a modern 8-core server typically handles 2–4 simultaneous 1080p transcode streams. 4K HEVC transcoding requires significantly more CPU. Enable hardware acceleration to improve throughput.

**Q: How do I reset the admin password?**
A: Run the CLI command — with `--password` omitted it generates a strong random
password and prints it once:
```bash
php bin/phlix user:reset-password admin@example.com
```
The reset revokes the account's existing sessions automatically; no server
restart is needed. Details in [Admin password reset](#admin-password-reset) above.

**Q: How do I enable debug logging?**
A: Set the `PHLIX_LOG_LEVEL` environment variable before starting the server:
```bash
PHLIX_LOG_LEVEL=debug php start.php start
```
Valid levels (in order of verbosity): `debug`, `info`, `notice`, `warning`, `error`, `critical`, `alert`, `emergency`. Restart the server for the change to take effect.

**Q: My media is not being found after adding new files. What do I do?**
A: (1) Check that the media directory has correct permissions (`chmod -R 755 /path/to/media`). (2) Trigger a manual rescan from the web UI (Library → Scan) or check `.logs/app.log` for scanner activity. (3) Verify your file naming matches the conventions in [Movies library](libraries/movies.md) or [TV library](libraries/tv-shows.md). If the scanner logs show "unrecognized file", rename the file to match the expected pattern.

**Q: Where are the Workerman/FFmpeg logs?**
A: Workerman stdout is written to `workerman.log` in the directory where you ran `php start.php start`. Each transcode job writes an `ffmpeg.log` next to its segment output directory. Phlix application logs are in `.logs/` split by sink — `app.log` carries every channel (auth, HTTP, websocket, media, session, streaming) at info and above, and `error.log` carries errors from all of them.
