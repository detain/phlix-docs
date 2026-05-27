# Admin Reference

**Phase:** N (End-User Documentation)
**Step:** N.20
**Since:** 0.18.0

## TL;DR

This page is the single admin landing page for three pillars of Phlix server operation: environment variables (control startup), CLI commands (control ongoing operation), and config files (control runtime behaviour). For the complete tables of every variable or command, see [Environment variables](env-vars.md) and [CLI commands](cli.md).

## Environment Variables

Environment variables are read at process startup. Most can be overridden by `config/*.php` at runtime (noted per variable). For the full table, see [Environment variables](env-vars.md).

**Five operationally critical variables:**

- `JWT_SECRET` — change this immediately in production; the default is insecure and only suitable for local dev.
- `PHLIX_HTTP_PORT` — the port the server binds (default `32400`).
- `PHLIX_DATABASE_HOST` / `PHLIX_DATABASE_PASSWORD` — MySQL connection; credentials live in the environment, not in config files.
- `TZ` — timestamps in logs and EPG depend on a correct timezone; set to your local timezone.
- `PHLIX_LOG_LEVEL` — `debug` is verbose; `error` is production-minimal.

## CLI Commands

All commands run from the Phlix Server install directory (`phlix-server/`). `php public/index.php` starts the Workerman HTTP server (blocking — use systemd or supervisord in production).

Ongoing operation is driven by the `php bin/phlix <command>` console. Run `php bin/phlix list` to see every available command (it works with no database). For the full reference of each command's arguments and options, see [CLI commands](cli.md).

### Server lifecycle

| Command | Description |
| --- | --- |
| `php public/index.php` | Start the Workerman HTTP server. Run under systemd/supervisord, not directly in a shell session. |
| `php bin/phlix migrate` | Apply pending DB migrations (`migrations/*.sql`). Idempotent — safe to run multiple times. Supported equivalent of `php scripts/run-migrations.php` (both use the same `MigrationRunner`; the script remains for the Docker entrypoint/installer). |

### Operational (`bin/phlix`)

| Command | Description |
| --- | --- |
| `php bin/phlix library:list` | List configured media libraries. |
| `php bin/phlix library:scan {libraryId} [--rescan]` | Scan (or, with `--rescan`, clear and rescan) a library for new content. |
| `php bin/phlix plugin:list` | List installed plugins and their enabled state. |
| `php bin/phlix plugin:enable {name}` / `plugin:disable {name}` | Enable / disable an installed plugin by manifest name. |
| `php bin/phlix plugin:install {source}` / `plugin:uninstall {name}` | Install from an HTTPS / `file://` source, or uninstall by name. |
| `php bin/phlix backup:create [--label=]` | Create a server backup archive (optionally labelled). |
| `php bin/phlix backup:list` | List stored server backups. |
| `php bin/phlix hwaccel:probe` | Probe for available hardware-acceleration encoders. |
| `php bin/phlix user:reset-password {user} [--password=]` | Reset a user's password by username or email (Argon2ID; generates and prints a strong random password when `--password` is omitted). |

### Operational (still script-based — no `bin/phlix` command yet)

These remain standalone scripts (network-, daemon-, or TLS-bound) and are deferred to a later phase.

| Command | Description |
| --- | --- |
| `php scripts/pair-with-hub.php <hub-url> <server-name>` | Pair this server with a Phlix Hub. Blocking poll loop; see [CLI commands](cli.md). |
| `php scripts/port-forward.php <command>` | Manage UPnP-IGD / NAT-PMP port forwarding (`status`/`enable`/`disable`/`info`). See [CLI commands](cli.md). |
| `php scripts/run-marker-detection-worker.php` | Intro/outro marker detection background worker (infinite daemon loop). Not yet wrapped as a `bin/phlix` command. |
| `./scripts/compatibility-check.sh` | Check server/hub major version compatibility. Exits 0 if compatible, 1 if not. Requires `PHLIX_HUB_URL` set. |
| `php scripts/claim-subdomain.php` | Claim a `*.phlix.media` subdomain for the enrolled server after pairing. Note: automated TLS provisioning is **not implemented** — certificates must be provisioned out-of-band (see [TLS Certificates](../dev/tls-certificates.md)). |

### Release / Build

