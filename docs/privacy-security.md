# Privacy & Security

**Since:** 0.18.0

## TL;DR

Phlix is privacy-first. No telemetry, no analytics, no third-party data sharing. Media stays on your hardware. Hub relay is end-to-end encrypted. The guide below explains exactly what is and is not collected, what the Hub can and cannot see, and how to harden your deployment.

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
- Never leaves the server unless the user explicitly exports it.

### Server logs (local file)

- Written to `.logs/` directory on the local filesystem.
- Rotated via Monolog's rotating file handler (30 files retained by default).
- Not sent to any external log aggregator by default.

### What is NOT collected

- No viewing habits sent to any third party.
- No device IDs shared externally.
- No media filenames transmitted anywhere.
- No analytics, crash reports, or usage telemetry.

## Hub Data Visibility

### Hub sees

- **User email** — used for account identity and server claim status.
- **Server claim status** — whether the server is claimed or unclaimed.
- **Server version string** — for compatibility checks during pairing.
- **Relay session metadata** — WebSocket frame timing, connection duration, session token. The Hub does **not** see media content or filenames.

### Hub does NOT see

- Media filenames or folder structure.
- Playback history or watch history.
- Media content or stream content.
- Library metadata (genres, descriptions, actors).
- Any content of the local database.

### Hub relay encryption

- WebSocket frames between server and Hub are end-to-end encrypted.
- The Hub terminates the TLS connection and acts as a relay — it cannot decrypt the WebSocket payload.
- The Hub only sees encrypted binary frames and connection metadata (IP address, timing).

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

HTTP port 32400 transmits credentials in clear text when not behind TLS.

```bash
# Example Caddyfile
phlix.example.com {
  reverse_proxy localhost:32400
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
        proxy_pass http://127.0.0.1:32400;
    }
}
```

### 3. Firewall — only expose what is needed

Default: expose 32400 (HTTP API) + 1900 (DLNA, optional). Block everything else from ingress.

```bash
# Allow only HTTP and optional DLNA
ufw allow 32400/tcp comment "Phlix HTTP API"
ufw allow 1900/udp comment "DLNA discovery (optional)"
ufw enable
```

### 4. Disable DLNA if not used

DLNA discovery broadcasts on port 1900/UDP to the local network. If no DLNA/play-to clients are used, disable it to reduce attack surface:

```php
// In config/server.php:
'dlna' => ['enabled' => false],
```

### 5. Strong admin password

- Passwords are hashed with Argon2ID (12 MiB memory, 3 iterations, 4 parallelism).
- Minimum recommended: 12+ characters, mixed case, digits, symbols.
- Never reuse your Hub account password for the server admin account.

### 6. Hub claim uses cryptographic validation

The server validates Hub JWTs using the Hub's JWKS endpoint — no shared secret is required. The Hub cannot impersonate a server, and servers cannot impersonate each other via the Hub. Verify the JWKS URL in `config/hub.php`:

```php
'hub_jwks_url' => getenv('PHLIX_HUB_JWKS_URL') ?: null,
```

## Remote Access Privacy

### VPN / blockchain remote access

- Traffic stays off the public internet when using VPN or blockchain-based remote access.
- No port forwarding required — the connection is outbound from the server to the relay.
- Content is encrypted end-to-end; the relay sees only encrypted tunnel metadata.

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

### 2. Port 32400 exposed without TLS

**Symptom:** Login credentials, session tokens, and media streaming data are visible in clear text on the network.

**Cause:** No TLS-terminating reverse proxy in front of port 32400; direct HTTP access allowed.

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

## Next Steps

- [First-run setup](first-run.md) — initial server configuration and TLS setup.
- [Hub claim and setup](hub/claim-server.md) — understanding what the Hub can and cannot do.
- [Remote access without Hub](advanced/remote-access-without-hub.md) — VPN/blockchain-based remote access options.
- [Troubleshooting](troubleshooting.md) — diagnose connection and access issues.
