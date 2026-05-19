# Hub-Admin: Monitoring & Alerting

## TL;DR

Phlex Hub exposes Prometheus metrics at `/metrics` — servers enrolled, relay sessions active, API request counts and latencies, auth failures, and heartbeat rates. Point Grafana at that endpoint to see the Hub Overview, Relay Bandwidth, API Performance, and Auth Security dashboards. Set up five alert rules (servers offline, relay cap, brute force, API latency, disk usage) to get emailed before users notice problems. Structure all hub logs as JSON and ship them to Loki or your ELK stack, keeping an audit trail of logins, server claims, suspensions, and deletions.

```bash
# Verify hub is healthy
curl https://hub.example.com/api/v1/health
# {"status":"ok","version":"x.y.z","uptime_seconds":123456}

# Verify Prometheus metrics endpoint (auth via basic auth or IP allowlist)
curl -H "Authorization: Basic $(echo -n user:pass | base64)" \
  https://hub.example.com/metrics | grep "^phlex_hub"
```

---

## Prometheus Metrics

**Endpoint:** `GET /metrics` — unauthenticated by default (secure via basic auth or IP allowlist in production)

| Metric | Type | Labels | Description |
|---|---|---|---|
| `phlex_hub_servers_total` | gauge | — | Number of enrolled servers |
| `phlex_hub_users_total` | gauge | — | Total hub users |
| `phlex_hub_relay_sessions_active` | gauge | server_id | Current relay sessions |
| `phlex_hub_relay_bandwidth_bytes_total` | counter | server_id | Total relay bytes transferred |
| `phlex_hub_api_requests_total` | counter | method, route, status | API request count |
| `phlex_hub_api_latency_seconds` | histogram | method, route | API latency histogram |
| `phlex_hub_heartbeat_received_total` | counter | — | Heartbeats received from servers |
| `phlex_hub_auth_failures_total` | counter | reason | Failed login attempts |

### Enabling Basic Auth on `/metrics`

```bash
# In hub config
HUB_METRICS_BASIC_AUTH_USER=prometheus
HUB_METRICS_BASIC_AUTH_PASSWORD=your_secure_password

# Prometheus scrape config
- job_name: phlex-hub
  metrics_path: /metrics
  basic_auth:
    username: prometheus
    password: your_secure_password
  static_configs:
    - targets: ['hub.example.com:443']
```

---

## Grafana Dashboards

Four dashboards ship with the hub. Import them from `contrib/grafana/` or the Grafana.com dashboard registry.

### 1. Hub Overview (ID: `phlex-hub-overview`)

- Servers online / offline count with percentage
- Total hub users
- Active relay sessions vs. `HUB_MAX_RELAY_SESSIONS` cap
- Last heartbeat age per server (heatmap)

### 2. Relay Bandwidth (ID: `phlex-hub-relay`)

- Aggregate relay bandwidth (bytes/sec) across all servers
- Per-server relay bandwidth breakdown (top-10 bar chart)
- Monthly relay bytes per enrolled server
- Current vs. cap on `HUB_MAX_RELAY_SESSIONS`

### 3. API Performance (ID: `phlex-hub-api`)

- Request rate per route and method (lines)
- p50 / p95 / p99 latency per route (heatmap)
- Error rate (4xx + 5xx) per route
- Top 10 slowest API endpoints

### 4. Auth Security (ID: `phlex-hub-auth`)

- Failed login attempts over time (with `reason` label: `invalid_password`, `invalid_totp`, `rate_limited`)
- New hub users registered (counter)
- Suspicious activity: >5 failures in 5 min per IP (annotation on auth failures chart)
- Active sessions count

### Panel Configuration Example — p95 Latency Heatmap

```bash
# PromQL for API latency p95 per route
histogram_quantile(0.95,
  sum(rate(phlex_hub_api_latency_seconds_bucket[5m])) by (le, route)
)
```

---

## Alert Rules

Five alert rules to paste into Grafana Alerting, Prometheus Alertmanager, or your alerting tool of choice.

### 1. HubServersOffline

```bash
# Condition: > 20% of enrolled servers have not sent a heartbeat in 5 min
- alert: HubServersOffline
  expr: |
    (count(phlex_hub_heartbeat_received_total)
     - count(phlex_hub_heartbeat_received_total offset 5m > 0))
    / count(phlex_hub_heartbeat_received_total) > 0.20
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "More than 20% of servers offline"
    description: "{{ $value | humanizePercentage }} of enrolled servers have not sent a heartbeat in 5 minutes."
```

### 2. RelaySessionCapReached

