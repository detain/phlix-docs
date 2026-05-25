# Hub-Admin: Install & First Boot

## TL;DR

Install a self-hosted Phlix Hub via Docker, docker-compose, Kubernetes Helm, or source. The hub requires a MySQL database, a JWT secret, and a public URL. TLS must be provisioned out-of-band — automated certificate provisioning is **not implemented** (the hub's `TlsCertificateManager::provisionCertificate()` throws). Terminate TLS at a reverse proxy (Traefik/Caddy/nginx) or place certificates manually; see the hub's TLS runbook (`phlix-hub/docs/hub-admin/tls.md`) and [TLS Certificates](../dev/tls-certificates.md). Create the first admin via the UI first-boot form, CLI, or an invite token.

---

## Install Options

### Docker

```bash
docker run -d \
  --name phlix-hub \
  -p 8800:8800 \
  -e HUB_DATABASE_HOST=db \
  -e HUB_DATABASE_PORT=3306 \
  -e HUB_DATABASE_NAME=phlix_hub \
  -e HUB_DATABASE_USER=phlix \
  -e HUB_DATABASE_PASSWORD=secret \
  -e HUB_JWT_SECRET="$(openssl rand -hex 32)" \
  -e HUB_JWT_ISSUER=phlix-hub \
  -e HUB_PUBLIC_URL=https://hub.example.com \
  detain/phlix-hub
```

### Docker-compose

```yaml
services:
  traefik:
    image: traefik:v3
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    ports:
      - "80:80"
      - "443:443"

  hub:
    image: detain/phlix-hub
    environment:
      HUB_DATABASE_HOST: db
      HUB_JWT_SECRET: "${HUB_JWT_SECRET}"
      HUB_PUBLIC_URL: "https://hub.example.com"
    depends_on:
      - db

  server:
    image: detain/phlix-server
    environment:
      HUB_RELAY_ENABLED: "true"
      HUB_PUBLIC_URL: "https://hub.example.com"
    depends_on:
      - hub
```

### Kubernetes (Helm)

```bash
helm repo add phlix https://charts.phlix.io
helm install phlix-hub phlix/phlix-hub \
  --set hub.publicUrl=https://hub.example.com \
  --set hub.jwtSecret=$HUB_JWT_SECRET
```

### Source

```bash
git clone https://github.com/detain/phlix-hub.git
cd phlix-hub
composer install
php bin/hub.php admin:create admin@example.com
php bin/hub.php start
```

---

## TLS Setup

### Option A — Let's Encrypt via Traefik/Caddy (automatic)

Traefik automatically obtains TLS certificates via ACME when labels are set on the container:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.hub.tls=true"
  - "traefik.http.routers.hub.rule=Host(`hub.example.com`)"
```

### Option B — Manual TLS Cert

Place cert and key at `config/ssl/hub.crt` and `config/ssl/hub.key`:

```php
// config/ssl.php
return [
    'cert' => __DIR__ . '/hub.crt',
    'key'  => __DIR__ . '/hub.key',
];
```

### HTTP → HTTPS Redirect (always)

```php
// config/ssl.php
return [
    'redirect_http' => true,
    'hsts'          => 'max-age=31536000; includeSubDomains',
];
```

---

## First Admin User

Three ways to create the first admin:

### 1. Hub UI (first boot)

Navigate to `https://hub.example.com` — the hub shows a "Create admin account" form automatically on first boot.

### 2. CLI

```bash
php bin/hub.php admin:create admin@example.com
```

Prompts for password interactively. Outputs the user ID on success.

### 3. Invite Token via Env Var

```bash
HUB_ADMIN_INVITE_TOKEN="$(openssl rand -hex 16)" php bin/hub.php start
```

Then visit `https://hub.example.com/invite?token=$HUB_ADMIN_INVITE_TOKEN`.

---

## Hub Claim Flow QA

Verify that pairing works end-to-end:

1. Start hub and server (both running; server has `HUB_RELAY_ENABLED=true`).
2. On **server**: Settings → Hub → Connect → generates a claim code (e.g. `HUB-CLAIM-ABCD1234`).
3. On **hub**: Admin → Servers → Claim Server → enter the claim code.
4. Verify hub shows the server in "My Servers" with a green heartbeat indicator.
5. Create a test user on the hub (Admin → Users → Add User).
6. Log in as that test user; confirm the shared server appears in their server list and media is visible.

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `HUB_DATABASE_HOST` | Yes | `localhost` | MySQL host |
| `HUB_DATABASE_PORT` | Yes | `3306` | MySQL port |
| `HUB_DATABASE_NAME` | Yes | `phlix_hub` | Database name |
| `HUB_DATABASE_USER` | Yes | — | Database user |
| `HUB_DATABASE_PASSWORD` | Yes | — | Database password |
| `HUB_JWT_SECRET` | Yes | dev default | JWT signing secret (min 32 bytes) |
| `HUB_JWT_ISSUER` | No | `phlix-hub` | JWT issuer claim |
| `HUB_PUBLIC_URL` | Yes | — | Public URL of the hub (e.g. `https://hub.example.com`) |
| `HUB_TLS_CERT` | No | — | Path to TLS cert (Traefik handles this if used) |
| `HUB_TLS_KEY` | No | — | Path to TLS key |
| `HUB_RELAY_ENABLED` | No | `false` | Enable relay tunnel for server communication |
| `HUB_CORS_ORIGINS` | No | `*` | Allowed CORS origins (comma-separated) |
| `HUB_ADMIN_INVITE_TOKEN` | No | — | One-time invite token for first admin creation |

---

## What Can Go Wrong

### TLS cert not trusted by clients (self-signed)

**Symptom:** Clients show a certificate warning or refuse to connect.

**Cause:** Using a self-signed certificate — browsers and apps reject it by default.

**Fix:** Use Let's Encrypt via Traefik, or distribute your CA-signed cert to all client machines. For internal testing, temporarily accept the exception.

### JWT secret not set (falls back to dev default)

**Symptom:** Hub logs show `SECURITY WARNING: using default JWT secret`.

**Cause:** `HUB_JWT_SECRET` is not set or is too short.

**Fix:** Set `HUB_JWT_SECRET` to a secure random value (minimum 32 bytes): `openssl rand -hex 32`. Any deployment using the default secret is insecure.

### Hub can't receive connections from server

**Symptom:** Server appears offline in hub dashboard; no heartbeat received.

**Cause:** Firewall blocking port 8800, or `HUB_PUBLIC_URL` set to an unreachable address (e.g. `localhost` instead of the public IP/DNS name).

**Fix:** Open port 8800 in the firewall. Set `HUB_PUBLIC_URL` to the public DNS name or IP that servers can reach externally. Verify with `curl -v https://hub.example.com/api/v1/health` from the server's network.

### Database migration fails

**Symptom:** Hub fails to start; migration errors in logs.

**Cause:** Schema already exists from a previous dev-mode run, or the database user lacks permissions.

**Fix:** Drop and recreate the database, or run migrations with the `--force` flag: `php bin/hub.php migrate --force`. Ensure the database user has `CREATE, ALTER, DROP, INSERT, UPDATE, DELETE, SELECT` privileges.

---

## Next Steps

- [Hub-Admin Capacity Planning](capacity-planning.md) — size hub hardware for your user base
- [Hub-Admin Monitoring & Alerting](monitoring-alerting.md) — dashboards, metrics, and alerts for the hub
