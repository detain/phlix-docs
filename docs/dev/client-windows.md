# Windows Client Developer Documentation

## Overview

The Phlix Windows Client is an Electron-based desktop application that serves as a thin consumer of `@phlix/ui`, providing platform-specific integration for Windows.

## Tech Stack

- **Shell**: Electron 42
- **Renderer**: Vue 3 with Pinia (state management), vue-router, and Vite 7
- **UI Library**: `@phlix/ui` (pinned via `github:detain/phlix-ui#<tag>` — the renderer imports pages, components, and stores from this package; it owns zero UI of its own)
- **Testing**: Vitest 3, Playwright (smoke tests)
- **Build**: electron-builder (NSIS and APPX targets)

## Architecture

### The "Thin Consumer" Rule

The Windows client renderer **owns zero UI**. All pages, components, and stores come from `@phlix/ui`. The local `src/renderer/` directory contains only:

- `main.ts` — App entry point, menu building, IPC bridge setup, deep link routing
- `overlay.tsx` — Vue JSX overlay component for player supplements (PiP, sleep timer, skip intro)
- `electronBridge.ts` — IPC bridge between renderer and main process
- `components/` — PlayerSupplement.tsx, PiPButton.tsx, SleepTimer.tsx (player control overlays)
- `stores/` — Local state (auth store, connection store, etc.)

### Main Process (`src/main/index.ts`)

Handles:
- Window management (bounds persistence, single-instance lock)
- Tray icon and context menu
- Protocol handling (`app://` for local assets, `phlix://` for deep links)
- IPC handler registration
- Power save blocker during playback
- Thumbar buttons and taskbar progress
- Native notifications

### Preload Script (`src/preload/index.ts`)

Exposes a limited, context-isolated API surface to the renderer via `contextBridge`. All IPC channels are allow-listed and typed.

### Key Files

| File | Purpose |
|------|---------|
| `src/main/index.ts` | Main process entry, window creation, IPC handlers |
| `src/preload/index.ts` | Context bridge API surface |
| `src/renderer/main.ts` | Renderer entry, menu config, router setup, deep link queue |
| `src/renderer/electronBridge.ts` | IPC client wrappers for renderer |
| `src/renderer/overlay.tsx` | Player supplement overlay (PiP, timer, skip) |
| `docs/ipc-channels.md` | All IPC channels documented |

### Dependency Pins

| Package | Pin Form | Reason |
|---------|----------|--------|
| `@phlix/ui` | `github:detain/phlix-ui#<tag>` | GitHub tag with built dist/ |
| `@phlix/contracts` | `github:detain/phlix-contracts#<tag>` | Type contracts |
| `electron` | `^42.0.0` | Hardcoded minor version |
| `electron-log` | `^5.0.0` | Logging |
| `electron-store` | `^8.0.0` | Persistent storage |

## Development

```bash
# Install dependencies
npm ci

# Development build
npm run dev

# Production build
npm run build

# Run tests
npm test

# Run smoke test (requires display)
npm run smoke

# Lint
npm run lint
```

## Testing Strategy