| Command | Description |
| --- | --- |
| `./scripts/release.sh [patch\|minor\|major] [--dry-run]` | Bump version in `composer.json`, update Helm chart, create git commit and tag. Use `--dry-run` to preview without making changes. |
| `./scripts/docker-release.sh [VERSION] [--dry-run]` | Build and push Docker images (`phlix-server`, `nvidia-*`, `intel-*` variants) to the registry. Defaults to `latest` tag if no version specified. |

## Config Files

All config files are plain PHP files that `include` returning an array. They are included at boot time. **Always lint after editing:**

```bash
php -l config/server.php
php -l config/database.php
php -l config/ffmpeg.php
php -l config/hub.php
php -l config/logger.php
```

### config/server.php

```php
return [
    'server' => [
        'name' => 'Phlix Media Server',
        'host' => '0.0.0.0',      // bind address (all interfaces)
        'port' => 8096,            // HTTP port (overridden by PHLIX_HTTP_PORT env var)
        'context' => [],
    ],
    'worker' => [
        'count' => 'auto',       // 'auto' = CPU core count, or integer
        'stdout_file' => __DIR__ . '/../.logs/stdout.log',
        'pid_file' => '/var/run/phlix/pid',
    ],
    'process' => [
        'reloadable' => true,
        'reuse_port' => true,
    ],
];
```

- `server.host` — `0.0.0.0` = all interfaces; `127.0.0.1` = localhost only.
- `server.port` — default `8096`. Use `PHLIX_HTTP_PORT` env var to override.
- `worker.count` — Workerman process count. `auto` = CPU core count.
- `worker.stdout_file` — Workerman master process stdout/stderr redirect.

### config/database.php

```php
return [
    'default' => 'mysql',
    'connections' => [
        'mysql' => [
            'host' => '127.0.0.1',      // PHLIX_DATABASE_HOST
            'port' => 3306,             // PHLIX_DATABASE_PORT
            'database' => 'phlix',      // PHLIX_DATABASE_NAME
            'username' => 'phlix',       // PHLIX_DATABASE_USER
            'password' => getenv('DB_PASSWORD') ?: '',  // PHLIX_DATABASE_PASSWORD
            'charset' => 'utf8mb4',
            'pool_size' => 20,
            'timeout' => 5,
        ],
    ],
];
```

- `connections.mysql.password` — read from `DB_PASSWORD` env var at runtime. Never commit credentials to this file.
- `pool_size` — maximum concurrent DB connections per worker.
- `timeout` — query timeout in seconds.

### config/logger.php

```php
return [
    'default' => 'file',
    'handlers' => [
        'file' => [
            'type' => 'rotating_file',
            'path' => __DIR__ . '/../.logs/app.log',
            'max_files' => 30,
            'level' => 'debug',   // overridden by PHLIX_LOG_LEVEL env var
        ],
        'error' => [
            'type' => 'rotating_file',
            'path' => __DIR__ . '/../.logs/error.log',
            'max_files' => 30,
            'level' => 'error',
        ],
    ],
];
```

Log levels (in order of verbosity): `debug` → `info` → `notice` → `warning` → `error` → `critical` → `alert` → `emergency`. Levels below the configured `level` are discarded.

### config/ffmpeg.php

```php
return [
    'ffmpeg_path' => '/usr/bin/ffmpeg',
    'ffprobe_path' => '/usr/bin/ffprobe',
    'transcode_dir' => '/var/transcodes',
    'max_concurrent_transcodes' => 4,
    'transcode_timeout' => 7200,
    'hwaccel' => [
        'enabled' => true,
        'prefer_hardware' => true,
        'vendor_priority' => [
            'nvenc'       => 0,  // NVIDIA NVENC (GPU)
            'vaapi'       => 1,  // Linux VAAPI
            'qsv'         => 2,  // Intel Quick Sync
            'videotoolbox' => 3, // macOS VideoToolbox
            'amf'         => 4,  // AMD AMF
            'v4l2'        => 5, // Linux V4L2
        ],
    ],
];
```

- `vendor_priority` — ordered list; first available is used. Override with `PHLIX_HWACCEL` env var (e.g., `PHLIX_HWACCEL=vaapi`).
- `max_concurrent_transcodes` — set to `1` on low-end NAS devices.

### config/hub.php

