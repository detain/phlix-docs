# Privacy & Security

**Since:** 0.18.0

## TL;DR

Phlix is privacy-first. No telemetry, no analytics, no third-party data sharing by default. Media stays on your hardware. The Hub relay is **not** end-to-end encrypted — the Hub terminates your traffic and proxies it, so it can see what it relays. And by default the server↔Hub relay tunnel is **not even encrypted on the wire** (plain `ws://` until you enable relay TLS on both ends — see [Hardening §2](/security/hardening)). The guide below explains exactly what is and is not collected, what the Hub can and cannot see, and how to harden your deployment. New to the terms? [Glossary: Relay / Tunnel / Bearer](/glossary).

```bash
# Verify no unexpected external network calls (drop all egress except DNS/80/443)
# Example iptables rules (run on host):
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 80 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 443 -j ACCEPT
iptables -A OUTPUT -j DROP
```

## What Is Collected (Local Only)

### Watch history per profile (local DB)

- Stored in `playback_state` / `watch_history` tables in the local MySQL database.
- Tied to the user profile; not associated with any external identity.
- Never leaves the server unless you export it, configure an off-site backup destination, or connect an opt-in scrobbling integration (Trakt, Last.fm).

### Server logs (local file)

- Written to `.logs/` directory on the local filesystem.
- Rotated via Monolog's rotating file handler (30 files retained by default).
- Not sent to any external log aggregator by default.

### What is NOT collected

- No viewing habits sent to any third party unless you connect one yourself. The opt-in Trakt and Last.fm integrations scrobble playback to those services; both need an operator to configure them and a user to authorise them, and neither sends anything until then.
- No device IDs shared externally.
- No media filenames transmitted anywhere.
- No analytics, crash reports, or usage telemetry.

## Hub Data Visibility

### Hub sees

- **User email** — used for account identity and server claim status.
- **Server claim status** — whether the server is claimed or unclaimed.
- **Server version string** — for compatibility checks during pairing.
- **Relay session metadata** — WebSocket frame timing, connection duration, session token.
- **Everything that crosses the relay.** When remote access goes through the Hub, the Hub proxies your HTTP requests and responses *in cleartext inside the tunnel*: request paths, headers (including your session token), JSON library listings, and the media bytes themselves.

### Hub does NOT see — when the relay is not in use

When clients reach the server directly — LAN, VPN, Cloudflare Tunnel, or your own reverse proxy — the Hub is involved only in claim, heartbeat and subdomain calls, and never sees:

- Media filenames or folder structure.
- Playback history or watch history.
- Media content or stream content.
- Library metadata (genres, descriptions, actors).
- Any content of the local database.

When traffic **is** relayed through the Hub, all of the above passes through the Hub process in cleartext. If that trust boundary matters to you, use a [direct remote-access option](advanced/remote-access-without-hub.md) or self-host the Hub.

### Hub relay encryption

- **By default, neither leg of a Hub-relayed session is tunneled over TLS to your server:** the server↔Hub relay tunnel is a plain `ws://` connection, and the Hub's relay listener (`:8802`) serves plaintext unless `HUB_RELAY_TLS=true` (+ cert/key) is configured. Only the client↔Hub *HTTPS* front is encrypted out of the box.
- When you enable relay TLS on **both** ends (`HUB_RELAY_TLS=true` on the Hub, `PHLIX_RELAY_TLS=1` on the server), the tunnel and the client↔Hub connection are each encrypted **on the wire**; `PHLIX_RELAY_REQUIRE_TLS=1` makes the server refuse any plaintext tunnel outright. See [Hardening §2](/security/hardening).
- Either way, the Hub **terminates** both connections, so relayed traffic exists in cleartext inside the Hub process. There is no application-layer encryption between client and server today — `phlix-hub/src/Relay/` performs no encryption or decryption of its own, and the proxy decodes each request and response body to forward it.
- The Hub therefore sees connection metadata (IP address, timing) **plus** the proxied request and response content described above.

