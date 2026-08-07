# Phlix Windows Client

A native Windows desktop application for Phlix Media Server.

## Features

- **Native Desktop Experience**: Electron shell with Windows integration
- **All Media Types**: Video, music, photos, books, and audiobooks via `@phlix/ui`
- **System Tray**: Minimize to tray, background playback
- **Hardware Media Keys**: Windows SMTC integration and taskbar thumbnail buttons *(Windows SMTC verification pending — see W4.x)*
- **Deep Links**: `phlix://` protocol for "Open in app" links
- **Auto-Update**: Checks GitHub tagged releases on startup; notifies and asks user confirmation before restarting (see W4.9)
- **Window Management**: Persistent bounds, maximized state, off-screen fallback

## Requirements

- Windows 10 or later
- Phlix Media Server 1.1.0 or later

## Installation

Download the latest NSIS installer from the Releases page. The installer does not require administrator privileges — it installs per-user to `%LOCALAPPDATA%\Phlix`.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Play/Pause (when player focused) |
| Left/Right | Seek (when player focused) |
| F11 | Toggle fullscreen |

## Tech Stack

- Electron 42 shell
- Vue 3 + Pinia + vue-router
- `@phlix/ui` for all UI components (HLS streaming handled by `@phlix/ui`)

## Auto-Update

The app checks GitHub for new tagged releases on startup. When a newer version is available, a notification is shown asking for confirmation before restarting to apply the update. Signed builds are required for SmartScreen compatibility (see W4.9, W4.10).

## Settings

The app inherits schema-driven settings from the server. Local preferences (window bounds, minimize-to-tray, notifications) are stored in plain JSON via `electron-store` at `%APPDATA%\phlix-windows\config.json`. Authentication JWTs are stored in the renderer process `localStorage`.

## Known Limitations

- SmartScreen warnings may appear on first run if code signing is not configured (W4.10)
- Auto-update requires signing certificates (W4.9 blocked on W4.10)
