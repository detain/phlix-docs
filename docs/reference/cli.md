# CLI Reference

The Phlix Media Server and the Phlix Hub each ship a `bin/phlix` console
entrypoint built on `webman/console` (a thin wrapper around Symfony Console).
A handful of operations that are network-, daemon-, or TLS-bound are still
provided as standalone `scripts/*.php` and are documented at the end of this
page.

## `bin/phlix` — what it is

`webman/console` only auto-discovers commands from an `app/command` directory,
which neither repo has (both use a PSR-4 `Phlix\… → src/` layout). So each
repo ships a small `bin/phlix` executable that bootstraps the autoloader and
config, then explicitly registers its `Phlix\…\Console\Commands\*` classes on a
`Webman\Console\Command` application and runs it.

`bin/phlix` is a **one-shot CLI** — not the resident Workerman/Swoole worker —
so it does not start the event loop. The DI container and the database
connection are resolved **lazily**: a command only builds the container or opens
a connection when it actually needs one. Consequently:

```bash
php bin/phlix list      # list every available command (no database needed)
php bin/phlix help <command>
```

`php bin/phlix list` works with **no database configured or reachable** — it
never builds the container, so you can always discover the available commands.

All commands return a standard exit code: `0` on success, `1` on failure (the
error is written to output). Commands never call `exit()`/`die()` internally.

---

## phlix-server commands

Run from the phlix-server install directory (`phlix-server/`). Twelve commands
are available.

| Command | Arguments / options | Description |
| --- | --- | --- |
| `migrate` | — | Apply database migrations (`migrations/*.sql`). |
| `library:list` | — | List all configured media libraries. |
| `library:scan` | `{libraryId}` `[--rescan]` | Scan (or rescan) a media library for new content. |
| `plugin:list` | — | List installed plugins and their enabled state. |
| `plugin:enable` | `{name}` | Enable an installed plugin by name. |
| `plugin:disable` | `{name}` | Disable an enabled plugin by name. |
| `plugin:install` | `{source}` | Install a plugin from a source URL. |
| `plugin:uninstall` | `{name}` | Uninstall a plugin by name. |
| `backup:create` | `[--label=]` | Create a new server backup archive. |
| `backup:list` | — | List stored server backups. |
| `hwaccel:probe` | — | Probe for available hardware-acceleration encoders. |
| `user:reset-password` | `{user}` `[--password=]` | Reset a user's password by username or email. |

### `migrate`

Applies every `migrations/*.sql` file in sorted order. Idempotent: it has **no
migration-tracking table** and is safe to run repeatedly — duplicate-column /
duplicate-key / "already exists" errors are downgraded to notes rather than
treated as failures. This is the supported equivalent of
`php scripts/run-migrations.php` (both delegate to the same
`Phlix\Common\Database\MigrationRunner`); the script remains for the Docker
entrypoint and installer.

```bash
php bin/phlix migrate
```

Returns exit `1` if a genuine (non-idempotent) statement error occurs.

### `library:list`

Prints the id, name, type, and configured path(s) of each library as a table.

```bash
php bin/phlix library:list
```

### `library:scan`

Scans a library for new content. Pass `--rescan` to clear existing items and
rescan from the filesystem.

This command runs **synchronously** and blocks until the scan completes. (The
HTTP `POST /api/v1/libraries/{id}/scan` endpoint is asynchronous instead — it
queues a job; see the [Library Scan Worker](../dev/library-scan-worker).)

| Argument / option | Description |
| --- | --- |
| `libraryId` (required) | The library identifier to scan. |
| `--rescan` | Clear existing items and rescan from scratch. |

```bash
php bin/phlix library:scan 3
php bin/phlix library:scan 3 --rescan
```

### `plugin:list`

Lists installed plugins with their version and enabled state (yes/no) as a
table.

```bash
php bin/phlix plugin:list
```

### `plugin:enable` / `plugin:disable` / `plugin:uninstall`

Each takes a required `name` argument — the plugin's manifest name.

```bash
php bin/phlix plugin:enable my-plugin
php bin/phlix plugin:disable my-plugin
php bin/phlix plugin:uninstall my-plugin
```

### `plugin:install`

Installs a plugin from a source. The `source` argument is required and accepts
an HTTPS URL or a `file://` path for local sources. (Plain `http://` is rejected
unless `PHLIX_PLUGINS_ALLOW_HTTP` is enabled — see
[Environment variables](env-vars.md).)

| Argument | Description |
| --- | --- |
| `source` (required) | The plugin source URL (HTTPS, or `file://` for local sources). |

