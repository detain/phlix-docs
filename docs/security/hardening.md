# Security Hardening Checklist

**Since:** 0.18.0

Checklist for hardening a production Phlix deployment. Work through items in order — earlier steps address higher-severity risks.

---

## 1. Change all default secrets

Every secret below has an insecure default that **must** be overridden before production use.

| Secret | Default | Required action |
|--------|---------|----------------|
| `DB_PASSWORD` | _(empty)_ | Set a strong password for the `phlix` MySQL user. Use `openssl rand -base64 24`. |
| `JWT_SECRET` | `default-secret-change-me` | Set a long random string. If leaked, attackers can forge tokens. |
| `PHLIX_SIGNED_URL_SECRET` | _derived from `JWT_SECRET`_ | Set explicitly to rotate stream tokens independently of JWTs. |
| `PHLIX_SECRET_KEY` | _(varies)_ | Set via the admin UI or env — used for internal cryptographic operations. |

See [/reference/env-vars](/reference/env-vars) and [/reference/config-files](/reference/config-files) for where these are documented and consumed.

---

## 2. Enable TLS

### Option A — Phlix Hub (simplest)

Let the Hub allocate a `*.phlix.media` subdomain and manage TLS automatically:

```bash
PHLIX_HUB_URL=https://hub.phlix.media
PHLIX_HUB_ENROLLMENT_TOKEN=<token-from-hub-ui>
PHLIX_SUBDOMAIN_AUTO_CLAIM=1
PHLIX_TLS_ENABLED=1
```

The Hub's tunnel (port 8802) carries all traffic over an encrypted WebSocket. See [/hub/remote-access](/hub/remote-access) and [/hub/self-host-the-hub](/hub/self-host-the-hub).

### Option B — Reverse proxy with your own certificate

Terminate TLS at a reverse proxy (Caddy, nginx, HAProxy). See [/advanced/reverse-proxy](/advanced/reverse-proxy) for a full guide.

Minimum TLS configuration (Caddy example):

```
phlix.example.com {
    reverse_proxy localhost:8096
    tls you@example.com
}
```

Do not expose port 8096 directly to the internet without a TLS terminator in front of it.

---

## 3. Restrict network exposure

- **Do not bind to `0.0.0.0`** on internet-facing servers. Prefer binding to `127.0.0.1` behind a reverse proxy, or use a firewall rule to restrict port 8096 to trusted IPs.
- **Disable unused services** — if you only use the Hub tunnel, disable the direct HTTP port entirely in `config/server.php`:

  ```php
  'server' => [
      'host' => '127.0.0.1',   // Only accept local connections
      'port' => 8096,
  ],
  ```

- **MySQL** — bind `mysqld` to `127.0.0.1` only, not `0.0.0.0`. The `phlix` MySQL user should be `@'127.0.0.1'`, not `@'%'`.

---

## 4. Set strong filesystem permissions

Phlix should run as a dedicated unprivileged system user (`phlix`), not as `root`.

```bash
# Create dedicated user (already done by install.sh)
sudo useradd --system --no-create-home --shell /usr/sbin/nologin phlix

# Secure data directories
sudo chown -R phlix:phlix /var/phlix /etc/phlix /var/log/phlix /var/run/phlix

# Only phlix user can read the env file (contains DB_PASSWORD)
sudo chmod 600 /etc/phlix/env

# Web server (nginx/Caddy) runs as www-data — grant read-only access to media only
sudo usermod -a -G phlix www-data   # If co-hosted on the same machine
```

---

## 5. Enable passkey authentication

Password-based authentication is vulnerable to credential stuffing and phishing. Passkeys (WebAuthn) are resistant to these attacks and are supported as a primary or secondary auth method.

See [/security/passkeys](/security/passkeys) for setup instructions.

---

## 6. Use signed media URLs

Phlix signs all streaming URLs with a time-limited HMAC. This prevents anyone who intercepts a stream URL from replaying it. The signing secret is derived from `JWT_SECRET` by default.

To rotate stream tokens independently of JWTs, set an explicit `PHLIX_SIGNED_URL_SECRET`:

```bash
PHLIX_SIGNED_URL_SECRET=$(openssl rand -hex 32)
```

See [/security/signed-media-urls](/security/signed-media-urls) for full details.

---

## 7. Keep the system patched

- **PHP** — subscribe to security advisories for your PHP version. Upgrade promptly when security patches are released.
- **FFmpeg** — use a recent build (the jellyfin-ffmpeg or ffmpeg-rockchip feeds track security fixes).
- **OS** — enable automatic security updates on Ubuntu/Debian (`unattended-upgrades`) or equivalent on your distro.
- **Phlix** — watch the GitHub releases page and upgrade promptly for security-related releases. See [/install/upgrade](/install/upgrade) for the update procedure.

---

## 8. Secure the admin panel

- **Do not expose the admin panel to the public internet.** Access it only over the local network or through the Hub tunnel.
- **Use a strong admin password** — minimum 12 characters, unique, stored in a password manager.
- **Limit admin sessions** — active sessions can be reviewed in **Admin → Server Settings → Sessions**. Revoke any that are unknown.
- **Consider IP allowlisting** — if your reverse proxy supports it, restrict the `/admin/` path to known IP ranges.

---

## 9. Backups

Configure regular encrypted backups. See [/advanced/backup-restore](/advanced/backup-restore) and the admin backup guide at [/admin/backup](/admin/backup).

Ensure backups include `/etc/phlix/env` (contains all secrets) and the database. Test restores regularly.

---

## 10. Monitor logs

Watch the AUTH log (`auth.log`) for failed login attempts:

```bash
tail -f .logs/auth.log | grep -i "failed\|invalid\|401"
```

Set up a log aggregation system or use `fail2ban` to auto-block IPs with repeated failed login attempts when using password auth (prefer passkeys — see step 5).

---

## Quick reference: hardening env vars

| Variable | Recommended value | Effect |
|----------|-------------------|--------|
| `DB_PASSWORD` | _(strong random string)_ | MySQL auth — must not be empty in production |
| `JWT_SECRET` | _(strong random string)_ | JWT signing key — must not be `default-secret-change-me` |
| `PHLIX_SIGNED_URL_SECRET` | _(strong random string)_ | Stream URL signing — set explicitly for key rotation |
| `PHLIX_TLS_ENABLED` | `1` | Enforces TLS on the Hub tunnel |
| `PHLIX_PLUGINS_REQUIRE_SIGNATURE` | `1` | Refuses unsigned plugins in the catalog |
| `PHLIX_PLUGINS_ALLOW_HTTP` | `0` | Disallows plugin installation from `http://` URLs |
