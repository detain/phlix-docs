# Hub-Admin: Monitoring & Alerting

## TL;DR

Phlix Hub exposes a single liveness endpoint, `GET /health`, that returns a small static JSON payload (status, service, version, phlixShared, timestamp). It does **not** ship a Prometheus `/metrics` endpoint. Monitor the hub by polling `/health` from an external uptime monitor, tailing the systemd journal (`journalctl -u phlix-hub`), querying the hub's MySQL/MariaDB tables, and reading fleet/relay/request/user counts from the admin dashboard summary (`GET /api/v1/admin/dashboard/summary`). Keep an audit trail of logins, server claims, suspensions, and deletions, and ship structured logs to Loki or your ELK stack.

```bash
# Verify hub is healthy (static liveness JSON, no DB query)
curl https://hub.example.com/health
# {"status":"ok","service":"phlix-hub","version":"x.y.z","phlixShared":"x.y.z","timestamp":1700000000}

# Read fleet/relay/request/user counts (requires an admin JWT)
curl -H "Authorization: Bearer $ADMIN_JWT" \
  https://hub.example.com/api/v1/admin/dashboard/summary
```

---

## What You Can Monitor

The hub does **not** expose a Prometheus `/metrics` endpoint and has no Prometheus instrumentation. There are four practical signals you can monitor today:

### 1. `/health` liveness probe

