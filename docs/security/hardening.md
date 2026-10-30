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
| `PHLIX_SECRET_KEY` | _unset_ | **Docker-only alias.** The container entrypoint copies it into `JWT_SECRET`; the PHP code never reads this name — on systemd/bare-metal set `JWT_SECRET` directly (see `install/linux.md` §7). |

See [/reference/env-vars](/reference/env-vars) and [/reference/config-files](/reference/config-files) for where these are documented and consumed.

### Rotating JWT secrets

Rotating `JWT_SECRET` (server) or `HUB_JWT_SECRET` (hub, ≥ 32 bytes) **invalidates every token issued under the old secret** — signature verification fails, so all clients must re-authenticate. That is the desired effect after a suspected leak, and the cost to plan for on a routine rotation.

Two further mechanics worth knowing:

- **Per-user kill switch without rotating the secret:** the server carries a `users.tokens_not_valid_after` watermark — every JWT issued at or before that timestamp is rejected for that user. The server bumps it automatically on password change; it is the per-user equivalent of a secret rotation and does not disturb anyone else's sessions.
- **Restart to apply a rotated secret:** both secrets are read from the environment at config load, and resident Workerman workers keep the pre-fork value. Set the new secret in the environment file and **restart the service** — a running server will keep signing and verifying with the old secret until it does.

### Admin lock-out guards (auth-method policy)

The server refuses admin setting changes that would lock you out (`src/Auth/AuthMethodPolicy.php`, enforced by the admin settings API):

- **All methods off is rejected:** turning off *all five* auth methods (password, WebAuthn/passkeys, OIDC, LDAP, GitHub) in one update returns `422` with a machine-readable `reason` — at least one method must stay enabled.
- **Last usable factor is protected:** an update that would leave an *active* admin with no usable auth factor is likewise rejected with `422`.
- **Break-glass fallback:** if all methods are ever found disabled (e.g. a raw-SQL edit that bypassed the API), the login path applies a documented password-only fallback and records an `auth.methods_all_disabled_fallback` audit event; the fallback is applied, never persisted.

---

## 2. Enable TLS

### Option A — Phlix Hub (simplest)

Let the Hub allocate a `*.phlix.media` subdomain and manage TLS for the **public hostname** automatically:

```bash
PHLIX_HUB_URL=https://hub.phlix.media
PHLIX_HUB_ENROLLMENT_TOKEN=<token-from-hub-ui>
PHLIX_SUBDOMAIN_AUTO_CLAIM=1
```

This secures the **client ↔ Hub** leg with HTTPS. It does **not** by itself encrypt the **server ↔ Hub relay tunnel** (port 8802 — see [Glossary: Relay / Tunnel](/glossary)): by default that tunnel is a plain `ws://` connection. `PHLIX_TLS_ENABLED` controls only the scheme of the server's advertised `public_url` (`https://` vs `http://` + `PHLIX_DOMAIN`) during pairing — it defaults to true when unset and has no effect on the tunnel.

To put TLS on the tunnel you must enable it on **both ends**:

| # | End | Setting |
|---|-----|---------|
| 1 | Hub (listener) | `HUB_RELAY_TLS=true` **and** `HUB_RELAY_TLS_CERT` + `HUB_RELAY_TLS_KEY` — the relay worker errors out at boot if TLS is on without a cert/key pair |
| 2 | Server (dialer) | `PHLIX_RELAY_TLS=1` — dials the tunnel as `wss://` (or set the `hub_relay_ws_url` key in `config/relay.php` to an explicit `wss://` URL, which overrides the derived scheme). Certificate verification is on by default (`PHLIX_RELAY_TLS_VERIFY`, CA bundle via `PHLIX_RELAY_TLS_CAFILE`) |
| 3 | Server (policy, optional) | `PHLIX_RELAY_REQUIRE_TLS=1` — the server **refuses** any tunnel dial that resolves to plaintext `ws://`, before the socket opens. This beats a Hub `allow_plaintext` ACK: the refusal is enforced server-side, so a misconfigured or compromised Hub setting cannot re-open the cleartext path |

Why step 3 matters: the relay tunnel honors the `X-Phlix-Relay-User` identity header the Hub attaches, so anyone able to position themselves on a plaintext `ws://` tunnel could impersonate users to the server. With `PHLIX_RELAY_REQUIRE_TLS=1` set, a plaintext dial is rejected and audited (`connect` error logged, reconnect scheduled) instead of silently carrying tokens in the clear. With the default (off), the server logs a warning on a plaintext tunnel but still connects.

See [/hub/remote-access](/hub/remote-access) and [/hub/self-host-the-hub](/hub/self-host-the-hub).

### Option B — Reverse proxy with your own certificate

Terminate TLS at a reverse proxy (Caddy, nginx, HAProxy). See [/advanced/reverse-proxy](/advanced/reverse-proxy) for a full guide.

Minimum TLS configuration (Caddy example):

```caddy
phlix.example.com {
    reverse_proxy localhost:8096
    tls you@example.com
}
```

Do not expose port 8096 directly to the internet without a TLS terminator in front of it.

### HSTS (HTTP Strict Transport Security)

The server ships HSTS **on by default**: every response it generates carries

