# Hub-Admin: Scaling

## TL;DR

Hub persistent state — users, server registry, grants, and audit logs — lives entirely in MariaDB; there is no Redis. JWT validation is stateless (HS256, no server-side session store). Horizontal scaling is straightforward for the HTTP API: add hub instances behind a load balancer and point them all at the same database. The one caveat is the relay: relay tunnel and session state is held **in-process** by each hub instance (Workerman `RelaySessionManager`/`TunnelManager`), so a server's WSS tunnel is bound to the single instance that holds it — use sticky sessions so each server's connection consistently lands on the same instance. Database backups use `mysqldump` with binlog for point-in-time recovery; offsite copies go to S3/R2 with 30-day retention. Restore drills should be run quarterly to catch corrupt or incomplete backups before a real disaster. RTO target is under 15 minutes with automated failover; RPO is under 4 hours.

| Metric | Target |
|---|---|
| RTO | < 15 minutes |
| RPO | < 4 hours |
| Hub instances | 2+ recommended |
| DB replication | MariaDB Galera (multi-master) or single primary + read replica |
| Relay state | In-process per hub instance (not shared); requires sticky sessions |
| Backup retention | 30 days offsite |

---

## Multi-Region / Horizontal Scaling

### Architecture Overview

- Persistent state lives entirely in MariaDB (users, server registry, grants, audit logs); there is no Redis
- Relay tunnel/session state is **not** persisted — it is held in-process by each hub instance's Workerman `RelaySessionManager`/`TunnelManager`, so it is per-instance and not shared
- Multiple hub instances share the same database behind a load balancer
- Each server maintains one persistent WSS connection; that connection must stick to the instance that holds its tunnel, so route servers via sticky sessions (source IP hash)
- Docker Swarm or Kubernetes for orchestration; `docker-compose up --scale phlix-hub=2` for simple HA

### Deployment Topology

```yaml
# Minimal HA stack (docker-compose)
# 2 hub instances + nginx load balancer + MariaDB primary + 1 read replica
services:
  phlix-hub:
    image: phlix/hub:latest
    deploy:
      replicas: 2
    environment:
      HUB_DB_HOST: hub-db
      HUB_DB_USER: phlix_hub
      HUB_DB_NAME: hub_db
    depends_on:
      - hub-db

  nginx:
    image: nginx:latest
    ports:
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - phlix-hub

  hub-db:
    image: mariadb:10.11
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_ROOT_PASSWORD}
      MYSQL_DATABASE: hub_db
      MYSQL_USER: phlix_hub
      MYSQL_PASSWORD: ${DB_PASSWORD}
    volumes:
      - hub-db-data:/var/lib/mysql

  hub-db-replica:
    image: mariadb:10.11
    command: --read-only
    depends_on:
      - hub-db
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_ROOT_PASSWORD}
      MYSQL_DATABASE: hub_db
      MYSQL_USER: phlix_hub
      MYSQL_PASSWORD: ${DB_PASSWORD}
      MYSQL_MASTER_HOST: hub-db
```

### Sticky Sessions (relay affinity)

```bash
# nginx upstream with ip_hash for sticky sessions
# Each server's WSS connection lands on the same hub instance
upstream phlix_hub_backend {
    ip_hash;
    server phlix-hub-1:8443;
    server phlix-hub-2:8443;
}
```

- Without sticky sessions, a server's WSS connection would be routed to different hub instances, breaking relay state
- For Kubernetes: use an Ingress with `sessionAffinity: ClientIP`
- For Docker Swarm: use `docker-compose up --scale phlix-hub=2` with a compatible reverse proxy

---

## Database Backups

### Full mysqldump

```bash
# Daily full backup
mysqldump -h hub-db -u phlix_hub -p hub_db > hub-backup-$(date +%Y%m%d).sql

# Verify the dump is valid before archiving
grep -c "INSERT INTO" hub-backup-$(date +%Y%m%d).sql
# Expected: table count > 0
```

### Point-in-Time Recovery (binlog)

```bash
# Ensure binlog is enabled on the primary
# Check in my.cnf or via:
SHOW VARIABLES LIKE 'log_bin';

# If binlog is enabled, replay to a specific time:
mysqlbinlog --stop-datetime="2025-06-01 12:00:00" /var/lib/mysql/mysql-bin.* | \
  mysql -h hub-db -u phlix_hub -p hub_db
```

