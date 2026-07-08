# Environment variables

Reference list of every environment variable read by the Phlix Media Server,
its default, and a one-line description. Each entry links back to the file
that consumes it.

## Container & bootstrap

| Variable                   | Default | Description |
| -------------------------- | ------- | ----------- |
| `PHLIX_CONTAINER_COMPILE`  | _unset_ | When truthy (`1`, `true`, `yes`, `on`) enables PHP-DI's compiled-container cache in `var/cache/container/`. Disabled by default for dev parity. See `Phlix\Common\Container\ContainerFactory`. |

## Events

| Variable               | Default | Description |
| ---------------------- | ------- | ----------- |
| `PHLIX_DEBUG_EVENTS`   | `0`     | When truthy (`1`, `true`, `yes`, `on`) wraps the PSR-14 dispatcher in Tukio's `DebugEventDispatcher`, which logs every dispatched event class at debug level on the `events` channel (`.logs/events.log`). Useful for tracing plugin behaviour; leave off in production. See `Phlix\Common\Events\EventDispatcherFactory` and `docs/dev/event-reference.md`. |

## Plugins

| Variable                              | Default | Description |
| ------------------------------------- | ------- | ----------- |
| `PHLIX_PLUGINS_ALLOW_HTTP`            | `0`     | When truthy (`1`, `true`, `yes`, `on`) lets the plugin loader accept plain `http://` source URLs. Default off — HTTPS or `file://` only. See `Phlix\Plugins\Installer\HttpInstaller`. |
| `PHLIX_PLUGINS_REQUIRE_SIGNATURE`     | `0`     | When truthy, the plugin loader refuses to install unsigned plugins and refuses signatures missing from the trusted-key allowlist. Default off, which means unsigned plugins install with a warning on the `plugins` log channel. See `Phlix\Plugins\Signature\SignatureVerifier`. |
| `PHLIX_PLUGINS_COMPOSER_TIMEOUT`      | `120`   | Hard timeout (seconds) on the per-plugin `composer install --no-dev` subprocess. See `Phlix\Plugins\Installer\ComposerRunner`. |

## Auth

| Variable      | Default                       | Description |
| ------------- | ----------------------------- | ----------- |
| `JWT_SECRET`  | `default-secret-change-me`    | HMAC secret used to sign / verify JWT access and refresh tokens. The default is intentionally insecure so a missing env var fails closed in production deployments. Read by `Phlix\Common\Container\Providers\AuthServicesProvider`. |
| `PHLIX_SIGNED_URL_SECRET` | _derived from `JWT_SECRET`_ | HMAC key for the [signed media URLs](/security/signed-media-urls) that gate the binary/streaming endpoints (`/media/{id}/stream`, `/hls/**`, `/dash/**`, book/audiobook/photo bytes). When unset it is derived from `JWT_SECRET` via a domain-separated HMAC, so a leaked stream token can never be replayed as a JWT (and vice-versa). Set an explicit value to rotate stream tokens independently of JWTs. Read by `Phlix\Auth\SignedUrl::fromEnv()`. |
| `PHLIX_SIGNED_URL_TTL`    | `21600` (6 h)               | Lifetime, in seconds, of a minted signed media URL before it expires. Must be a positive integer. Read by `Phlix\Auth\SignedUrl::fromEnv()`. |

## Hub / Pairing (phlix-server)

