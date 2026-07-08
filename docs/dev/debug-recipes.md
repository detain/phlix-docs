# Debug Recipes

**Since:** 0.18.0

Common debugging scenarios and the commands to diagnose them. Start with `tail -f .logs/phlix.log` in most cases.

---

## Playback fails / transcoding errors

### 1. Check the transcode log

Every transcode job writes a log to `.logs/transcode/<job-id>.log`. Find the job ID from `media.log` or `streaming.log`:

```bash
# Watch media channel for transcode job IDs
tail -f .logs/media.log | grep -i "transcode\|job"

# Read a specific transcode log
cat .logs/transcode/abc123def.log
```

### 2. Verify FFmpeg is installed and accessible

```bash
ffmpeg -version
ffprobe -version
```

If FFmpeg is not found or the version is very old, reinstall:

```bash
# Ubuntu/Debian
sudo apt install ffmpeg

# Or use the jellyfin-ffmpeg PPA for a more up-to-date build
sudo add-apt-repository ppa:jonathonf/ffmpeg-4
sudo apt update && sudo apt install ffmpeg
```

### 3. Check hardware acceleration

```bash
# NVIDIA NVENC
ffmpeg -hide_banner -encoders 2>&1 | grep nvenc

# Intel VAAPI
vainfo

# Intel Quick Sync
ffmpeg -hide_banner -encoders 2>&1 | grep qsv

# AMD VAAPI
ffmpeg -hide_banner -encoders 2>&1 | grep vaapi
```

No output for your expected encoder means hardware acceleration is not active. See [/advanced/hardware-transcoding](/advanced/hardware-transcoding) to enable it.

---

## Library scan is slow or hanging

### 1. Check the media log

```bash
tail -f .logs/media.log
```

Look for `Scanning` entries showing progress and `Matched` or `Unmatched` for each file.

### 2. Force a single-threaded rescan to see errors

```bash
sudo -u phlix php scripts/run-library-scan-worker.php --full-rescan 2>&1
```

This runs the scan synchronously and prints errors to stdout that may not appear in the log.

### 3. Check file permissions

The `phlix` system user must be able to read all media directories:

```bash
sudo -u phlix php -r "realpath('/mnt/media/movies/');" 2>&1
```

If this returns nothing, the user cannot access the path. Fix with:

```bash
sudo chown -R phlix:phlix /mnt/media
```

---

## Server won't start

### 1. Check the Workerman log

```bash
cat workerman.log
journalctl -u phlix-server --no-pager -n 50
```

### 2. Check for port conflicts

```bash
lsof -i :8096       # HTTP port
lsof -i :8097       # WebSocket port
```

If another process is using either port, either kill it or change Phlix's bind port in `config/server.php`.

### 3. Verify the database can be reached

```bash
mysql -u phlix -p -h 127.0.0.1 phlix -e "SELECT 1;"
```

If this fails, MySQL may not be running or credentials may be wrong. Check `/etc/phlix/env` for `DB_*` values.

### 4. Run migrations explicitly

```bash
sudo -u phlix php scripts/run-migrations.php
```

If migrations fail, restore the database from a backup and retry.

---

## Hub connection fails

### 1. Check the hub log channel

```bash
tail -f .logs/phlix.log | grep -i hub
```

### 2. Verify the JWKS URL is reachable from the server

```bash
curl -s https://hub.phlix.media/.well-known/jwks.json | head -c 200
```

If this fails, the server cannot reach the Hub — check network/firewall rules.

### 3. Verify the enrollment token is valid

```bash
cat /etc/phlix/hub-enrollment.json
```

An expired or missing enrollment token prevents the server from connecting. Re-enroll from the Hub admin UI: **Hub Admin → Servers → Re-enroll**.

### 4. Check relay tunnel status

```bash
tail -f .logs/phlix.log | grep -i relay
```

If the relay is repeatedly reconnecting, check `config/relay.php` — use `ws://127.0.0.1:8802` for a co-located Hub or the correct `wss://` address for a remote Hub.

---

## High CPU / memory usage

### 1. Identify the source process

```bash
top -c
htop
```

### 2. Check transcode jobs

```bash
ps aux | grep ffmpeg | grep -v grep
```

Many concurrent FFmpeg processes indicate the transcode limit (`max_concurrent_transcodes`) is not being respected or is set too high.

### 3. Check for deadlocks

```bash
tail -100 .logs/phlix.log | grep -i "deadlock\|timeout\|fatal"
```

The DB connection pool is on by default (`DB_POOL_ENABLED` defaults to `1` as of
Stream Quality/ABR step S9). While diagnosing, either pin `DB_POOL_SIZE=1` as a
safe, fully-serialised pool size, or set `DB_POOL_ENABLED=0` to fall all the way
back to the single-connection coroutine mutex path:

```bash
DB_POOL_SIZE=1 sudo systemctl restart phlix-server
# or, to bypass the pool entirely:
DB_POOL_ENABLED=0 sudo systemctl restart phlix-server
```

---

## Plugin installation fails

### 1. Check the plugins log

```bash
tail -f .logs/plugins.log
```

### 2. Verify the catalog is reachable

```bash
curl -s https://github.com/detain/phlix-plugins/contents/plugins.json | head -c 500
```

### 3. Check PHP composer and network access

Plugins are installed via `composer install` over HTTPS. If your server is air-gapped, either:
- Set `PHLIX_PLUGINS_ALLOW_HTTP=1` and host the plugin on an internal HTTP server, or
- Install the plugin manually by placing it in `var/plugins/`

### 4. Verify signature requirements

If `PHLIX_PLUGINS_REQUIRE_SIGNATURE=1` is set, the plugin must have a valid signature from a key in the trusted allowlist. Try setting it to `0` temporarily to see if that resolves the installation.

---

## Authentication / login failures

### 1. Check the AUTH log

```bash
tail -f .logs/auth.log
```

This records every login attempt with the user identifier, success/failure status, and IP address.

### 2. Verify JWT_SECRET

If tokens are failing immediately after issue, `JWT_SECRET` may have changed (e.g. an env var that was set for one session is not set for another):

```bash
grep JWT_SECRET /etc/phlix/env
```

### 3. Check the database connection

```bash
mysql -u phlix -p -h 127.0.0.1 phlix -e "SELECT id, email FROM users LIMIT 5;"
```

A connection failure here means the auth layer cannot read user credentials.
