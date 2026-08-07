# Windows client build guide

> Developer build spec for the Phlix Windows desktop app — Electron + Vue 3.
> For end-user install and setup, see [Windows Desktop App](/clients/windows).

## Minimum Server Version

**Phlix Media Server 1.1.0** or later is required. All key client features (skip-intro markers, SyncPlay groups, media facets, schema-driven settings) depend on server 1.1.0 or later.

> **Hub relay limitation:** The Hub relay supports DELETE but not PUT — this is a server-side gap; a future server release will add PUT support.

## Table of Contents

1. [Architectural Rule](#1-architectural-rule)
2. [Technology Stack](#2-technology-stack)
3. [Entry Points and Boot Sequence](#3-entry-points-and-boot-sequence)
4. [The `app://` Protocol](#4-the-app-protocol)
5. [IPC Channels](#5-ipc-channels)
6. [Dependency Pinning](#6-dependency-pinning)
7. [Testing](#7-testing)
8. [Building and Releasing](#8-building-and-releasing)

---

## 1. Architectural Rule

> **The renderer owns no UI.**

Pages, components, stores, and the API client all live in `@phlix/ui`. This repo (`phlix-windows-client`) supplies only:

- The Electron shell (main + preload process)
- The `apiBase` URL (server endpoint)
- Device identification headers (`X-Phlix-Device-ID`, `X-Phlix-Device-Name`, `X-Phlix-Device-Type: windows`)
- The boot configuration passed to `createPhlixApp()`

### What happens when that rule is broken

Phase W2 discovered 14 components, 2 screens, 1 page, and 1 store had been added locally — almost all duplicating what `@phlix/ui` already provides. Phase W2 deleted them, recovering roughly 1,900 lines. The renderer should never re-implement anything that exists in `@phlix/ui`.

---

## 2. Technology Stack

| Component | Technology | Notes |
|-----------|------------|-------|
| Shell | Electron 42 | Main + preload process |
| Renderer | Vue 3 + TypeScript | Consumed via `@phlix/ui`'s `createPhlixApp()` |
| State | Pinia | Owned by `@phlix/ui`; exposed through the bridge |
| Router | vue-router | Provided by `@phlix/ui` |
| Bundler (renderer) | Vite 7 | With `@vitejs/plugin-vue-jsx` for `.tsx` files |
| Bundler (main) | `tsc` | Compiles `src/main/index.ts` → `dist/main/index.js` |
| Streaming | hls.js | Provided by `@phlix/ui`; handles HLS manifest parsing |
| Test runner | Vitest 3 | jsdom environment |
| Packager | electron-builder | Produces NSIS (`.exe`) and APPX (Microsoft Store) |
| Coverage | @vitest/coverage-v8 | Enabled in the Vitest config |

> [!NOTE]
> `.tsx` files in this project use **Vue JSX** (via `@vitejs/plugin-vue-jsx`), NOT React JSX. The plugin name is deliberately similar but is a completely different transform.

---

## 3. Entry Points and Boot Sequence

### Three entry points

| File | Role |
|------|------|
| `src/main/index.ts` | Electron main process — window creation, menu, tray, IPC handlers, auto-updater |
| `src/preload/index.ts` | Preload script — context bridge exposing `window.phlixBridge` to the renderer |
| `src/renderer/main.ts` | Renderer entry — calls `boot()` and mounts the Vue app |

### Boot sequence

```
boot()
  └─ resolveAppConfig()        # Merge CLI args, env vars, stored config
       └─ createPhlixApp()      # @phlix/ui — returns a Vue app instance with router, store, API client
            └─ mount()           # Renderer mounts into #app
                 └─ installElectronBridge()  # Wire window.phlixBridge to the Vue app
```

`resolveAppConfig()` reads the stored server URL (or falls back to the default), applies any command-line overrides, and passes the resulting `appConfig` to `createPhlixApp()`.

---

## 4. The `app://` Protocol

### Why `loadFile` does not work

In production, the packaged renderer lives inside the Electron ASAR archive. Using `mainWindow.loadFile()` results in a `file://` URL, which triggers the **opaque-origin module-fetch block**: the browser will refuse to load ES modules (import maps, dynamic `import()`, etc.) from a `file://` origin due to cross-origin restrictions.

### The `app://` protocol workaround

Electron's `protocol` module registers `app://` as a custom, privileged scheme. The main process serves the renderer bundle over this scheme, giving it a proper origin (`app://-`) that bypasses the opaque-origin block.

```
app://-/app  →  renderer bundle index.html inside ASAR
```

### Interaction with `createWebHistory`

`@phlix/ui` uses `createWebHistory()` (HTML5 history mode) for client-side routing. Because the renderer runs at `app://-/`, Vue Router can use `/`-prefixed routes without conflicts. The `app://` origin is stripped from the URL in the address bar, so users see only the path portion (e.g., `/library/movies`).

---

## 5. IPC Channels

The preload bridge exposes a typed set of channels. Key channels include:

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `phlix:version` | main → renderer | App version for display |
| `phlix:open-external` | renderer → main | Open a URL in the system browser |
| `phlix:window-minimize` | renderer → main | Minimize the window |
| `phlix:window-maximize` | renderer → main | Maximize / restore the window |
| `phlix:window-close` | renderer → main | Close or hide to tray |
| `phlix:get-app-config` | renderer → main | Retrieve server URL, device headers |

---

## 6. Dependency Pinning

Both `@phlix/ui` and `@phlix/contracts` are pinned by **GitHub tag**, never by branch or semver range.

### The `dist/`-before-tag rule

A tag is only bumped **after** the `dist/` artifacts are published to npm. Pinning to a tag that has no published `dist/` will cause runtime failures — the import will resolve to source (`.ts`) files that cannot execute in the browser without a build step.

```bash
# Correct — dist/ artifacts exist at this tag
npm install @phlix/ui@v2.4.1

# Wrong — tag was pushed but dist/ was not yet published
npm install @phlix/ui@broken-tag
```

### Workflow

1. Build `@phlix/ui` locally → `dist/` is generated
2. Tag the commit: `git tag v2.4.1 && git push origin v2.4.1`
3. CI publishes to npm: `npm publish` from the `dist/` directory
4. Only then may `phlix-windows-client` update its lockfile to `@phlix/ui@v2.4.1`

---

## 7. Testing

### Vitest suite

Tests live in `tests/` at the repo root and run with jsdom:

```bash
npm test           # Run once
npm run test:watch # Watch mode
npm run test:coverage # With coverage report
```

### Boot smoke test

The boot smoke test (`tests/smoke/boot.test.ts`) verifies that `createPhlixApp()` resolves without throwing. On Linux, this requires Xvfb because Electron cannot open a display natively in CI:

```bash
xvfb-run --auto-servernum npm test
```

The `auto-servernum` flag allocates a virtual framebuffer automatically (port 99 + display number).

### Coverage targets

Coverage is collected via `@vitest/coverage-v8`. Reports are generated in `coverage/` and can be uploaded to Codacy or similar services.

---

## 8. Building and Releasing

### Signing (W4.10 — blocked on secrets)

Code signing is handled by electron-builder against a stored certificate. **This step is currently blocked** — the signing secrets have not been injected into the CI environment. NSIS and APPX outputs will be unsigned until secrets are available.

### Updater feed (W4.9)

The auto-updater polls a release feed on launch. The feed URL is configured at build time via `ELECTRONUpdater.feedUrl`. When a new release is available, the app prompts the user to download and install it. The updater feed configuration is part of W4.9.

### `files` allow-list (W4.11)

The `electron-builder` `files` field restricts what gets bundled into the packaged app. The allow-list is defined in the builder config and must be kept in sync with the boot sequence — any new entry point or asset must be added here or it will be missing from the package.

### Build commands

```bash
npm run build        # Build renderer (Vite) + main (tsc)
npm run package      # electron-builder --win --publish never  (NSIS)
npm run package:store # electron-builder --win appx            (Microsoft Store)
```

Both NSIS and APPX targets are configured in `electron-builder.json` / the `build` section of `package.json`.

---

**Document Version:** 3.0
**Last Updated:** 2026-08-07
