# Roku Channel

**Phase:** N (End-User Documentation)
**Step:** N.13
**Since:** 0.18.0

> [!TIP]
> The Phlix channel for Roku brings your media library to any Roku streaming device. Add the channel from the Roku Channel Store, open it, enter your server URL (or sign in with Hub), and start streaming. Works on all Roku models running OS 10 or later.

## Install / Store Links

- **Roku Channel Store:** Search for **Phlix** on your Roku device or at [channel.roku.com](https://channel.roku.com)
- **Developer sideload (.ipk):** [github.com/detain/phlix-roku-client/releases](https://github.com/detain/phlix-roku-client/releases) — for beta testing and development devices only

## Platform-Specific Install Steps

### Add the Official Channel (Recommended)

1. From the Roku home screen, navigate to **Streaming Channels → Search Channels**.
2. Type **Phlix** and select the Phlix channel from the results.
3. Click **Add Channel** and confirm. The channel appears on your home screen.
4. Open **Phlix** from your channel list.

### Developer Sideload (Beta / Testing Only)

1. Download the latest `.ipk` package from [github.com/detain/phlix-roku-client/releases](https://github.com/detain/phlix-roku-client/releases).
2. Set up your Roku device for development at [developer.roku.com](https://developer.roku.com) — create a developer account and register your device.
3. Use the **Roku Developer Application Loader (RDA)** to install:
   ```bash
   rokudev install Phlix-1.0.0.ipk --device 192.168.1.x
   ```
4. The channel appears in **My Channels** on the home screen.

### First Launch

On first open, the Phlix channel shows a server URL entry screen:

1. Enter your server's address:
   - **Local:** `http://192.168.1.100:32400` (replace with your server's LAN IP)
   - **Remote:** your server's public domain if you have remote access configured
2. Press **Connect** on your remote.
3. The URL is saved to persistent storage and remembered on subsequent launches.

## Hub Connection

1. In the Phlix channel, go to **Settings** (gear icon).
2. Select **Hub Login**.
3. Enter your Hub URL (e.g., `https://hub.phlix.example.com`) and press **OK**.
4. Enter your Hub username and password on the on-screen keyboard.
5. After authentication, the Hub auto-populates your server URL if you have a server claimed. No manual entry required.

Hub login also enables remote playback when you are away from home — the Hub relay handles the connection without any router configuration.

## What Can Go Wrong

### Server URL is wrong or mistyped

**Symptom:** Immediately after entering the server URL and pressing Connect, the channel displays "Unable to reach server."

**Fix:** Verify the URL protocol — `http://` and `https://` are different. Confirm the port number is correct (default is `32400`). Try using the direct LAN IP address of your server. If you are traveling, you need either a Hub relay URL or a configured VPN to reach your server remotely.

### Roku not on the same network as the server

**Symptom:** Your phone or computer can connect to the server fine, but the Roku channel shows "Server unreachable" despite a correct URL.

**Fix:** Some Roku models default to a "linked" or guest network that isolates them from other devices. In your router's admin panel, verify the Roku is on the same SSID as your server. Check that the router does not have **Client Isolation** or **AP Isolation** enabled. As a workaround, try connecting the server via Ethernet to the router instead of Wi-Fi.

### Channel store version vs. dev channel version mismatch

**Symptom:** The version of Phlix on the Channel Store behaves differently from the version you sideloaded for testing.

**Fix:** Report the discrepancy at [github.com/detain/phlix-roku-client/issues](https://github.com/detain/phlix-roku-client/issues). For production use, always rely on the Channel Store version — it has passed Roku's certification process. Dev sideloads are for beta testing only.

## Next Steps

- [Tizen](./tizen.md) — Samsung Smart TV app
- [Windows client](./windows.md) — desktop client with additional features
- [First-run wizard](../first-run.md) — configure your libraries after connecting a client
- [Roku client build guide](../dev/client-roku.md) — for developers building this channel
