# Install phlix-server on Linux

## TL;DR

phlix-server is a PHP 8.3+ media server with HLS streaming, WebSocket real-time sync, DLNA, and a Smarty web portal. This guide installs it on Linux (Ubuntu 22.04+, Debian 12+, or Fedora 40+) in roughly 15 minutes using system packages, Composer, and systemd.

**Minimum requirements:** 2 CPU / 4 GB RAM. A non-root sudo user is recommended.

**Quick one-liner (Ubuntu/Debian)** — `scripts/install.sh` does the entire install (system packages, MySQL DB + user, dedicated `phlix` system user, code clone, env file at `/etc/phlix/env`, migrations, systemd `phlix-server` service, HAProxy + Let's Encrypt):

```bash
curl -fsSL https://raw.githubusercontent.com/detain/phlix-server/master/scripts/install.sh | sudo bash
```

Or provision HTTPS in the same run by passing your domain and a Let's Encrypt contact email:

```bash
curl -fsSL https://raw.githubusercontent.com/detain/phlix-server/master/scripts/install.sh \
  | sudo bash -s -- --domain phlix.example.com --admin-email you@example.com
```

Then open `http://your-server-ip:8096` (or `https://phlix.example.com` if you set up TLS) in your browser.

The manual step-by-step below is the same workflow done by hand; you only need it if you want to customise something the script doesn't expose, or if you're on a distro other than Ubuntu/Debian.

::: tip Screenshots TBD
This guide is text-first. Screenshots will be added in a follow-up.
:::

---

## 1. Supported operating systems

| Distro | Version | Package manager | Notes |
|--------|---------|-----------------|-------|
| Ubuntu | 22.04+ (LTS) | APT | LTS recommended |
| Debian | 12+ (Bookworm) | APT | Testing/stable |
| Fedora | 40+ | DNF/RPM | RPM Fusion needed for FFmpeg |
| General (source) | Any modern | Source compile | PHP 8.3 from source |

Use a non-root sudo user for all steps below.

---

## 2. Install system dependencies

### 2a. Ubuntu / Debian (APT)

```bash
sudo apt update
sudo apt install -y php-fpm php-mysql php-curl php-gd php-zip \
  php-xml php-mbstring php-bcmath mariadb-server ffmpeg git curl unzip
```

### 2b. Fedora (DNF)

First enable RPM Fusion for a full FFmpeg build:

```bash
sudo dnf install -y https://mirrors.rpmfusion.org/free/fedora/rpmfusion-free-release-$(rpm -E %fedora).noarch.rpm
sudo dnf install -y php-fpm php-mysqlnd php-curl php-gd php-zip php-xml \
  php-mbstring php-bcmath mariadb-server ffmpeg git curl unzip
```

### 2c. From source (all distros)

Install PHP 8.3 from source, MariaDB from distro packages, and FFmpeg from the jellyfin-ffmpeg PPA or source.

---

## 3. Database setup (MySQL / MariaDB)

`config/database.php` hardcodes the host (`127.0.0.1`), port (`3306`), database name
(`phlix`), and username (`phlix`); only `DB_PASSWORD` is read from the environment. So the
database name and user must match those values exactly:

```bash
sudo mysql_secure_installation

sudo mysql -e "CREATE DATABASE phlix CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
sudo mysql -e "CREATE USER 'phlix'@'127.0.0.1' IDENTIFIED BY 'your_strong_password';"
sudo mysql -e "GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON phlix.* TO 'phlix'@'127.0.0.1';"
sudo mysql -e "FLUSH PRIVILEGES;"
```

Replace `your_strong_password` with a real strong password (`openssl rand -base64 24` works).

---

## 4. Create the `phlix` system user

The systemd unit runs as a dedicated unprivileged account:

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin phlix
sudo mkdir -p /var/phlix/{config,data,logs,backups} /var/log/phlix /var/run/phlix /etc/phlix
sudo chown -R phlix:phlix /var/phlix /var/log/phlix /var/run/phlix
```

---

## 5. Clone phlix-server

```bash
sudo mkdir -p /var/www/phlix
sudo git clone https://github.com/detain/phlix-server.git /var/www/phlix
cd /var/www/phlix
```

---

## 6. PHP dependencies (Composer)

```bash
sudo composer install --no-dev --optimize-autoloader
sudo mkdir -p /var/www/phlix/.logs /var/www/phlix/templates_c
sudo chown -R phlix:phlix /var/www/phlix
```

---

## 7. Configure environment

The systemd unit loads variables from `/etc/phlix/env`:

```bash
sudo tee /etc/phlix/env >/dev/null <<'EOF'
# Phlix Media Server environment

# DB_PASSWORD is the only DB var read by config/database.php; host/port/db/user
# are hardcoded to 127.0.0.1:3306 / phlix / phlix.
DB_PASSWORD=your_strong_password

# 32-byte hex secret (openssl rand -hex 32)
PHLIX_SECRET_KEY=CHANGE-ME

PHLIX_DOMAIN=your-server.example.com
PHLIX_LOG_LEVEL=info
PHLIX_ENV=production

# Optional integrations
#TMDB_API_KEY=
#PHLIX_HUB_URL=
#PHLIX_RELAY_ENABLED=1
EOF
sudo chmod 640 /etc/phlix/env
sudo chown root:phlix /etc/phlix/env
```

---

## 8. Database migrations

The migration runner reads `config/database.php`, which pulls the password from
`DB_PASSWORD`:

```bash
sudo -u phlix DB_PASSWORD=your_strong_password \
  php /var/www/phlix/scripts/run-migrations.php
```

The runner is *currently* not idempotent (no tracking table), but every migration uses
`CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN` and the script swallows duplicate
errors, so re-runs are safe.

---

## 9. systemd service unit

Save this as `/etc/systemd/system/phlix-server.service`:

```ini
[Unit]
Description=Phlix Media Server
Documentation=https://docs.phlix.media
After=network.target mysql.service
Wants=mysql.service

[Service]
Type=simple
User=phlix
Group=phlix
WorkingDirectory=/var/www/phlix
EnvironmentFile=/etc/phlix/env
Environment="PHLIX_ENV=production"
ExecStart=/usr/bin/php /var/www/phlix/public/index.php start
ExecReload=/bin/kill -SIGUSR1 $MAINPID
ExecStop=/bin/kill -SIGTERM $MAINPID
Restart=on-failure
RestartSec=5s

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/phlix /var/log/phlix /var/run/phlix /var/www/phlix/.logs /var/www/phlix/templates_c
RestrictNamespaces=true
LockPersonality=true
RemoveIPC=true

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now phlix-server
sudo systemctl status phlix-server
```

Note the `start` argument on `ExecStart` — phlix-server is a Workerman app and won't daemonise
without it.

---

## 10. Firewall configuration

### UFW (Ubuntu/Debian)

```bash
sudo ufw allow 8096/tcp comment 'Phlix HTTP'
sudo ufw allow 1900/udp comment 'DLNA discovery (optional)'
```

### firewalld (Fedora)

```bash
sudo firewall-cmd --permanent --add-port=8096/tcp
sudo firewall-cmd --permanent --add-port=1900/udp
sudo firewall-cmd --reload
```

For a public-facing install, put HAProxy or nginx on `:80/:443` in front of phlix on `:8096`
and open only the proxy ports.

---

## 11. Verify the install

```bash
sudo systemctl status phlix-server
curl -I http://localhost:8096/health
```

Expected: HTTP 200 from the `/health` endpoint.

---

## Updating an existing install

If you used `scripts/install.sh` for the initial setup, the same script updates in place —
preserving `/etc/phlix/env` (so `DB_PASSWORD` and `PHLIX_SECRET_KEY` survive), pulling the
latest code, refreshing Composer deps, running pending migrations, and restarting the service:

```bash
sudo bash /var/www/phlix/scripts/install.sh --update -y
```

Pin to a specific tag or branch with `--branch`:

```bash
sudo bash /var/www/phlix/scripts/install.sh --update --branch v0.2.0 -y
```

The `--update` flow:

1. Discovers the install path from the systemd unit's `WorkingDirectory`.
2. Re-reads `/etc/phlix/env` — every existing value is preserved.
3. Fetches code as the install dir owner (via `sudo -H -u <owner>`) so it doesn't trip Git's
   CVE-2022-24765 dubious-ownership check.
4. `composer install --no-dev --optimize-autoloader` against the committed `composer.lock`.
5. Clears `templates_c/` so Smarty recompiles changed templates.
6. Runs `scripts/run-migrations.php`.
7. `systemctl daemon-reload` then `systemctl restart phlix-server`.
8. `curl http://localhost:8096/health` as a final check.

It explicitly does **not** touch the env file, MySQL grants, HAProxy config, or the Let's
Encrypt cert.

If you did a manual install (didn't use `install.sh`), update by hand:

```bash
cd /var/www/phlix
sudo -u phlix git fetch --depth 1 origin master
sudo -u phlix git reset --hard origin/master
sudo -u phlix composer install --no-dev --optimize-autoloader --no-interaction
sudo find /var/www/phlix/templates_c -mindepth 1 -delete
sudo -u phlix DB_PASSWORD=your_strong_password \
  php /var/www/phlix/scripts/run-migrations.php
sudo systemctl restart phlix-server
curl http://localhost:8096/health
```

---

## Uninstalling

`scripts/install.sh --uninstall` removes an install. It is **interactive by default** and
prompts separately for each destructive step. The MySQL database, the `/var/phlix` data
directory, and the Let's Encrypt certificate are **preserved** unless you opt in.

```bash
sudo bash /var/www/phlix/scripts/install.sh --uninstall
```

Add `--purge` to also drop the database (and user), wipe `/var/phlix`, and delete the
Let's Encrypt certificate via `certbot delete`. Combine with `-y` for a fully unattended
teardown:

```bash
sudo bash /var/www/phlix/scripts/install.sh --uninstall --purge -y
```

Piped, non-interactive runs require an explicit `-y` to proceed.

What it removes when present:

| Step | Artefact | Notes |
|---|---|---|
| 1 | `phlix-server` systemd service | `stop`, `disable`, remove unit, `daemon-reload` |
| 2 | HAProxy fragment | `/etc/haproxy/phlix-managed/phlix-server.cfg.fragment` removed; `haproxy.cfg` rebuilt from remaining Phlix fragments. If phlix-server was the last one, the pre-Phlix snapshot at `/etc/haproxy/haproxy.cfg.pre-phlix.bak` is restored, or `haproxy.cfg` is removed and haproxy is stopped + disabled. |
| 3 | HAProxy TLS cert | The combined PEM at `/etc/haproxy/certs/<domain>.pem` |
| 4 | Certbot helpers | `/etc/cron.d/phlix-server-certbot` and the renewal deploy hook |
| 5 | Let's Encrypt cert | `certbot delete --cert-name <domain>` — only with `--purge` or interactive confirm |
| 6 | MySQL database + user | `DROP DATABASE` / `DROP USER` — only with `--purge` or interactive confirm |
| 7 | Install dir | `/var/www/phlix` (or whatever path was used); system paths refused |
| 8 | Data dirs | `/var/phlix`, `/var/log/phlix`, `/var/run/phlix` — `/var/phlix` only with `--purge` or interactive confirm |
| 9 | `/etc/phlix/env` | env file |
| 10 | Dedicated system user `phlix` | `userdel` — only with `--purge` or interactive confirm. Refuses shared OS accounts. Cross-detects phlix-hub's `User=` and refuses to remove a name that's still being used by the hub. |

System packages (`php-*`, `mysql-server`, `ffmpeg`, `haproxy`, `certbot`) and `ufw` rules are
left alone — `sudo apt remove …` / `sudo ufw delete …` to remove them.

### Install flags

`sudo bash scripts/install.sh --help` lists every option. Highlights:

| Flag | Effect |
|---|---|
| `--domain HOST` | Public hostname; enables TLS when paired with `--admin-email` |
| `--admin-email EMAIL` | Email registered with Let's Encrypt |
| `--db-name`/`--db-user`/`--db-pass`/`--db-host`/`--db-port` | MySQL identity. `config/database.php` hardcodes host/port/db/user — only `DB_PASSWORD` is env-driven. |
| `--http-port PORT` | HTTP listen port (default `8096`) |
| `--tmdb-api-key KEY` | Optional TMDB API key |
| `--hub-url URL` | Optional `PHLIX_HUB_URL` for hub relay pairing |
| `--service-user USER` | System user to run as (default `phlix` — dedicated, created if missing) |
| `--branch NAME` | Git branch or tag to install |
| `--tls`/`--no-tls`/`--no-proxy` | Force TLS / plain HTTP / skip managed HAProxy |
| `--update` | Pull new code + run migrations on an existing install (preserves env + secrets) |
| `--uninstall` | Remove the install — interactive prompts before each destructive step |
| `--purge` | With `--uninstall`, also drop the DB, delete the Let's Encrypt cert, wipe `/var/phlix`, and remove the dedicated system user |
| `-y` / `--interactive` | Override interactivity detection |

---

## What can go wrong

### PHP extension missing

- **Symptom:** `Class 'PDO' not found` or similar during `composer install`
- **Fix:** `sudo apt install php-mysql php-gd` (installs extensions for your default PHP version)
- **Verify:** `php -m | grep pdo_mysql`

### MariaDB not running

- **Symptom:** `Connection refused` on `localhost:3306` after install
- **Fix:** `sudo systemctl start mariadb && sudo systemctl enable mariadb`
- **Verify:** `sudo mysql -u root -p -e "SELECT 1;"`

### FFmpeg not found / wrong version

- **Symptom:** Transcoding fails, "FFmpeg not found" in logs
- **Fix (Ubuntu/Debian):** `sudo apt install ffmpeg` — for better transcoding use jellyfin-ffmpeg
- **Fix (Fedora):** Enable RPM Fusion first, then `dnf install ffmpeg`
- **Verify:** `ffmpeg -version`

### Permission denied on /var/phlix

- **Symptom:** "Cannot create file /var/phlix/..." in logs
- **Fix:** `sudo chown -R phlix:phlix /var/phlix /var/log/phlix /var/run/phlix`

### Port 8096 already in use

- **Symptom:** `bind(): Address already in use`
- **Fix:** `sudo ss -tlnp | grep 8096` to find the conflicting process; stop it or change the
  `port` in `config/server.php`.

### Service exits immediately

- **Symptom:** `systemctl status phlix-server` shows the service failing after a few seconds.
- **Cause:** `ExecStart` is missing the trailing `start` argument — Workerman prints help text
  and exits.
- **Fix:** confirm the unit's `ExecStart=` ends with `public/index.php start`.

### "dubious ownership in repository" on update

- **Symptom:** `git fetch` aborts with *fatal: detected dubious ownership in repository at
  '/var/www/phlix'*.
- **Cause:** the install dir is owned by the `phlix` user but you ran git as root.
- **Fix:** `scripts/install.sh --update` already handles this by `sudo`-ing as the install
  dir owner. For a manual update, prefix the git commands with `sudo -u phlix`.

---

## Next steps

- [First-run wizard](/first-run) — complete the browser-based setup at `http://your-server:8096`
- [Docker install](/install/docker) — alternative install method using containers
- [Hardware transcoding](/advanced/hardware-transcoding) — configure NVENC/VAAPI for better performance
