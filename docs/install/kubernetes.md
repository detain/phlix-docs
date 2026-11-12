# Install phlix-server on Kubernetes

## TL;DR

phlix-server is a PHP 8.3+ media server with HLS streaming, WebSocket real-time sync, DLNA, and a Vue `/app` web portal. This guide deploys it on Kubernetes via Helm in roughly 10 minutes.

**Minimum requirements:** Kubernetes 1.21+, Helm 3.8+, a `default` or named StorageClass, 2 CPU / 4 GB RAM per pod.

**There is no Phlix Helm repository.** `charts.phlix.media` does not resolve and no `helm repo add` / OCI push
publishes these charts; a `helm repo add phlix …` command you may have seen elsewhere never worked against a live
endpoint. Consume the chart from source (a `phlix-server` checkout) or from the `.tgz` attached to a tagged GitHub
Release, and pin an immutable image tag — see §2. This doc-truth marker `S483DOCTRUTHX9P2` records that the image and
tag guidance below was re-derived against the live `ghcr.io` registry and the tip chart on 2026-09-11.

**Quick one-liner (install from a checkout, immutable tag):**

```bash
# Resolve the newest immutable <full-sha>-latest tag straight from ghcr (no login):
IMG_TAG=$(curl -s -H "Authorization: Bearer $(curl -s "https://ghcr.io/token?scope=repository:detain/phlix-server:pull" | jq -r .token)" \
  "https://ghcr.io/v2/detain/phlix-server/tags/list" | jq -r '.tags[]' | grep -E '^[0-9a-f]{40}-latest$' | sort | tail -1)
git clone --depth 1 https://github.com/detain/phlix-server && cd phlix-server
# Secrets first, out of argv: the chart renders its managed Secret FROM values
# (there is no existing-secret hook — see §7), so create a local, uncommitted
# values file and pass it with -f. Never `--set` a secret.
umask 077
cat > phlix-secrets.yaml <<EOF
config:
  # Generated fresh here — create your MySQL user with this password:
  database_password: "$(openssl rand -hex 32)"
  # JWT signing key — generate one, never reuse:
  secret_key: "$(openssl rand -hex 32)"
EOF
# phlix-secrets.yaml holds live credentials — never commit it.
# config.database_host is REQUIRED — the chart deploys no database; replace
# mysql.example.com with the host of a MySQL that serves your phlix database.
helm install phlix ./k8s/helm/phlix \
  -f phlix-secrets.yaml \
  --set image.tag="$IMG_TAG" \
  --set config.database_host=mysql.example.com \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=phlix.example.com
```

Then open `https://phlix.example.com` in your browser.

<!-- screenshots TBD — text-first -->

---

## 1. Prerequisites

| Component | Minimum version | Notes |
|-----------|-----------------|-------|
| Kubernetes | 1.21+ | |
| Helm | 3.8+ | |
| Ingress controller | nginx-ingress or Traefik | with cert-manager for automated TLS |
| StorageClass | default or named | Required for PVCs |
| NVIDIA GPU (optional) | Driver 525+ | For hardware transcoding |
| MySQL | External or in-cluster | Required — the chart deploys no database; `config.database_host` must point at a real MySQL (§3) |

---

## 2. Get the chart and pin an immutable image tag

The `phlix` chart is **not** published to a Helm repository. On a `v*.*.*` tag push, `release.yml` verifies the chart
`appVersion` matches the tag, packages the charts, and attaches them as **GitHub Release assets** (`phlix-<version>.tgz`)
— there is no `helm repo index`, no `charts.phlix.media`, and no OCI registry push. Two real ways to consume it:

```bash
# (a) From a checkout of phlix-server (the chart source lives in k8s/helm/phlix):
git clone --depth 1 https://github.com/detain/phlix-server
helm show values ./phlix-server/k8s/helm/phlix > values.yaml

# (b) From a packaged chart attached to a tagged GitHub Release:
#     download phlix-<version>.tgz, then:
helm show values ./phlix-1.2.3.tgz > values.yaml   # only once a v*.*.* release exists
```

**The image tag is required and must be immutable.** The chart's `templates/deployment.yaml` uses `required` on
`image.tag`: leaving it empty fails `helm template`/`helm install` loudly (there is no silent `:latest` or AppVersion
fallback — S475 removed the AppVersion fallback because the `1.2.3` tag it pointed at was never published). Set the tag
to a deterministic immutable `<full-sha>-<variant>` value the `Docker Build & Push` workflow publishes on every push,
where `<variant>` is `latest` (generic x86_64), `nvidia`, or `intel`. Do **not** pin `:latest`, `:nvidia`, or `:intel`
alone — those are mutable convenience tags that move with every build. Find the current immutable shas with the
anonymous read below (never hand-bake a sha that will age):