### Incremental Backup (every 4 hours)

```bash
# Copy binlog files since last full backup
cp /var/lib/mysql/mysql-bin.{n} /backup/binlog-incremental-$(date +%Y%m%d%H%M)/
# Or use mysqlbinlog to dump the active binlog since last backup:
mysqlbinlog --read-from-remote-server \
  --host=hub-db \
  --user=phlix_hub \
  --password \
  --stop-never \
  mysql-bin.000123 > hub-incremental-$(date +%Y%m%d%H%M).sql
```

### Off-Site Copy

```bash
# Copy daily full backup to S3/R2 with 30-day retention
aws s3 cp hub-backup-$(date +%Y%m%d).sql s3://your-hub-backups/hub/
# Or with rclone:
rclone copy hub-backup-$(date +%Y%m%d).sql remote:hub-backups/hub/ \
  --excludes "*.tmp"

# Retention: 30 days
rclone delete remote:hub-backups/hub/ --min-age 30d
```

---

## Restore Drill

Run this quarterly. Do NOT wait for a real disaster to discover your backups are corrupt.

### Step 1 — Stop Hub Instances

```bash
# Stop all hub instances (avoid writes during restore)
docker-compose stop phlix-hub
# Or for Kubernetes:
kubectl scale deployment phlix-hub --replicas=0
```

### Step 2 — Restore the Database

```bash
# Restore from latest full backup
mysql -h hub-db -u phlix_hub -p hub_db < hub-backup-20250601.sql

# If point-in-time recovery is needed, replay binlog:
mysqlbinlog --stop-datetime="2025-06-01 12:00:00" \
  /var/lib/mysql/mysql-bin.* | \
  mysql -h hub-db -u phlix_hub -p hub_db
```

### Step 3 — Restart Hub Instances

```bash
# Verify DB is accessible and schema is current
docker-compose up -d phlix-hub
# Or for Kubernetes:
kubectl scale deployment phlix-hub --replicas=2
```

### Step 4 — Verify

```bash
# Verify users can log in
curl -X POST https://your-hub.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@yourhub.com","password":"testpassword"}'

# Verify enrolled servers and relay sessions via the admin dashboard summary
# (requires an admin JWT). The console at /app/admin/dashboard shows the same data.
curl -s -H "Authorization: Bearer $ADMIN_JWT" \
  https://your-hub.com/api/v1/admin/dashboard/summary
# -> servers (total/online/offline), active relay sessions, pending requests, user count

# Recent activity feed (server claims, logins, etc.)
curl -s -H "Authorization: Bearer $ADMIN_JWT" \
  https://your-hub.com/api/v1/admin/dashboard/activity
```

---

## Failover Playbook

### Hub Instance Down

- **Detection:** Load balancer health check fails (`/health` endpoint returns non-200)
- **Response:** Load balancer automatically routes new traffic to healthy instance(s)
- **Recovery:** Restart crashed container/pod. No persistent data is lost (all of that is in MariaDB), but any relay tunnels that were held in-process on the dead instance are dropped — the affected servers reconnect (landing on a healthy instance via sticky sessions) and re-establish their tunnels
- **RTO:** < 1 minute

### Database Down

- **Detection:** Hub instances report DB connection errors in logs
- **Response:** If using Galera multi-master, remaining nodes continue serving
- **If single primary + read replica:** promote read replica to primary
  ```bash
  # On the read replica, stop writes and promote:
  STOP SLAVE;
  RESET SLAVE ALL;
  # Update hub connection strings to point at new primary
  ```
- **RTO:** < 15 minutes (automated failover preferred)
- **RPO:** < 4 hours (last full backup + binlog replay)

### Relay Tunnels Dropped (instance restart / failover)

- **Symptom:** Active relay sessions on a restarted or failed-over instance drop; clients must reconnect after timeout (~30s)
- **Cause:** Relay tunnel/session state is held in-process per hub instance (`RelaySessionManager`/`TunnelManager`); it is not persisted anywhere, so it does not survive that instance restarting or its connections moving to another instance
- **Recovery:** Servers reconnect automatically; clients resume from their own last reported stream position (server-side), not from any hub-held state
- **RTO:** < 5 minutes (servers re-establish WSS tunnels after reconnect)
- **RPO:** N/A (no persistent relay state is needed for playback resumption)

### Summary RTO/RPO

