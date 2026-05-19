# Phlex Documentation

[![Deploy Docs](https://github.com/detain/phlex-docs/actions/workflows/docs.yml/badge.svg)](https://github.com/detain/phlex-docs/actions/workflows/docs.yml)

Phlex Media Server documentation — end-user guides, developer docs, and hub-admin references.

## Live Site

Visit the published docs at: **https://detain.github.io/phlex-docs** (GitHub Pages)

## Local Development

```bash
npm install
npm run docs:dev
```

Then open http://localhost:5173

## Building

```bash
npm run docs:build   # builds to docs/.vitepress/dist
npm run docs:preview # preview the built site
```

## Contributing

Doc PRs are welcome! Please keep changes focused on the markdown content in `docs/`.

For developer docs, see the [Developer Documentation](https://detain.github.io/phlex-docs/dev/architecture-server).
For hub admin guides, see the [Hub Admin Documentation](https://detain.github.io/phlex-docs/hub-admin/install).