```php
return [
    'hub_url' => getenv('PHLIX_HUB_URL') ?: null,
    'hub_jwks_url' => getenv('PHLIX_HUB_JWKS_URL') ?: null,
    'heartbeat_interval' => (int)(getenv('PHLIX_HUB_HEARTBEAT_INTERVAL') ?: 60),
    'enrollment_token_ttl' => 7 * 86400,
    'jwks_cache_ttl' => 900,
    'key_path' => __DIR__ . '/hub-server-key.pem',
    'subdomain_auto_claim' => (bool)(getenv('PHLIX_SUBDOMAIN_AUTO_CLAIM') ?: true),
    'tls_enabled' => (bool)(getenv('PHLIX_TLS_ENABLED') ?: true),
    'domain' => getenv('PHLIX_DOMAIN') ?: 'phlix.media',
];
```

- `heartbeat_interval` — seconds between Hub heartbeats. Range: 30–3600.
- `enrollment_token_ttl` — how long the Hub enrollment JWT is valid.
- `subdomain_auto_claim` — automatically claim a `*.phlix.media` subdomain after enrollment.

### Other config files

- `config/backups.php` — backup destination, retention, and schedule.
- `config/relay.php` — relay tunnel WSS URL, ping interval/timeout.
- `config/port-forward.php` — UPnP/IGD discovery settings, STUN server/port.
- `config/hwaccel_profiles.php` — per-quality-tier CRF (`23`/`28`) and codec (`libx264`/`libx265`).
- `config/subtitles.php` — subtitle extraction and burn-in settings.

## What Can Go Wrong

### 1. Boolean env var treated as a string (truthy "0")

**Symptom:** `PHLIX_PLUGINS_ALLOW_HTTP=0` is treated as truthy, or `PHLIX_CONTAINER_COMPILE=1` is ignored.

**Cause:** In shell, `PHLIX_PLUGINS_ALLOW_HTTP=0` passes the string `"0"` to PHP's `getenv()`, which is truthy because it is a non-empty string. `(bool)getenv('VAR')` sees `"0"` as `true` — not `false`.

**Fix:** Use the empty string to falsify:
```bash
# WRONG — "0" is truthy in PHP
PHLIX_PLUGINS_ALLOW_HTTP=0 php public/index.php

# CORRECT — empty string is falsy
PHLIX_PLUGINS_ALLOW_HTTP="" php public/index.php
```

### 2. PHP not on PATH

**Symptom:** `php: command not found` when running `php scripts/run-migrations.php`.

**Cause:** PHP is installed in a non-standard location (`/usr/local/bin/php`, `/opt/php83/bin/php`) or not on the system `PATH`.

**Fix:** Use the full path to PHP:
```bash
which php
/usr/local/bin/php scripts/run-migrations.php
```
Or add to `PATH` permanently in `~/.bashrc` or `/etc/environment`.

### 3. Config file PHP parse error prevents server start

**Symptom:** Server fails to start with "Primary script unknown" or Workerman exits immediately with no log output.

**Cause:** A syntax error in a config PHP file — missing semicolon, unclosed bracket, or array key typo. PHP parses config files at include time.

**Fix:** Always lint after editing:
```bash
php -l config/server.php
php -l config/database.php
php -l config/ffmpeg.php
php -l config/hub.php
php -l config/logger.php
```
A clean `No syntax errors detected` means the file is safe to include.

### 4. JWT_SECRET left at default in production

**Symptom:** External clients cannot connect; JWT validation errors in logs.

**Cause:** `JWT_SECRET` defaults to `default-secret-change-me` when not set. Tokens signed with the default secret are rejected in production because the server fails closed.

**Fix:** Set a strong secret:
```bash
openssl rand -hex 32
# Add to systemd unit or environment file:
Environment=JWT_SECRET=$(openssl rand -hex 32)
```
Restart the server after changing `JWT_SECRET`. All existing sessions will be invalidated — users must log in again.

## Next Steps

- [Environment variables detail](env-vars.md) — complete table of every env var.
- [CLI commands detail](cli.md) — the full `bin/phlix` command reference plus the remaining hub-pairing and port-forwarding scripts.
- [Backup & restore](../advanced/backup-restore.md) — backup strategies and restore procedures.
- [Troubleshooting](../troubleshooting.md) — diagnosing startup and runtime issues.