| Variable                        | Default | Description |
| ------------------------------- | ------- | ----------- |
| `PHLIX_HUB_URL`                 | _unset_ | Base URL of the Phlix Hub to pair with (e.g. `https://hub.example.com`). When set, the server initiates pairing automatically on startup if enrolled. See `Phlix\Hub\HubClient` and `config/hub.php`. |
| `PHLIX_HUB_JWKS_URL`            | _unset_ | URL of the hub's JWKS endpoint for validating hub-issued JWTs. Typically set automatically during enrollment. See `Phlix\Hub\HubJwtValidator` and `config/hub.php`. |
| `PHLIX_HUB_ENROLLMENT_TOKEN`    | _unset_ | When set, overrides the enrollment token read from `config/hub-enrollment.json`. Mostly useful for automation / container orchestration. See `Phlix\Hub\HubClient::loadEnrollment()`. |
| `PHLIX_HUB_HEARTBEAT_INTERVAL`  | `60`    | Interval in seconds between hub heartbeat calls. Must be between 30 and 3600. See `Phlix\Hub\HubClient::startHeartbeatLoop()` and `config/hub.php`. |
| `PHLIX_SUBDOMAIN_AUTO_CLAIM`    | `1`     | When truthy (`1`, `true`, `yes`, `on`) automatically claims a *.phlix.media subdomain from the hub after enrollment. See `Phlix\Hub\SubdomainClient` and `config/hub.php`. |
| `PHLIX_TLS_ENABLED`            | `1`     | When truthy enables TLS/HTTPS for the server's public hostname. Requires a subdomain to be allocated. See `config/hub.php`. |
| `PHLIX_DOMAIN`                 | `phlix.media` | The base domain for server subdomains (e.g. `abc12345.phlix.media`). See `config/hub.php`. |

## Hub / Server (phlix-hub)

These environment variables apply when running `phlix-hub` itself (not when the server connects to a hub).

### HTTP worker (`config/server.php`)

| Variable             | Default                       | Description                                                                  |
| -------------------- | ----------------------------- | ---------------------------------------------------------------------------- |
| `HUB_HOST`           | `0.0.0.0`                     | Bind address for the Workerman HTTP worker.                                  |
| `HUB_PORT`           | `8800`                        | TCP port the worker listens on.                                              |
| `HUB_WORKERS`        | `2`                           | Number of worker processes Workerman should fork.                            |
| `HUB_WORKERMAN_LOG`  | `<repo>/.logs/workerman.log`  | Path Workerman writes its master-log to. Directory must exist or be writable. |

### Database (`config/database.php`)

| Variable          | Default       | Description                                       |
| ----------------- | ------------- | ------------------------------------------------- |
| `HUB_DB_HOST`     | `127.0.0.1`   | MySQL host the hub connects to.                   |
| `HUB_DB_PORT`     | `3306`        | MySQL port.                                       |
| `HUB_DB_USER`     | `phlix_hub`   | MySQL username.                                   |
| `HUB_DB_PASSWORD` | `phlix_hub`   | MySQL password. **Override in any non-dev env.**  |
| `HUB_DB_NAME`     | `phlix_hub`   | Database name.                                    |

### Auth (`config/auth.php`)

| Variable               | Default   | Description                                                                                                                                  |
| ---------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `HUB_JWT_SECRET`       | (dev fallback) | HMAC-SHA256 secret for issuing JWTs. **Required in production** — must be ≥32 bytes. Falls back to a random per-process secret in dev. |
| `HUB_JWT_ACCESS_TTL`   | `3600`    | Access-token lifetime in seconds (default 1 hour).                                                                                           |
| `HUB_JWT_REFRESH_TTL`  | `604800`  | Refresh-token lifetime in seconds (default 7 days).                                                                                          |

> When `HUB_JWT_SECRET` is unset, the hub generates a random secret at container-build time. Tokens issued with that secret are valid only for the lifetime of the current PHP process — restarting the worker invalidates every existing session. Always set this var explicitly in production.

### Container caching

| Variable                       | Default | Description                                                                                                                       |
| ------------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `PHLIX_HUB_CONTAINER_COMPILE`  | unset   | When truthy (`1`, `true`, `yes`, `on`), PHP-DI writes compiled definitions to `var/cache/container/` for faster cold-start. Off for dev. |

## Hub / Arr Integration

Controls Radarr (movies) and Sonarr (series) connectivity for the Hub's media-request system. The hub uses these to push approved requests into the appropriate Arr instance. Both instances must be reachable from the Hub host and have API v3 enabled.

| Variable | Default | Description |
| --- | --- | --- |
| `HUB_RADARR_URL` | `http://localhost:7878` | Base URL of the Radarr instance (API v3). |
| `HUB_RADARR_API_KEY` | _empty_ | Radarr API key. Generate in Radarr → Settings → General → Security → API Key. |
| `HUB_RADARR_ENABLED` | `0` | When truthy (`1`, `true`, `yes`, `on`) enables Radarr integration. When falsy, movie approvals fail with `approve_failed`. |
| `HUB_SONARR_URL` | `http://localhost:8989` | Base URL of the Sonarr instance (API v3). |
| `HUB_SONARR_API_KEY` | _empty_ | Sonarr API key. Generate in Sonarr → Settings → General → Security → API Key. |
| `HUB_SONARR_ENABLED` | `0` | When truthy (`1`, `true`, `yes`, `on`) enables Sonarr integration. When falsy, series approvals fail with `approve_failed`. |

