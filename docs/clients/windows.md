# Windows Desktop App

**Since:** 0.18.0

> [!TIP]
> The Phlix Windows app is a full-featured Electron desktop client with system tray integration and media key support. Download the installer, run it, enter your server URL, and start streaming. No admin privileges required for per-user installs.

> [!NOTE]
> Hub-mode support (connecting to a Phlix Hub and auto-discovering servers) is planned for a future release. Currently, the Windows app connects directly to a server URL. Hub connection features will be documented once the feature is released.

## Install / Store Links

- **Installer (.exe):** [github.com/detain/phlix-windows-client/releases](https://github.com/detain/phlix-windows-client/releases) — download the latest `.exe` installer
- **System requirements:** Windows 10 (version 1903+) or Windows 11; 4 GB RAM; graphics acceleration recommended for smooth playback

The installer handles the Visual C++ runtime dependency automatically. Auto-update is built in — the app checks for new releases on launch and prompts you to install.

## Platform-Specific Install Steps

1. Download the latest `.exe` installer from the [releases page](https://github.com/detain/phlix-windows-client/releases).
2. Run the installer:
   - **Per-user install (recommended):** Defaults to `%LOCALAPPDATA%\Phlix` — no administrator privileges required.
   - **System-wide install:** Choose "Install for all users" and grant admin elevation when prompted.
3. Launch **Phlix** from the **Start Menu** or the desktop shortcut.
4. The system tray icon appears in the bottom-right corner — the app runs in the tray by default. Right-click for quick controls: **Open**, **Play/Pause**, **Next**, and **Quit**.

## Setup Steps

### First Launch — Direct Mode

On first launch, the app prompts you to connect to a server:

1. Enter your server URL:
   - **Local:** `http://localhost:32400` (same machine) or `http://192.168.1.100:32400` (LAN IP)
   - **Remote:** your server's public domain
2. Click **Connect**.
3. Enter your server username and password.

The URL and credentials are stored securely in the Windows Credential Manager.

### Settings

- **Server:** Update the direct server URL in **Settings → Server → Server URL**
- **Startup:** Enable **Settings → Startup → Launch on Windows logon** to start the app minimized to the system tray automatically
- **Playback:** Adjust default quality, subtitle language, and audio track preferences in **Settings → Playback**

## Hub Connection

> **Note:** Hub-mode support is under development. This section will be updated once the feature is released. To connect remotely without hub-mode, use your server's public URL directly or set up a Tailscale VPN.

When hub-mode is available, you will be able to:

1. Open **Settings → Hub → Enable Hub Connection**.
2. Enter your Hub URL (e.g., `https://hub.phlix.example.com`).
3. Authenticate with your Hub credentials.
4. Your server will be auto-discovered from your Hub account.

## What Can Go Wrong

### App does not launch (missing VC++ runtime)

**Symptom:** Phlix crashes immediately on launch, or a dialog appears stating "VCRUNTIME140.dll not found."

**Fix:** Install the Visual C++ 2015–2022 Redistributable from [Microsoft's official page](https://aka.ms/vs/17/release/vc_redist.x64.exe). The link is also in the release notes on the [releases page](https://github.com/detain/phlix-windows-client/releases). Restart the app after installation.

### Port 32400 blocked by firewall

**Symptom:** The app shows "Connection refused" or "Server unreachable" when connecting to a local server, even though the server is running.

**Fix:** Windows Defender Firewall is blocking the connection. Either add an inbound rule for `phlix-server.exe` in **Windows Defender Firewall → Allow an app**, or run the server once as Administrator to trigger the Windows firewall dialog. Ensure the rule allows TCP port 32400.

### Hub relay not working (network issue)

**Symptom:** Local LAN connection works, but remote access via Hub relay fails — the app spins or shows "Connection error" when away from home.

**Fix:** Verify both the client machine and the server have working internet connectivity. Check that your network does not block WebSocket connections (`ws://` or `wss://`) — common on coffee shop and enterprise networks. Try a different network (e.g., your phone's hotspot) to isolate whether the issue is network-specific. Also confirm the Hub relay URL is accessible from outside your network.

## Next Steps

- [Mobile app](./mobile.md) — iOS and Android
- [Web client](./web.md) — browser-based access without installing software
- [Hardware transcoding](../advanced/hardware-transcoding.md) — GPU acceleration on Windows for smooth 4K playback
- [Windows client build guide](../dev/client-windows.md) — for developers building this app
