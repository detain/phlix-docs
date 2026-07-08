# Config Files Reference

**Since:** 0.18.0

Reference for every `config/*.php` file in phlix-server and what each key controls. All connection parameters in `database.php` are environment-variable-driven — see the [Database](#database-php) section for the full list.

For environment variables that control runtime behaviour, see [/reference/env-vars](/reference/env-vars).

---

## `config/server.php`

Core server and worker settings.

```php
'server' => [
    'name' => 'Phlix Media Server',   // Displayed in the web UI header
    'host' => '0.0.0.0',               // Bind address — 0.0.0.0 = all interfaces
    'port' => 8096,                    // Main HTTP port
    'context' => [],                   // PHP stream context options (rarely needed)
],
```

### Worker

```php
'worker' => [
    'count'        => 'auto',          // 'auto' = CPU core count; integer for fixed count
    'stdout_file'  => '/var/phlix/logs/stdout.log',  // Workerman process stdout
    'pid_file'     => '/var/run/phlix/pid',          // PID file path
],
```

### Process

```php
'process' => [
    'reloadable' => true,   // SIGHUP reloads worker without full restart
    'reuse_port' => true,   // Enables SO_REUSEPORT for better multi-process throughput
],
```

### Coroutine runtime

```php
'coroutine' => [
    'enabled'    => true,               // Use Swoole event loop (required for DB pool)
    'hook_flags' => null,              // null = safe curated flags; override only if needed
],
```

The curated hook allowlist enables socket, sleep, and stream hooks only. `SWOOLE_HOOK_ALL` caused crashes with PHP 8.5 / Swoole 6.2.1 / kernel io_uring — do not re-enable it without testing.

### HLS streaming

```php
'hls' => [
    'segment_dir'     => sys_get_temp_dir() . '/phlix_hls',  // Where .m3u8/.ts files are written
    'base_url'        => 'http://localhost:8096',             // Used for absolute playlist URLs (casting)
    'segment_seconds' => 6,                                  // Target segment duration (Apple default)
],
```

`segment_dir` is the single source of truth — both the transcode writer and the HLS streamer read from the same path.

### WebSocket (SyncPlay)

```php
'websocket' => [
    'host'                     => '0.0.0.0',
    'port'                     => 8097,        // Separate from HTTP port
    'stale_connection_timeout' => 300,          // Seconds before a stale WS connection is dropped
    'stale_group_timeout'      => 3600,         // Seconds before an idle SyncPlay group is dissolved
],
```

### Included sub-configs

```php
'ffmpeg' => require __DIR__ . '/ffmpeg.php',   // Transcoding config (paths, HW accel, profiles)
'hub'    => require __DIR__ . '/hub.php',     // Hub pairing and heartbeat settings
'relay'  => require __DIR__ . '/relay.php',    // Relay tunnel settings
```

---

## `config/database.php`

All connection parameters are **environment-variable-driven** with safe localhost defaults for a stock single-host install. Any or all of these can be overridden — a remote or renamed database only needs the relevant `DB_*` variables set.

### Connection

| Env var | Legacy alias | Default | Description |
|---------|-------------|---------|-------------|
| `DB_HOST` | — | `127.0.0.1` | MySQL host address |
| `DB_PORT` | — | `3306` | MySQL port |
| `DB_DATABASE` | `DB_NAME` | `phlix` | Database name |
| `DB_USER` | `DB_USERNAME` | `phlix` | Database username |
| `DB_PASSWORD` | — | _(empty)_ | Database password |

### Connection pool

| Env var | Default | Description |
|---------|---------|-------------|
| `DB_POOL_ENABLED` | `true` | **On by default** (Stream Quality/ABR step S9): each coroutine gets its own leased connection for intra-worker DB parallelism. Set to `0`/`false`/`no`/`off` to fall back to the single-connection coroutine mutex. |
| `DB_POOL_SIZE` | `8` | Per-worker pool ceiling; total server maximum ≈ `worker_count × pool_size` — keep under MySQL `max_connections` |

```php
'connections' => [
    'mysql' => [
        'host'         => getenv('DB_HOST') ?: '127.0.0.1',
        'port'         => (int) (getenv('DB_PORT') ?: 3306),
        'database'     => getenv('DB_DATABASE') ?: (getenv('DB_NAME') ?: 'phlix'),
        'username'     => getenv('DB_USER') ?: (getenv('DB_USERNAME') ?: 'phlix'),
        'password'     => getenv('DB_PASSWORD') ?: '',
        'charset'      => 'utf8mb4',
        // DB_POOL_ENABLED defaults ON (unset env var -> '1'); DB_POOL_ENABLED=0
        // is the explicit opt-out back to the single-connection mutex path.
        'pool_enabled' => filter_var(
            getenv('DB_POOL_ENABLED') === false ? '1' : getenv('DB_POOL_ENABLED'),
            FILTER_VALIDATE_BOOLEAN
        ),
        'pool_size'    => (int) (getenv('DB_POOL_SIZE') ?: 8),
        'timeout'      => 5,
    ],
],
```

---

## `config/logger.php`

Rotating file log handlers. All paths are relative to the phlix-server root.

```php
'default' => 'file',   // Handler used when no channel is specified
```

### Available handlers

| Handler | Path key | Level | Purpose |
|---------|----------|-------|---------|
| `file` | `path` | `debug` | General application log (`.logs/app.log`) |
| `error` | `path` | `error` | Error-only log (`.logs/error.log`) |
| `events` | `path` | `debug` | PSR-14 event dispatch trace — active only when `PHLIX_DEBUG_EVENTS=1` (`.logs/events.log`) |
| `plugins` | `path` | `debug` | Plugin lifecycle events — install, enable, disable, uninstall (`.logs/plugins.log`) |

```php
'file' => [
    'type'       => 'rotating_file',
    'path'       => __DIR__ . '/../.logs/app.log',
    'max_files'  => 30,      // Keep 30 rotated files
    'level'      => 'debug',
],
```

---

## `config/ffmpeg.php`

FFmpeg binary paths, transcoding limits, hardware acceleration, and codec profiles.

```php
'ffmpeg_path'              => '/usr/bin/ffmpeg',
'ffprobe_path'            => '/usr/bin/ffprobe',
'transcode_dir'            => '/var/transcodes',   // Working directory for transcode jobs
'segment_dir'              => '/var/segments',      // HLS/DASH segment output (see server.php hls.segment_dir)
'max_concurrent_transcodes' => 4,                   // Global transcode job limit
'transcode_timeout'       => 7200,                  // Seconds before a transcode job is abandoned
```

### Hardware acceleration

```php
'hwaccel' => [
    'enabled'         => true,
    'prefer_hardware' => true,          // Try GPU encoders before software encoders
    'vendor_priority' => [              // Lower number = higher priority
        'nvenc'     => 0,   // NVIDIA NVENC
        'vaapi'     => 1,   // Intel VAAPI / Quick Sync
        'qsv'       => 2,   // Intel Quick Sync (legacy path)
        'videotoolbox' => 3, // macOS VideoToolbox
        'amf'       => 4,   // AMD AMF
        'v4l2'      => 5,   // Linux V4L2
    ],
],
```

See [/advanced/hardware-transcoding](/advanced/hardware-transcoding) for how to configure and verify hardware acceleration.

### Hardware acceleration profiles

```php
'hwaccel_profiles' => require __DIR__ . '/hwaccel_profiles.php',
```

Defines per-quality-tier encoder settings (bitrate, preset, profile). Rarely needs manual changes.

### Subtitles

```php
'subtitles' => require __DIR__ . '/subtitles.php',
```

Controls embedded subtitle extraction and burn-in behaviour.

### DASH streaming

```php
'dash' => [
    'enabled'       => true,
    'segment_dir'   => '/var/segments',
    'default_codecs' => [
        'video' => 'avc1.64001f',   // H.264 High Profile Level 4.1
        'audio' => 'mp4a.40.2',     // AAC-LC
    ],
],
```

---

## `config/hub.php`

Hub pairing, heartbeat, and public hostname configuration.

```php
'hub_url'            => getenv('PHLIX_HUB_URL') ?: null,         // Hub base URL
'hub_jwks_url'       => getenv('PHLIX_HUB_JWKS_URL') ?: null,     // Hub JWKS endpoint
'heartbeat_interval' => (int)(getenv('PHLIX_HUB_HEARTBEAT_INTERVAL') ?: 60),  // Seconds (30–3600)
'enrollment_token_ttl' => 7 * 86400,                               // 7 days
'jwks_cache_ttl'     => 900,                                       // 15 minutes
'key_path'           => __DIR__ . '/hub-server-key.pem',            // Server identity key
'config_dir'         => __DIR__,
'subdomain_auto_claim' => (bool)(getenv('PHLIX_SUBDOMAIN_AUTO_CLAIM') ?: true),
'tls_enabled'        => $tlsEnabled,                                // Derived from PHLIX_TLS_ENABLED env
'domain'             => $domain ?: 'phlix.media',                   // Base domain for *.phlix.media subdomains
'public_url'         => /* derived */ '',                           // Advertised public hostname during pairing
```

See [/hub/what-is-the-hub](/hub/what-is-the-hub) and [/hub/remote-access](/hub/remote-access).

---

## `config/relay.php`

Relay tunnel settings for the Hub connection.

```php
'enabled'          => true,
'hub_wss_url'      => 'wss://hub.example.com/api/v1/servers/{id}/relay',  // Legacy template (not used if hub_relay_ws_url set)
'hub_relay_ws_url' => 'ws://127.0.0.1:8802',                   // Use 127.0.0.1 when co-located with hub; wss:// for remote
'local_http_address' => '127.0.0.1:8096',                      // Where relay pipes relayed bytes locally
'local_address'    => '127.0.0.1:0',                           // Local bind address for the tunnel
'tunnel_hostname'  => '',                                       // Optional override
'reconnect_delay'  => 5,                                        // Seconds between reconnection attempts
'ping_interval'   => 30,                                        // Keep-alive ping interval
'ping_timeout'    => 10,                                        // Seconds to wait for pong before dropping
```

---

## `config/plugins.php`

Plugin catalog sources and auto-update behaviour.

```php
'catalog' => [
    'default_source' => 'https://github.com/detain/phlix-plugins',  // Official plugin repository
    'sources'        => [],                                          // Extra operator-defined catalogs
    'fetch_timeout'  => 10,                                          // Seconds before a catalog fetch is abandoned
],
'auto_update' => false,    // When true, periodically reinstalls plugins if a newer version is in any configured catalog
```

See [/plugins/manifest](/plugins/manifest) and [/dev/plugin-sdk](/dev/plugin-sdk) for plugin development.

---

## `config/process.php`

Managed background worker processes started alongside the HTTP worker.

```php
'library-scan' => [
    'enabled'      => true,
    'count'        => 1,        // Atomic claimNext() means count=1 is sufficient
    'poll_seconds' => 5,         // How often the scanner checks for new/changed files
],
'plugin-auto-update' => [
    'enabled'      => true,
    'count'        => 1,
    'poll_seconds' => 86400,    // Daily cadence; only does work when auto_update is enabled in plugins.php
],
```

These are started by `start.php` alongside the HTTP worker. Running the scan worker as a standalone service via `scripts/run-library-scan-worker.php` is safe and mutually exclusive with the in-process worker (atomic job claiming).

---

## `config/filesystem.php`

Filesystem browse roots for the admin path picker.

```php
'browse_roots' => ['/home', '/mnt', '/media', '/data'],
```

The admin `GET /api/v1/admin/fs/browse` endpoint is jailed to these roots. Override via `PHLIX_BROWSE_ROOTS` (comma-separated, replaces defaults):

```bash
PHLIX_BROWSE_ROOTS=/home,/mnt/media,/srv/media php public/index.php
```

See [/reference/env-vars](/reference/env-vars) for the full variable.