```bash
# Condition: active relay sessions equal to HUB_MAX_RELAY_SESSIONS
- alert: RelaySessionCapReached
  expr: phlex_hub_relay_sessions_active >= HUB_MAX_RELAY_SESSIONS
  for: 1m
  labels:
    severity: warning
  annotations:
    summary: "Relay session cap reached"
    description: "Active relay sessions ({{ $value }}) have hit the HUB_MAX_RELAY_SESSIONS limit. New relay connections will be rejected."
```

### 3. BruteForceAttemptDetected

```bash
# Condition: > 10 auth failures in 5 min
- alert: BruteForceAttemptDetected
  expr: |
    increase(phlex_hub_auth_failures_total[5m]) > 10
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "Brute force attempt detected"
    description: "{{ $value }} failed login attempts in the last 5 minutes. Consider blocking the source IP."
```

### 4. ApiLatencyDegraded

```bash
# Condition: p95 API latency > 2 seconds
- alert: ApiLatencyDegraded
  expr: |
    histogram_quantile(0.95, sum(rate(phlex_hub_api_latency_seconds_bucket[5m])) by (le))
    > 2
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "API latency degraded"
    description: "Hub API p95 latency is {{ $value | humanizeDuration }} — above the 2s threshold."
```

### 5. DiskSpaceLow

```bash
# Condition: disk usage > 80%
# Note: requires a node_exporter or similar exporter on the hub host
- alert: DiskSpaceLow
  expr: |
    (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) < 0.20
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Disk space low on hub host"
    description: "Disk usage is above 80% on {{ $labels.instance }}. Investigate log rotation, old transcode files, or increasing disk size."
```

### Routing Alerts to Email

```bash
# Alertmanager config (alertmanager.yml)
route:
  receiver: hub-admin-email
receivers:
  - name: hub-admin-email
    email_configs:
      - to: hub-admin@example.com
        from: alerts@example.com
        smarthost: smtp.example.com:587
        auth_username: alerts@example.com
        auth_password: $ALERTMANAGER_SMTP_PASSWORD
```

---

## Log Aggregation

### Structured JSON Format

All hub logs are JSON-lines (one JSON object per line) to each service type:

```json
{"level":"info","service":"hub","ts":"2026-01-15T10:30:00Z","msg":"Server claimed","server_id":"srv_abc123","owner_id":"usr_xyz"}
{"level":"warn","service":"hub","ts":"2026-01-15T10:31:00Z","msg":"Auth failure","reason":"invalid_password","ip":"1.2.3.4","user_id":"usr_xyz"}
```

### Two Log Streams

**1. Hub audit log** — high-value admin and security events:
- `user.login` — user_id, ip, user_agent, success/failure
- `user.logout` — user_id, session_id
- `server.claim` — server_id, owner_id, claim_code
- `server.suspend` — server_id, reason, admin_id
- `user.delete` — user_id, deleted_by
- `admin.config_change` — changed_by, config_key, old_value, new_value

**2. Access log** — every API request:
```json
{"level":"info","service":"hub.access","ts":"2026-01-15T10:30:00Z","method":"POST","route":"/api/v1/relay/session","status":200,"user_id":"usr_xyz","server_id":"srv_abc123","duration_ms":45,"ip":"1.2.3.4"}
```

### Shipping to Loki (Grafana Agent)

```bash
# Grafana Agent config (agent.yaml)
server:
  log_level: info

client:
  url: https://loki.example.com/loki/api/v1/push
  basic_auth:
    username: grafana-agent
    password: $LOKI_PASSWORD

scrape_configs:
  - job_name: phlex-hub
    static_configs:
      - targets: ['localhost']
        labels:
          service: phlex-hub
          env: production
    relabel_configs:
      - source_labels: ['service']
        target_label: 'job'
```

### Shipping to ELK (Filebeat)

```bash
# /etc/filebeat/filebeat.yml
filebeat.inputs:
  - type: log
    enabled: true
    json.keys_under_root: true
    fields:
      service: phlex-hub
      env: production
    paths:
      - /var/log/phlex-hub/*.log

output.elasticsearch:
  hosts: ["https://elasticsearch.example.com:9200"]
  username: filebeat
  password: $FILEBEAT_PASSWORD
  ssl.certificate_authorities: ["/etc/ssl/certs/ca.crt"]
```

---

## Uptime Monitoring

### Health Endpoint

`GET /api/v1/health` — returns real-time hub health:

```bash
curl https://hub.example.com/api/v1/health
# {"status":"ok","version":"1.2.3","uptime_seconds":1234567}
```