| Failure | RTO | RPO |
|---|---|---|
| Hub instance crash | < 1 minute (LB routes to other instance) | N/A (no persistent state on the instance) |
| DB primary crash | < 15 minutes (automated failover or manual promote) | < 4 hours |
| Relay tunnels dropped (instance restart) | < 5 minutes (servers reconnect, tunnels re-establish) | N/A |
| Full site failure | < 15 minutes (restore from backup in new region) | < 4 hours |

---

## What Can Go Wrong

### Galera Cluster Split-Brain (network partition)

**Symptom:** Two sets of Galera nodes accept writes independently; data diverges; corruption on reconnect.

**Cause:** Network partition without proper quorum configuration; `pc.recovery` not enabled.

**Fix:** Configure proper quorum: set `pc.wait_prim=true` and `pc.ignore_splits=true`; ensure at least 3 nodes in cluster; enable `pc.recovery=true` so cluster recovers state on restart; always validate with a network-partition test drill.

**Prevention:** Minimum 3 nodes, odd node count, proper network isolation testing in staging.

### Sticky Sessions Missing (relay tunnels break across instances)

**Symptom:** With more than one hub instance, server WSS tunnels flap or relay sessions appear to vanish; the admin dashboard shows inconsistent relay-session counts.

**Cause:** Relay tunnel/session state is held in-process per instance (`RelaySessionManager`/`TunnelManager`) and is not shared. Without sticky sessions, a server's connection (or its frames) can be routed to an instance that does not hold its tunnel.

**Fix:** Enable sticky sessions at the load balancer (nginx `ip_hash`, Kubernetes Ingress `sessionAffinity: ClientIP`) so each server consistently lands on the instance that holds its tunnel. When totalling relay sessions across the fleet, query each instance's `/api/v1/admin/dashboard/summary` directly rather than a single load-balanced response.

**Prevention:** Verify sticky sessions before scaling past one instance; test instance failover in staging and confirm servers re-establish tunnels.

### Backup Not Tested (restore fails when needed)

**Symptom:** Full disaster strikes; backup file is corrupt, incomplete, or from wrong point in time.

**Cause:** Backups run on schedule but are never validated; disk full at backup destination causes truncated files.

**Fix:** Run a full restore drill quarterly on an isolated environment; verify checksum (`sha256sum`) of every backup immediately after creation; store checksum alongside backup.

**Prevention:** Automate restore drill notification; alert if backup size drops below expected minimum.

### binlog Not Enabled (point-in-time recovery impossible)

**Symptom:** DB crashes; full backup is 3 days old; 3 days of new users, server enrollments, and grants are lost.

**Cause:** `log_bin` was not enabled in `my.cnf`; PITR is not possible without it.

**Fix:** Enable binlog before disaster: `log_bin=mysql-bin` in my.cnf and restart; for existing data, take a fresh full backup immediately after enabling; document this in the operations runbook.

**Prevention:** Verify binlog is enabled in all DB nodes during setup; check with `SHOW VARIABLES LIKE 'log_bin';` in initial deployment checklist.

### Load Balancer Health Check Misconfigured (routes to unhealthy instance)

**Symptom:** Users see 502s or connection timeouts; hub logs show requests from unhealthy instance.

**Cause:** Health check interval too long (e.g., 60s); or you rely solely on `/health`, which is a static liveness payload that checks nothing — it returns 200 even when the instance is actually degraded (DB connection pool depleted, relay tunnels exhausted), so the load balancer keeps routing to a broken instance.

**Fix:** Use `/health` only as a liveness probe (process up / not up) and keep the interval tight — `interval: 5s`, `timeout: 3s`. For deeper health, layer on out-of-band checks your tooling controls: probe the DB, and poll `/api/v1/admin/dashboard/summary` for relay-session counts; drain an instance from the pool when those checks fail. Test the health check manually before deploying.

**Prevention:** Canary deploy new hub versions with brief health check window; monitor both healthy and unhealthy state transitions in alerting.

---

## Next Steps

- [Hub-admin capacity planning](capacity-planning.md) — sizing hub hardware for your user base
- [Hub claim and setup](../hub/claim-server.md) — understanding server claiming and hub identity
- [Hub relay tunnel](relay-tuning.md) — how the WSS relay actually works under the hood
- [Hub-admin install & first boot](install.md) — hub setup and admin account creation
