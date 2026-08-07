# Phlix Documentation

[![Deploy Docs](https://github.com/detain/phlix-docs/actions/workflows/docs.yml/badge.svg)](https://github.com/detain/phlix-docs/actions/workflows/docs.yml)

Phlix Media Server documentation — end-user guides, developer docs, and hub-admin references.

## Live Site

Visit the published docs at: **https://detain.github.io/phlix-docs** (GitHub Pages)

## Local Development

```bash
npm install
npm run docs:dev
```

Then open http://localhost:5173

## Building

```bash
npm run docs:build   # builds to docs/.vitepress/dist, then checks heading anchors
npm run docs:preview # preview the built site
```

## The link gate — what it does and does not check

`npm run docs:build` is two gates, because one of them was missing:

| broken link | caught by |
|---|---|
| internal **page path** — `/reference/no-such-page` | VitePress (`ignoreDeadLinks: false`) |
| **same-page anchor** — `#no-such-slug` | `scripts/check-anchor-links.mjs` |
| **cross-page anchor** — `/reference/api#no-such-slug` | `scripts/check-anchor-links.mjs` |

VitePress's `ignoreDeadLinks: false` validates page paths **only**. Measured
2026-08-03 (S192), four mutations each built and each restored by file copy +
`md5sum`: a dead page exits 1 with `1 dead link(s) found`, but a bad
`#anchor` — same-page *and* cross-page — built clean and exited **0**. A
`page#anchor` where the page is also dead exits 1, which rules out the
competing theory that a `#` suppresses the whole check: the page half is
validated and the fragment is simply discarded.

`scripts/check-anchor-links.mjs` runs after `vitepress build` and reads the
emitted HTML in `docs/.vitepress/dist`, comparing every on-site `<a href>`
fragment against the `id=` attributes actually rendered on the target page. It
reads the built output rather than the markdown so it never has to re-implement
VitePress's slugify rules and cannot drift from them. It also refuses to report
success if it scanned nothing — a missing `dist`, no HTML, or no
fragment-bearing link at all is a non-zero exit saying the gate could not run.

Enabling it turned up **78 already-broken anchors across 22 pages**, all now
fixed. Two slugify rules accounted for nearly all of them, and both are easy to
get wrong by hand:

```text
## 1. Overview                     ->  id="_1-overview"    (note the leading _)
## Fixing a single item's match     ->  id="fixing-a-single-item-s-match"
## Hub & Arr integration            ->  id="hub-arr-integration"
```

Where the generated id was genuinely unusable — it contained an em or en dash —
the target heading was given an explicit ASCII anchor instead of encoding the
dash into every link:

```md
## Architecture note — why I/O in phlix-shared {#architecture-note-why-i-o-in-phlix-shared}
```

To see a page's real anchor targets:

```bash
grep -oE '<h[1-6] id="[^"]+"' docs/.vitepress/dist/reference/api.html
```

Both gates run in CI on every push, pull request and manual dispatch, in the
`Docs / Build Docs` job. Note that this repository has **no branch protection**,
so a red check is *advisory*: it is visible on the pull request but does not by
itself block a merge.

## Contributing

Doc PRs are welcome! Please keep changes focused on the markdown content in `docs/`.

Authoring conventions — sidebar registration, section landing-page keys, the
anchor-slug rules above, and the OpenAPI-sibling convention for pages under
`docs/reference/api/` — are kept in
[`.claude/rules/docs-authoring.md`](.claude/rules/docs-authoring.md). That file
is tracked deliberately: it is repo knowledge, not per-machine agent config.
The rest of `.claude/` stays ignored.

For developer docs, see the [Developer Documentation](https://detain.github.io/phlix-docs/dev/architecture-server).
For hub admin guides, see the [Hub Admin Documentation](https://detain.github.io/phlix-docs/hub-admin/install).