> **Tip:** Both Arr instances must have at least one quality profile and root folder configured before requests can be approved. The hub uses the first available profile and root folder automatically.

See [`docs/hub/requests.md`](../hub/requests.md) for the full media-request workflow.

## Relay tunnel

| Variable                       | Default                            | Description |
| ------------------------------ | ---------------------------------- | ----------- |
| `PHLIX_RELAY_ENABLED`          | `0`                                | When truthy (`1`, `true`, `yes`, `on`) enables the persistent WSS relay tunnel to the hub. Requires the server to be enrolled. See `Phlix\Hub\RelayConfig` and `config/relay.php`. |
| `PHLIX_RELAY_HUB_URL`          | `wss://hub.example.com/api/v1/servers/{id}/relay` | WebSocket URL of the hub relay endpoint. `{id}` is replaced with the server's UUID from enrollment. See `Phlix\Hub\RelayConsumer` and `config/relay.php`. |
| `PHLIX_RELAY_TUNNEL_HOSTNAME`  | _empty_                            | Public hostname assigned to this server's relay tunnel (e.g. `my-server.phlix.media`). See `Phlix\Hub\RelayConfig` and `config/relay.php`. |
| `PHLIX_RELAY_RECONNECT_DELAY`  | `5`                                | Seconds to wait before attempting to reconnect after the relay tunnel is disconnected. See `Phlix\Hub\RelayConfig` and `config/relay.php`. |
| `PHLIX_RELAY_PING_INTERVAL`    | `30`                               | Seconds between keep-alive ping frames sent over the relay tunnel. See `Phlix\Hub\RelayConfig` and `config/relay.php`. |
| `PHLIX_RELAY_PING_TIMEOUT`     | `10`                               | Seconds to wait for a pong response before considering the relay connection dead. See `Phlix\Hub\RelayConfig` and `config/relay.php`. |

## Port forwarding / remote access

| Variable                     | Default       | Description |
| ---------------------------- | ------------- | ----------- |
| `PHLIX_PORT_FORWARD_AUTO`    | `1`          | When truthy (`1`, `true`, `yes`, `on`) enables automatic port forwarding via UPnP-IGD on startup. See `Phlix\Network\PortForwardService` and `config/port-forward.php`. |
| `PHLIX_EXTERNAL_PORT`        | `32400`      | Port to use for automatic port forwarding. Both external and internal ports use this value by default. See `Phlix\Network\PortForwardService` and `config/port-forward.php`. |
| `PHLIX_EXTERNAL_HTTP_PORT`   | `8080`       | External HTTP port for the web portal when accessed remotely. See `config/port-forward.php`. |
| `PHLIX_EXTERNAL_HTTPS_PORT`  | `8443`       | External HTTPS port for the web portal when accessed remotely. See `config/port-forward.php`. |
| `PHLIX_UPNP_ENABLED`          | `1`          | When truthy enables UPnP-IGD port mapping attempts. When falsy, only STUN-based external IP detection is used. See `Phlix\Network\UpnpIgdClient` and `config/port-forward.php`. |
| `PHLIX_STUN_SERVER`          | `stun.l.google.com` | STUN server hostname for discovering the server's public IP address. See `Phlix\Network\StunClient` and `config/port-forward.php`. |
| `PHLIX_STUN_PORT`            | `19302`       | STUN server port. See `Phlix\Network\StunClient` and `config/port-forward.php`. |

## Server

| Variable | Default | Description |
| --- | --- | --- |
| `PHLIX_HTTP_PORT` | `32400` | HTTP port the server listens on. Overridden by `config/server.php` `server.port` at runtime. See `config/server.php`. |
| `PHLIX_PUBLIC_URL` | _unset_ | Public URL used in Hub relay and DLNA announcements. Must be set if the server is behind a reverse proxy. See `Phlix\Server\Core\Application`. |
| `PHLIX_LOG_LEVEL` | `info` | Minimum log level for application logs written to `.logs/app.log`. Valid values (in order of verbosity): `debug`, `info`, `notice`, `warning`, `error`, `critical`, `alert`, `emergency`. See `config/logger.php`. |