## How the Web App Stores Tokens

Phlix's API authenticates with **Bearer JWTs** — the token rides in an `Authorization: Bearer` header ([what's a bearer token?](/glossary)). The web SPA persists its access token in browser `localStorage` and sends it as a header on every API call.

Be aware of the trade-off this makes:

- **localStorage is readable by any script on the page.** A cross-site scripting (XSS) flaw in any loaded code — including third-party artwork or embeds — could exfiltrate the token. This is the known cost of header-based bearer auth in browsers.
- **Why bearer instead of cookies-only:** the identical scheme serves every client in the estate — TVs, phones, consoles and CLI tools have no cookie jar — and a header the browser cannot auto-attach is inherently resistant to CSRF.
- **Browser sessions are not localStorage-only:** the server's browser login flow additionally sets `HttpOnly` + `Secure` + `SameSite=Lax` session and refresh cookies (unreadable to scripts), so XSS exposure of the stored token is one credential among several, and `PHLIX_COOKIE_INSECURE` exists only as a local-dev opt-out.
- Revocation levers: the per-user `tokens_not_valid_after` watermark kills a user's issued JWTs (automatic on password change), and rotating `JWT_SECRET` invalidates every token server-wide — see [Hardening §1](/security/hardening).

## Security Hardening Checklist

### 1. Change JWT_SECRET immediately

Phlix ships with a default `JWT_SECRET` value (`default-secret-change-me`). Anyone who knows the default can forge valid JWTs and access the server.

```bash
# Generate a cryptographically secure secret
openssl rand -hex 32

# Add to systemd unit or environment file:
Environment=JWT_SECRET=$(openssl rand -hex 32)
```

### 2. Use TLS (reverse proxy with a valid cert)

HTTP port 8096 transmits credentials in clear text when not behind TLS.

```bash
# Example Caddyfile
phlix.example.com {
  reverse_proxy localhost:8096
  tls admin@example.com
}
```

Or with nginx and Let's Encrypt:

```bash
# Obtain a certificate
sudo certbot --nginx -d phlix.example.com

# nginx.conf snippet
server {
    listen 443 ssl;
    server_name phlix.example.com;
    ssl_certificate /etc/letsencrypt/live/phlix.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/phlix.example.com/privkey.pem;
    location / {
        proxy_pass http://127.0.0.1:8096;
    }
}
```

### 3. Firewall — only expose what is needed

Default: expose 8096 (HTTP API) + 1900 (DLNA, optional). Block everything else from ingress.

```bash
# Allow only HTTP and optional DLNA
ufw allow 8096/tcp comment "Phlix HTTP API"
ufw allow 1900/udp comment "DLNA discovery (optional)"
ufw enable
```

### 4. Disable DLNA if not used

DLNA discovery broadcasts on port 1900/UDP to the local network. If no DLNA/play-to clients are used, disable it to reduce attack surface:

```php
// In config/dlna.php:
'enabled'     => false,  // SSDP advertiser on 1900/UDP — on by default
'cds_enabled' => false,  // ContentDirectory browse + /dlna/stream — already off by default
```

### 5. Strong admin password

- Passwords are hashed with Argon2ID at PHP's built-in defaults (64 MiB memory, 4 iterations, 1 thread) — the server passes no cost overrides to `password_hash()`.
- Minimum recommended: 12+ characters, mixed case, digits, symbols.
- Never reuse your Hub account password for the server admin account.

### 6. Hub claim uses cryptographic validation

The server validates Hub JWTs using the Hub's JWKS endpoint — no shared secret is required. The Hub cannot impersonate a server, and servers cannot impersonate each other via the Hub. Verify the JWKS URL in `config/hub.php`:

```php
'hub_jwks_url' => getenv('PHLIX_HUB_JWKS_URL') ?: null,
```

## Remote Access Privacy

### VPN / tunnel remote access

Phlix ships no VPN of its own; the documented no-port-forward options are **Cloudflare Tunnel, WireGuard, or Tailscale** (see [Remote access without a hub](/advanced/remote-access-without-hub)):

