---
description: Authoring and publishing conventions for the VitePress docs site
paths:
  - docs/**/*.md
  - docs/.vitepress/config.ts
---

# Docs authoring

## New pages must be registered in the sidebar

A new `.md` file under `docs/` does not appear in site navigation on its own —
add a matching entry to the sidebar array in `docs/.vitepress/config.ts`:

```ts
{ text: 'SSO (OIDC, LDAP & GitHub)', link: '/security/sso-oidc-ldap' },
{ text: 'JWKS API', link: '/reference/api/hub-jwks' },
```

Links are site-root-relative and omit the `.md` extension.

## Section landing pages need their own sidebar key

A `docs/<section>.md` landing page serves `/<section>` with no trailing slash, so
it does not match the `'/<section>/'` sidebar keys — give it a separate key in
`docs/.vitepress/config.ts` (longest-prefix matching keeps `'/hub-admin/'`
winning over `'/hub'` for pages inside `docs/hub-admin/`):

```ts
'/reference': [{ text: 'Reference', link: '/reference' }],
```

## The build is the link gate — but it is TWO gates, not one

`npm run docs:build` fails on a bad internal **page path** *and* on a bad
**heading anchor**, but those are two separate mechanisms and it matters which
one you are relying on:

| broken link | caught by | since |
|---|---|---|
| page path — `/reference/no-such-page` | VitePress `ignoreDeadLinks: false` | always |
| same-page anchor — `#no-such-slug` | `scripts/check-anchor-links.mjs` | S192 |
| cross-page anchor — `/reference/api#no-such-slug` | `scripts/check-anchor-links.mjs` | S192 |

⚠ **`ignoreDeadLinks: false` alone does NOT check anchors.** Measured 2026-08-03
(S192), four mutations each built and each restored by file copy + `md5sum`: a
dead page exits 1 with `1 dead link(s) found`; a bad `#anchor`, same-page *and*
cross-page, built clean and exited **0**. `page#anchor` with a dead page exits 1
— the page half is checked and the fragment is discarded, so a `#` does not
suppress the whole link. Before S192 this rule file claimed anchors were
covered; they were not. Do not remove the second gate on the belief that
VitePress covers it.

Run after any edit that adds or changes links or headings:

```bash
npm run docs:build      # vitepress build + the anchor gate
npm run check:anchors   # anchor gate alone, against the existing dist/
npm run docs:preview
```

### Anchor slugs are not what you would guess

The anchor gate compares link fragments against the `id=` attributes in the
**emitted HTML**, so it is always right about the real target. Three rules bite
often — all three produced real broken links in this repo:

```text
## 1. Overview                  ->  id="_1-overview"    (leading _ before a digit)
## Fixing a single item's match  ->  id="fixing-a-single-item-s-match"
## Hub & Arr integration         ->  id="hub-arr-integration"   (not "hub--arr")
```

Check a page's real targets rather than guessing:

```bash
grep -oE '<h[1-6] id="[^"]+"' docs/.vitepress/dist/reference/api.html
```

When the generated id contains an em or en dash, do **not** encode the dash into
every inbound link — give the target heading an explicit ASCII anchor:

```md
## Architecture note — why I/O in phlix-shared {#architecture-note-why-i-o-in-phlix-shared}
```

### Enforcement is advisory

Both gates run in CI as `Docs / Build Docs` on every push, pull request and
manual dispatch (that job deliberately carries no `if:`, because a skipped job
reports `skipped`, which counts as success). This repository has **no branch
protection**, so a red check is visible on the pull request but does not by
itself block a merge.

## API reference pages

Pages under `docs/reference/api/` pair a prose `.md` with a machine-readable
OpenAPI `.yaml` sibling — e.g. `docs/reference/api/hub-jwks.md` alongside
`docs/reference/api/hub-jwks.yaml` — and the prose page references the spec by
path.
