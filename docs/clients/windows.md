# Windows Desktop App

**Since:** 0.18.0

> [!TIP]
> The Phlix Windows app is a full-featured Electron desktop client with system tray integration and media key support. Download the installer, run it, enter your server URL, and start streaming. No admin privileges required for per-user installs.

## Install / Store Links

- **Installer (.exe):** [github.com/detain/phlix-windows-client/releases](https://github.com/detain/phlix-windows-client/releases) — download the latest `.exe` installer
- **System requirements:** Windows 10 (version 1903+) or Windows 11; 4 GB RAM; graphics acceleration recommended for smooth playback

The installer handles the Visual C++ runtime dependency automatically. Auto-update checks for new tagged releases on launch, notifies you, and asks before restarting. Rolling master builds are not offered via auto-update.

## Platform-Specific Install Steps

1. Download the latest `.exe` installer from the [releases page](https://github.com/detain/phlix-windows-client/releases).
2. Run the installer:
   - **Per-user install (recommended):** Defaults to `%LOCALAPPDATA%\Phlix` — no administrator privileges required.
   - **System-wide install:** Choose "Install for all users" and grant admin elevation when prompted — installs to Program Files.
3. Launch **Phlix** from the **Start Menu** or the desktop shortcut.
4. The system tray icon appears in the bottom-right corner — the app runs in the tray by default. Right-click for quick controls: **Open**, **Play/Pause**, **Stop**, **Rewind (±10s)**, **Forward (±10s)**, and **Quit**.

## Setup Steps

### First Launch — Direct Mode

On first launch, the app prompts you to connect to a server:

1. Enter your server URL:
   - **Local:** `http://localhost:8096` (same machine) or `http://192.168.1.100:8096` (LAN IP)
   - **Remote:** your server's public domain
2. Click **Connect**.
3. Enter your server username and password.

The server URL is stored in `%APPDATA%\phlix-windows\config.json` (electron-store). Authentication tokens (JWT) are stored in the browser's `localStorage`.

### Settings

- **Server:** Update the direct server URL in **Settings → Server → Server URL**
- **Startup:** Enable **Settings → Startup → Launch on Windows logon** to start the app minimized to the system tray automatically
- **Playback:** Adjust default quality, subtitle language, and audio track preferences in **Settings → Playback**

## Hub Connection

When connected to a Phlix Hub (Settings → Hub → Enable Hub Connection), the app auto-discovers your servers from your Hub account. Enter your Hub URL (e.g., `https://hub.phlix.example.com`) and authenticate with your Hub credentials.

## Troubleshooting

### Blank window on launch (W0.1 — preload path)

**Symptom:** The app launches but shows a completely blank window.

**Cause:** The preload script path is incorrect after a build or route change.

**Fix:** Run a clean build: `npm run build`. If the issue persists, verify `app.getPath('userData')` points to a valid directory and that the preload script exists at `dist/preload/index.js` next to `dist/main/index.js`.

### Missing tray icon

**Symptom:** No tray icon appears in the system tray after launch.

**Cause:** The tray icon file (`build/icon.png`) was not included in the package, or the path resolution failed.

**Fix:** Verify `build/icon.png` exists and the `files` array in `package.json`'s `build` section includes `build/**`. Check the logs at `%APPDATA%\phlix-windows\logs\` for `[tray] Icon not found` entries.

### Posters not loading on HTTP server

**Symptom:** Movie posters appear as broken images when connected to an HTTP (non-HTTPS) server.

**Cause:** The app's Content Security Policy restricts media sources. The CSP allows `http:` for `img-src` (posters), but some poster URLs may be blocked by other directives or by the browser loading mixed content.

**Fix:** Use an HTTPS server where possible. If using HTTP locally, ensure your media library's poster URLs resolve correctly and are not redirected to HTTPS by your server configuration.

### HLS not playing

**Symptom:** Direct playback works but HLS streams fail to load or play.

**Cause:** The WebView2 or Chromium engine blocks HLS playback if `worker-src blob:` is not permitted, or WebSocket connections to the Hub relay (`wss:`) are blocked.

**Fix:** Verify the CSP in `src/renderer/index.html` includes `worker-src 'self' blob:`. For Hub relay streaming, confirm `wss:` is in `connect-src` (it is: `connect-src ... ws: wss:`). Check that corporate firewalls or VPN configurations are not blocking WebSocket connections.

### Port 8096 blocked by firewall

**Symptom:** The app shows "Connection refused" or "Server unreachable" when connecting to a local server, even though the server is running.

**Fix:** Windows Defender Firewall may be blocking the connection. Either add an inbound rule for `phlix-server.exe` in **Windows Defender Firewall → Allow an app**, or run the server once as Administrator to trigger the Windows firewall dialog. Ensure the rule allows TCP port 8096.

## Next Steps

- [Mobile app](./mobile.md) — iOS and Android
- [Web client](./web.md) — browser-based access without installing software
- [Hardware transcoding](../advanced/hardware-transcoding.md) — GPU acceleration on Windows for smooth 4K playback
- [Windows client build guide](../dev/client-windows.md) — for developers building this app
