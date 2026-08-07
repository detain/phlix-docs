# Windows Client Developer Documentation

## Overview

The Phlix Windows Client is an Electron-based desktop application that serves as a thin consumer of `@phlix/ui`, providing platform-specific integration for Windows.

## Tech Stack

- **Shell**: Electron 42
- **Renderer**: Vue 3 with Pinia (state management), vue-router, and Vite 7
- **UI Library**: `@phlix/ui` (pinned via `github:detain/phlix-ui#<tag>`)
- **Media Playback**: hls.js for HLS streaming, integrated via `@phlix/ui`
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
