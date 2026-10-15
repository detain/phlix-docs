---
title: Backup & Restore
description: Hub backup and disaster recovery runbook — database, signing key, secrets
---

# Backup & Restore

There is **no backup page or button in the Hub admin UI** — the Hub ships no backup feature. Everything a Hub needs to live is in three places you back up yourself: the MySQL database, the Ed25519 signing key file, and the environment (secrets) file. This page is the runbook.

## What to back up

| Asset | Location | Contains |
|-------|----------|----------|
| Hub database | MySQL schema `phlix_hub` (names per `HUB_DB_NAME` / `HUB_DB_USER` / `HUB_DB_PASSWORD` in `config/database.php`) | Servers, users, shares, enrollment state, `hub_settings`, `audit_logs`, and the `migrations` tracking table |
| Federation/enrollment signing key | `config/hub-signing-key.pem` by default (override via the `hub_signing_key_path` key in the Hub app config — there is no dedicated env var). The key lives in a `0700` directory, written atomically | Ed25519 private key. It signs enrollment JWTs **and** federation master proofs — there is no second key file |
| Environment / secrets | Your systemd unit, Docker env file, or `.env` — wherever you set `HUB_JWT_SECRET` (≥ 32 bytes), the `HUB_DB_*` credentials, and `HUB_RELAY_TLS_CERT` / `HUB_RELAY_TLS_KEY` paths if you enabled [relay TLS](/security/hardening) | Anything the Hub reads from `getenv()` at boot |

The cert/key material for relay TLS lives outside the repo — include whatever paths your env file names in the backup too.

## Backup procedure

### 1. Database snapshot

Use a consistent, non-locking dump (InnoDB):

```bash
mysqldump --single-transaction --routines --triggers \
  -u "$HUB_DB_USER" -p "$HUB_DB_NAME" | gzip > hub-db-$(date +%F).sql.gz
```

`--single-transaction` avoids locking the live relay worker's writes. The dump **includes the `migrations` table** — that is what keeps a restored database consistent with the code that created it (see below).

### 2. Key material and env file

```bash
cp -a config/hub-signing-key.pem "$BACKUP_DIR/"     # Ed25519 private key — protect like a CA key
cp -a /etc/phlix-hub/env "$BACKUP_DIR/hub-env"      # adjust to your actual env-file path
```

Store both with tight permissions (`chmod 600`); the signing key backup is the difference between "restore" and "every enrolled server must re-enroll."

### 3. Automation

There is no built-in scheduler — add a cron or systemd timer for steps 1–2 and test the restore path (below) before you rely on it.

## The `migrations` consistency rule

The Hub tracks schema state in the `migrations` table, keyed by **filename plus a checksum of each migration file**. Consequences for restore:

- Restore the dump **together with** the Hub code version it came from, or newer. Newer code applies any migrations missing from the restored table at boot.
- Never hand-edit the schema or tamper with migration files: a checksum mismatch on a changed file causes the runner to treat it as **re-applied** — surprising and dangerous against live data.
- Restoring an *older* code version onto a *newer* dump is unsupported; the runner will not roll schema changes back.

## Restore procedure

1. Stop the Hub worker.
2. Create a fresh schema and import the dump:

   ```bash
   mysql -u "$HUB_DB_USER" -p -e "CREATE DATABASE \`$HUB_DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
   gunzip -c hub-db-$(date +%F).sql.gz | mysql -u "$HUB_DB_USER" -p "$HUB_DB_NAME"
   ```

3. Restore `config/hub-signing-key.pem` to the path the app config names (default `config/hub-signing-key.pem`), parent directory `0700`, file `0600`.
4. Restore the env file and verify `HUB_JWT_SECRET` is present and ≥ 32 bytes — a changed secret invalidates every session token the Hub issued; clients must log in again.
5. Start the Hub and run the smoke checks below.

### Verify a restore

```bash
# Health endpoint responds (default Hub HTTP port 8800, override via HUB_PORT)
curl -fsS http://127.0.0.1:${HUB_PORT:-8800}/health

# A real login round-trips against the restored database
curl -fsS -X POST http://127.0.0.1:${HUB_PORT:-8800}/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$HUB_TEST_EMAIL\",\"password\":\"$HUB_TEST_PASSWORD\"}"
```

Use credentials from a private, operator-owned account — do **not** create shared or canned test accounts on a Hub.

Then confirm in the admin UI that enrolled servers still appear, and that a relayed request reaches one of them. If enrolled servers report JWT validation failures after a key restore, double-check that the restored file is the same key pair their servers cached via JWKS (they will re-fetch on the next rotation window).

## Audit log retention (backup size lever)

`audit_logs` grows with every relayed admin action. The reaper prunes it using `HUB_AUDIT_RETENTION_DAYS` (default **365**). Lower it to cap dump size — but decide that *before* you need the history: rows past the retention window are gone from every future backup.

## See Also

- [Monitoring & Alerting](./monitoring-alerting) — verify backup success
- [Scaling](./scaling) — plan for growth
- [Security Hardening](/security/hardening) — relay TLS and secret handling
