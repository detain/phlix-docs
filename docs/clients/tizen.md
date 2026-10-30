---
title: Samsung Tizen TV App
description: The Phlix app for 2018-and-newer Samsung Smart TVs, sideloaded as a .wgt package
---

# Samsung Tizen TV App

**Since:** 0.18.0

> [!TIP]
> The Phlix app for Samsung Smart TVs runs on 2018 and newer Samsung TVs powered by Tizen. Enable Developer Mode on your TV, sideload the `.wgt` package from a USB drive, then open the app and enter your server URL.

## Install / Store Links

- **Samsung Galaxy Store:** [Phlix on Galaxy Store](#) <!-- placeholder: pending Samsung store submission -->
- **Direct `.wgt` download:** [github.com/detain/phlix-tizen-client/releases](https://github.com/detain/phlix-tizen-client/releases) — for sideloading

## Platform-Specific Install Steps

### Step 1 — Enable Developer Mode on the TV

1. Power on your Samsung TV and open **Settings**.
2. Navigate to **About → Support → Developer Mode**.
3. Set **Developer Mode** to **On**.
4. The TV will prompt you to restart. Confirm and wait for the TV to reboot.

> [!NOTE]
> Developer Mode must remain **On** for sideloaded apps to run. Turning it off will remove all sideloaded applications.

### Step 2 — Sideload the `.wgt` File

1. Download the latest `.wgt` file from [github.com/detain/phlix-tizen-client/releases](https://github.com/detain/phlix-tizen-client/releases) to a computer.
2. Format a USB drive as **FAT32**.
3. Copy the `.wgt` file to the root of the USB drive.
4. On the TV, open **My Apps** from the home screen.
5. Insert the USB drive into the TV's USB port.
6. Open the TV's **File Manager** app → **USB** → click the `.wgt` file.
7. Confirm the installation. The Phlix app icon appears in **My Apps**.

### Step 3 — Network Requirement

The TV must be able to reach your Phlix server — usually that means the same local network. Avoid connecting the TV to a "guest" network that isolates devices from each other.

> [!NOTE]
> The Tizen app connects directly to your server. Signing in to the Hub is **not** available on this platform yet, so there is no built-in way to reach a server that is not directly reachable from your TV's network. If you want TV-style access while away from home, the practical options today are a [VPN](../hub/remote-access.md) back to your home network, or a properly secured HTTPS reverse proxy in front of your server. (Watch-together also needs the separate SyncPlay port **8097** reachable — see [Watch together](../advanced/syncplay.md).)

## Configuration

### In-App Server URL

1. Open **Phlix** from **My Apps**.
2. On first launch, enter your server's address, for example `http://192.168.1.100:8096` (replace with your server's LAN IP or hostname).
3. The address is saved automatically. Update it later in **Settings → Server URL**.

### Signing In

After the app can reach your server, sign in with your regular Phlix user account (username and password). There is no separate Hub sign-in on this platform — the Tizen app is a direct-to-server client only.

Typing a password with a TV remote is tedious, so the app also offers **Quick-Connect**: on the sign-in screen choose **Sign in without a keyboard**, and a short code appears on the TV. Then, on your phone (or any device already signed in), open Phlix → **Sign in on TV** → type the code, and the TV logs itself in.

### Environment Variable (for Packaged Builds)

For automated or kiosk-style deployments, you can embed the server URL at build time by setting `window.PHLIX_SERVER_URL` in the build configuration. See the [Tizen client readme](https://github.com/detain/phlix-tizen-client/blob/master/README.md) for details.

## What Can Go Wrong

### Developer Mode not enabled

**Symptom:** When trying to install the `.wgt` file, the TV shows "Installation blocked" or the File Manager does not respond to the `.wgt` file.

**Fix:** Return to **Settings → About → Support → Developer Mode** and ensure it is set to **On**. After toggling, restart the TV for the change to take effect. Re-insert the USB and try again.

### Wrong TV model year / Tizen version

**Symptom:** During installation, the TV shows "This app is not compatible with this TV" or the installation silently fails.

**Fix:** Confirm your TV model year is **2018 or newer**. Phlix requires Tizen 4.0 or later. Update your TV's firmware in **Settings → Support → Software Update**. If your TV is older, use the web client (`http://your-server:8096/app`) in the TV's browser instead.

### Network isolation preventing server access

**Symptom:** The app opens but displays "Server unreachable" immediately after entering the server URL.

**Fix:** Verify the TV and your Phlix server are on the **same subnet**. Some Samsung TVs have network isolation features that prevent devices on one network from seeing each other. Ensure both devices are on the same LAN. Try using the server's direct LAN IP instead of a hostname. The Tizen app has no Hub relay sign-in, so a server that is unreachable from the TV's network simply cannot be used from that TV — see the network note above for the VPN / reverse-proxy workarounds.

## Next Steps

- [Roku](./roku.md) — alternative living room streaming platform
- [Windows client](./windows.md) — desktop app with system tray and media key support
- [Live TV](../advanced/live-tv.md) — watch live television through the Phlix app
- [Samsung Tizen client build guide](../dev/client-tizen.md) — for developers building this app
