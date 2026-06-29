# Test Harness

**Since:** 0.18.0

How to run and extend the phlix-server test suite.

---

## Running the suite

### All tests (unit + integration)

```bash
./vendor/bin/phpunit
```

### Unit tests only

```bash
./vendor/bin/phpunit --testsuite Unit
```

### Integration tests only

```bash
./vendor/bin/phpunit --testsuite Integration
```

### A single test file

```bash
./vendor/bin/phpunit tests/Unit/Auth/JwtHandlerTest.php --testdox
```

### A single test method

```bash
./vendor/bin/phpunit tests/Unit/Auth/JwtHandlerTest.php --filter testJwtSigning --testdox
```

### With testdox output (human-readable)

```bash
./vendor/bin/phpunit --testdox
```

---

## Test structure

```
tests/
├── Unit/
│   ├── Auth/
│   │   ├── JwtHandlerTest.php
│   │   └── UserRepositoryTest.php
│   ├── Media/
│   │   ├── LibraryScannerTest.php
│   │   └── MetadataManagerTest.php
│   └── Server/
│       └── ApplicationTest.php
└── Integration/
    ├── Server/
    │   └── Core/
    │       └── ApplicationTest.php   # Full boot smoke test
    └── Media/
        └── ItemRepositoryTest.php
```

Unit tests live under `tests/Unit/` and mock all external dependencies (database, filesystem, HTTP). Integration tests under `tests/Integration/` may use a real temporary database (see the test DB setup in `phpunit.xml`).

---

## Coding standards

### PHPStan (static analysis, level 9)

```bash
./vendor/bin/phpstan analyze src/ --level=9
```

### PHPCS (PSR-12 style)

```bash
./vendor/bin/phpcs --standard=PSR12 src/
```

### PHP syntax check (all files)

```bash
find src -name '*.php' -exec php -l {} \;
```

---

## Test database

Integration tests use a temporary database built from the real schema:

- `phpunit.xml` exports `DB_HOST=127.0.0.1`, `DB_DATABASE=phlix_test`, `DB_USER=root`, `DB_PASSWORD=root` — these must match the GitHub Actions `services: mysql:8.0` container which sets `MYSQL_ROOT_PASSWORD=root` and `MYSQL_DATABASE=phlix_test`.
- `tests/Integration/Server/Core/ApplicationTest.php::writeTempDbConfig()` reads those env vars and writes a temporary `config/database.php` before the boot smoke test.

If either side changes (env vars or workflow service), update both together. CI will fail with `Access denied for user 'root'@... (using password: NO)` if they diverge.

---

## Coverage

Coverage is generated on demand:

```bash
./vendor/bin/phpunit --coverage-text
```

Configuration in `phpunit.xml` produces:
- `coverage.xml` — Clover format ( consumed by CI coverage threshold)
- `coverage-report/` — HTML report directory

The CI workflow enforces a minimum statement coverage floor computed from the Clover XML. Current floor is `MIN_COVERAGE=40`. Bump it as coverage grows; never set it above current coverage or every PR turns red.

---

## Adding a new test

1. Place the file in the appropriate directory under `tests/Unit/` or `tests/Integration/`.
2. Name it `<ClassName>Test.php` to match PSR-4 conventions.
3. Extend `PHPUnit\Framework\TestCase`.
4. Mock external dependencies with `$this->createMock(Connection::class)` for the MySQL connection:

  ```php
  $db = $this->createMock(Connection::class);
  $db->method('query')->willReturn([['col' => 'val']]);
  ```

See [tests/Unit/Auth/JwtHandlerTest.php](https://github.com/detain/phlix-server/blob/master/tests/Unit/Auth/JwtHandlerTest.php) for a complete example.