| Field | Description |
|---|---|
| `status` | `ok` if hub is healthy; `degraded` if some subsystems are degraded; `error` if critical failure |
| `version` | Running hub version |
| `uptime_seconds` | Seconds since hub process started |

### External Uptime Monitors

For public hubs, configure an external monitor from:
- **UptimeRobot** — free tier: 50 monitors, 5-min interval, email alerts
- **BetterStack** — free tier: 10 monitors, 30-sec interval, email/Slack/PagerDuty
- **Gatus** — self-hosted: define endpoints in `gatus.yaml`, deploy alongside hub

### BetterStack Config

```bash
# Create a new monitor in BetterStack dashboard
# URL: https://hub.example.com/api/v1/health
# Expected status: 200
# Expected response: {"status":"ok"}
# Interval: 1 minute
# Alert on: connection failure, SSL expiry, status != 200, response mismatch
```

### Gatus (self-hosted)

```yaml
# gatus.yaml
services:
  - name: phlex-hub
    url: https://hub.example.com/api/v1/health
    interval: 30s
    conditions:
      - "[STATUS] == 200"
      - '[BODY] == "{\"status\":\"ok\"}"'
    alerts:
      - type: email
        enabled: true
        recipients:
          - hub-admin@example.com
```

### SSL Certificate Expiry Check

```bash
# Check SSL cert expiry date
openssl s_client -connect hub.example.com:443 \
  -servername hub.example.com </dev/null 2>/dev/null \
  | openssl x509 -noout -dates

# Add to cron job (check every 7 days)
0 0 */7 * * ~
  openssl s_client -connect hub.example.com:443 \
    -servername hub.example.com </dev/null 2>/dev/null \
    | openssl x509 -noout -dates \
    | grep NotAfter \
    | awk -F'= ' '{print $2}' \
    | while read date; do
        expiry_ts=$(date -d "$date" +%s)
        now_ts=$(date +%s)
        days_left=$(( (expiry_ts - now_ts) / 86400 ))
        if [ $days_left -lt 30 ]; then
          echo "SSL cert expires in $days_left days on $date" \
            | mail -s "SSL Warning: hub.example.com" hub-admin@example.com
        fi
      done
```

---

## What Can Go Wrong

### Metrics Endpoint Not Secured (anyone can scrape)

**Symptom:** Your hub's internal metrics (server IDs, user counts, relay session counts) are publicly accessible.

**Cause:** `/metrics` is unauthenticated by default; operators forgot to add basic auth or IP allowlist.

**Fix:** Add `HUB_METRICS_BASIC_AUTH_USER` / `HUB_METRICS_BASIC_AUTH_PASSWORD` env vars; update your Prometheus scrape config with `basic_auth` block; or restrict access at the reverse proxy (Traefik middleware, nginx allow/deny) to only the Prometheus server IP range.

### Alert Fatigue (too many alerts, thresholds too low)

**Symptom:** Alerts fire constantly for normal operation; operators start ignoring them or silencing the entire group.

**Cause:** `HubServersOffline` threshold too aggressive for servers on intermittent connections; `BruteForceAttemptDetected` fires on legitimate typos; `ApiLatencyDegraded` fires during peak hours.

**Fix:** Raise the threshold to >20% offline for 10 min (not 5 min) to allow reconnecting servers; exclude `rate_limited` from brute-force alert (it fires on the rate limiter, not a real attack); set `ApiLatencyDegraded` `for: 10m` instead of `5m`; review alert severity labels and route warning vs. critical to different receivers.

### Grafana Dashboard Empty (Prometheus scraper not configured)

**Symptom:** Grafana shows "No data" on all hub panels despite hub running.

**Cause:** Prometheus not scraping the hub `/metrics` endpoint — wrong URL path, missing `metrics_path`, basic auth credentials mismatch, TLS verification failure, or hub not reachable from Prometheus.

**Fix:** Check `targets` in Prometheus UI (Status → Targets); verify `metrics_path: /metrics` is set; for TLS, add `tls_config: { insecure_skip_verify: false }` if using self-signed certs; test curl from Prometheus host to hub metrics endpoint with the same auth; check Prometheus logs for scrape errors.

---

## Next Steps

- [Hub claim and enrollment](hub-admin/enrollment.md) — enrolling your first server with the hub
- [Hub admin panel reference](hub-admin/panel-reference.md) — full reference for the hub admin UI
- [Relay tunnel deep-dive](hub-admin/relay-tunnel.md) — how the WSS relay works
- [Troubleshooting](troubleshooting.md) — diagnose metrics gaps, alert firing, and dashboard issues
- [Hub capacity planning](hub-admin/capacity-planning.md) — sizing hub hardware based on server and user count
