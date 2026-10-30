# Install phlix-server via Docker

## TL;DR

phlix-server is a PHP 8.3+ media server with HLS streaming, WebSocket real-time sync, DLNA, and a Vue `/app` web portal. This guide deploys it via Docker in roughly 10 minutes using the published `ghcr.io/detain/phlix-server` image and Docker Compose v2.

**Minimum requirements:** Docker 20.10+, Docker Compose v2, 2 CPU / 4 GB RAM.

**Quick one-liner:** the example compose intentionally refuses to start without an explicit image pin and real database passwords (`${VAR:?…}` gates — loud beats silently booting public placeholder secrets). Resolve a current immutable pin, then feed the three required variables inline:

```bash
TOKEN=$(curl -s "https://ghcr.io/token?scope=repository:detain/phlix-server:pull" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
PHLIX_PIN=$(curl -s -H "Authorization: Bearer $TOKEN" \
  https://ghcr.io/v2/detain/phlix-server/tags/list | grep -o '[0-9a-f]\{40\}-latest' | sort | tail -1)
curl -sSL https://raw.githubusercontent.com/detain/phlix-server/master/docker/examples/server-only/docker-compose.yml | \
  PHLIX_SERVER_IMAGE="ghcr.io/detain/phlix-server:$PHLIX_PIN" \
  MYSQL_ROOT_PASSWORD=$(openssl rand -hex 16) \
  PHLIX_DB_PASSWORD=$(openssl rand -hex 16) \
  docker compose -f - up -d
```

Two harmless warnings may scroll by: the obsolete top-level `version:` attribute, and `PHLIX_SECRET_KEY … defaulting to a blank string` — the entrypoint generates and persists a JWT key on first boot (see §3). `grep -o … | sort | tail -1` picks the lexicographically highest `<full-sha>-latest` tag, not strictly the newest build; any tag it returns is a valid immutable pin (recipe and rationale in §1). Note that the generated passwords exist only in this shell — for anything you will `down` and re-`up` later, use the file-based flow in §3 so the passwords live in `.env`.

**Image variants:**

| Image tag | Use case | Hardware |
|-----------|----------|----------|
| `ghcr.io/detain/phlix-server:latest` | Generic x86_64, no HWaccel | Any 64-bit |
| `ghcr.io/detain/phlix-server:nvidia` | NVIDIA GPU transcoding | NVIDIA GPU with driver 525+ |
| `ghcr.io/detain/phlix-server:intel` | Intel Quick Sync Video | Intel CPUs with Quicksync (Gen 8+) |

---

## 1. Supported Docker variants

| Image tag | Use case | Hardware |
|-----------|----------|----------|
| `ghcr.io/detain/phlix-server:latest` | Generic x86_64, no HWaccel | Any 64-bit |
| `ghcr.io/detain/phlix-server:nvidia` | NVIDIA GPU transcoding | NVIDIA GPU with driver 525+ |
| `ghcr.io/detain/phlix-server:intel` | Intel Quick Sync Video | Intel CPUs with Quicksync (Gen 8+) |

::: warning Registry path & mutable tags
These images live on **`ghcr.io/detain/phlix-server`** (pull with the full `ghcr.io/` prefix — e.g.
`ghcr.io/detain/phlix-server:nvidia`). The bare `:latest` / `:nvidia` / `:intel` tags above are **mutable convenience
tags** that move with every build to `master`, so a `docker pull` of one may give you a different image than the last
time, or a stale one. For a reproducible pull, pin the **immutable `<full-sha>-<variant>` tag** the
`Docker Build & Push` workflow publishes on every push (`<variant>` ∈ `latest|intel|nvidia`). The registry has
**no** `v1.2.3`-style semver tags and **no** `nightly-*` tags. Find the current immutable shas with an anonymous read
(no login required):

