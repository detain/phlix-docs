# Contributing to Phlix

Everything you need to contribute across all Phlix repositories — server, hub, clients, and plugins.

## TL;DR

```bash
# Clone all repos
git clone git@github.com:detain/phlix-server.git
git clone git@github.com:detain/phlix-hub.git
git clone git@github.com:detain/phlix-shared.git
git clone git@github.com:detain/phlix-mobile-client.git
git clone git@github.com:detain/phlix-tizen-client.git
git clone git@github.com:detain/phlix-roku-client.git
git clone git@github.com:detain/phlix-windows-client.git

# Server dev setup
cd phlix-server && composer install && php scripts/run-migrations.php && php public/index.php

# Hub dev setup
cd phlix-hub && composer install && php start.php start

# Mobile/Windows clients
cd phlix-mobile-client && npm install
cd phlix-windows-client && npm install
```

Branch → commit → PR → squash-merge → delete. PSR-12, phpstan level 9, all PHPUnit tests must pass.

---

## Cloning all repositories

Phlix is split across seven repositories:

| Repository | Language / stack | What it runs |
|-----------|-----------------|---------------|
| [`phlix-server`](https://github.com/detain/phlix-server) | PHP 8.3+, Workerman 5 | Media server (HTTP, WS, HLS, DLNA, LiveTV) |
| [`phlix-hub`](https://github.com/detain/phlix-hub) | PHP 8.3+, Workerman 5 | Hub orchestration (pairing, relay tunnel) |
| [`phlix-shared`](https://github.com/detain/phlix-shared) | PHP 8.3+ | Shared types, DTOs, event classes |
| [`phlix-mobile-client`](https://github.com/detain/phlix-mobile-client) | React Native | iOS + Android mobile app |
| [`phlix-tizen-client`](https://github.com/detain/phlix-tizen-client) | JavaScript / Tizen | Samsung Tizen TV app |
| [`phlix-roku-client`](https://github.com/detain/phlix-roku-client) | BrightScript | Roku channel |
| [`phlix-windows-client`](https://github.com/detain/phlix-windows-client) | Electron | Windows desktop app |

```bash
git clone git@github.com:detain/phlix-server.git
git clone git@github.com:detain/phlix-hub.git
git clone git@github.com:detain/phlix-shared.git
git clone git@github.com:detain/phlix-mobile-client.git
git clone git@github.com:detain/phlix-tizen-client.git
git clone git@github.com:detain/phlix-roku-client.git
git clone git@github.com:detain/phlix-windows-client.git
```

---

## Development environment setup

### phlix-server

```bash
cd phlix-server
composer install
php scripts/run-migrations.php   # creates all DB tables
php public/index.php            # starts the server on 0.0.0.0:8080
```

The server uses `Workerman\MySQL\Connection` (never PDO or mysqli). All DB access goes through the connection pool. See [`docs/dev/architecture-server.md`](architecture-server.md) for the bootstrap path.

### phlix-hub

```bash
cd phlix-hub
composer install
php start.php start            # starts the hub on 0.0.0.0:8800
```

The hub holds server claim codes, runs heartbeat loops, multiplexes relay tunnels, and issues HS256 user-session JWTs. See [`docs/dev/architecture-hub.md`](architecture-hub.md) for internals.

### Mobile client (phlix-mobile-client)

```bash
cd phlix-mobile-client
npm install          # or: yarn
npx react-native start   # Metro bundler
npx react-native run-android   # Android emulator
npx react-native run-ios        # iOS simulator
```

### Windows client (phlix-windows-client)

```bash
cd phlix-windows-client
npm install          # or: yarn
npm run dev        # starts Electron with hot reload
```

### Tizen client (phlix-tizen-client)

Tizen builds require the Tizen Studio toolchain. Build commands are defined in the `.tizen` project file; refer to the repo's `README.md` for the full build instructions.

### Roku client (phlix-roku-client)

Roku builds require the Roku SDK. Refer to the repo's `README.md` for the full build instructions.

---

## Branch naming

Use a consistent prefix so the purpose of each branch is obvious at a glance:

| Prefix | Use for |
|--------|---------|
| `feature/{slug}` | New features |
| `fix/{slug}` | Bug fixes |
| `step-{phase}.{step}-{slug}` | Phase/step deliverables (e.g., `step-n.23-contributing`, `step-c.2-hubclient`) |

Never commit directly to `master`. All work happens in feature branches.

---

## Commit format

```
{type}: {description}
```

Types for conventional contributions:

| Type | When to use |
|------|-------------|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `chore:` | Tooling, dependencies, config |
| `docs:` | Documentation only |
| `refactor:` | Code restructure without behaviour change |
| `step-N.M:` | Phase/step deliverable (e.g., `step-N.23:`) |

Examples:
```
step-N.23: add contributing guide (repo structure, dev setup, branch conventions)
fix: resolve race condition in HubClient heartbeat loop
feat: add FanartProvider for TV series artwork
docs: document DLNA ContentDirectoryBrowse response format
```

---

## Pull request process

1. **Branch** from `master`.
2. **Write** your change + tests + docs.
3. **Run locally** before pushing:
   ```bash
   ./vendor/bin/phpcs --standard=PSR12 src/
   ./vendor/bin/phpstan analyze src/ --level=9
   ./vendor/bin/phpunit
   ```
4. **Push** and open a PR. Title format: `step-N.M: {description}` for phase work.
5. **Review** — CI must be green, at least one approval required.
6. **Merge** — squash-merge preferred; branch is deleted after merge.
7. **Sync** — pull `master` locally and delete the topic branch.

---

## PHPDoc requirements

Every `public` and `protected` method must have:

```php
/**
 * @param string $mediaId  The unique media item identifier.
 * @param int    $position Ticks position in the playback stream.
 * @return array{media_id: string, user_id: string}
 * @throws InvalidArgumentException If the media ID is not found.
 */
public function getPosition(string $mediaId, int $position): array
```

Minimum required tags: `@param`, `@return`, `@throws`. Add `@see` for related methods and `@internal` when a method is not part of the public API.

---

## Code standards

### PSR-12

```bash
./vendor/bin/phpcs --standard=PSR12 src/
```

All PHP files must pass PSR-12. No exceptions in submitted PRs.

### Static analysis (phpstan level 9)

```bash
./vendor/bin/phpstan analyze src/ --level=9
```

Level 9 is the maximum. If phpstan reports errors, fix them — do not lower the level to silence warnings.

### Syntax check

```bash
find src -name '*.php' -exec php -l {} \;
```

All files must parse cleanly. No output means no errors.

### PHPUnit tests

```bash
./vendor/bin/phpunit                        # all suites
./vendor/bin/phpunit --testsuite Unit      # unit tests only
./vendor/bin/phpunit --testsuite Integration
```

All tests must pass. Unit tests mock `Workerman\MySQL\Connection`:

```php
$db = $this->createMock(Workerman\MySQL\Connection::class);
$db->method('query')
   ->willReturn([['col' => 'val']]);  // SELECT result
$db->expects($this->once())
    ->method('query')
    ->with($this->stringContains('INSERT'), $this->anything());  // write assertion
```

Test files live in `tests/Unit/{Module}/{Class}Test.php` with namespace `Phlix\Tests\Unit\{Module}` and extend `PHPUnit\Framework\TestCase`.

### Code coverage

```bash
./vendor/bin/phpunit --coverage-text
```

Coverage writes to `coverage.xml` and `coverage-report/` (configured in `phpunit.xml`). Target ≥ 80% on `src/Common/Container/**`.

---

## CI / GitHub Actions policy

All Phlix repositories share a single rule for GitHub Actions:

> **Pin action `uses:` references to a single major (`@vN`), never to a
> minor or to `@main`. The major must be a Node-current build.**

As of 2026-05, that means Node 24 for every JavaScript-runtime action.
Concretely, the repos use:

| Action | Pin |
| --- | --- |
| `actions/checkout` | `@v6` |
| `actions/setup-node` | `@v6` |
| `actions/setup-python` | `@v6` |
| `actions/cache` | `@v5` |
| `actions/upload-artifact`, `download-artifact` | `@v5` |
| `docker/build-push-action` | `@v7` |
| `docker/setup-buildx-action`, `setup-qemu-action`, `metadata-action`, `login-action` | `@v4` / `@v6` (Node-24 majors) |
| `codecov/codecov-action` | `@v6` |

The repo-wide opt-in `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` env shim
has been removed — the action majors now run on Node 24 natively, so
the shim was redundant and is gone. Do not re-introduce it.

**When a new action major lands:** bump every workflow across every
phlix repo in lock-step. We deliberately do not pin minors (e.g.
`@v6.1`) because dependabot churn vastly outweighs the supply-chain
risk for these first-party Actions vendors, and partial bumps cause
hard-to-debug behavior drift between repos.

---

## Code coverage / Codecov

All repos upload coverage to Codecov. Each repo's `phpunit.yml`
workflow reads `CODECOV_TOKEN` from secrets — guarded by an
`if: env.CODECOV_TOKEN != ''` step-level condition, **not**
`secrets.CODECOV_TOKEN != ''`, because the `secrets` context is
unavailable inside `step.if` expressions (GitHub Actions limitation).
Use `env.CODECOV_TOKEN` after exporting the secret into the step's
`env:` block.

The token is provisioned by the idempotent helper script
`set-codecov-token.sh` (kept in the local `phlix` parent directory,
not committed to any repo). It seeds the token as:

- An **organization secret** on the `interserver`, `myadmin-plugins`,
  `provirted`, `lamtard`, and `sugarcraft` orgs.
- A **per-repo secret** on 85 personal `detain/*` repos plus 24
  private `interserver/*` repos that cannot inherit the org secret.

The script is safe to re-run; it diffs existing secrets and only
writes when the token differs. New repos can be picked up by adding
them to the script's repo list and re-running.

### Codecov upload is non-blocking

The Codecov step uses `fail_ci_if_error: false`. The token being valid
is **not** enough — each repo must also be `activated: true` in the
Codecov account at <https://app.codecov.io>, which requires the account
owner to click "Sync" / "Setup repo" in the UI. Until that happens, the
upload step returns `"Repository not found"` with exit 1 on every push,
and we deliberately let CI ignore it rather than block unrelated PRs on
a one-shot UI action.

There is **no programmatic activation path**. The Codecov v2 REST API
returns 404 or 405 for `PATCH`, `PUT`, and `POST` against
`/api/v2/{service}/{owner}/repos/{repo}/` — there is no `/activate`
endpoint and no `activated` field on the repo PATCH body. Do not spend
time trying to script this; just log in to Codecov once per account
sync.

When you activate a repo, no workflow change is required: the same
upload step starts succeeding on the next run.

### Coverage threshold parses Clover, not Cobertura

The "Check minimum coverage threshold" step in each repo's `phpunit.yml`
reads PHPUnit's `--coverage-clover` output. Clover writes:

```xml
<coverage>
  <project>
    <metrics statements="..." coveredstatements="..." .../>
```

and the workflow computes the percentage as
`coveredstatements * 100 / statements`. Cobertura's `@line-rate`
attribute does **not** exist on PHPUnit's Clover XML — if a future
edit tries to read it with `xmllint --xpath "string(.../@line-rate)"`
it returns the empty string, bash coerces to `0`, and CI hard-fails
"Coverage 0% is below minimum N%" while PHPUnit itself reports the real
number. Stick with `@statements` / `@coveredstatements`.

The minimum is set per-repo (currently 40 in `phlix-server`, intentionally
just below actual coverage so small regressions trip the check). Raise it
as coverage improves; never raise it above current coverage.

---

## Plugin contribution

Plugins extend the Phlix feature set without modifying the core server. The plugin SDK lives in [`docs/dev/plugin-sdk.md`](plugin-sdk.md) — it covers the manifest schema, lifecycle (install → enable → disable → uninstall), container bindings plugins can use, and how to add a new plugin type.

To list a plugin in the in-product catalog, submit a PR to [`detain/phlix-plugin-catalog`](https://github.com/detain/phlix-plugin-catalog) with the plugin's manifest and metadata.

See [`docs/plugins/developer-guide.md`](../plugins/developer-guide.md) for the full author-facing guide.

---

## What can go wrong

### PHP version mismatch

**Symptom:** `composer install` succeeds but the server crashes with `Error: Class 'Workerman\MySQL\Connection' not found`.

**Cause:** The project requires PHP 8.3+. Older PHP versions lack required features (e.g., attributes, `readonly` properties, first-class enum constants).

**Fix:**
```bash
php -v                    # confirm PHP 8.3+
composer install          # re-run after upgrading PHP
php public/index.php      # verify the server starts
```

Use `phpbrew`, `nvm` (with phpenv), or Docker to manage multiple PHP versions.

---

### Migration failure on first run

**Symptom:** `php scripts/run-migrations.php` exits non-zero. DB tables are missing or partially created.

**Cause:** Migration script run against a pre-existing database with stale schema, or the MySQL server is not reachable.

**Fix:**
```bash
# Verify MySQL is reachable
mysql -h 127.0.0.1 -u phlix -p -e "SELECT 1"

# Drop and recreate (development only — NEVER do this in production):
mysql -h 127.0.0.1 -u phlix -p -e "DROP DATABASE IF EXISTS phlix"
mysql -h 127.0.0.1 -u phlix -p -e "CREATE DATABASE phlix"
php scripts/run-migrations.php

# Or run the SQL files directly for incremental fixes:
mysql -h 127.0.0.1 -u phlix -p phlix < migrations/001_initial_schema.sql
```

Check `migrations/` for the current set of SQL files.

---

### Missing environment variables

**Symptom:** Server starts but returns 500 on all requests. Log shows `RuntimeException: JWT_SECRET environment variable is not set`.

**Cause:** Required env vars are not set. The server reads config from `config/server.php` which may reference `getenv()`.

**Fix:**
```bash
# Copy and edit the env example
cp .env.example .env
# Fill in all required values (JWT_SECRET, DB_* credentials, etc.)
php public/index.php
```

The required variables are documented in [`docs/reference/env-vars.md`](../reference/env-vars.md).

---

### phpstan level 9 failures

**Symptom:** `phpstan analyze` reports errors on new code.

**Cause:** Level 9 is the strictest level. Common issues: missing return types, incorrect nullable types, accessing properties that may not exist on a mixed value.

**Fix:** Add explicit type declarations. Do not use `@var` annotations to silence phpstan — fix the underlying code.

```bash
# Audit your specific file only while developing
./vendor/bin/phpstan analyze src/Server/Http/Router.php --level=9
```

---

## Next steps

- [`docs/dev/plugin-sdk.md`](plugin-sdk.md) — Plugin SDK internals (manifest schema, lifecycle, container bindings, events). Start here for plugin development.
- [`docs/dev/architecture-hub.md`](architecture-hub.md) — Hub internals (pairing protocol, relay tunnel, namespace map).
- [`docs/dev/architecture-server.md`](architecture-server.md) — Server bootstrap, container, request lifecycle.
