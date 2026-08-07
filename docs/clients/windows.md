# Phlix Windows Client

A native Windows desktop application for Phlix Media Server.

## Features

- **Native Desktop Experience**: Electron shell with Windows integration
- **All Media Types**: Video, music, photos, books, and audiobooks via `@phlix/ui`
- **System Tray**: Minimize to tray, background playback
- **Hardware Media Keys**: Windows SMTC integration and taskbar thumbnail buttons
- **Deep Links**: `phlix://` protocol for "Open in app" links
- **Auto-Update**: Enabled (requires signed builds for SmartScreen)
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
- `@phlix/ui` for all UI components
- hls.js for HLS media streaming

## Auto-Update

Auto-update is enabled for signed releases. The app checks for updates on startup and notifies you when a new version is available. Updates require user confirmation before installing.

## Settings

The app inherits schema-driven settings from the server. Local preferences (window bounds, minimize-to-tray, notifications) are stored in `%APPDATA%\phlix-windows\config.json`.

## Known Limitations

- SmartScreen warnings may appear on first run if code signing is not configured (W4.10)
- Auto-update requires signing certificates (W4.9 blocked on W4.10)
