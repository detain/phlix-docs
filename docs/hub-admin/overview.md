# Hub Admin Overview

The **Hub Admin** section covers running and operating a self-hosted [Phlix Hub](../hub/what-is-the-hub.md) —
the cloud directory + reverse-tunnel relay that lets your media servers be reached from anywhere.

This page is the entry point: it explains the **web admin console** (the Vue single-page app you
manage the Hub from) and the **operational CLI reference** (the commands you run on the host). The
rest of the section drills into install, capacity, tuning, monitoring, and policy.

## The Hub web UI

Once the Hub is running, its web UI is the **Vue single-page app** (built on the shared `@phlix/ui`
design system) served by the HTTP worker on the public port (default `8800`). The bare root
**redirects into the app** — `GET /` → `/app/servers` — and the SPA is served at `/app` and every
`/app/*` deep link; it handles its own sign-in. (The Hub's original server-rendered Smarty pages —
`/login`, `/my-servers`, `/claim-server`, `/manage-shares`, … — still resolve directly, but the SPA
is the front door now.)

The **first account created becomes an admin automatically** (see [Install](./install.md)); the SPA
reads `is_admin` from `GET /api/v1/auth/me` and shows the **Admin** nav entry only to admins.

### Primary nav (any signed-in user)

| Page | Path | What it does |
|------|------|--------------|
| My Servers | `/app/servers` | Your claimed servers + live heartbeat status; claim a new server here |
| Federation | `/app/federation` | Peer-hub federation: peers, cross-hub library shares, admin delegation |
| Shares | `/app/shares` | Libraries you share and libraries shared with you, with permission levels |

### Admin console (admins only)

The gated **Admin** entry opens the shared admin console at `/app/admin/*` — five pages: Hub
Dashboard, Users, Logs, Settings, and Audit Logs. It is backed by the `/api/v1/admin/*` API and is
documented in full on the **[Admin Console](./admin-console.md)** page.

| Page | Path |
|------|------|
| Hub Dashboard | `/app/admin/dashboard` |
| Users | `/app/admin/users` |
| Logs | `/app/admin/logs` |
| Settings | `/app/admin/settings` |
| Audit Logs | `/app/admin/audit-logs` |

Admin-only pages and APIs are gated server-side by `AdminMiddleware` (**401 `auth.required`** when
unauthenticated, **403 `auth.not_admin`** for a non-admin) and require an account with the
`is_admin` flag. The first registered user gets it automatically; there is no separate
"create admin" step.

A machine-readable health probe is always available at `/health`:

```bash
curl http://localhost:8800/health
# => {"status":"ok", ...}
```

## Admin & operations CLI reference

The Hub is operated from the project root with plain PHP entry points — there is no separate
`hub` binary. The two commands you use day-to-day are the process controller
(`public/index.php`) and the migration runner (`scripts/run-migrations.php`).

### Process control — `public/index.php`

The HTTP, relay, and client-relay workers are managed by [Workerman](https://www.workerman.net/),
which exposes the standard start/stop verbs:

```bash
php public/index.php start        # run in the foreground
php public/index.php start -d     # run as a daemon
php public/index.php stop         # stop all workers
php public/index.php restart      # stop, then start
php public/index.php reload       # graceful reload (zero-downtime code reload)
php public/index.php status       # show worker status
php public/index.php connections  # list active connections
```

Under systemd, use the foreground form (`start`) with `Type=simple` — see the
[install guide](./install.md).

### Database migrations — `scripts/run-migrations.php`

```bash
php scripts/run-migrations.php
```

Applies every SQL file in `migrations/` in order. The runner records what it has applied in a
`migrations` table, so it is **idempotent** — re-running after a successful apply is a no-op.
There is no destructive `--force` flag; to start over, drop and recreate the database, then
re-run.

### JWT smoke test — `scripts/smoke-jwt-roundtrip.php`

```bash
php scripts/smoke-jwt-roundtrip.php
```

Mints an access token with the Hub's configured secret, validates it back, and prints the
decoded claims. Exits non-zero on mismatch — handy for confirming `HUB_JWT_SECRET` is wired up
after a deploy.

### Creating and promoting admins

There is no user-management CLI. Admins are bootstrapped by **signup**:

- The **first** account registered at `/signup` is auto-promoted to admin.
- Additional admins are granted by setting `is_admin = 1` on their row in the `users` table.

## Configuration at a glance

The Hub is configured entirely through `HUB_*` environment variables (database, JWT, public
domain, ports). The [Install](./install.md) page documents every variable and a full Ubuntu /
Docker walkthrough.

## Where to next

- [Admin Console](./admin-console.md) — the web admin console (Hub Dashboard, Users, Logs, Settings, Audit Logs)
- [Install](./install.md) — deploy the Hub (Docker, source, reverse-proxy TLS)
- [First Boot](./first-boot.md) — create the first admin and pair a server
- [Capacity Planning](./capacity-planning.md) — size the host for your user base
- [Relay Tuning](./relay-tuning.md) — tune the reverse-tunnel relay
- [Monitoring & Alerting](./monitoring-alerting.md) — dashboards, metrics, alerts
- [Scaling](./scaling.md) — run multiple Hub nodes
- [Backup & Restore](./backup-restore.md) — protect Hub state
- [TLS Certificates](./tls.md) — certificates for server subdomains
