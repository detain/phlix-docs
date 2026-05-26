# Planned / unwritten pages

This file is a backlog, **not a published doc** (it lives at the repo root, outside `docs/`, so
VitePress does not build it).

The following sidebar/nav entries used to point at pages that were never written, so they 404'd
when clicked. They were removed from `docs/.vitepress/config.ts` to keep the navigation clean.
Re-add the sidebar entry (and the homepage card / cross-links if relevant) once the page exists.

| Suggested route | Title | Section (sidebar key) | Intended content |
|-----------------|-------|------------------------|------------------|
| `docs/faq.md` | FAQ | `/faq` (standalone) | Frequently asked questions for end users |
| `docs/reference/config-files.md` | Config Files | `/reference/` | Reference for the server/hub `config/*.php` files and their keys |
| `docs/advanced/arr-integration.md` | ARR Integration | `/advanced/` | User-facing guide to Sonarr/Radarr/etc. integration (dev detail lives in `dev/arr-clients.md`) |
| `docs/dev/test-harness.md` | Test Harness | `/dev/` → Developer Reference | How to run and extend the test suite / harness |
| `docs/dev/debug-recipes.md` | Debug Recipes | `/dev/` → Developer Reference | Common debugging recipes and tooling |
| `docs/dev/release-process.md` | Release Process | `/dev/` → Developer Reference | How releases are cut, versioned, and published |

## How to restore one

1. Create the markdown file at the suggested route.
2. Add its entry back to the matching sidebar group in `docs/.vitepress/config.ts`.
3. Run `npm run docs:build` to confirm it resolves and appears in the sidebar.