```bash
TOKEN=$(curl -s "https://ghcr.io/token?scope=repository:detain/phlix-server:pull" | jq -r .token)
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://ghcr.io/v2/detain/phlix-server/tags/list" \
  | jq -r '.tags[]' | grep -E '^[0-9a-f]{40}-(latest|intel|nvidia)$' | sort | tail
```

The companion relay image `ghcr.io/detain/phlix-hub` uses **`<sha12>`** immutable short-sha tags (same recipe, swapping
`repository:detain/phlix-hub:pull`); its own Helm chart documents the published `:latest` as frozen/stale, so pin a
`<sha12>`. This doc-truth marker
`S483DOCTRUTHX9P2` records that the tag guidance on this page was re-derived from the live `ghcr.io` tags on 2026-09-11.
:::

---

## 2. Prerequisites

### Install Docker Engine (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

### Install Docker Compose v2 (standalone binary — optional)

The `docker compose` (space, plugin) form installed above is what this page uses. If you prefer the legacy
`docker-compose` (hyphen) command name, the same v2 engine ships as a standalone binary:

```bash
sudo curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" \
  -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
docker-compose --version
```

---

## 3. Quick-start (server-only)

The compose example and the `.env` template it references are two different files: the stack lives in
`docker/examples/server-only/`, while the env template is **shared** one level up at `docker/examples/.env.example`
(there is no `.env.example` inside `server-only/`). Download both:

```bash
mkdir -p ~/phlix && cd ~/phlix
curl -O https://raw.githubusercontent.com/detain/phlix-server/master/docker/examples/server-only/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/detain/phlix-server/master/docker/examples/.env.example
chmod 600 .env
```

Then edit `.env` — four touches, and the fourth one is a trap worth naming. It will
hold real credentials, so keep it at mode `600` and never commit it — if you version
this deploy directory with git, add `.env` to `.gitignore` first:

1. Replace the `MYSQL_ROOT_PASSWORD=…` line with a real value (`openssl rand -hex 16`).
2. Replace the `PHLIX_DB_PASSWORD=…` line with a real value (`openssl rand -hex 16`).
3. Uncomment `#PHLIX_SERVER_IMAGE=` and set the immutable pin (form and discovery recipe in §1):
   `PHLIX_SERVER_IMAGE=ghcr.io/detain/phlix-server:<full-sha>-latest`.
4. **Delete (or fill) the `HUB_DB_PASSWORD=…` line.** It is another `${VAR:?…}` self-gate meant for the server-hub /
   full-stack examples, but Compose interpolates *every* line of the env file it loads — even variables your compose
   never references — so leaving it gated fails `docker compose up` (and even `docker compose config`) before your
   stack ever starts.

```bash
docker compose up -d
```

`PHLIX_SECRET_KEY` stays optional: unset, the container's entrypoint generates a strong JWT signing key on first boot
and persists it to `/var/phlix/config/jwt_secret`, which lives on the `phlix_config` volume and so survives restarts
and recreations. Set it yourself only if you want to manage the key externally (it also signs media URLs).

### .env configuration reference

```bash
# Required by docker/examples/server-only/docker-compose.yml
PHLIX_SERVER_IMAGE=ghcr.io/detain/phlix-server:<full-sha>-latest   # §1 pin recipe
MYSQL_ROOT_PASSWORD=<openssl rand -hex 16>                          # MySQL root password
PHLIX_DB_PASSWORD=<openssl rand -hex 16>                            # shared by the app AND MySQL

# Optional
#PHLIX_SECRET_KEY=<openssl rand -hex 32>   # unset → auto-generated, persisted on phlix_config
```

What is deliberately **not** in this file:

