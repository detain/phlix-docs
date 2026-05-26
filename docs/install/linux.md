# Install phlix-server on Linux

## TL;DR

phlix-server is a PHP 8.3+ media server with HLS streaming, WebSocket real-time sync, DLNA, and a Smarty web portal. This guide installs it on Linux (Ubuntu 22.04+, Debian 12+, or Fedora 40+) in roughly 15 minutes using system packages, Composer, and systemd.

**Minimum requirements:** 2 CPU / 4 GB RAM. A non-root sudo user is recommended.

**Quick one-liner (Ubuntu/Debian):**

```bash
sudo apt update && sudo apt install -y php-fpm php-mysql php-curl php-gd \
  php-zip php-xml php-mbstring php-bcmath mariadb-server ffmpeg git curl unzip && \
  sudo mkdir -p /opt/phlix && sudo chown $USER:$USER /opt/phlix && \
  git clone https://github.com/detain/phlix-server.git /opt/phlix && cd /opt/phlix && \
  composer install --no-dev --optimize-autoloader && \
  cp .env.example .env && php scripts/run-migrations.php && \
  sudo cp phlix.service /etc/systemd/system/ && sudo systemctl daemon-reload && \
  sudo systemctl enable --now phlix && sudo ufw allow 32400/tcp comment 'Phlix HTTP'
```

Then open `http://your-server-ip:32400` in your browser.

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

## 3. Database setup (MariaDB)

```bash
sudo mysql_secure_installation

sudo mysql -u root -p -e "CREATE DATABASE phlix CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
sudo mysql -u root -p -e "CREATE USER 'phlix'@'localhost' IDENTIFIED BY 'your_strong_password';"
sudo mysql -u root -p -e "GRANT ALL PRIVILEGES ON phlix.* TO 'phlix'@'localhost';"
sudo mysql -u root -p -e "FLUSH PRIVILEGES;"
```

Replace `your_strong_password` with a real strong password.

---

## 4. Clone phlix-server

```bash
sudo mkdir -p /opt/phlix
sudo chown $USER:$USER /opt/phlix
git clone https://github.com/detain/phlix-server.git /opt/phlix
cd /opt/phlix
```

---

## 5. PHP dependencies (Composer)

```bash
composer install --no-dev --optimize-autoloader
```

---

## 6. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your editor. Required settings:

```env
APP_URL=http://your-server-ip:32400
DB_HOST=localhost
DB_DATABASE=phlix
DB_USERNAME=phlix
DB_PASSWORD=your_strong_password
```

---

## 7. Database migrations

```bash
php scripts/run-migrations.php
```

---

## 8. systemd service unit

Save this as `/etc/systemd/system/phlix.service`:

```ini
[Unit]
Description=Phlix Media Server
After=network.target mariadb.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/phlix
ExecStart=/usr/bin/php /opt/phlix/public/index.php
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Install and enable:

```bash
sudo cp phlix.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable phlix
sudo systemctl start phlix
```

---

## 9. Firewall configuration

### UFW (Ubuntu/Debian)

```bash
sudo ufw allow 32400/tcp comment 'Phlix HTTP'
sudo ufw allow 1900/udp comment 'DLNA discovery (optional)'
```

### firewalld (Fedora)

```bash
sudo firewall-cmd --permanent --add-port=32400/tcp
sudo firewall-cmd --permanent --add-port=1900/udp
sudo firewall-cmd --reload
```

---

## 10. Verify the install

```bash
sudo systemctl status phlix
curl -I http://localhost:32400
```

Expected: HTTP 200 from the phlix index page.

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

### Permission denied on /var/lib/phlix

- **Symptom:** "Cannot create file /var/lib/phlix/..." in logs
- **Fix:** `sudo chown -R www-data:www-data /var/lib/phlix && sudo chmod -R 755 /var/lib/phlix`

### Port 32400 already in use

- **Symptom:** `bind(): Address already in use`
- **Fix:** `sudo ss -tlnp | grep 32400` to find the conflicting process, stop it or change phlix port via `APP_URL` env var

---

## Next steps

- [First-run wizard](/first-run) — complete the browser-based setup at `http://your-server:32400`
- [Docker install](/install/docker) — alternative install method using containers
- [Hardware transcoding](/advanced/hardware-transcoding) — configure NVENC/VAAPI for better performance