```bash
# List published tags for phlix-server (anonymous ghcr.io read, HTTP 200):
TOKEN=$(curl -s "https://ghcr.io/token?scope=repository:detain/phlix-server:pull" | jq -r .token)
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://ghcr.io/v2/detain/phlix-server/tags/list" \
  | jq -r '.tags[]' | grep -E '^[0-9a-f]{40}-(latest|intel|nvidia)$' | sort | tail
```

As measured on 2026-09-11 the `detain/phlix-server` repository carried exactly these immutable tags (plus the mutable
`latest`/`intel`/`nvidia` and internal `buildcache-*` tags): `<full-sha>-intel`, `<full-sha>-latest`,
`<full-sha>-nvidia` for two commits. The registry exposes **no** semver (`v1.2.3`) or `nightly-YYYYMMDD` image tags —
only the `<full-sha>-<variant>` and mutable-variant forms above exist. (The `1.2.3` you may see is the *Helm chart*
`version`/`appVersion`, not an image tag.)

---

## 3. Minimal values.yaml

```yaml
replicaCount: 1

image:
  repository: ghcr.io/detain/phlix-server
  pullPolicy: IfNotPresent
  # REQUIRED, no default — the chart fails loudly if this is empty (see §2).
  # Use an immutable <full-sha>-<latest|intel|nvidia> tag from the Docker workflow.
  # Replace <full-sha> with a value from the anonymous tags/list recipe in §2;
  # never pin bare "latest"/"intel"/"nvidia" — those mutable tags drift with every build.
  tag: <full-sha>-latest

ingress:
  enabled: true
  className: "nginx"
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "86400"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "86400"
    nginx.ingress.kubernetes.io/upstream-hdrs: "Upgrade"
    nginx.ingress.kubernetes.io/websocket-services: "phlix-websocket"
  hosts:
    - host: phlix.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: phlix-tls
      hosts:
        - phlix.example.com

resources:
  requests:
    cpu: 500m
    memory: 512Mi
  limits:
    cpu: 2000m
    memory: 2Gi

persistence:
  media:
    enabled: true
    storageClass: ""        # uses default StorageClass; set to "nfs" or "local-path" if needed
    size: 100Gi
    readOnly: true
  data:
    enabled: true
    storageClass: ""
    size: 10Gi
  config:
    enabled: true
    storageClass: ""
    size: 1Gi

config:
  database_host: "mysql.default.svc.cluster.local"
  database_port: 3306
  database_name: phlix
  database_user: phlix
  database_password: "REPLACE_WITH_STRONG_PASSWORD"
  secret_key: "REPLACE_WITH_32_CHAR_KEY"
  log_level: info

# Optional: GPU node scheduling for hardware transcoding
nodeSelector:
  gpu: "nvidia"

tolerations:
  - key: "nvidia.com/gpu"
    operator: "Exists"
    effect: "NoSchedule"
```

> The two `REPLACE_…` lines above are placeholders — fill them with generated
> values (the chart refuses copy-paste placeholder strings like `secret` or
> `change-me` at template time — see §7), but keep the filled file out of git:
> `values.yaml` ends up verbatim in the Helm release metadata, which anyone
> with release read access can dump with `helm get values`. Use a separate
> mode-`600` secrets file as in §7 rather than committing real credentials
> here.

Save as `values.yaml` and install with (chart from a `phlix-server` checkout, per §2):

```bash
helm install phlix ./k8s/helm/phlix -f values.yaml
```

---

## 4. Required PersistentVolumeClaims

The Helm chart creates three PVCs automatically:

```bash
kubectl get pvc | grep phlix
```

| PVC name | Purpose | Default size | Access mode |
|----------|---------|--------------|-------------|
| `phlix-media` | Media files (read-only mount) | 100 Gi | ReadWriteOnce |
| `phlix-data` | Application data (DB, watch history) | 10 Gi | ReadWriteOnce |
| `phlix-config` | Config directory | 1 Gi | ReadWriteOnce |

> **StorageClass:** If your cluster has no default StorageClass, you must set `persistence.media.storageClass` explicitly (e.g. `local-path`, `nfs`, `cephfs`). Using a StorageClass that supports `ReadWriteMany` (e.g. NFS) is required for the media PVC to be mounted read-only by multiple pods.

---

## 5. Service type

### 5a. ClusterIP (default — requires Ingress)

```yaml
service:
  type: ClusterIP
  http:
    port: 80
```

Access via Ingress at `https://phlix.example.com`.

### 5b. LoadBalancer

```yaml
service:
  type: LoadBalancer
  http:
    port: 80
```

Exposes phlix directly on a cloud LB. For on-premises, MetalLB can provide this.

### 5c. NodePort

