# Install phlix-server on Windows

## TL;DR

phlix-server is a PHP 8.3+ media server with HLS streaming, WebSocket real-time sync, DLNA, and a Smarty web portal. This guide installs it on Windows 10 21H2+ or Windows 11 in roughly 20 minutes.

**Minimum requirements:** Windows 10 21H2+ or Windows 11, 2 CPU / 4 GB RAM.

**Quick one-liner (XAMPP):** Download XAMPP → `git clone` → `composer install` → start Apache → open `http://localhost:32400`

**Recommendation:** Use **WSL2 + Ubuntu** for production. Use **XAMPP** for quick dev / non-Docker users.

::: tip Screenshots TBD
This guide is text-first. Screenshots will be added in a follow-up.
:::

---

## 1. Choose your installation path

### Option 1: XAMPP (for dev / non-Docker users)

- Full stack: Apache + PHP + MariaDB bundled together
- Easiest for users who don't want to touch WSL or containers
- Download from [apachefriends.org](https://www.apachefriends.org/)

### Option 2: WSL2 + Ubuntu (recommended for production)

- Runs a real Ubuntu VM inside Windows
- Native Linux experience: composer, apt, systemd scripts all work
- Requires: Windows 10 21H2+ or Windows 11 with WSL2 enabled
- See §3 for WSL2 setup steps

### Option 3: IIS reverse-proxy to Workerman PHP

- For enterprise environments that already run IIS
- Requires URL Rewrite module + ARR (Application Request Routing)
- Advanced; less common

---

## 2. Option 1 — XAMPP install

### 2a. Download and install XAMPP

1. Download XAMPP PHP 8.3 from [apachefriends.org](https://www.apachefriends.org/download.html)
2. Run the installer — deselect unnecessary components (e.g., Tomcat)
3. Install to default `C:\xampp`
4. Start the XAMPP Control Panel

### 2b. Enable required PHP extensions

Edit `C:\xampp\php\php.ini` and ensure these lines are uncommented (no `;`):

```ini
extension=curl
extension=gd
extension=mbstring
extension=mysql
extension=openssl
extension=zip
extension=xml
extension=bcmath
```

Save and restart Apache from the XAMPP Control Panel.

### 2c. Verify PHP version

```cmd
C:\xampp\php\php.exe -v
```

Expected: `PHP 8.3.x`

### 2d. Clone phlix-server

```cmd
git clone https://github.com/detain/phlix-server.git C:\phlix
cd C:\phlix
```

### 2e. PHP dependencies (Composer)

```cmd
C:\xampp\composer\composer.bat install --no-dev --optimize-autoloader
```

Or if Composer is installed globally:

```cmd
composer install --no-dev --optimize-autoloader
```

### 2f. Configure environment

```cmd
copy .env.example .env
```

Edit `.env`:

```env
APP_URL=http://localhost:32400
DB_HOST=localhost
DB_DATABASE=phlix
DB_USERNAME=phlix
DB_PASSWORD=your_strong_password
```

### 2g. Database setup (MariaDB via XAMPP)

Open phpMyAdmin at `http://localhost/phpmyadmin` or run:

```cmd
C:\xampp\mysql\bin\mysql.exe -u root -p
```

```sql
CREATE DATABASE phlix CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'phlix'@'localhost' IDENTIFIED BY 'your_strong_password';
GRANT ALL PRIVILEGES ON phlix.* TO 'phlix'@'localhost';
FLUSH PRIVILEGES;
```

### 2h. Run migrations

```cmd
php scripts/run-migrations.php
```

### 2i. Start the server

```cmd
php public\index.php
```

### 2j. Firewall configuration

```powershell
New-NetFirewallRule -DisplayName "Phlix HTTP" -Direction Inbound -Protocol TCP -LocalPort 32400 -Action Allow
```

Or via Windows Defender Firewall UI: Inbound Rule → New Rule → Port → 32400 → Allow.

---

## 3. Option 2 — WSL2 + Ubuntu (recommended)

### 3a. Enable WSL2

Open PowerShell as Administrator:

```powershell
wsl --install --no-distribution
```

Restart the computer when prompted.

### 3b. Install Ubuntu

```powershell
wsl --install -d Ubuntu-24.04
```

Create a user account when prompted.

### 3c. Update Ubuntu

```bash
sudo apt update && sudo apt upgrade -y
```

### 3d. Install PHP 8.3

Ubuntu 24.04 ships PHP 8.3 by default, so install straight from the distro repos:

```bash
sudo apt install -y php-fpm php-mysql php-curl php-gd php-zip php-xml php-mbstring php-bcmath
php -v   # confirm PHP 8.3 or newer
```

If `php -v` reports something older than 8.3, you're on an older Ubuntu release — upgrade to 24.04 (or newer) rather than pulling PHP from a third-party PPA.

### 3e. Install MariaDB

```bash
sudo apt install -y mariadb-server
sudo mysql_secure_installation
```

### 3f. Install FFmpeg

```bash
sudo apt install -y ffmpeg
```

### 3g. Install Composer

```bash
curl -sS https://getcomposer.org/installer | php
sudo mv composer.phar /usr/local/bin/composer
```

### 3h. Clone phlix-server

```bash
sudo mkdir -p /opt/phlix
sudo chown $USER:$USER /opt/phlix
git clone https://github.com/detain/phlix-server.git /opt/phlix
cd /opt/phlix
```

### 3i. PHP dependencies

```bash
composer install --no-dev --optimize-autoloader
```

### 3j. Configure environment

```bash
cp .env.example .env
nano .env
```

Set:

```env
APP_URL=http://localhost:32400
DB_HOST=localhost
DB_DATABASE=phlix
DB_USERNAME=phlix
DB_PASSWORD=your_strong_password
```

### 3k. Database setup (MariaDB)

```bash
sudo mysql -u root -p
```

```sql
CREATE DATABASE phlix CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'phlix'@'localhost' IDENTIFIED BY 'your_strong_password';
GRANT ALL PRIVILEGES ON phlix.* TO 'phlix'@'localhost';
FLUSH PRIVILEGES;
```

### 3l. Run migrations

```bash
php scripts/run-migrations.php
```

### 3m. Start the server

```bash
php /opt/phlix/public/index.php
```

### 3n. Firewall configuration (from PowerShell on Windows host)

```powershell
New-NetFirewallRule -DisplayName "Phlix HTTP" -Direction Inbound -Protocol TCP -LocalPort 32400 -Action Allow
```

### 3o. Access from Windows browser

Open `http://localhost:32400` in your Windows browser.

---

## 4. Option 3 — IIS reverse-proxy (advanced)

### 4a. Install URL Rewrite and ARR

Download and install URL Rewrite 2.1 from [iis.net](https://www.iis.net/downloads/microsoft/url-rewrite). Enable ARR (Application Request Routing) via IIS Manager → Server Farm.

### 4b. Create a site binding

IIS Manager → Sites → Add Website:

- Site name: `phlix`
- Physical path: `C:\phlix\public`
- Binding: Host: `phlix.local`, Port: `80`

### 4c. Configure reverse-proxy

In `C:\phlix\public\web.config`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="ProxyToWorkerman" enabled="true" stopProcessing="true">
          <match url="(.*)" />
          <conditions>
            <add input="{CACHE_URL}" pattern="^(https?)://" />
          </conditions>
          <action type="Rewrite" url="http://127.0.0.1:32400/{R:1}" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
```

### 4d. Start Workerman

```cmd
php C:\phlix\public\index.php
```

---

## 5. Verify the install

Open your browser:

```
http://localhost:32400
```

Expected: phlix-server index page loads (HTTP 200).

---

## What can go wrong

### WSL2 not enabled or wrong version

- **Symptom:** `wsl --install` fails, or `wsl -l -v` shows Ubuntu with version 1
- **Fix:** Enable Hyper-V and WSL2 via Windows Features, or run `wsl --set-version Ubuntu-24.04 2` to migrate
- **Verify:** `wsl -l -v` should show Ubuntu-24.04 with version 2

### Hyper-V conflicts preventing WSL2

- **Symptom:** WSL2 fails to start, or Ubuntu stuck at "Installing"
- **Fix:** Ensure Windows is fully updated (21H2 or later); disable conflicting virtualization software (e.g., older VirtualBox)
- **Verify:** `systeminfo | findstr /C:"Hyper-V"` should show Hyper-V present

### PHP version mismatch

- **Symptom:** `composer install` fails with version errors, or runtime errors about missing PHP 8.3 features
- **Fix (XAMPP):** Download PHP 8.3 version from apachefriends.org; uninstall old version first
- **Fix (WSL2):** `php -v` should show 8.3; if not, upgrade Ubuntu to 24.04 (or newer), whose default PHP is 8.3
- **Verify:** `php -v` shows `PHP 8.3.x`

### Missing Visual C++ Runtime

- **Symptom:** `php.exe` fails to start with "VCRUNTIME140.dll not found"
- **Fix:** Download and install Visual C++ Redistributable 2015-2022 from [Microsoft](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist)
- **Verify:** `php -v` runs without error

### Path separator issues (Windows vs Unix)

- **Symptom:** "File not found" errors, broken requires/includes
- **Fix:** Ensure all paths in `.env` use Windows-style separators or that the app handles `DIRECTORY_SEPARATOR` correctly; avoid hardcoded `/` in file paths
- **Verify:** Set `git config --global core.autocrlf true` to handle line endings

### Port 32400 already in use

- **Symptom:** `bind(): Address already in use`
- **Fix:** `netstat -ano | findstr :32400` to find the conflicting process; stop it or change phlix port via `APP_URL` env var

### XAMPP Apache won't start (port 80/443 conflict)

- **Symptom:** Apache shows "Error: Apache shutdown unexpectedly"
- **Fix:** Check Skype, IIS, or another web server on ports 80/443; change XAMPP Apache ports in `C:\xampp\apache\conf\httpd.conf` (Listen 8080, 4433) and update virtual host config

---

## Next steps

- [First-run wizard](/first-run) — complete the browser-based setup at `http://your-server:32400`
- [Docker install](/install/docker) — alternative install method using containers
- [Hardware transcoding](/advanced/hardware-transcoding) — configure NVENC/VAAPI for better performance (WSL2+Ubuntu only)
- [Linux install](/install/linux) — for mixed Windows/Linux environments