- Traffic stays off the public internet when using a WireGuard/Tailscale VPN or a Cloudflare Tunnel.
- Hub-relay mode needs no port forwarding — the connection is outbound from the server to the relay.
- A VPN encrypts traffic to your VPN endpoint; a Cloudflare Tunnel encrypts client↔edge. Neither is end-to-end to the Phlix server. Same caution as the Hub relay: whoever terminates the tunnel sees the proxied requests.

### Cloud transcoding

- Disabled by default — all transcoding is local to the server hardware.
- No media is sent to a cloud service for transcoding or analysis.

### Media files

- Always remain on the user's own hardware.
- No media is uploaded to any external service.

## What Can Go Wrong

### 1. JWT_SECRET left at default in production

**Symptom:** Unauthorized users can create valid JWT tokens and access all API endpoints, including admin functions.

**Cause:** Production deployment left the default `JWT_SECRET` value unchanged.

**Fix:** Immediately set a strong random secret. Restart the server to invalidate all existing sessions. Enable audit logging to identify any unauthorized access that may have occurred.

---

### 2. Port 8096 exposed without TLS

**Symptom:** Login credentials, session tokens, and media streaming data are visible in clear text on the network.

**Cause:** No TLS-terminating reverse proxy in front of port 8096; direct HTTP access allowed.

**Fix:** Configure a TLS-terminating reverse proxy (nginx, Caddy, or Traefik). Force all clients to use HTTPS. Revoke affected sessions and force re-authentication.

---

### 3. Hub account password reused on server

**Symptom:** Attacker uses Hub credentials to access the server admin panel, or uses server credentials to access the Hub.

**Cause:** Password reuse between Hub account and server admin account; no MFA on the Hub account.

**Fix:** Use different passwords for Hub account and server admin account. Enable MFA on the Hub account. Audit recent sessions in the server audit log.

---

### 4. Port 1900 (DLNA) open without network isolation

**Symptom:** DLNA clients on the local network can discover and request media from the server without authentication.

**Cause:** Port 1900/UDP open to the local network without authentication; no network segmentation.

**Fix:** Disable DLNA if unused (`'dlna' => ['enabled' => false]` in `config/server.php`). If needed, restrict to a dedicated VLAN with firewall rules that only allow known DLNA clients.

---

### 5. No egress filtering (unintended outbound connections)

**Symptom:** Server makes outbound connections to unknown external IPs (e.g., metadata providers, update checkers).

**Cause:** Egress not restricted; metadata auto-refresh or update checker making external calls.

**Fix:** Apply strict egress rules (only DNS/80/443 outbound). Disable metadata auto-refresh if privacy-sensitive. Verify with:

```bash
tcpdump -i eth0 -n 'ip and tcp' -A | grep -v 'your-known-domain'
```

Or use iptables to log dropped egress:

```bash
iptables -A OUTPUT -m limit --limit 5/min -j LOG --log-prefix "EGRESS BLOCKED: "
```

> **Note — browser-side TMDB image fetches.** Separate from server egress, the web app's
> Content-Security-Policy (`img-src`) allowlists the TMDB image CDN hosts `image.tmdb.org` and
> `tmdb.org`. When poster/backdrop/cast artwork has not yet been cached on your own origin, the
> **browser** loads it directly from TMDB — a client-side external connection to TMDB, not from the
> Phlix server. This is a stopgap: once local image caching proxies all remote artwork through your
> own origin, these hosts will be removed from the policy and no browser-side TMDB call is made.

## Next Steps

- [First-run setup](first-run.md) — initial server configuration and TLS setup.
- [Hub claim and setup](hub/claim-server.md) — understanding what the Hub can and cannot do.
- [Remote access without Hub](advanced/remote-access-without-hub.md) — Cloudflare Tunnel, WireGuard, and Tailscale options.
- [Troubleshooting](troubleshooting.md) — diagnose connection and access issues.
