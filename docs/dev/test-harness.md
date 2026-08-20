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

::: warning `--testdox` can never name a skipped test
A testdox run still counts its skips in `Skipped: N` but prints no skipped-details list,
whatever `phpunit.xml` says: PHPUnit builds the default result printer on that path with its
`$displayDetailsOnSkippedTests` argument hardcoded `false`. Drop `--testdox` whenever you care
*which* tests skipped — see [Skipped tests: compare names, never counts](#skipped-tests-compare-names-never-counts)
below. No workflow in `phlix-server` passes `--testdox` for this reason.
:::

---

## Skipped tests: compare names, never counts

This suite has legitimately environment-dependent skips — no MySQL, no Chromium, no
mysqldump and no FFI each remove a different set — so the `Skipped: N` figure differs
between machines and between CI jobs. CI reports single digits where a bare developer box
reports a couple of hundred. The number is also ambiguous: *a test started skipping*, *a
conditionally-skipped test turned into a failure* and *a test disappeared* all move it the
same way, and two of them together can leave it unmoved. **Never conclude anything from a
skip count.**

`phpunit.xml` therefore sets `displayDetailsOnSkippedTests="true"`, so every run that loads
it and uses PHPUnit's default result printer names each skipped test, and
`scripts/skipped-test-names.sh` turns that output into a sorted, deduplicated,
`comm`-ready set:

```bash
./vendor/bin/phpunit 2>&1 | scripts/skipped-test-names.sh > /tmp/before.txt
# ...make your change...
./vendor/bin/phpunit 2>&1 | scripts/skipped-test-names.sh > /tmp/after.txt
comm -3 /tmp/before.txt /tmp/after.txt   # left column: left the skip set. right: joined it.
```

Against a CI run — the script strips `gh`'s `job<TAB>step<TAB>timestamp` prefix itself:

```bash
gh run view <run-id> --log | scripts/skipped-test-names.sh > /tmp/ci.txt
```

Only the name set goes to stdout, so `comm` and `diff` can consume it directly; the
denominators (lines read, skips summarised, names declared, names extracted) always go to
stderr. It refuses to hand over a set it cannot vouch for, and the exit code says why:

| exit | meaning |
| --- | --- |
| `0` | parsed a real PHPUnit run — stdout is the set (zero lines is a valid answer) |
| `2` | the input is not PHPUnit output at all |
| `3` | the numbers do not add up: a run printed no list, or PHPUnit's format drifted |
| `4` | skips were counted but never named — the attribute is off, or that invocation did not load `phpunit.xml` |
| `5` | the unnamed skips are testdox skips, which cannot be named at all — re-run without `--testdox` |
| `6` | the set could not be written in full, so stdout is truncated |

A non-zero exit means *this input must not be compared*. Two invocations are outside the
mechanism by construction rather than by mistake: a `--testdox` run (above), and the
`assertion-escape-probe` CI job, whose PHPUnit output is captured into a PHP variable and
never echoed.

The canonical, exhaustive statement of all this — every exit path with the input class that
reaches it, and the five numbered known limits of the arithmetic — is the header comment of
`scripts/skipped-test-names.sh` itself, summarised in `phlix-server`'s `README.md` under
"Comparing skip sets between two runs". Read the header before trusting a diagnosis on a
whole-workflow log, where several runs share one input.

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