```bash
php bin/phlix plugin:install https://plugins.example.com/my-plugin.zip
```

On success it prints the installed plugin's name and version.

### `backup:create`

Creates a new server backup archive and prints the backup id, file path, and
size.

| Option | Description |
| --- | --- |
| `--label=` | Optional human-readable label for the backup. |

```bash
php bin/phlix backup:create
php bin/phlix backup:create --label="before 1.2 upgrade"
```

### `backup:list`

Lists stored backups (id, label, size, location — local or S3 — and creation
time) as a table.

```bash
php bin/phlix backup:list
```

### `hwaccel:probe`

Probes for available hardware-acceleration encoders/decoders using the
configured `ffmpeg` binary (from `config/ffmpeg.php`) and renders the detected
vendor, encoder, decoder, HDR support, and codecs per capability. Needs neither
the container nor a database.

```bash
php bin/phlix hwaccel:probe
```

### `user:reset-password`

Resets a user's password, looking the user up by username first, then by email.
The password is hashed with Argon2ID before storage.

| Argument / option | Description |
| --- | --- |
| `user` (required) | The username or email of the user to reset. |
| `--password=` | The new password. When omitted, a strong random password is generated and **printed** to stdout. |

```bash
# Generate and print a strong random password
php bin/phlix user:reset-password alice@example.com

# Set a specific password (not echoed back)
php bin/phlix user:reset-password alice --password='S3cret!Passphrase'
```

Returns exit `1` if the user is not found.

---

## phlix-hub commands

Run from the phlix-hub install directory (`phlix-hub/`). Two commands are
available.

| Command | Arguments / options | Description |
| --- | --- | --- |
| `migrate` | — | Apply database migrations (`migrations/*.sql`). |
| `smoke:jwt` | — | Smoke-test the JWT create/validate round-trip. |

### `migrate`

Applies the hub's pending `migrations/*.sql`. Unlike the server's `migrate`,
the hub uses a real migration-tracking table (`Phlix\Hub\Common\Database\MigrationRunner`),
so already-applied migrations are skipped. It is the supported equivalent of
`php scripts/run-migrations.php`.

```bash
php bin/phlix migrate
```

Output reports each newly applied file and the total, or "All migrations
already applied. Nothing to do." when up to date.

### `smoke:jwt`

Runs a self-contained JWT create-then-validate round-trip using a throwaway
test secret (no config or database). Useful for verifying the
`JwtHandler` ↔ `JwtClaims` wiring after a deploy. Prints
`OK: JWT round-trip succeeded` and the asserted claim fields on success;
returns exit `1` on any mismatch.

```bash
php bin/phlix smoke:jwt
```

---

## Standalone scripts (not yet `bin/phlix` commands)

The following operations remain `scripts/*.php` rather than `bin/phlix`
commands. They are network-, daemon-, or TLS-bound and are deferred to a later
phase; there is **no** `bin/phlix` equivalent for them today.

### `php scripts/pair-with-hub.php <hub-url> <server-name>`

Initiates pairing between this server and a Phlix Hub instance.

**Arguments:**

| Argument       | Description                                      |
| -------------- | ------------------------------------------------ |
| `hub-url`     | Base URL of the hub (e.g. `https://hub.example.com`). |
| `server-name` | Human-readable name shown on the hub dashboard.  |

**Example:**

```bash
php scripts/pair-with-hub.php https://hub.example.com "Alice's NAS"
```

**Output:**

```
Pairing initiated.
Claim code: ABCD-1234
Enter this code at https://hub.example.com/claim-server
Waiting for claim... (press Ctrl+C to cancel)
Claimed! Server ID: 550e8400-e29b-41d4-a716-446655440000
Enrollment stored.
Pairing complete. Server is now connected to the hub.
Heartbeat loop has been started in the background.
```

**Behavior:**

1. Generates (or loads existing) Ed25519 keypair from `config/hub-server-key.pem`.
2. Sends a claim request to `POST <hub-url>/api/v1/server-claims/new`.
3. Displays the returned claim code for the operator to enter on the hub's web portal.
4. Polls `GET <hub-url>/api/v1/server-claims/{claimId}` every 2 seconds.
5. On successful claim, stores enrollment JWT to `config/hub-enrollment.json`.
6. Starts the background heartbeat loop.

**Exit codes:**

- `0` — Pairing completed successfully.
- `1` — Error (network failure, invalid arguments, hub rejection).

See `Phlix\Hub\HubClient` and `docs/dev/pairing-protocol.md`.

### `php scripts/claim-subdomain.php`

