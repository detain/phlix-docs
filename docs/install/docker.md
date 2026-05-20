# Install phlix-server via Docker

## TL;DR

phlix-server is a PHP 8.3+ media server with HLS streaming, WebSocket real-time sync, DLNA, and a Smarty web portal. This guide deploys it via Docker in roughly 10 minutes using the official `detain/phlix-server` image and `docker-compose`.

**Minimum requirements:** Docker 20.10+, docker-compose v2, 2 CPU / 4 GB RAM.

**Quick one-liner:**

```bash
curl -sSL https://raw.githubusercontent.com/detain/phlix-server/master/docker/examples/server-only/docker-compose.yml | \
  PHLIX_DB_PASSWORD=$(openssl rand -hex 16) \
  PHLIX_SECRET_KEY=$(openssl rand -hex 32) \
  docker-compose -f - up -d
```

**Image variants:**

| Image tag | Use case | Hardware |
|-----------|----------|----------|
| `detain/phlix-server:latest` | Generic x86_64, no HWaccel | Any 64-bit |
| `detain/phlix-server:nvidia` | NVIDIA GPU transcoding | NVIDIA GPU with driver 525+ |
| `detain/phlix-server:intel` | Intel Quick Sync Video | Intel CPUs with Quicksync (Gen 8+) |

::: tip Screenshots TBD
This guide is text-first. Screenshots will be added in a follow-up.
:::

---

## 1. Supported Docker variants

| Image tag | Use case | Hardware |
|-----------|----------|----------|
| `detain/phlix-server:latest` | Generic x86_64, no HWaccel | Any 64-bit |
| `detain/phlix-server:nvidia` | NVIDIA GPU transcoding | NVIDIA GPU with driver 525+ |
| `detain/phlix-server:intel` | Intel Quick Sync Video | Intel CPUs with Quicksync (Gen 8+) |

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
  sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

### Install docker-compose v2 (standalone)

```bash
sudo curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" \
  -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
docker-compose --version
```

---

## 3. Quick-start (server-only)

```bash
mkdir -p ~/phlix && cd ~/phlix
curl -O https://raw.githubusercontent.com/detain/phlix-server/master/docker/examples/server-only/docker-compose.yml
cp .env.example .env  # copy and edit
# Edit .env: set PHLIX_DB_PASSWORD, PHLIX_SECRET_KEY, TZ, PLEX_UID, PLEX_GID
docker-compose up -d
```

### .env configuration reference

```bash
# Required
PHLIX_DB_PASSWORD=change_me_generate_with_openssl    # openssl rand -hex 16
PHLIX_SECRET_KEY=change_me_generate_with_openssl       # openssl rand -hex 32

# Optional — defaults shown
TZ=UTC
PLEX_UID=1000
PLEX_GID=1000
PHLIX_LOG_LEVEL=info
PHLIX_PORT=32400
```

---

## 4. Volume mounts

| Host path | Container path | Purpose |
|-----------|---------------|---------|
| `phlix_config` (named volume) | `/var/phlix/config` | Application config |
| `phlix_data` (named volume) | `/var/phlix/data` | Media database, caches |
| `phlix_backups` (named volume) | `/var/phlix/backups` | Automatic backups |
| `phlix_logs` (named volume) | `/var/phlix/logs` | Log files |
| `/path/to/media` | `/media:ro` | Read-only media library mount |

To bind-mount a host media directory, replace the volume entry in `docker-compose.yml`:

```yaml
volumes:
  - /mnt/mediavault/movies:/media:ro
```

---

## 5. Hardware transcoding

### NVIDIA GPU (nvidia image tag)

Install NVIDIA Docker runtime first:

```bash
distribution=$(. /etc/os-release && echo "$ID$VERSION_ID")
curl -sL https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -sL https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | \
  sudo tee /etc/apt/sources.list.d/nvidia-docker.list
sudo apt update && sudo apt install -y nvidia-container-toolkit
sudo systemctl restart docker
```

Use the nvidia image and add runtime to compose:

