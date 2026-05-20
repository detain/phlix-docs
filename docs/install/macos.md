# Install phlix-server on macOS

## TL;DR

phlix-server is a PHP 8.3+ media server with HLS streaming, WebSocket real-time sync, DLNA, and a Smarty web portal. This guide installs it on macOS 12+ (Monterey or later) in roughly 15 minutes using Homebrew or MacPorts.

**Minimum requirements:** macOS 12+ (Monterey or later), 2 CPU / 4 GB RAM, Homebrew or MacPorts.

**Quick one-liner (Homebrew):**

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" && \\
  brew install php@8.3 mysql@8.0 ffmpeg git curl && \\
  sudo mkdir -p /opt/phlix && sudo chown $USER /opt/phlix && \\
  git clone https://github.com/detain/phlix-server.git /opt/phlix && cd /opt/phlix && \\
  composer install --no-dev --optimize-autoloader && \\
  cp .env.example .env && php scripts/run-migrations.php && \\
  brew services start mysql@8.0 && php public/index.php
```

Then open `http://localhost:32400` in your browser.

::: tip Screenshots TBD
This guide is text-first. Screenshots will be added in a follow-up.
:::

---

## 1. Supported macOS versions and hardware

| macOS version | Chip | Architecture | Notes |
|---------------|------|-------------|-------|
| 12 (Monterey) | Intel / Apple Silicon | x86_64 / arm64 | Rosetta 2 available for Intel emulation |
| 13 (Ventura) | Intel / Apple Silicon | x86_64 / arm64 | |
| 14 (Sonoma) | Intel / Apple Silicon | x86_64 / arm64 | |
| 15 (Sequoia) | Intel / Apple Silicon | x86_64 / arm64 | |

- **Intel** (Broadwell and later): Homebrew installs to `/usr/local/`
- **Apple Silicon** (M1/M2/M3/M4): Homebrew installs to `/opt/homebrew/`

---

## 2. Choose a package manager

### 2a. Homebrew (recommended)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 2b. MacPorts (alternative)