Claims a `*.phlix.media` subdomain for the enrolled server after pairing.
Note: automated TLS provisioning is **not implemented** — certificates must be
provisioned out-of-band (see [TLS Certificates](../dev/tls-certificates.md)).

### `php scripts/port-forward.php <command>`

Manages UPnP-IGD and NAT-PMP port forwarding for direct server access without a
relay tunnel.

**Commands:**

| Command  | Description |
| -------- | ----------- |
| `status` | Show current port forwarding status, enabled state, method, and hostname candidates. |
| `enable` | Attempt automatic port forwarding via UPnP-IGD or NAT-PMP. Falls back to manual instructions on failure. |
| `disable` | Remove all port mappings and disable automatic port forwarding. |
| `info`   | Display detailed network information: local IP, public IP (via STUN), port accessibility, and UPnP IGD discovery status. |
| `help`   | Show usage information. |

**Example output (status):**

```
Port Forwarding Status
=======================
Enabled:  YES
Method:   upnp
External IP: 203.0.113.42
Port:     32400
Endpoint: 203.0.113.42:32400

Hostname Candidates:
  [lan] http://192.168.1.100:32400
  [lan-mdns] http://phlix.local:32400
  [public] http://203.0.113.42:32400
```

**Example output (info):**

```
Network Information
====================
Local IP:  192.168.1.100
Port:      32400

Testing STUN (public IP detection)...
Public IP: 203.0.113.42
Port 32400 on 203.0.113.42: OPEN

UPnP IGD Discovery...
Gateway:  http://192.168.1.1:1900/gateway.xml
External WAN IP: 203.0.113.42
```

**How it works:**

1. **UPnP-IGD** — Sends SSDP M-SEARCH to `239.255.255.250:1900` to discover
   a UPnP InternetGatewayDevice, then uses SOAP `AddPortMapping` to open the
   port. See `Phlix\Network\UpnpIgdClient`.
2. **NAT-PMP** — Falls back to Apple NAT-PMP (RFC 6886) on routers like
   AirPort Extreme. See `Phlix\Network\NatPmpClient`.
3. **STUN** — Uses RFC 5389 STUN binding to discover the server's public
   IP address and test port accessibility. See `Phlix\Network\StunClient`.

**See also:** `docs/hub/remote-access.md`.

### `php scripts/run-marker-detection-worker.php`

Intro/outro marker-detection background worker (an infinite daemon loop). This
script is a carry-over and is **not** wrapped as a `bin/phlix` command — it
belongs to a future queue/worker step.

### `php scripts/dedup-series.php [--library=ID] [--dry-run|--apply]`

Find and (optionally) merge **duplicate top-level items** (series and movies) across
the catalog. Title-slug variance — separators, year bleed, a flat→per-directory
re-scan, or a concurrent-scan race — can create a second top-level row for the same
show or film (the classic "100 episodes + 1 episode" symptom). This script is the
offline counterpart of the admin
[Duplicates page](../admin/library-management#merging-duplicate-series-movies) /
[`POST /api/v1/admin/media/merge`](./api#post-api-v1-admin-media-merge) endpoint: it
runs `DuplicateFinder` per library and, on `--apply`, collapses each group with
`SeriesMerger`.

**Options:**

| Option | Description |
| ------ | ----------- |
| `--library=ID` | Restrict to a single library UUID. Omit to process every library. |
| `--dry-run` | List the duplicate groups that would be merged, **without** mutating anything. **This is the default.** |
| `--apply` | Actually merge each group (re-parent children onto the primary, delete empty shells / duplicate movie rows). |

**Behavior:**

- Default mode is **dry-run** — you must pass `--apply` to make changes.
- The "primary" of each group is the member with the most descendants; the rest are
  re-parented into it. Re-parented episodes keep their ids, so per-user playback
  progress survives; only empty shells and duplicate movie rows are deleted (their
  own per-user rows go via `ON DELETE CASCADE`).
- A re-run after `--apply` reports **zero groups** (idempotent).

**Prerequisite:** migration `043_media_items_canonical_key.sql` (adds a nullable,
**non-unique** `canonical_key` column + a `(library_id, type, canonical_key)` index).
There is intentionally **no** UNIQUE constraint — historical duplicates exist;
uniqueness is enforced in application code at scan time.

**Example:**

```bash
# Preview duplicate groups in one library (no changes)
php scripts/dedup-series.php --library=550e8400-e29b-41d4-a716-446655440001 --dry-run

# Merge duplicates across every library
php scripts/dedup-series.php --apply
```
