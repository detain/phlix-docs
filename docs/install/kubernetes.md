# Install phlex-server on Kubernetes

## TL;DR

phlex-server is a PHP 8.3+ media server with HLS streaming, WebSocket real-time sync, DLNA, and a Smarty web portal. This guide deploys it on Kubernetes via Helm in roughly 10 minutes.

**Minimum requirements:** Kubernetes 1.21+, Helm 3.8+, a `default` or named StorageClass, 2 CPU / 4 GB RAM per pod.

**Quick one-liner:**

```bash
helm repo add phlex https://charts.phlex.media && helm repo update
helm install phlex phlex/phlex \
  --set config.database_password=SECRET \
  --set config.secret_key=YOUR_KEY \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=phlex.example.com
```

Then open `https://phlex.example.com` in your browser.

::: tip Screenshots TBD
This guide is text-first. Screenshots will be added in a follow-up.
:::

---

## 1. Prerequisites

| Component | Minimum version | Notes |
|-----------|-----------------|-------|
| Kubernetes | 1.21+ | |
| Helm | 3.8+ | |
| Ingress controller | nginx-ingress or Traefik | with cert-manager for automated TLS |
| StorageClass | default or named | Required for PVCs |
| NVIDIA GPU (optional) | Driver 525+ | For hardware transcoding |
| MySQL (optional) | External or in-cluster | Or use the chart's embedded DB |

---

## 2. Add the Helm repository

```bash
helm repo add phlex https://charts.phlex.media
helm repo update
helm search repo phlex/phlex   # confirm latest chart version
```

---

## 3. Minimal values.yaml

```yaml
replicaCount: 1

image:
  repository: ghcr.io/detain/phlex-server
  pullPolicy: IfNotPresent
  tag: "latest"   # pin to a specific release tag in production

ingress:
  enabled: true
  className: "nginx"
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "86400"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "86400"
    nginx.ingress.kubernetes.io/upstream-hdrs: "Upgrade"
    nginx.ingress.kubernetes.io/websocket-services: "phlex-websocket"
  hosts:
    - host: phlex.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: phlex-tls
      hosts:
        - phlex.example.com

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
  database_name: phlex
  database_user: phlex
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

Save as `values.yaml` and install with:

```bash
helm install phlex phlex/phlex -f values.yaml
```

---

## 4. Required PersistentVolumeClaims

The Helm chart creates three PVCs automatically:

```bash
kubectl get pvc | grep phlex
```

| PVC name | Purpose | Default size | Access mode |
|----------|---------|--------------|-------------|
| `phlex-media` | Media files (read-only mount) | 100 Gi | ReadWriteOnce |
| `phlex-data` | Application data (DB, watch history) | 10 Gi | ReadWriteOnce |
| `phlex-config` | Config directory | 1 Gi | ReadWriteOnce |

> **StorageClass:** If your cluster has no default StorageClass, you must set `persistence.media.storageClass` explicitly (e.g., `local-path`, `nfs`, `cephfs`). Using a StorageClass that supports `ReadWriteMany` (e.g., NFS) is required for the media PVC to be mounted read-only by multiple pods.

---

## 5. Service type

### 5a. ClusterIP (default — requires Ingress)

```yaml
service:
  type: ClusterIP
  http:
    port: 80
```

Access via Ingress at `https://phlex.example.com`.

### 5b. LoadBalancer

```yaml
service:
  type: LoadBalancer
  http:
    port: 80
```

Exposes phlex directly on a cloud LB. For on-premises, MetalLB can provide this.

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
    nginx.ingress.kubernetes.io/websocket-services: "phlex-websocket"
    nginx.ingress.kubernetes.io/use-regex: "true"
```

### Traefik

```yaml
ingress:
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    traefik.ingress.kubernetes.io/router.entrypoints: "websecure"
    traefik.ingress.kubernetes.io/router.http-services: "phlex-http"
    traefik.ingress.kubernetes.io/router.headers.customrequestheaders: "Upgrade: websocket"
```

If using Traefik's `IngressRoute` CRD instead of plain Ingress, see the [Traefik docs](https://doc.traefik.io/traefik/routing/providers/kubernetes-ingress/).

---

## 7. Environment variables

The chart passes these to the pod automatically via `PHLEX_*` env vars:

| Env var | Description | Example |
|---------|-------------|---------|
| `PHLEX_DATABASE_HOST` | MySQL host | `mysql.default.svc.cluster.local` |
| `PHLEX_DATABASE_PORT` | MySQL port | `3306` |
| `PHLEX_DATABASE_NAME` | Database name | `phlex` |
| `PHLEX_DATABASE_USER` | Database user | `phlex` |
| `PHLEX_DATABASE_PASSWORD` | Database password | from Kubernetes Secret |
| `PHLEX_SECRET_KEY` | JWT/signing key | from Kubernetes Secret |
| `PHLEX_LOG_LEVEL` | Log verbosity | `info`, `debug` |
| `PHLEX_HTTP_PORT` | Internal HTTP port | `80` |

Set passwords/keys via the chart's secrets mechanism (required):

```bash
helm install phlex phlex/phlex \
  --set config.database_password=STRONG_PASSWORD \
  --set config.secret_key=YOUR_32_CHAR_SECRET
```

Or pre-create a Kubernetes Secret and reference it in `values.yaml`.

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

When a new chart or image version is released:

```bash
# Update chart repo
helm repo update

# Check what would change
helm diff upgrade phlex phlex/phlex -f values.yaml

# Apply the upgrade
helm upgrade phlex phlex/phlex -f values.yaml

# Roll back if needed
helm rollback phlex
```

For zero-downtime upgrades, the chart uses `RollingUpdate` strategy with `maxSurge: 1` and `maxUnavailable: 0`. Ensure `readinessProbe` is properly configured (it is by default).

To update only the Docker image tag:

```bash
helm upgrade phlex phlex/phlex --set image.tag=v1.2.3
```

---

## What can go wrong

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
- **Verify:** `kubectl top pod phlex-xxxxxxxxx` (requires metrics-server) or check `kubectl describe pod` for `Last State: Terminated, Reason: OOMKilled`

### Ingress 502 — ingress controller not found or WebSocket misconfiguration

- **Symptom:** HTTP requests return 502, or WebSocket connections fail immediately
- **Cause 1:** No ingress controller is installed in the cluster
  - **Fix:** Install nginx-ingress: `helm install ingress-nginx ingress-nginx/ingress-nginx --namespace ingress-nginx --create-namespace`
- **Cause 2:** WebSocket annotations missing from Ingress (required for the WebSocket port 3473)
  - **Fix:** Ensure the ingress annotations include the WebSocket proxy directives listed in §6
- **Verify:** `kubectl describe ingress phlex-xxxx` shows backend services correctly; check nginx-ingress logs: `kubectl logs -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx`

---

## Next steps

- [First-run wizard](/first-run) — complete the browser-based setup at `https://phlex.example.com`
- [Linux install](/install/linux) — alternative install method on bare metal
- [Docker install](/install/docker) — alternative install method using containers
- [Hardware transcoding](/advanced/hardware-transcoding) — configure NVENC/VAAPI for GPU-accelerated transcoding on Kubernetes nodes
- [Helm chart source (O.3)](https://github.com/detain/phlex-helm) — report chart issues or contributing improvements