## Database

These are the **production runtime** connection parameters. `config/database.php`
reads **every** one of them from the environment, each with a localhost default
that targets a stock single-host install (the `install.sh`-managed `phlix` MySQL
user on `127.0.0.1`). A default install only needs to set `DB_PASSWORD`; override
any of the others when your database is remote or renamed. See `config/database.php`.

| Variable | Default | Description |
| --- | --- | --- |
| `DB_HOST` | `127.0.0.1` | MySQL host consumed by `config/database.php` `connections.mysql.host`. |
| `DB_PORT` | `3306` | MySQL port consumed by `config/database.php` `connections.mysql.port`. |
| `DB_DATABASE` | `phlix` | Database name consumed by `config/database.php` `connections.mysql.database`. Legacy alias: `DB_NAME` (used only when `DB_DATABASE` is unset). |
| `DB_USER` | `phlix` | Database username consumed by `config/database.php` `connections.mysql.username`. Legacy alias: `DB_USERNAME` (used only when `DB_USER` is unset). |
| `DB_PASSWORD` | _empty_ | Database password consumed by `config/database.php` `connections.mysql.password` via `getenv('DB_PASSWORD')`. Set this on every non-dev install. |
| `DB_POOL_ENABLED` | `1` | The per-worker coroutine connection pool is **on by default** (Stream Quality/ABR step S9): each coroutine leases its own connection so independent queries within a worker run in parallel instead of serialising on one shared socket. Set `DB_POOL_ENABLED=0` (or `false`/`no`/`off`) to opt back into the single-connection mutex path. See `config/database.php`. |
| `DB_POOL_SIZE` | `8` | Per-worker connection-pool ceiling while `DB_POOL_ENABLED` is on (the default). The server-wide max is roughly (worker count × pool size); keep it under MySQL `max_connections`. See `config/database.php`. |

> **Test overrides:** `phpunit.xml`'s `<env>` block overrides these same `DB_*`
> vars for the integration test suite (e.g. `DB_DATABASE=phlix_test`,
> `DB_USER=root`, plus `APP_ENV=testing`). Those values apply **only** when
> running the test suite — they are not the production defaults shown above.

### `PHLIX_DATABASE_*` aliases

| Variable | Default | Description |
| --- | --- | --- |
| `PHLIX_DATABASE_HOST` | `127.0.0.1` | MySQL host; maps to `config/database.php` `connections.mysql.host`. |
| `PHLIX_DATABASE_PORT` | `3306` | MySQL port; maps to `config/database.php` `connections.mysql.port`. |
| `PHLIX_DATABASE_NAME` | `phlix` | Database name; maps to `config/database.php` `connections.mysql.database`. |
| `PHLIX_DATABASE_USER` | `phlix` | Database username; maps to `config/database.php` `connections.mysql.username`. |
| `PHLIX_DATABASE_PASSWORD` | _empty_ | Database password. Alias for the `DB_PASSWORD` env var consumed by `config/database.php`. Prefer setting `DB_PASSWORD` to avoid confusion. |

## Transcoding / Hardware acceleration

| Variable | Default | Description |
| --- | --- | --- |
| `PHLIX_HWACCEL` | `none` | Preferred hardware acceleration. Valid values: `nvidia`, `vaapi`, `videotoolbox`, `qsv`, `amf`, `v4l2`, `none`. Overridden by `config/ffmpeg.php` `hwaccel.vendor_priority`. See `config/ffmpeg.php`. |

## Timezone

| Variable | Default | Description |
| --- | --- | --- |
| `TZ` | system TZ | PHP `date_default_timezone_set()` value. Controls timestamps in logs and EPG data. Set to your local timezone (e.g., `America/New_York`, `Europe/London`). |

> The production database credentials live in `config/database.php`
> (which reads `DB_PASSWORD` from the environment via `getenv('DB_PASSWORD')`).
