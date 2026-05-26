# Mobile App

**Phase:** N (End-User Documentation)
**Step:** N.13
**Since:** 0.18.0

> [!TIP]
> The Phlix mobile app is available for both iOS and Android. Install it from your device's app store, open it, and enter your server URL or sign in with your Hub account. Minimum requirements: iOS 15+ or Android 10+.

## Install / Store Links

- **Apple App Store:** [Phlix on the App Store](#) <!-- placeholder: pending App Store setup -->
- **Google Play:** [Phlix on Google Play](#) <!-- placeholder: pending Play Store setup -->
- **Direct APK download:** [github.com/detain/phlix-mobile-client/releases](https://github.com/detain/phlix-mobile-client/releases) — for Android devices outside the Play Store

## Platform-Specific Install Steps

### iOS

1. Open the **App Store** on your iPhone or iPad.
2. Search for **Phlix** and tap **Get** to install.
3. For beta testing, join the **TestFlight** program via the link on the [releases page](https://github.com/detain/phlix-mobile-client/releases).
4. Open Phlix from your home screen after installation.

### Android

1. Open **Google Play** and search for **Phlix**.
2. Tap **Install** to download and install automatically.
3. For sideloading (outside Play Store):
   - Download the APK from [github.com/detain/phlix-mobile-client/releases](https://github.com/detain/phlix-mobile-client/releases).
   - Enable **Install unknown apps** in your device's security settings before running the APK.
   - Open the APK and follow the on-screen prompts.

### First Launch

On first launch, the app presents two options:

- **Enter Server URL** — type your server's address directly (e.g., `http://192.168.1.100:32400` for local access or `https://your-domain.com` for remote access)
- **Sign in with Hub** — authenticate via your Phlix Hub account, which auto-discovers all servers linked to your hub

Choose one and proceed. You can switch methods later in **Settings → Account**.

## Setup Steps

1. After connecting, the app downloads your library list and starts displaying movies, shows, and other content.
2. On first connect, grant **Camera** permission if you want to scan barcodes or use photo-based search. Grant **Storage** permission if you want to download content for offline playback.
3. A background library sync begins automatically. New or updated items appear in your library over the next few minutes.
4. To manually refresh, pull down on the library list.

## Hub Connection

Once the app is running and connected to a server, you can link it to your Hub account:

1. Tap **Settings** (gear icon) in the top-right corner.
2. Tap **Account → Sign in with Hub**.
3. Enter the Hub URL (e.g., `https://hub.phlix.example.com`) and tap **Continue**.
4. Enter your Hub username and password, then tap **Sign In**.
5. If your Hub account manages multiple servers, a picker appears — select the server you want to use.

The Hub connection allows you to access all of your Hub-linked servers without manually entering each URL, and enables secure remote playback when you are away from home.

## What Can Go Wrong

### Self-signed certificate error

**Symptom:** On first launch, the app shows "Unable to connect — certificate invalid" immediately after entering the server URL.

**Fix:** Your server is using a self-signed SSL certificate. Either replace it with a properly signed certificate (Let's Encrypt is free and automatic), or install your server's CA certificate on the mobile device. For local-only use, you can also connect over HTTP by using `http://` instead of `https://` in the server URL.

### Server not reachable when away from home

**Symptom:** The app times out or shows "Server unreachable" when you are on mobile data or a different Wi-Fi network, even though it works fine at home.

**Fix:** Use the Hub relay URL (from the sign-in-with-Hub flow) for remote access — the Hub relay handles the connection tunnel automatically. For direct access, configure port forwarding on your router for TCP port 32400, or set up a Tailscale VPN to create a private tunnel between your mobile device and your home network.

### Hub login fails

**Symptom:** Tapping "Sign in with Hub" and entering your credentials returns "Authentication failed."

**Fix:** Verify your Hub username and password. Confirm the Hub URL is entered without a trailing slash (e.g., `https://hub.phlix.example.com` not `https://hub.phlix.example.com/`). If you have forgotten your Hub password, use the password reset flow on the Hub login page.

## Next Steps

- [Web client](./web.md) — access from any browser without installing software
- [Roku](./roku.md) — living room streaming on Roku devices
- [Tizen](./tizen.md) — Samsung Smart TV app
- [Mobile client build guide](../dev/client-mobile.md) — for developers building these apps
