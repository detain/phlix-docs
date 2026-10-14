# Roku Channel

**Since:** 0.18.0

> [!NOTE]
> **Device verification status:** The Roku channel was remediated in 2026 (phases R0–R9) but has **never been tested on physical hardware** due to no device being available. Static analysis (brighterscript `bsc`, `make verify-runtime`) is the only automated quality bar. Functional testing requires a physical Roku device or emulator.

> [!TIP]
> The Phlix channel for Roku brings your media library to any Roku streaming device. The channel is **not published in the Roku Channel Store yet** — today it is installed by developer sideload. Open it, enter your server (or Hub) URL on the Connect screen, sign in with your account, and start streaming.

## Install / Store Links

- **Roku Channel Store:** not published yet. When certification and submission happen, this section will link the listing.
- **Developer sideload (zip package):** [github.com/detain/phlix-roku-client/releases](https://github.com/detain/phlix-roku-client/releases) — the rolling `Latest (master)` pre-release carries `phlix.zip`, installed through the Roku's device installer.

## Platform-Specific Install Steps

### Developer Sideload (the only route today)

1. On the Roku remote, press **Home 5×, Up 2×, Right, Left, Right, Left, Right** to open the hidden developer menu, then follow the prompts to enable developer mode (you will set a device password). Note the device's IP address.
2. Download `phlix.zip` from the [releases page](https://github.com/detain/phlix-roku-client/releases).
3. In a browser on the same network, open `http://<ROKU_IP>` (the device web interface), go to the **Installer**, upload `phlix.zip`, and click **Install**.
4. The channel appears on your home screen as a developer channel.

> [!NOTE]
> If you build from source instead of downloading the package, `make package` produces `phlix.zip` and `make install` pushes it straight to a dev-enabled device. Store submission (`make package-signed`) requires a real Roku code-signing certificate and is documented in the repository's publishing guide.

### First Launch

On first open (no saved address yet), the channel shows a **Connect to server** screen:

1. Enter your server's address — either a direct Phlix server (e.g. `http://192.168.1.100:8096`) or a Phlix Hub URL. A missing scheme is inferred (`http://` for local addresses, `https://` otherwise).
2. Press **Connect**. The channel checks the address with a quick health probe before saving it; if the probe fails you can still choose **Connect anyway**.
3. Next comes the sign-in screen: enter your **username** and **password** (the server address lives only on the Connect screen — you are not asked again).
4. On later launches the saved address is reused and you land straight on login (or Home if your session is still valid).

## Hub Connection

There is no separate "Hub login" switch. Instead: on the **Connect screen**, enter your Hub URL instead of a server URL, then sign in with your Hub account as usual. The channel detects that it reached a Hub right after login and shows a **server picker** listing your claimed servers with their online/offline status — pick one and every request is routed through the Hub relay to that server, so nothing on the server side needs router configuration.

To switch servers later, sign out and back in (the picker returns). To go back to a direct connection, re-enter the direct server URL on the Connect screen.

> [!NOTE]
> **SyncPlay / Watch Together:** This feature is **direct-connection only** on Roku. The channel speaks plain, unencrypted WebSocket (`ws://`) directly to your server's SyncPlay port **8097** — Roku's socket API has no TLS support at all, so `wss://` is impossible for this client, and the Hub relay's HTTP proxy carries no WebSocket traffic. In hub mode the Watch Together overlay opens with "Watch Together isn't available in hub mode yet". On a LAN this works as-is; remotely you would need the server's plaintext `:8097` reachable by the Roku (not recommended without a VPN).

## What Can Go Wrong

### Server URL is wrong or mistyped

**Symptom:** Immediately after entering the server URL and pressing Connect, the channel displays "Unable to reach server."

**Fix:** Verify the URL protocol — `http://` and `https://` are different. Confirm the port number is correct (default is `8096`). Try using the direct LAN IP address of your server. If you are away from home, enter your Hub URL on the Connect screen instead (see [Hub Connection](#hub-connection)), or use a configured VPN to reach your server directly.

### Roku not on the same network as the server

**Symptom:** Your phone or computer can connect to the server fine, but the Roku channel shows "Server unreachable" despite a correct URL.

**Fix:** Some Roku models default to a "linked" or guest network that isolates them from other devices. In your router's admin panel, verify the Roku is on the same SSID as your server. Check that the router does not have **Client Isolation** or **AP Isolation** enabled. As a workaround, try connecting the server via Ethernet to the router instead of Wi-Fi.

### Updating the sideloaded channel

**Symptom:** You installed Phlix weeks ago and want the newer build.

**Fix:** Download the current `phlix.zip` from the [releases page](https://github.com/detain/phlix-roku-client/releases) and install it through the device web interface again (`http://<ROKU_IP>` → Installer) — the same channel ID is replaced in place, and your saved server address and session survive the update.

## Next Steps

- [Tizen](./tizen.md) — Samsung Smart TV app
- [Windows client](./windows.md) — desktop client with additional features
- [First-run wizard](../first-run.md) — configure your libraries after connecting a client
- [Roku client build guide](../dev/client-roku.md) — for developers building this channel
