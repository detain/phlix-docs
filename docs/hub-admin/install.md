# Hub Admin: Install & First Boot

## TL;DR

Run a self-hosted Phlix Hub via Docker or from source. The Hub needs a **MySQL database**, a
**JWT secret** (`HUB_JWT_SECRET`), and a **public domain** (`HUB_PUBLIC_DOMAIN`). It is configured
entirely through `HUB_*` environment variables. TLS is **not** provisioned automatically
(the Hub's `TlsCertificateManager::provisionCertificate()` throws) — terminate TLS at a reverse
proxy (Traefik / Caddy / nginx) or place certificates out-of-band; see the
[TLS Certificates runbook](./tls.md) and the developer [TLS notes](../dev/tls-certificates.md).
The **first account registered** at `/signup` is automatically promoted to admin.

> For an exhaustive bare-metal Ubuntu walkthrough (PHP packages, MySQL hardening, systemd unit,
> nginx config), see the [README in the `phlix-hub` repo](https://github.com/detain/phlix-hub#readme).

---

## Automated install (one-liner)

On a fresh Ubuntu/Debian host, the bundled
[`scripts/install.sh`](https://github.com/detain/phlix-hub/blob/master/scripts/install.sh)
does the whole thing — system packages, MySQL database + user, application code, env file, JWT
secret, migrations, a systemd service, and an HAProxy reverse proxy with an auto-renewing
Let's Encrypt certificate:

```bash
curl -fsSL https://raw.githubusercontent.com/detain/phlix-hub/master/scripts/install.sh | sudo bash
```

Add your domain and a Let's Encrypt email to provision HTTPS in the same run:

```bash
curl -fsSL https://raw.githubusercontent.com/detain/phlix-hub/master/scripts/install.sh \
  | sudo bash -s -- --domain hub.example.com --admin-email you@example.com
```

Run in a terminal, it prompts for the install path, database user/password, and hostname (with
sensible defaults); piped or with `-y` it runs **fully unattended**. See
`sudo bash scripts/install.sh --help` for all flags. The manual steps below cover the same ground
if you'd rather configure each piece yourself.

---

## Updating an existing install

The same `install.sh` updates an in-place install. It reads `/etc/phlix-hub.env` so the JWT
secret and DB password are **preserved** — nothing is regenerated — then pulls new code,
runs `composer install`, applies pending migrations, and restarts the service.

```bash
sudo bash /opt/phlix-hub/scripts/install.sh --update -y
```

Or via the one-liner:

```bash
curl -fsSL https://raw.githubusercontent.com/detain/phlix-hub/master/scripts/install.sh \
  | sudo bash -s -- --update -y
```

Pin to a specific branch or tag with `--branch`:

```bash
sudo bash /opt/phlix-hub/scripts/install.sh --update --branch v0.2.0 -y
```

`--update` steps, in order:

1. **Discovers the install path** from the systemd unit (`WorkingDirectory`), so non-default
   layouts work automatically.
2. **Reads the env file** — every existing value is reused. `HUB_JWT_SECRET`, `HUB_DB_PASSWORD`,
   `HUB_PUBLIC_DOMAIN`, etc. are never regenerated.
3. **Pulls code** with `git fetch --depth 1 origin $BRANCH` followed by
   `git reset --hard origin/$BRANCH`. Local uncommitted edits in the install directory are
   discarded (the script warns first).
4. **Composer** — `composer install --no-dev --optimize-autoloader` against the committed
   `composer.lock`.
5. **Clears `var/smarty/{compile,cache}`** to avoid stale compiled templates.
6. **Runs migrations** — `scripts/run-migrations.php` is idempotent and only applies pending
   files.
7. **Restarts** — `systemctl daemon-reload` then `systemctl restart phlix-hub`.
8. **Health check** — `curl http://localhost:$HUB_PORT/health`.

What it does **not** touch: the env file, MySQL grants, HAProxy config, certbot/Let's Encrypt
state. New `HUB_*` env vars introduced by a release must be added to `/etc/phlix-hub.env`
manually — anything missing falls back to its documented default in the
[Environment variables reference](#environment-variables-reference).

> Mixed Docker users: this section applies to bare-metal / systemd installs. For Docker, pull
> the new image (`docker pull detain/phlix-hub`), `docker compose up -d`, then run
> `docker compose exec hub php /var/www/html/scripts/run-migrations.php`.

---

## Uninstalling

`install.sh --uninstall` removes an existing install. By default it is **interactive** and
prompts separately for each destructive step (database drop, certificate deletion). The
database and the Let's Encrypt cert are **preserved** unless you opt in.

```bash
sudo bash /opt/phlix-hub/scripts/install.sh --uninstall
```

Add `--purge` to also drop the database and delete the Let's Encrypt certificate via
`certbot delete`. Combine with `-y` for a fully unattended teardown:

```bash
sudo bash /opt/phlix-hub/scripts/install.sh --uninstall --purge -y
```

Piped (non-interactive) runs require an explicit `-y` to proceed.

What `--uninstall` removes, only when present:

| Step | Artefact | Notes |
|---|---|---|
| 1 | `phlix-hub` systemd service | `stop`, `disable`, remove unit, `daemon-reload` |
| 2 | HAProxy fragment | `/etc/haproxy/phlix-managed/phlix-hub.cfg.fragment` removed; `haproxy.cfg` rebuilt from remaining Phlix fragments. If phlix-hub was the last one, the pre-Phlix snapshot at `/etc/haproxy/haproxy.cfg.pre-phlix.bak` is restored, or `haproxy.cfg` is removed and haproxy is stopped + disabled. |
| 3 | HAProxy TLS cert | The combined PEM at `/etc/haproxy/certs/<domain>.pem` |
| 4 | Certbot helpers | `/etc/cron.d/phlix-hub-certbot` and the renewal deploy hook |
| 5 | Let's Encrypt cert | `certbot delete --cert-name <domain>` — only with `--purge` or interactive confirm |
| 6 | MySQL database + user | `DROP DATABASE` / `DROP USER` — only with `--purge` or interactive confirm |
| 7 | Install directory | `rm -rf` on the discovered install path; system paths like `/`, `/etc`, `/opt`, `/home` are refused |
| 8 | `/etc/phlix-hub.env` | env file |
| 9 | Dedicated system user | `userdel` of the user listed in the systemd unit's `User=` — only with `--purge` or interactive confirm. Refuses shared OS accounts (`www-data`, `root`, etc.). Cross-detects phlix-server's `User=` and refuses to remove a shared name. |

System packages (`php-*`, `mysql-server`, `haproxy`, `certbot`) and `ufw` rules are left alone —
remove them yourself with `apt remove` / `ufw delete` if you no longer need them.

### Install flags

`sudo bash scripts/install.sh --help` lists every option. Highlights:

| Flag | Effect |
|---|---|
| `--domain HOST` | Public hostname; enables TLS when paired with `--admin-email` |
| `--admin-email EMAIL` | Email registered with Let's Encrypt |
| `--db-name`/`--db-user`/`--db-pass`/`--db-host`/`--db-port` | MySQL identity (random password if `--db-pass` omitted) |
| `--jwt-secret SECRET` | HMAC secret used to sign JWTs (random 32-byte hex if omitted) |
| `--service-user USER` | System user to run as (default `phlix-hub` — dedicated, created if missing) |
| `--workers N` | HTTP worker processes (default 4) |
| `--branch NAME` | Git branch or tag to install |
| `--tls`/`--no-tls`/`--no-proxy` | Force TLS / plain HTTP / skip the managed HAProxy entirely |
| `--update` | Pull new code + run migrations on an existing install (preserves env + secrets) |
| `--uninstall` | Remove the install — interactive prompts before each destructive step |
| `--purge` | With `--uninstall`, also drop the DB, delete the Let's Encrypt cert, remove the system user |
| `-y` / `--interactive` | Override interactivity detection |

> Default service user changed from `www-data` to `phlix-hub` so the hub runs as its own
> dedicated system account, isolated from the apache/nginx-owned `www-data`. Existing
> installs that were created with `www-data` keep running on `www-data` — `--update` reads
> `User=` from the systemd unit rather than rewriting it.

---

## Requirements

- **PHP 8.3+** with `pcntl`, `posix`, `json`, `mbstring`, `curl`, and `sodium`
- **MySQL 8.0+** (or MariaDB 10.6+)
- **Composer 2**
- A reverse proxy for TLS termination in production

The Hub runs three long-lived workers in one process group:

| Worker | Default port | Purpose |
|--------|--------------|---------|
| HTTP | `8800` | REST API + dashboard + `/health` |
| Relay (server-facing) | `8802` | Servers open their outbound tunnel here |
| Relay (client-facing) | `8803` | Remote clients connect and are routed to a server |

---

## Database setup

Create the database and a dedicated user. The Hub connects over TCP to `127.0.0.1` by default,
so the user's host must match:

```sql
CREATE DATABASE phlix_hub
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER 'phlix_hub'@'127.0.0.1' IDENTIFIED BY 'CHANGE-ME-strong-password';

-- The migration runner issues CREATE/ALTER, so those grants are required
-- alongside the CRUD rights. No DROP is needed.
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
  ON phlix_hub.* TO 'phlix_hub'@'127.0.0.1';

FLUSH PRIVILEGES;
```

If the Hub runs on a different host than MySQL, create the user for that host (or `'%'`) and set
`HUB_DB_HOST` accordingly.

---

## Install options

### Docker

```bash
docker run -d \
  --name phlix-hub \
  -p 8800:8800 -p 8802:8802 -p 8803:8803 \
  -e HUB_DB_HOST=db \
  -e HUB_DB_PORT=3306 \
  -e HUB_DB_NAME=phlix_hub \
  -e HUB_DB_USER=phlix_hub \
  -e HUB_DB_PASSWORD=CHANGE-ME \
  -e HUB_JWT_SECRET="$(openssl rand -hex 32)" \
  -e HUB_PUBLIC_DOMAIN=hub.example.com \
  detain/phlix-hub

# Apply migrations against the configured database
docker exec phlix-hub php /var/www/html/scripts/run-migrations.php
```

### Docker Compose

```yaml
services:
  traefik:
    image: traefik:v3
    command:
      - "--providers.docker=true"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    ports:
      - "80:80"
      - "443:443"

  db:
    image: mysql:8
    environment:
      MYSQL_DATABASE: phlix_hub
      MYSQL_USER: phlix_hub
      MYSQL_PASSWORD: CHANGE-ME
      MYSQL_RANDOM_ROOT_PASSWORD: "yes"
    volumes:
      - hub-db:/var/lib/mysql

  hub:
    image: detain/phlix-hub
    environment:
      HUB_DB_HOST: db
      HUB_DB_NAME: phlix_hub
      HUB_DB_USER: phlix_hub
      HUB_DB_PASSWORD: CHANGE-ME
      HUB_JWT_SECRET: "${HUB_JWT_SECRET}"
      HUB_PUBLIC_DOMAIN: hub.example.com
    depends_on:
      - db
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.hub.rule=Host(`hub.example.com`)"
      - "traefik.http.routers.hub.tls=true"
      - "traefik.http.services.hub.loadbalancer.server.port=8800"

volumes:
  hub-db:
```

Run migrations once the database is up:

```bash
docker compose exec hub php /var/www/html/scripts/run-migrations.php
```

### From source

```bash
git clone https://github.com/detain/phlix-hub.git
cd phlix-hub
composer install --no-dev --optimize-autoloader

export HUB_DB_HOST=127.0.0.1 HUB_DB_USER=phlix_hub \
       HUB_DB_PASSWORD=CHANGE-ME HUB_DB_NAME=phlix_hub
export HUB_JWT_SECRET="$(openssl rand -hex 32)"
export HUB_PUBLIC_DOMAIN=hub.example.com

php scripts/run-migrations.php     # create the schema (idempotent)
php public/index.php start         # add -d to daemonize
```

For a production host, run `php public/index.php start` under a process manager such as systemd
(see the [Overview](./overview.md) for the full CLI and the
[`phlix-hub` README](https://github.com/detain/phlix-hub#readme) for a ready-made unit file).

---

## TLS setup

The Hub does **not** terminate TLS itself and does **not** provision certificates automatically.
Put it behind a reverse proxy that terminates TLS and forwards to the HTTP worker on `8800` and
the client-relay worker on `8803` (WebSocket).

### Traefik / Caddy (automatic ACME)

With Traefik, the labels in the Compose example above obtain and renew a Let's Encrypt
certificate for you.

### nginx (manual cert)

```nginx
server {
    listen 443 ssl;
    server_name hub.example.com;

    ssl_certificate     /etc/letsencrypt/live/hub.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/hub.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8800;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket upgrade (relay + client mount)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
    }
}
```

If you allocate per-server subdomains (`<subdomain>.<HUB_PUBLIC_DOMAIN>`), point a **wildcard**
DNS record at the Hub and use a wildcard certificate. See the
[TLS Certificates runbook](./tls.md).

---

## First admin user

There is no `admin:create` command. Admins are bootstrapped by **signup**:

1. Open `https://hub.example.com/signup`.
2. Create the first account — it is **automatically promoted to admin**.
3. Additional admins are granted by setting `is_admin = 1` on their row in the `users` table.

---

## Hub claim flow QA

Verify pairing works end-to-end:

1. Start the Hub and a media server (the server has relay enabled and points at
   `HUB_PUBLIC_DOMAIN`).
2. On the **server**: Settings → Hub → Connect → generate a claim code (e.g. `HUB-CLAIM-ABCD1234`).
3. On the **Hub**: sign in, open **`/claim-server`**, and enter the claim code.
4. Confirm the server appears under **`/my-servers`** with a live heartbeat indicator.
5. Create a second account at `/signup`, sign in as that user, and confirm shared libraries and
   media are visible.

---

## Environment variables reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `HUB_HOST` | No | `0.0.0.0` | HTTP bind address |
| `HUB_PORT` | No | `8800` | HTTP listen port |
| `HUB_WORKERS` | No | `2` | HTTP worker process count |
| `HUB_PUBLIC_DOMAIN` | Yes | `phlix.media` | Base domain for per-server subdomains / relay URLs |
| `HUB_DB_HOST` | Yes | `127.0.0.1` | MySQL host |
| `HUB_DB_PORT` | No | `3306` | MySQL port |
| `HUB_DB_NAME` | Yes | `phlix_hub` | Database name |
| `HUB_DB_USER` | Yes | `phlix_hub` | Database user |
| `HUB_DB_PASSWORD` | Yes | `phlix_hub` | Database password |
| `HUB_JWT_SECRET` | Yes (prod) | random per-process | ≥32-byte JWT signing secret |
| `HUB_JWT_ACCESS_TTL` | No | `3600` | Access-token lifetime (seconds) |
| `HUB_JWT_REFRESH_TTL` | No | `604800` | Refresh-token lifetime (seconds) |
| `HUB_SONARR_URL` / `HUB_SONARR_API_KEY` / `HUB_SONARR_ENABLED` | No | — | Sonarr integration for media requests |
| `HUB_RADARR_URL` / `HUB_RADARR_API_KEY` / `HUB_RADARR_ENABLED` | No | — | Radarr integration for media requests |

> If `HUB_JWT_SECRET` is unset the Hub falls back to a random per-process secret — usable in dev,
> but it invalidates every token on restart, so it **must** be set in production.

---

## What can go wrong

### TLS cert not trusted by clients (self-signed)

**Symptom:** Clients show a certificate warning or refuse to connect.

**Fix:** Use a CA-signed certificate (Let's Encrypt via Traefik/Caddy, or certbot for nginx).
Self-signed certs are rejected by apps and browsers by default.

### JWT secret not set (random per-process fallback)

**Symptom:** Users are logged out on every Hub restart; tokens stop validating.

**Fix:** Set `HUB_JWT_SECRET` to a stable random value (`openssl rand -hex 32`) and keep it
constant across restarts and across all Hub nodes.

### Server can't reach the Hub

**Symptom:** A server appears offline in `/my-servers`; no heartbeat is recorded.

**Fix:** Make sure the Hub's HTTP (`8800`) and relay (`8802`) ports are reachable from the
server's network through your reverse proxy, and that `HUB_PUBLIC_DOMAIN` resolves to the Hub's
public address. Verify with `curl https://hub.example.com/health` from the server's network.

### Database migration fails

**Symptom:** `php scripts/run-migrations.php` errors out.

**Cause:** The database user lacks `CREATE`/`ALTER`, or the database doesn't exist.

**Fix:** Confirm the grants above and that the database exists. The runner is idempotent (it
tracks applied migrations in a `migrations` table) — to start completely clean, run
`sudo bash scripts/install.sh --uninstall --purge -y` followed by a fresh install.

---

## Next steps

- [Overview](./overview.md) — dashboard and CLI reference
- [First Boot](./first-boot.md) — create the first admin and pair a server
- [Capacity Planning](./capacity-planning.md) — size Hub hardware for your user base
- [Monitoring & Alerting](./monitoring-alerting.md) — dashboards, metrics, and alerts