- Unit tests: `tests/unit/` — Vitest
- Smoke tests: `tests/smoke/boot.spec.ts` — Playwright Electron
- Coverage: src/main/** and src/preload/** are included (W0.7 removed exclusions)

## Build Outputs

- NSIS installer: `.exe` (per-user install, no admin required)
- APPX: `.appx` for Windows Store
- Both are gated on lint + typecheck + tests + smoke (W6.1)

## Boot Sequence

The renderer entry point is `src/renderer/main.ts`. The module-level call `void boot()` runs at load
and is exported for testing. The call chain is:

```
boot()
  ├─ hubGetConfig()          — read persisted Hub config (null if not configured)
  ├─ getDeviceId()           — read or generate+persist windows-<uuid>
  ├─ getServerUrl()          — read persisted direct server URL (null if not set)
  ├─ resolveAppConfig()      — pure: hub-mode vs server-mode, resolves apiBase
  ├─ buildPhlixHeaders()     — @phlix/contracts: { deviceId, deviceName, deviceType }
  ├─ createPhlixApp()        — @phlix/ui: boots Vue 3 + Pinia + vue-router (the entire UI)
  ├─ app.mount('#phlix-app') — mounts the Vue app into the DOM
  └─ installElectronBridge() — wires Electron tray/menu/media IPC → @phlix/ui player store + router
```

`resolveAppConfig({ hub, serverUrl, envUrl })` is pure and unit-tested:
- Hub mode (`{ app: 'hub', apiBase: hub.hubUrl }`) when `hub.hubUrl` is set AND
  `hub.connectionMode !== 'direct'`.
- Server mode (`{ app: 'server', apiBase }`) resolved as `serverUrl || envUrl || 'http://localhost:8096'`.

In plain-browser dev (no `window.electronAPI`), `boot()` falls back to a per-session `browser-<uuid>`,
no hub, and `VITE_PHLIX_SERVER_URL` for the server URL.

## The `app://` Protocol

### Why `loadFile` is not used in production

`BrowserWindow.loadFile()` bypasses all URL handlers — it loads the file directly off disk and assigns
the window an opaque `file://` origin. This breaks the renderer bundle's dynamic `import()` calls
because `import()` from a `file://` origin triggers CORS errors in Chromium (cross-origin `file://` loads
are blocked).

### How `app://` works

The main process registers a `protocol.registerFileProtocol('app', ...)` **at module load time, before
`app.whenReady()` is called**. When the renderer navigates to `app://index.html`, this handler serves
the file from `__dirname` (the packaged `dist/main/` directory). Because the URL scheme is `app://`
(not `file://`), Chromium assigns it an **opaque origin** that is distinct from every other origin.
Dynamic `import()` calls from within the bundle are same-origin to the opaque `app://` origin, so CORS
is satisfied and bundled ES modules load without errors.

### The `createWebHistory` conflict

`@phlix/ui` uses `createWebHistory()` (HTML5 history API) for client-side routing. `createWebHistory`
intercepts `pushState`/`replaceState` and syncs the URL bar without full page reloads. When Electron's
`loadFile` is used, the URL bar shows `file://.../index.html`, which:
1. Exposes internal filesystem paths to users.
2. Confuses `createWebHistory`'s origin detection, causing route mismatches on fresh load.

By using `app://` and `createWebHashHistory()` (or by using `createWebHistory` with `app://`), the
renderer gets a clean opaque origin that satisfies both CORS requirements for ES module dynamic imports
and `@phlix/ui`'s routing expectations.

## Dependency Pinning Story

### The `dist/`-before-tag rule

This repo **always builds `dist/` locally before tagging a release**. The tag (`vX.Y.Z`) is a pointer
to a specific local build — it identifies what was built, not what to build. The workflow is:

```
1. Build locally: npm run build  →  dist/ (gitignored, never committed)
2. git add . && git commit -m "build: vX.Y.Z"
3. git tag vX.Y.Z
4. git push origin vX.Y.Z  →  triggers build.yml
5. build.yml packages dist/ (already built) into release artifacts
```

### The inert-master trap

`master` is **always behind the latest tag** because it carries the built artifact in `dist/` at tag
time. Any subsequent commits to `master` after a tag — including dependabot PRs, documentation fixes,
or CI config changes — modify source only; `dist/` is not updated until the next build-and-tag cycle.
This means:
- `master` is **inert** — it cannot be `npm install`ed and expected to run.
- The **tag** is the authoritative build artifact identifier.
- To reproduce a build, check out the tag (not master) and run `npm run package` directly.

This is intentional: the tag + `dist/` (in the tag's tree) = reproducible artifact. No build server
is needed to reconstruct what a tag contains.

## Building and Releasing

### CI pipeline (`build.yml`)

`build.yml` triggers on tag push and runs the following jobs in sequence:

| Job | Steps |
|-----|-------|
| **Lint** | `npm ci && npm run lint` (ESLint flat config) |
| **Typecheck** | `npx vue-tsc --noEmit && npx tsc -p tsconfig.main.json --noEmit` |
| **Test** | `npx vitest run --coverage` |
| **Smoke** | Playwright Electron boot test (`tests/smoke/boot.spec.ts`) |
| **Package** | `npm run build && npm run package && npm run package:store` |
| **Release** | Upload NSIS `.exe` + APPX `.appx` to GitHub Release; generate `SHA256SUMS.txt` + `latest.yml` |

All five gates (lint, typecheck, test, smoke, package) must pass before artifacts are uploaded.
`SHA256SUMS.txt` contains the SHA-256 digest of every artifact. `latest.yml` follows the
[electron-builder auto-update schema](https://www.electron.build/configuration/publish.html) and is
used by `@electron/auto-update` clients to locate the latest version.