- **`PLEX_UID` / `PLEX_GID` do not exist.** Earlier revisions of this page listed them; they are a foreign product's
  namespace and nothing in phlix-server's `docker/` directory or image reads them. The container runs its daemons as
  `nobody` and the named volumes are created by Docker, so there is no UID knob to set (see
  [Volume permission errors](#volume-permission-errors) for the real story on bind mounts).
- **`TZ` and `PHLIX_LOG_LEVEL` are not interpolated** by the server-only example. The compose hardcodes
  `PHLIX_LOG_LEVEL=info` as a literal env line; to change the log level, edit that line in `docker-compose.yml`
  (`PHLIX_LOG_LEVEL` *is* a real application variable — see the [env reference](/reference/env-vars) — but only the
  value the container actually receives takes effect). Only the full-stack example passes a `TZ` line, also hardcoded.
- There is no `PHLIX_PORT` variable. `PHLIX_HTTP_PORT` / `PHLIX_WS_PORT` (plus `PHLIX_HTTP_HOST`, `PHLIX_WS_HOST`,
  `PHLIX_HTTP_WORKER_COUNT`) **are** real listen-port seams on current master (`src/Server/Runtime/ListenEndpoints.php`;
  unreleased as of v1.2.3 — the `<full-sha>` pins built from master, §1, include them)
  — an earlier revision of this page denied their existence, and `reference/env-vars.md` carries the corrected truth.
  The example compose does not pass them, so the container binds the defaults (8096/8097). If you do pass them into the
  container, the right-hand side of the `ports:` mapping must match the port the container actually listens on.

---

## 4. Volume mounts

| Volume (as shipped) | Container path | Purpose |
|-----------|---------------|---------|
| `phlix_config` (named volume) | `/var/phlix/config` | Application config, persisted JWT key |
| `phlix_data` (named volume) | `/var/phlix/data` | Media database, caches |
| `phlix_backups` (named volume) | `/var/phlix/backups` | Automatic backups |
| `phlix_logs` (named volume) | `/var/phlix/logs` | Log files |
| `media_library` (named volume) | `/media:ro` | Media — as shipped this is an EMPTY named volume, not a host folder |
| `mysql_data` (named volume) | `/var/lib/mysql` | Database |

The shipped example mounts media from a named volume called `media_library`, so out of the box the server sees an
empty library. To point it at a real host directory, replace the `media_library:/media:ro` entry under the `phlix`
service's `volumes:` (the now-unused top-level `media_library:` declaration can stay or be removed):

```yaml
    volumes:
      - /mnt/mediavault/movies:/media:ro
```

Make the host directory readable by the container's application user: the image's `supervisord` runs as root but the
phlix daemons run as `nobody`, so world-readable (`chmod -R a+rX /mnt/mediavault/movies`) is what the scanner needs.

---

## 5. Hardware transcoding

### NVIDIA GPU (nvidia image tag)

Install the NVIDIA Container Toolkit first (current official recipe — keyring-based, since `apt-key` is removed on
modern Ubuntu; the old `nvidia.github.io/nvidia-docker/<dist>/…` repository path 404s):

```bash
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
  sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

Use the nvidia image and add runtime to compose (pin the immutable `<full-sha>-nvidia` tag — recipe in §1 — so the pull
is reproducible; the bare `:nvidia` is a mutable convenience tag that may be stale):

```yaml
# <full-sha> = the 40-char commit sha, e.g. from the §1 tags/list recipe
image: ghcr.io/detain/phlix-server:<full-sha>-nvidia
# mutable alternative (moves with every build, may be stale):
#   image: ghcr.io/detain/phlix-server:nvidia
# docker-compose.yml must include:
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: 1
          capabilities: [gpu, video]
```

### Intel Quick Sync (intel image tag)

Pin the immutable `<full-sha>-intel` tag (recipe in §1) for a reproducible pull:

```yaml
# <full-sha> = the 40-char commit sha, e.g. from the §1 tags/list recipe
image: ghcr.io/detain/phlix-server:<full-sha>-intel
# mutable alternative (moves with every build, may be stale):
#   image: ghcr.io/detain/phlix-server:intel
```

No special runtime needed, but the `/dev/dri` render node must reach the container — with Compose v2 add a device
mapping under the service:

```yaml
    devices:
      - /dev/dri:/dev/dri
```

---

## 6. Port reference

| Host (example default) | Container port | Protocol | Service |
|------|------|---------|---------|
| `127.0.0.1:32400` | 8096 | TCP | HTTP web interface (REST API, `/app` SPA, static assets, `/health`) |
| `127.0.0.1:8097` | 8097 | TCP | SyncPlay WebSocket |
| *not published* | — | UDP 1900 | DLNA/SSDP discovery — see note below |

::: tip 8096 inside, 32400 outside — and loopback-only by default
phlix-server's HTTP worker binds **`8096`** inside the container by default
(`server.port` in `config/server.php`; overridable via `PHLIX_HTTP_PORT`, see §3).
The `server-only` example publishes it as **`127.0.0.1:32400:8096`** — deliberately bound to loopback, because
Docker's published ports bypass host firewalls like ufw. That is why the URLs on this page use `:32400` while the
Linux/macOS/Windows install pages use `:8096`. To serve your LAN, change the **left** side —
drop the `127.0.0.1:` prefix (everything on the `8097` mapping is plaintext WebSocket, appropriate only on a trusted
LAN) or put a TLS-terminating reverse proxy in front (§7c's full-stack example). The **right** side stays `8096`
unless you pass `PHLIX_HTTP_PORT` into the container yourself.
:::

::: warning DLNA does not work in the bridge-network examples
The example stacks attach services to a Docker bridge network and publish **no** `1900/UDP` mapping, so SSDP
multicast discovery never reaches your LAN and the TV never sees the server. DLNA browsing in Docker needs host
networking (`network_mode: "host"` on the server service — at which point the `32400:8096` mapping is moot because
the container binds the host's `8096` directly), or just don't run DLNA in Docker. There is no `PHLIX_DLNA_PORT`
variable; the real switches are the `dlna.enabled` (SSDP advertiser) and `dlna.cds_enabled` (browse service, off by
default because it serves the library unauthenticated) settings — see [DLNA](/advanced/dlna).
:::

```bash
# Verify ports are free before starting
sudo ss -tlnp | grep -E '32400|8097'
```

---

## 7. Example stacks

> **Tip:** All example stacks live under `docker/examples/` in the repository. Each directory ships a
> `docker-compose.yml` only — the env template is the shared `docker/examples/.env.example` one level up (§3).

### 7a. Server-only (minimal)

Single phlix-server + MySQL container, loopback access only. See `docker/examples/server-only/docker-compose.yml`:

```bash
curl -O https://raw.githubusercontent.com/detain/phlix-server/master/docker/examples/server-only/docker-compose.yml
```

### 7b. Server + Hub (remote access)

Adds phlix-hub relay service for remote access behind NAT. See `docker/examples/server-hub/docker-compose.yml`.

### 7c. Full-stack with Traefik (production)

Traefik reverse proxy handling HTTPS, WebSocket relay, and Let's Encrypt certificates:

```bash
mkdir -p ~/phlix/full-stack/traefik && cd ~/phlix/full-stack
curl -O https://raw.githubusercontent.com/detain/phlix-server/master/docker/examples/full-stack/docker-compose.yml
curl -O https://raw.githubusercontent.com/detain/phlix-server/master/docker/examples/full-stack/traefik/traefik.yml
curl -O https://raw.githubusercontent.com/detain/phlix-server/master/docker/examples/full-stack/traefik/dynamic.yml
```

---

## 8. Verify the install

```bash
# Check containers are running (service names: phlix, mysql)
docker compose ps

# Check logs
docker compose logs -f phlix

# Test the health endpoint
curl -s http://127.0.0.1:32400/health
# Expected: {"status":"ok",...} with HTTP 200

# Access web UI — the browser opens the login page; the first account becomes the admin (no wizard)
xdg-open http://127.0.0.1:32400   # macOS: open
```

The compose file's own header documents each listener (also visible with
`docker compose config`): a plain HTTP `GET` to `:8097` answers **400** — that is the SyncPlay WebSocket worker
being *alive*, not broken.

---

## What can go wrong

### Docker not installed or wrong version

- **Symptom:** `docker: command not found`, or `docker compose: 'compose' is not a docker command`
- **Fix:** Follow §2 above to install Docker Engine + the `docker-compose-plugin`
- **Verify:** `docker --version` (min 20.10) and `docker compose version` (min v2.0)

### `required variable … is missing a value` before anything starts

- **Symptom:** `docker compose up` (or even `config`) fails with
  `required variable MYSQL_ROOT_PASSWORD is missing a value` / `PHLIX_SERVER_IMAGE must be set …` /
  `required variable HUB_DB_PASSWORD is missing a value`
- **Cause:** the examples refuse to parse without real secrets and an explicit image pin — loud over silently
  booting public placeholder passwords (see §3). The `HUB_DB_PASSWORD` gate also fires when you use the shared
  `.env.example` with the *server-only* stack, because Compose interpolates every env-file line regardless of use.
- **Fix:** fill the variables your stack needs; delete (or fill) the unused hub gate; set `PHLIX_SERVER_IMAGE` to a
  §1 pinned tag.

### Volume permission errors

- **Symptom:** `Permission denied` reading bind-mounted media files, or "cannot create file" errors in logs
- **Cause:** your host directory isn't readable by the container's user — the image runs its daemons as `nobody`
  (there is no `PUID`/`PLEX_UID` knob; earlier revisions of this page listed one, and it was never real)
- **Fix:** make the media bind world-readable: `chmod -R a+rX /mnt/mediavault/movies`. For writable paths
  (config/data/backups/logs), prefer the shipped named volumes — they initialize from the image's `nobody`-owned
  `/var/phlix` tree.
- **Verify as the app user** (`docker compose exec` itself lands as the container default, root — not the user your
  media is read by):
  ```bash
  docker compose exec phlix su -s /bin/sh nobody -c 'ls /media | head'
  ```

### Port already in use

- **Symptom:** `bind(): Address already in use` on `127.0.0.1:32400` or `:8097`
- **Fix:** Find and stop the conflicting process: `sudo ss -tlnp | grep 32400`, then stop it.
  Or change the mapped port in `docker-compose.yml`:
  ```yaml
  ports:
    - "127.0.0.1:32401:8096"   # publish on host port 32401 instead of 32400
  ```
  Only the host side of the mapping needs to change — the container binds `8096` unless you pass `PHLIX_HTTP_PORT`.
- **DLNA:** the examples publish no host `1900` mapping, so they cannot collide with your router/Plex there;
  DLNA simply does not discover over the bridge network (see §6's warning). To stop the SSDP advertiser itself,
  disable the `dlna.enabled` setting (admin settings UI, or `enabled => false` in `config/dlna.php`).

### NVIDIA runtime not configured

- **Symptom:** Transcoding falls back to software encoding despite NVIDIA GPU present; logs show `GPU not available`
- **Cause:** `nvidia-container-toolkit` not installed, or the `nvidia` runtime not registered with Docker
- **Fix:** run the §5 install block, which ends with `sudo nvidia-ctk runtime configure --runtime=docker` and a
  Docker restart. (Manual equivalent: `"default-runtime": "nvidia"` plus the `runtimes` entry in `/etc/docker/daemon.json`.)
- **Verify:** `docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi` — should print GPU info

---

## Next steps

- [First run](/first-run) — create the first account (it becomes the administrator) at `http://your-server:32400`
- [Hardware transcoding](/advanced/hardware-transcoding) — configure NVENC/VAAPI/Quicksync for better transcoding performance
- [Linux install](/install/linux) — alternative install method without containers