```http
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

(one year, subdomains included) — `Phlix\Server\Http\Middleware\SecurityHeaders`.
Browsers ignore the header over plaintext HTTP, so it only takes effect once
you serve HTTPS, but plan for it: a wrong subdomain that never gets a
certificate will be pinned away from by visitors' browsers.

The knob is the server setting `security.hsts_max_age_seconds` — an integer
`0..31536000` (Admin → Settings; the key is part of the shared settings
schema, see [Shared schemas](/dev/shared-schemas)). Set it to **`0`** to emit
`max-age=0`, the standard *clear-the-pin* signal: use it when decommissioning
HTTPS or before rolling back a TLS change, not as a permanent posture.

Behind a reverse proxy, leave the header to the app: proxies forward response
headers untouched, so adding `add_header Strict-Transport-Security ...` in
nginx on top of the app's copy produces duplicate headers, which browsers may
treat as invalid. If your proxy must own HSTS instead, set the app key to `0`.

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
- **Autofill is suppressed on admin secret fields.** Every credential input in the admin UI (API keys, tokens, client secrets, HMAC signing secrets, LDAP bind passwords, PINs) opts out of browser and password-manager autofill (`autocomplete="new-password"` plus LastPass/1Password/Bitwarden ignore hints), so a stored-credential autofill offer cannot silently overwrite a saved key the next time you open a settings form. User-facing login and sign-up fields are left autofillable, so you can still store your own admin login in a password manager.

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

## 11. Auth rate limiting (built-in)

Phlix rate-limits its abuse-prone auth surfaces out of the box (SV-4.15) — this is defence-in-depth on top of any `fail2ban` you add in step 10. The `register`, `refresh`, WebAuthn login `start`/`finish`, public JWKS, and WS-connect (`:8097`) surfaces each have their own limiter (`login` keeps its long-standing DB-backed IP limiter).

- **Over-limit HTTP responses:** `429 Too Many Requests` + a `Retry-After` header, body `{"error":"Too Many Requests","code":"rate_limited"}`. WS-connect rejects the handshake.
- **Tune per surface** with `RATE_LIMIT_<SURFACE>_MAX` / `RATE_LIMIT_<SURFACE>_WINDOW` — see [/reference/env-vars](/reference/env-vars#auth-rate-limiting-sv-4-15).
- **Behind a reverse proxy, set `TRUSTED_PROXIES`.** IP-keyed limits derive the client IP from `X-Forwarded-For`/`X-Real-IP`. If your non-loopback nginx/HAProxy hops are **not** listed in `TRUSTED_PROXIES`, every request buckets under the proxy address (so one abuser can lock out everyone, or spoof the header to dodge the limit). The stock loopback-fronted install needs no change; a custom proxy topology **must** list its hops. See [/advanced/reverse-proxy](/advanced/reverse-proxy).
- **Apply migration `085_rate_limit_buckets.sql`** on deploy — it backs the shared, cross-worker limiter for the credential-enumeration surfaces.

The Hub runs the same per-surface framework; see [Hub relay tuning → Rate limiting](/hub-admin/relay-tuning#rate-limiting) for the shared design rationale.

---

## 12. Understand what plugin signatures do (and don't) do

Phlix plugin "signatures" today are **`sha256:<hex>` digest strings over the `plugin.json` manifest bytes** — a content-integrity check, not asymmetric cryptography:

- **What is verified:** on load, the server hashes the plugin's on-disk `plugin.json` and compares it to the recorded digest. A tampered manifest **always** fails verification, regardless of any settings.
- **What is NOT covered:** the digest pins only the manifest, not the plugin's whole code tree, and it carries **no publisher identity** — the digest is catalog metadata, so it proves the manifest matches what was cataloged, not *who* built the plugin.
- **Default posture is permissive:** unsigned plugins load with a warning. Set `PHLIX_PLUGINS_REQUIRE_SIGNATURE=1` to refuse them; with an allowlist configured (`PHLIX_PLUGINS_TRUSTED_SIGNATURES` comma-separated, or `PHLIX_PLUGINS_TRUSTED_SIGNATURES_FILE` pointing at a JSON array) and `REQUIRE_SIGNATURE=1`, only listed digests load — an empty allowlist plus `REQUIRE_SIGNATURE=1` rejects **all** signed plugins (explicit trusted-only opt-in).
- **Transport:** installs from `http://` URLs are refused unless you deliberately set `PHLIX_PLUGINS_ALLOW_HTTP=1`. Keep it unset in production.

---

## Quick reference: hardening env vars

| Variable | Recommended value | Effect |
|----------|-------------------|--------|
| `DB_PASSWORD` | _(strong random string)_ | MySQL auth — must not be empty in production |
| `JWT_SECRET` | _(strong random string)_ | JWT signing key — must not be `default-secret-change-me` |
| `PHLIX_SIGNED_URL_SECRET` | _(strong random string)_ | Stream URL signing — set explicitly for key rotation |
| `PHLIX_TLS_ENABLED` | `1` (default when unset) | Scheme of the advertised `public_url` (`https://` + domain) during pairing — **not** relay-tunnel TLS; see §2 |
| `PHLIX_RELAY_TLS` | `1` | Dials the server↔Hub relay tunnel as `wss://` — requires `HUB_RELAY_TLS=true` + cert/key on the Hub (§2) |
| `PHLIX_RELAY_REQUIRE_TLS` | `1` | Server-side policy: refuse any plaintext `ws://` tunnel dial, enforced even against a Hub `allow_plaintext` ACK (§2) |
| `PHLIX_PLUGINS_REQUIRE_SIGNATURE` | `1` | Refuses unsigned plugins at load |
| `PHLIX_PLUGINS_ALLOW_HTTP` | `0` (leave unset) | Disallows plugin installation from `http://` URLs |
| `TRUSTED_PROXIES` | _(your proxy hops)_ | Comma-separated IP/CIDR of reverse-proxy hops — required for correct rate-limit client-IP keying behind a non-loopback proxy (default is loopback only) |
| `RATE_LIMIT_<SURFACE>_MAX` / `_WINDOW` | per-surface | Tighten the built-in auth rate limits (`REGISTER`, `REFRESH`, `WEBAUTHN_START`, `WEBAUTHN_FINISH`, `JWKS`, `WS_CONNECT`) |
