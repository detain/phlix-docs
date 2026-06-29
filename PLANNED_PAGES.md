# Planned / unwritten pages

This file is a backlog, **not a published doc** (it lives at the repo root, outside `docs/`, so
VitePress does not build it).

The following sidebar/nav entries used to point at pages that were never written, so they 404'd
when clicked. They were removed from `docs/.vitepress/config.ts` to keep the navigation clean.
Re-add the sidebar entry (and the homepage card / cross-links if relevant) once the page exists.

| Suggested route | Title | Section (sidebar key) | Intended content |
|-----------------|-------|------------------------|------------------|

## How to restore one

1. Create the markdown file at the suggested route.
2. Add its entry back to the matching sidebar group in `docs/.vitepress/config.ts`.
3. Run `npm run docs:build` to confirm it resolves and appears in the sidebar.