```yaml
image: ghcr.io/detain/phlix-server:nvidia
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

```yaml
image: ghcr.io/detain/phlix-server:intel
```

No special runtime needed; the container automatically detects Quicksync devices via `/dev/dri`.

---

## 6. Port reference

| Port | Protocol | Service |
|------|---------|---------|
| 32400 | TCP | HTTP web interface |
| 1900 | UDP | DLNA discovery |

```bash
# Verify ports are free before starting
sudo ss -tlnp | grep -E '32400|1900'
```

---

## 7. Example stacks

> **Tip:** All example stacks below are also available in `docker/examples/` in the repository. Copy the directory that matches your use case and edit `.env`.

### 7a. Server-only (minimal)

Single phlix-server + MySQL container, local access only. See `docker/examples/server-only/docker-compose.yml`:

```bash
curl -O https://raw.githubusercontent.com/detain/phlix-server/master/docker/examples/server-only/docker-compose.yml
```

### 7b. Server + Hub (remote access)

Adds phlix-hub relay service for remote access behind NAT. See `docker/examples/server-hub/docker-compose.yml`.

### 7c. Full-stack with Traefik (production)

Traefik reverse proxy handling HTTPS, WebSocket relay, and Let's Encrypt certificates:

```bash
mkdir -p ~/phlix/full-stack/traefik
curl -O https://raw.githubusercontent.com/detain/phlix-server/master/docker/examples/full-stack/docker-compose.yml
curl -O https://raw.githubusercontent.com/detain/phlix-server/master/docker/examples/full-stack/traefik/traefik.yml
curl -O https://raw.githubusercontent.com/detain/phlix-server/master/docker/examples/full-stack/traefik/dynamic.yml
```

---

## 8. Verify the install

```bash
# Check container is running
docker ps | grep phlix-server

# Check logs
docker-compose logs -f phlix-server

# Test HTTP endpoint
curl -I http://localhost:32400
# Expected: HTTP 200

# Access web UI
open http://localhost:32400
```

---

## What can go wrong

### Docker not installed or wrong version

- **Symptom:** `docker: command not found`, or `docker-compose: command not found`
- **Fix (no Docker):** Follow step 2 above to install Docker Engine + docker-compose plugin
- **Fix (docker-compose standalone):** Install `docker-compose` binary separately as shown above
- **Verify:** `docker --version` (min 20.10) and `docker-compose --version` (min v2.0) or `docker compose version`

### Volume permission errors

- **Symptom:** `Permission denied` accessing `/var/phlix/config` or media files, or "cannot create file" errors in logs
- **Cause:** UID/GID mismatch between host user and container's `www-data` (UID 33 typically)
- **Fix:** Set `PLEX_UID` and `PLEX_GID` in `.env` to match the host user that owns the media directories:
  ```bash
  PLEX_UID=$(id -u)
  PLEX_GID=$(id -g)
  ```
- **Verify:** `docker-compose exec phlix-server id` shows correct UID/GID

### Port already in use

- **Symptom:** `bind(): Address already in use` on `0.0.0.0:32400` or `1900`
- **Fix:** Find and stop the conflicting process: `sudo ss -tlnp | grep 32400`, then `sudo kill <PID>`
  Or change the mapped port in `docker-compose.yml`:
  ```yaml
  ports:
    - "32401:80"   # change host port 32401 instead of 32400
  ```
- For DLNA port 1900/UDP: set `PHLIX_DLNA_PORT=0` to disable DLNA if another service uses it

### NVIDIA runtime not configured

- **Symptom:** Transcoding falls back to software encoding despite NVIDIA GPU present; logs show `GPU not available`
- **Cause:** `nvidia-container-toolkit` not installed, or `nvidia` runtime not enabled in Docker
- **Fix:** Install `nvidia-container-toolkit` and add `"default-runtime": "nvidia"` to `/etc/docker/daemon.json`:
  ```json
  {
    "default-runtime": "nvidia",
    "runtimes": {
      "nvidia": {
        "path": "nvidia-container-runtime",
        "runtimeArgs": []
      }
    }
  }
  ```
  Then `sudo systemctl restart docker`
- **Verify:** `docker run --rm --gpus all nvidia/cuda:11.0-base nvidia-smi` — should print GPU info

---

## Next steps

- [First-run wizard](/first-run) — complete the browser-based setup at `http://your-server:32400`
- [Hardware transcoding](/advanced/hardware-transcoding) — configure NVENC/VAAPI/Quicksync for better transcoding performance
- [Linux install](/install/linux) — alternative install method without containers
