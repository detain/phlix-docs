# Contributing to Phlex

Everything you need to contribute across all Phlex repositories — server, hub, clients, and plugins.

## TL;DR

```bash
# Clone all repos
git clone git@github.com:detain/phlex-server.git
git clone git@github.com:detain/phlex-hub.git
git clone git@github.com:detain/phlex-shared.git
git clone git@github.com:detain/phlex-mobile-client.git
git clone git@github.com:detain/phlex-tizen-client.git
git clone git@github.com:detain/phlex-roku-client.git
git clone git@github.com:detain/phlex-windows-client.git

# Server dev setup
cd phlex-server && composer install && php scripts/run-migrations.php && php public/index.php

# Hub dev setup
cd phlex-hub && composer install && php bin/hub.php

# Mobile/Windows clients
cd phlex-mobile-client && npm install
cd phlex-windows-client && npm install
```

Branch → commit → PR → squash-merge → delete. PSR-12, phpstan level 9, all PHPUnit tests must pass.

---

## Cloning all repositories

Phlex is split across seven repositories:

| Repository | Language / stack | What it runs |
|-----------|-----------------|---------------|
| [`phlex-server`](https://github.com/detain/phlex-server) | PHP 8.3+, Workerman 5 | Media server (HTTP, WS, HLS, DLNA, LiveTV) |
| [`phlex-hub`](https://github.com/detain/phlex-hub) | PHP 8.3+, Workerman 5 | Hub orchestration (pairing, relay tunnel) |
| [`phlex-shared`](https://github.com/detain/phlex-shared) | PHP 8.3+ | Shared types, DTOs, event classes |
| [`phlex-mobile-client`](https://github.com/detain/phlex-mobile-client) | React Native | iOS + Android mobile app |
| [`phlex-tizen-client`](https://github.com/detain/phlex-tizen-client) | JavaScript / Tizen | Samsung Tizen TV app |
| [`phlex-roku-client`](https://github.com/detain/phlex-roku-client) | BrightScript | Roku channel |
| [`phlex-windows-client`](https://github.com/detain/phlex-windows-client) | Electron | Windows desktop app |

```bash
git clone git@github.com:detain/phlex-server.git
git clone git@github.com:detain/phlex-hub.git
git clone git@github.com:detain/phlex-shared.git
git clone git@github.com:detain/phlex-mobile-client.git
git clone git@github.com:detain/phlex-tizen-client.git
git clone git@github.com:detain/phlex-roku-client.git
git clone git@github.com:detain/phlex-windows-client.git
```

---

## Development environment setup

### phlex-server

```bash
cd phlex-server
composer install
php scripts/run-migrations.php   # creates all DB tables
php public/index.php            # starts the server on 0.0.0.0:8080
```

The server uses `Workerman\MySQL\Connection` (never PDO or mysqli). All DB access goes through the connection pool. See [`docs/dev/architecture-server.md`](architecture-server.md) for the bootstrap path.

### phlex-hub

```bash
cd phlex-hub
composer install
php bin/hub.php                 # starts the hub on 0.0.0.0:8800
```

The hub holds server claim codes, runs heartbeat loops, multiplexes relay tunnels, and issues RS256 user-session JWTs. See [`docs/dev/architecture-hub.md`](architecture-hub.md) for internals.

### Mobile client (phlex-mobile-client)

```bash
cd phlex-mobile-client
npm install          # or: yarn
npx react-native start   # Metro bundler
npx react-native run-android   # Android emulator
npx react-native run-ios        # iOS simulator
```

### Windows client (phlex-windows-client)

```bash
cd phlex-windows-client
npm install          # or: yarn
npm run dev        # starts Electron with hot reload
```

### Tizen client (phlex-tizen-client)

Tizen builds require the Tizen Studio toolchain. Build commands are defined in the `.tizen` project file; refer to the repo's `README.md` for the full build instructions.

### Roku client (phlex-roku-client)

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

Test files live in `tests/unit/{Module}/{Class}Test.php` with namespace `Phlex\Tests\Unit\{Module}` and extend `PHPUnit\Framework\TestCase`.

### Code coverage

```bash
./vendor/bin/phpunit --coverage-text
```

Coverage writes to `coverage.xml` and `coverage-report/` (configured in `phpunit.xml`). Target ≥ 80% on `src/Common/Container/**`.

---

## Plugin contribution

Plugins extend the Phlex feature set without modifying the core server. The plugin SDK lives in [`docs/dev/plugin-sdk.md`](plugin-sdk.md) — it covers the manifest schema, lifecycle (install → enable → disable → uninstall), container bindings plugins can use, and how to add a new plugin type.

To list a plugin in the in-product catalog, submit a PR to [`detain/phlex-plugin-catalog`](https://github.com/detain/phlex-plugin-catalog) with the plugin's manifest and metadata.

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
mysql -h 127.0.0.1 -u phlex -p -e "SELECT 1"

# Drop and recreate (development only — NEVER do this in production):
mysql -h 127.0.0.1 -u phlex -p -e "DROP DATABASE IF EXISTS phlex"
mysql -h 127.0.0.1 -u phlex -p -e "CREATE DATABASE phlex"
php scripts/run-migrations.php

# Or run the SQL files directly for incremental fixes:
mysql -h 127.0.0.1 -u phlex -p phlex < migrations/001_initial_schema.sql
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
- [`docs/dev/workflow.md`](workflow.md) — Day-to-day developer workflow (debugging, hot reload, logging).
- [`docs/dev/architecture-hub.md`](architecture-hub.md) — Hub internals (pairing protocol, relay tunnel, namespace map).
- [`docs/dev/architecture-server.md`](architecture-server.md) — Server bootstrap, container, request lifecycle.