`GET /health` returns a static JSON liveness payload and queries nothing — it is safe to hit while the rest of the stack is still starting up. Use it for load-balancer health checks and external uptime monitors (see [Uptime Monitoring](#uptime-monitoring)). It tells you the process is up and which versions are running; it does **not** report subsystem health.

### 2. systemd / journal logs

The hub runs as a long-lived Workerman daemon (`php start.php start`). When supervised by systemd, follow its output with:

```bash
# Live tail of the hub daemon
journalctl -u phlix-hub -f

# Errors only, last hour
journalctl -u phlix-hub --since "1 hour ago" -p err
```

Ship these logs to Loki or ELK for retention and alerting (see [Log Aggregation](#log-aggregation)).

### 3. MySQL/MariaDB queries

The hub stores all persistent state (users, server registry, grants, relay session records, audit logs) in MySQL/MariaDB. Query the hub database directly for ad-hoc operational checks, for example:

```sql
-- Enrolled servers and how recently each checked in
SELECT id, name, last_seen_at FROM servers ORDER BY last_seen_at DESC;

-- Recent failed logins (brute-force signal)
SELECT ip, COUNT(*) AS failures
FROM audit_logs
WHERE action = 'user.login' AND success = 0
  AND created_at > NOW() - INTERVAL 5 MINUTE
GROUP BY ip ORDER BY failures DESC;
```

(Adjust column/table names to your schema; inspect with `SHOW TABLES;` / `DESCRIBE <table>;`.)

### 4. Admin dashboard summary

The admin console aggregates fleet, relay, request, and user counts. Read them programmatically from:

- `GET /api/v1/admin/dashboard/summary` — servers (total / online / offline), active relay sessions, pending requests, and user count.
- `GET /api/v1/admin/dashboard/activity` — recent activity feed.

Both require an authenticated admin JWT (`[AuthMiddleware, AdminMiddleware]`) and back the `/app/admin/dashboard` page. Poll the summary endpoint on an interval and alert on threshold crossings (for example, online server count dropping) from your own tooling.

::: tip In-process relay state
Relay tunnel/session state lives in the in-process Workerman managers (`RelaySessionManager`, `TunnelManager`) on each hub instance, so the relay-session count returned by the dashboard summary reflects the instance that answered the request. With multiple hub instances behind a load balancer, query each instance to see the full picture.
:::

---

## Dashboards & Alerting

The hub ships no Grafana dashboards and no Prometheus metrics, so there are no PromQL panels or `phlix_hub_*` alert rules to import. Build dashboards and alerts on the real signals instead: the admin dashboard summary endpoint, the hub's MySQL/MariaDB tables, the structured logs, and host-level metrics from a generic exporter such as `node_exporter`.

### Fleet & relay status

The built-in admin console at `/app/admin/dashboard` already renders servers online/offline, active relay sessions, pending requests, and user count. For your own dashboards or alerting, poll the underlying API on an interval and compare against thresholds in your tooling:

```bash
# Poll fleet/relay/request/user counts (requires an admin JWT)
curl -s -H "Authorization: Bearer $ADMIN_JWT" \
  https://hub.example.com/api/v1/admin/dashboard/summary
# -> servers (total/online/offline), active relay sessions, pending requests, user count
```

Because relay session state is held in-process per hub instance (`RelaySessionManager`/`TunnelManager`), poll each instance to total relay sessions across a multi-instance deployment.

### Suggested alert conditions

You can express these conditions in any scheduler/alerting tool by querying the database or the summary endpoint; the hub does not evaluate them for you.

| Condition | Source signal | Threshold idea |
|---|---|---|
| Servers offline | `summary` online vs. total, or `last_seen_at` age in the `servers` table | > 20% offline for 10 min |
| Relay sessions high | `summary` active relay sessions (per instance) | Approaching your configured relay cap |
| Brute-force attempts | failed-login rows in `audit_logs` grouped by IP | > 10 failures from one IP in 5 min |
| Disk space low | host `node_exporter` (filesystem free), not the hub itself | < 20% free on `/` |
| Hub process down | `/health` not returning HTTP 200 | Any failed probe (see [Uptime Monitoring](#uptime-monitoring)) |

### Disk space (host-level)

Disk pressure on the hub host is a host concern, not a hub metric. If you run `node_exporter` on the host, a standard Prometheus rule covers it:

```yaml
- alert: HubHostDiskSpaceLow
  expr: |
    (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) < 0.20
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Disk space low on hub host"
    description: "Disk usage is above 80% on {{ $labels.instance }}. Investigate log rotation and old backup files."
```

### Routing alerts to email

Once your tooling evaluates the conditions above, route notifications however you prefer — for example with Prometheus Alertmanager driven by your `node_exporter` host rules:

```yaml
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
  - job_name: phlix-hub
    static_configs:
      - targets: ['localhost']
        labels:
          service: phlix-hub
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
      service: phlix-hub
      env: production
    paths:
      - /var/log/phlix-hub/*.log

output.elasticsearch:
  hosts: ["https://elasticsearch.example.com:9200"]
  username: filebeat
  password: $FILEBEAT_PASSWORD
  ssl.certificate_authorities: ["/etc/ssl/certs/ca.crt"]
```

---

## Uptime Monitoring

### Health Endpoint

`GET /health` — returns the hub's liveness JSON. It is a static payload built without touching the database, so it confirms the process is up and which versions are running, but it does **not** compute subsystem health:

```bash
curl https://hub.example.com/health
# {"status":"ok","service":"phlix-hub","version":"1.2.3","phlixShared":"1.2.3","timestamp":1700000000}
```

| Field | Description |
|---|---|
| `status` | Always the literal string `"ok"` — a liveness indicator, **not** a computed health verdict (there is no `degraded`/`error` logic) |
| `service` | Service identity; always `"phlix-hub"` |
| `version` | Running `phlix-hub` version |
| `phlixShared` | Version of the bundled `Phlix\Shared` package |
| `timestamp` | Unix timestamp (seconds) when the response was generated |

### External Uptime Monitors

For public hubs, configure an external monitor from:
- **UptimeRobot** — free tier: 50 monitors, 5-min interval, email alerts
- **BetterStack** — free tier: 10 monitors, 30-sec interval, email/Slack/PagerDuty
- **Gatus** — self-hosted: define endpoints in `gatus.yaml`, deploy alongside hub

### BetterStack Config

```bash
# Create a new monitor in BetterStack dashboard
# URL: https://hub.example.com/health
# Expected status: 200
# Expected response to contain: "status":"ok"
# Interval: 1 minute
# Alert on: connection failure, SSL expiry, status != 200, response mismatch
```

### Gatus (self-hosted)

```yaml
# gatus.yaml
services:
  - name: phlix-hub
    url: https://hub.example.com/health
    interval: 30s
    conditions:
      - "[STATUS] == 200"
      - '[BODY].status == "ok"'
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

### Expecting a `/metrics` Endpoint (there isn't one)

**Symptom:** Prometheus scrape of the hub fails; Grafana panels show "No data"; `curl .../metrics` returns 404.

**Cause:** The hub has no Prometheus instrumentation and no `/metrics` endpoint — only the static `/health` liveness route.

**Fix:** Don't scrape the hub for metrics. Drive dashboards and alerts off the real signals instead: the admin dashboard summary (`/api/v1/admin/dashboard/summary`), MySQL/MariaDB queries, structured logs, and host-level `node_exporter`. See [Dashboards & Alerting](#dashboards-alerting).

### Health Check Treated as a Health Verdict (false confidence)

**Symptom:** Monitors stay green while users hit failures, because the monitor only checks `/health`.

**Cause:** `/health` is a liveness probe — it returns a static `"ok"` and never queries the database or relay subsystem, so it cannot detect a degraded DB connection or an exhausted relay capacity.

**Fix:** Treat `/health` as "the process is up", nothing more. Layer on DB-level checks (query the hub tables) and the admin summary endpoint (online server / relay-session counts) for real subsystem visibility, and alert on those.

### Admin Endpoint Poll Returns 401/403 (missing admin JWT)

**Symptom:** Your dashboard-summary poller logs `auth.required` (401) or a 403, so fleet/relay panels never populate.

**Cause:** `/api/v1/admin/dashboard/summary` is gated by `[AuthMiddleware, AdminMiddleware]`; an anonymous or non-admin request is rejected.

**Fix:** Authenticate the poller with an admin JWT (`Authorization: Bearer <token>`) belonging to an admin account; confirm the token has not expired.

### Relay Session Count Looks Wrong Across Instances (per-instance state)

**Symptom:** The relay-session count reported by the summary endpoint jumps around or undercounts when you run multiple hub instances.

**Cause:** Relay tunnel/session state lives in the in-process Workerman managers (`RelaySessionManager`, `TunnelManager`) on whichever instance answered the request; it is not shared across instances.

**Fix:** Query each hub instance's summary endpoint directly (bypassing the load balancer) and sum the counts, rather than reading a single load-balanced response.

---

## Next Steps

- [Hub claim and first boot](first-boot.md) — enrolling your first server with the hub
- [Hub-admin install & first boot](install.md) — hub setup and admin account creation
- [Relay tunnel deep-dive](relay-tuning.md) — how the WSS relay works
- [Troubleshooting](../troubleshooting.md) — diagnose health-check failures, log gaps, and dashboard issues
- [Hub capacity planning](capacity-planning.md) — sizing hub hardware based on server and user count
