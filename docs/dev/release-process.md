# Release Process

**Since:** 0.18.0

How Phlix releases are versioned, built, and published.

---

## Versioning

Phlix follows [Semantic Versioning](https://semver.org):

```
major.minor.patch   (e.g. 1.2.3)
```

| Component | When to increment | Backward compatible? |
|-----------|-------------------|----------------------|
| `patch` | Bug fixes, security patches | Yes |
| `minor` | New features, new config keys, new API endpoints | Yes |
| `major` | Breaking changes: removed keys, changed behaviour, removed API endpoints | No |

### Pre-release versions

Development and release candidate versions use semver pre-release suffixes:

```
1.2.3-alpha.1
1.2.3-beta.2
1.2.3-rc.1
```

Tag format in git: `v1.2.3-rc.1`

---

## Release cadence

- **Patch releases**: As needed for security and critical bugs — no fixed schedule.
- **Minor releases**: Roughly monthly.
- **Major releases**: When a significant breaking-change set has accumulated — no fixed schedule.

---

## Branching model

```
origin/master          ← main development branch, always shippable
  ├── release/1.2.0    ← release stabilization branch (cut from master)
  └── hotfix/1.2.1     ← emergency fixes off a release tag
```

### Normal release flow

1. Cut a `release/x.y.z` branch from `master` when `master` is feature-complete for the release.
2. Only bug fixes and release-critical documentation changes land on the release branch.
3. When ready, tag `v.x.y.z` on the release branch and merge back to `master`.
4. `master` always carries the next development version (e.g. `1.3.0-dev`).

### Hotfix flow

1. Cut a `hotfix/x.y.z` branch from the release tag that needs fixing.
2. Fix, tag, merge to `master` and back to the release branch.
3. No new features in a hotfix.

---

## Version bumps

The version is declared in a single place:

- `phlix-server/composer.json` — `version` field (for the main package)
- `phlix-shared/composer.json` — `version` field (for the shared library)
- `package.json` in `phlix-docs` — `version` field

When cutting a release, update these three files in the same commit as the release tag.

---

## Building release artifacts

### phlix-server

```bash
composer install --no-dev --optimize-autoloader
```

No special build step — Composer handles autoloading optimization.

### phlix-docs

```bash
npm ci
npm run docs:build
```

The built site is a static output in `docs/.vitepress/dist/`, deployed to GitHub Pages on push to `master` via `.github/workflows/docs.yml`.

---

## Publishing

### GitHub release

1. Draft the release on GitHub with the tag `v<x.y.z>` pointing at the release commit.
2. Write the release notes: enumerate new features, fixed bugs, and any breaking changes.
3. Attach any build artifacts (e.g. a `phlix-docs-dist.tar.gz` if not deploying automatically).

### CI publishes

- **phlix-docs**: Deploys automatically via GitHub Pages on push to `master` — no manual publish step needed.
- **Composer packages**: Published to Packagist automatically when a tag is pushed to GitHub (packagist.org needs to be connected to the repo in the Detain account).

---

## Pre-release checklist

- [ ] All tests pass (`./vendor/bin/phpunit --testdox`)
- [ ] PHPStan passes at level 9 (`./vendor/bin/phpstan analyze src/ --level=9`)
- [ ] PHPCS passes (`./vendor/bin/phpcs --standard=PSR12 src/`)
- [ ] `phlix-docs` builds cleanly (`npm run docs:build`)
- [ ] Version bumped in `composer.json`, `phlix-shared/composer.json`, and `package.json`
- [ ] Release notes drafted on GitHub
- [ ] Migration scripts tested on a fresh database
- [ ] No uncommitted changes in the release commit

---

## Documentation releases

The `phlix-docs` repo is independent of the `phlix-server` version cycle. Docs are deployed on every push to `master`. When documenting a new feature, add it to the relevant page in `docs/` and push to `master` directly — no version bump needed in the docs repo.