```yaml
service:
  type: NodePort
  http:
    port: 80
    nodePort: 32400
```

Access at `http://<any-node-ip>:32400`. Not recommended for production.

---

## 6. Ingress annotations

### nginx-ingress (recommended)

```yaml
ingress:
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "86400"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "86400"
    # WebSocket proxying
    nginx.ingress.kubernetes.io/proxy-http-version: "1.1"
    nginx.ingress.kubernetes.io/upstream-hdrs: "Upgrade"
    nginx.ingress.kubernetes.io/websocket-services: "phlix-websocket"
    nginx.ingress.kubernetes.io/use-regex: "true"
```

### Traefik

```yaml
ingress:
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    traefik.ingress.kubernetes.io/router.entrypoints: "websecure"
    traefik.ingress.kubernetes.io/router.http-services: "phlix-http"
    traefik.ingress.kubernetes.io/router.headers.customrequestheaders: "Upgrade: websocket"
```

If using Traefik's `IngressRoute` CRD instead of plain Ingress, see the [Traefik docs](https://doc.traefik.io/traefik/routing/providers/kubernetes-ingress/).

---

## 7. Environment variables

The chart passes these to the pod automatically via `PHLIX_*` env vars:

| Env var | Description | Example |
|---------|-------------|---------|
| `PHLIX_DATABASE_HOST` | MySQL host — **required**; the chart deploys no database | `mysql.default.svc.cluster.local` |
| `PHLIX_DATABASE_PORT` | MySQL port | `3306` |
| `PHLIX_DATABASE_NAME` | Database name | `phlix` |
| `PHLIX_DATABASE_USER` | Database user | `phlix` |
| `PHLIX_DATABASE_PASSWORD` | Database password | from Kubernetes Secret |
| `PHLIX_SECRET_KEY` | JWT/signing key (entrypoint aliases it to `JWT_SECRET`) | from Kubernetes Secret |
| `PHLIX_LOG_LEVEL` | Log verbosity | `info`, `debug` |

::: info Ports: the chart now states them explicitly
The chart's deployment declares **`containerPort: 8096`** (HTTP) and
**`containerPort: 8097`** (the WebSocket worker) for phlix-server, and the
`phlix-hub` chart declares **`8800`** (HTTP) and **`8802`** (relay WebSocket) —
verified against `k8s/helm/phlix/templates/deployment.yaml` and
`k8s/helm/phlix-hub/templates/deployment.yaml`. The container never listens on
`80`; the Service's `port` values in the examples above are the *Service's*
ports and their `targetPort` resolves to `8096`. Changing the listen port
without editing the chart is possible server-side via `PHLIX_HTTP_PORT` /
`PHLIX_WS_PORT` (live since the SRV-OPS listen-endpoint wiring, default
`8096` / `8097`) — but then the chart's hardcoded `containerPort`/probes would
no longer match, so prefer the chart defaults inside Kubernetes.
:::

Passwords and keys are **required** — the chart's `templates/secret.yaml` wraps both in `required`, so an empty `config.database_password` or `config.secret_key` fails `helm template`/`helm install` loudly. (A template-time guard additionally refuses a family of copy-paste placeholder values — `secret`, `change-me`, `replace-me`, `password`, `test`, `demo`, `dev`, … — so install genuinely stalls if you leave an example string in place.) A third `required` guard sits in `templates/deployment.yaml` on `config.database_host`: the chart ships no database, so an unset host fails the install with `config.database_host is required` instead of booting a pod doomed to CrashLoopBackOff.

Prefer feeding real values through a **local, uncommitted secrets file** rather than the command line — `--set` puts the secret in your shell history and in the process argv while helm runs, visible to anyone who can list processes:

```bash
umask 077
cat > phlix-secrets.yaml <<EOF
config:
  database_password: "$(openssl rand -hex 32)"
  secret_key: "$(openssl rand -hex 32)"
EOF
# phlix-secrets.yaml holds live credentials — never commit it.
# config.database_host is required — point it at your real MySQL host:
helm install phlix ./k8s/helm/phlix \
  --set image.tag="$IMG_TAG" \
  --set config.database_host=mysql.example.com \
  -f phlix-secrets.yaml
```

Whatever path you use, the values are rendered into the chart-managed Secret and into the release metadata (`helm get values` shows them), so treat read RBAC on secrets/releases as part of the credential's trust boundary. On GitOps clusters, inject the same `config.*` values from your secret manager at render time — the chart owns its Secret object and has no existing-secret hook, so pre-creating a separate Secret and pointing the chart at it is not supported.

---

## 8. GPU node scheduling (NVIDIA)

For hardware-accelerated transcoding on NVIDIA GPUs:

```bash
# Install the NVIDIA device plugin (one-time per cluster)
kubectl apply -f https://raw.githubusercontent.com/NVIDIA/k8s-device-plugin/v0.14.5/nvidia-device-plugin.yml
```

Then in `values.yaml`:

```yaml
nodeSelector:
  nvidia.com/gpu: "true"

tolerations:
  - key: "nvidia.com/gpu"
    operator: "Exists"
    effect: "NoSchedule"
```

The container automatically detects and uses NVENC/NVDEC when available.

---

## 9. Helm upgrade process

When you want a newer image build or chart revision (there is no Helm repo to `update` — you refresh the chart from the
`phlix-server` checkout you installed from):

```bash
# Refresh the chart source to the revision you want to deploy:
git -C ./phlix-server pull --ff-only

# Check what would change (requires the helm-diff plugin)
helm diff upgrade phlix ./phlix-server/k8s/helm/phlix -f values.yaml

# Apply the upgrade
helm upgrade phlix ./phlix-server/k8s/helm/phlix -f values.yaml

# Roll back the Helm release if needed
helm rollback phlix
```

For zero-downtime upgrades, the chart uses `RollingUpdate` strategy with `maxSurge: 1` and `maxUnavailable: 0`. Ensure `readinessProbe` is properly configured (it is by default).

To point the deployment at a different image build, set the immutable tag to that build's `<full-sha>-<variant>` value —
because tags are `<full-sha>`-named (see §2), rollback is simply re-deploying the previous run's sha. The `<full-sha>`
placeholders below come from the same anonymous `tags/list` recipe in §2:

```bash
# Deploy a specific commit's generic build:
helm upgrade phlix ./phlix-server/k8s/helm/phlix --set image.tag="<full-sha>-latest"
# Roll back to the previous commit's build (same command, previous sha):
helm upgrade phlix ./phlix-server/k8s/helm/phlix --set image.tag="<previous-full-sha>-latest"
```

There are no semver (`v1.2.3`) image tags to upgrade to — the Docker workflow publishes only `<full-sha>-<variant>`
(immutable) and `latest`/`intel`/`nvidia` (mutable). Do not `--set image.tag=v1.2.3`; that tag has never existed.

---

## What Can Go Wrong

### PVC pending — storage class not found

- **Symptom:** `kubectl get pvc` shows all PVCs `Pending`
- **Cause:** Cluster has no default StorageClass, or the named StorageClass (`nfs`, `cephfs`, etc.) does not exist
- **Fix:** Check available StorageClasses: `kubectl get storageclass`. Then set it explicitly in `values.yaml`:
  ```yaml
  persistence:
    media:
      storageClass: "local-path"
  ```
- **Verify:** `kubectl describe pvc <name>` shows `Waiting for a volume to be created either by the external provisioner`

### OOMKilled — memory limit too low

- **Symptom:** Pod is `OOMKilled` shortly after starting, especially during first-run metadata fetch or FFmpeg probe
- **Cause:** Default memory limit of `2Gi` may be insufficient for libraries with large watch histories or concurrent transcoding
- **Fix:** Increase memory limits in `values.yaml`:
  ```yaml
  resources:
    limits:
      memory: 4Gi
    requests:
      memory: 1Gi
  ```
- **Verify:** `kubectl top pod phlix-xxxxxxxxx` (requires metrics-server) or check `kubectl describe pod` for `Last State: Terminated, Reason: OOMKilled`

### Ingress 502 — ingress controller not found or WebSocket misconfiguration

- **Symptom:** HTTP requests return 502, or WebSocket connections fail immediately
- **Cause 1:** No ingress controller is installed in the cluster
  - **Fix:** Install nginx-ingress: `helm install ingress-nginx ingress-nginx/ingress-nginx --namespace ingress-nginx --create-namespace`
- **Cause 2:** WebSocket annotations missing from Ingress (required for the WebSocket port 3473)
  - **Fix:** Ensure the ingress annotations include the WebSocket proxy directives listed in §6
- **Verify:** `kubectl describe ingress phlix-xxxx` shows backend services correctly; check nginx-ingress logs: `kubectl logs -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx`

---

## Next Steps

- [First run](/first-run) — create the first account (it becomes the administrator) at `https://phlix.example.com`
- [Linux install](/install/linux) — alternative install method on bare metal
- [Docker install](/install/docker) — alternative install method using containers
- [Hardware transcoding](/advanced/hardware-transcoding) — configure NVENC/VAAPI for GPU-accelerated transcoding on Kubernetes nodes
- [Helm chart source](https://github.com/detain/phlix-server/tree/master/k8s/helm/phlix) — the `phlix` chart lives in the `phlix-server` repo (`k8s/helm/phlix`); report chart issues there. (There is no separate `detain/phlix-helm` repo and no published Helm index.)