Download the installer from [macports.org](https://www.macports.org/install.php).

---

## 3. Install system dependencies

### 3a. Homebrew

```bash
brew install php@8.3 mysql@8.0 ffmpeg git curl
```

### 3b. MacPorts

```bash
sudo port install php83 php83-mysqlnd php83-gd mysql83 ffmpeg git curl
```

### Apple Silicon notes

Homebrew installs to `/opt/homebrew/` on Apple Silicon vs `/usr/local/` on Intel. Add to `~/.zshrc` or `~/.bash_profile`:

```bash
# Intel
export PATH="/usr/local/bin:$PATH"

# Apple Silicon
export PATH="/opt/homebrew/bin:$PATH"
export PATH="/opt/homebrew/sbin:$PATH"
```

MySQL socket: `/opt/homebrew/var/mysql/` (Apple Silicon Homebrew) vs `/usr/local/var/mysql/` (Intel Homebrew).

### 3c. Verify PHP-FPM

```bash
# Homebrew starts PHP-FPM automatically; manual control:
brew services start php@8.3
php-fpm -t  # test config
```

---

## 4. Database setup (MySQL)

```bash
# Start MySQL via Homebrew services
brew services start mysql@8.0

# Secure installation (first run)
mysql_secure_installation

# Create phlix database and user
mysql -u root -p -e "CREATE DATABASE phlix CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p -e "CREATE USER 'phlix'@'localhost' IDENTIFIED BY 'your_strong_password';"
mysql -u root -p -e "GRANT ALL PRIVILEGES ON phlix.* TO 'phlix'@'localhost';"
mysql -u root -p -e "FLUSH PRIVILEGES;"
```

---

## 5. Clone phlix-server

```bash
sudo mkdir -p /opt/phlix
sudo chown $USER /opt/phlix
git clone https://github.com/detain/phlix-server.git /opt/phlix
cd /opt/phlix
```

---

## 6. PHP dependencies (Composer)

```bash
composer install --no-dev --optimize-autoloader
```

---

## 7. Configure environment

```bash
cp .env.example .env
# Edit .env with:
#   APP_URL=http://your-mac-ip:32400
#   DB_HOST=localhost
#   DB_SOCKET=/opt/homebrew/var/mysql/mysql.sock   # Apple Silicon Homebrew
#   DB_SOCKET=/usr/local/var/mysql/mysql.sock     # Intel Homebrew
#   DB_DATABASE=phlix
#   DB_USERNAME=phlix
#   DB_PASSWORD=your_strong_password
```

---

## 8. Database migrations

```bash
php scripts/run-migrations.php
```

---

## 9. Start the server manually (first test)

```bash
php public/index.php
# or to run in background:
nohup php public/index.php > /opt/phlix/phlix.log 2>&1 &
```

---

## 10. Launchd plist for auto-start

Create `~/Library/LaunchAgents/com.phlix.media-server.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.phlix.media-server</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/php</string>
        <string>/opt/phlix/public/index.php</string>
        <string>start</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>/opt/phlix</string>
    <key>StandardOutPath</key>
    <string>/opt/phlix/phlix.log</string>
    <key>StandardErrorPath</key>
    <string>/opt/phlix/phlix.error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PHLIX_ENV</key>
        <string>production</string>
    </dict>
</dict>
</plist>
```

Install and load:

```bash
# Copy plist
cp ~/Library/LaunchAgents/com.phlix.media-server.plist ~/Library/LaunchAgents/

# Load (start immediately and on boot)
launchctl load ~/Library/LaunchAgents/com.phlix.media-server.plist

# Verify
launchctl list | grep phlix
```

::: tip Intel vs Apple Silicon
The plist above uses Apple Silicon paths (`/opt/homebrew/bin/php`). For Intel, change `/opt/homebrew/bin/php` to `/usr/local/bin/php` and adjust socket paths in the `.env`.
:::

---

## 11. macOS Firewall configuration

### Application Firewall UI (simplest)

1. System Settings → Privacy & Security → Firewall
2. Turn on Firewall
3. Click "Firewall Options..."
4. Add `/opt/phlix/public/index.php` (or allow PHP to accept incoming connections)

### pfctl CLI (advanced)

```bash
# Add to /etc/pf.anchors/com.phlix
# pass in proto tcp from any to any port 32400 keep state

# Reload pfctl
sudo pfctl -f /etc/pf.conf -E
```

> Note: macOS built-in firewall blocks incoming connections to port 32400 by default. For LAN-only access, add an exception via System Settings first. DLNA/UDP 1900 discovery is optional.

---

## 12. Verify the install

```bash
# Check server is running
curl -I http://localhost:32400
# Expected: HTTP 200 from the phlix index

# Check Launchd service
launchctl list | grep phlix
```

---

## What can go wrong

### Homebrew path conflicts

- **Symptom:** `php: command not found` or wrong PHP version after installation
- **Fix:** Verify PATH — Intel Macs use `/usr/local/bin` first; Apple Silicon uses `/opt/homebrew/bin`. Add to `~/.zshrc` explicitly
- **Verify:** `which php` and `php -v`

### MySQL socket in wrong location

- **Symptom:** `SQLSTATE[HY000] [2002] No such file or directory` connecting to MySQL
- **Cause:** Homebrew MySQL 8.x on Apple Silicon places socket at `/opt/homebrew/var/mysql/mysql.sock`; PHP may look in `/tmp/mysql.sock` or `/var/mysql/`
- **Fix:** Set `DB_SOCKET=/opt/homebrew/var/mysql/mysql.sock` in `.env` (Apple Silicon) or `DB_SOCKET=/usr/local/var/mysql/mysql.sock` (Intel)
- **Verify:** `ls -la /opt/homebrew/var/mysql/mysql.sock` (or the Intel equivalent)

### FFmpeg missing codecs

- **Symptom:** Some video files fail to transcode; error mentions "Unknown encoder" or "codec not supported"
- **Fix (Homebrew):** `brew install ffmpeg` installs a standard build; for full codec support use `brew install homebrew-ffmpeg/ffmpeg/homebrew-ffmpeg`
- **Fix (MacPorts):** `sudo port install ffmpeg +full`
- **Verify:** `ffmpeg -codecs | grep -c h264` (should be > 0)

### Port 32400 already in use

- **Symptom:** `bind(): Address already in use` or `Port 32400 in use`
- **Fix:** `sudo lsof -i :32400` to find the conflicting process (e.g., another web server or AirPlay receiver). Stop it or change phlix port via `APP_URL` env var
- **Verify after fix:** `curl -I http://localhost:32400`

---

## Next steps

- [First-run wizard](/first-run) — complete the browser-based setup at `http://your-mac-ip:32400`
- [Docker install](/install/docker) — alternative install using containers on macOS
- [Hardware transcoding](/advanced/hardware-transcoding) — configure VideoToolbox on Apple Silicon for better performance
