# Mobile App

**Since:** 0.18.0

> [!TIP]
> The Phlix mobile app runs on iOS 15+ and Android 10+. It is **not published in the App Store or Google Play yet** — for Android, download the APK from the GitHub releases page; for iOS, the app must currently be built from source.

## Install / Store Links

- **Apple App Store:** not published yet — building from source is the only iOS route today (see the [mobile client build guide](../dev/client-mobile.md)).
- **Google Play:** not published yet.
- **Direct APK download (Android):** [github.com/detain/phlix-mobile-client/releases](https://github.com/detain/phlix-mobile-client/releases) — the rolling `Latest (master)` pre-release carries `app-release.apk`.

## Platform-Specific Install Steps

### iOS

There is no App Store or TestFlight listing yet. To run Phlix on an iPhone or iPad today you build the app from source with Xcode — follow the [mobile client build guide](../dev/client-mobile.md).

### Android

1. On the phone, open [github.com/detain/phlix-mobile-client/releases](https://github.com/detain/phlix-mobile-client/releases) in a browser.
2. In the `Latest (master)` pre-release, download `app-release.apk`.
3. Enable **Install unknown apps** for your browser (or file manager) in the device's security settings.
4. Open the downloaded APK and follow the on-screen prompts.

> [!NOTE]
> The pre-release APK is a development build, updated whenever the app changes. If you prefer to compile it yourself, the release APK lands at `android/app/build/outputs/apk/release/app-release.apk` after a source build.

### First Launch

The sign-in screen is a single form — there is no choice of connection modes:

1. Enter your **Server URL** — your server's address, e.g. `http://192.168.1.100:8096` on the local network or `https://your-domain.com` if you expose it securely over HTTPS. An address typed without a scheme is assumed to be `https://`.
2. Enter your Phlix **username** and **password**, then tap **Login**.
3. If your server supports passkey sign-in, a **Sign in with a passkey** button also appears.

Signing in to the Hub is a separate, optional step you can do later from **Settings** — see [Hub Connection](#hub-connection).

## Setup Steps

1. After signing in, the app downloads your library list and starts displaying movies, shows, and other content.
2. Grant the **notifications** permission when prompted if you want alerts on this device.
3. To save content for offline playback, use the download action on a movie or episode — downloads stay on the device and play with an "Offline" badge in the player.
4. To manually refresh, pull down on the home or library list.

## Hub Connection

Once the app is connected to a server directly, you can additionally link it to your Hub account for remote access when away from home:

1. Tap **Settings** (gear icon).
2. In the **Hub** section, tap **Sign in to Hub** (hint: "Access your claimed servers remotely").
3. Enter your **Hub URL (e.g., https://hub.example.com)**, plus your Hub username and password.
4. After signing in, the app shows **Connection Mode** with a **Direct | Via Hub** toggle, an **Active Server** picker, and your **Claimed Servers** list — pick the server you want to use.

Via Hub mode routes the app's traffic through the Hub relay, so the server itself does not need to be exposed to the internet. Tap **Sign Out** in the same section to unlink the Hub account.

## What Can Go Wrong

### Self-signed certificate error

**Symptom:** On first launch, the app shows "Unable to connect — certificate invalid" immediately after entering the server URL.

**Fix:** Your server is using a self-signed SSL certificate. Either replace it with a properly signed certificate (Let's Encrypt is free and automatic), or install your server's CA certificate on the mobile device. For local-only use, you can also connect over HTTP by using `http://` instead of `https://` in the server URL.

### Server not reachable when away from home

**Symptom:** The app times out or shows "Server unreachable" when you are on mobile data or a different Wi-Fi network, even though it works fine at home.

**Fix:** Sign in to the Hub (see [Hub Connection](#hub-connection)) and switch **Connection Mode** to **Via Hub** — the Hub relay carries the connection for you, so the server need not be reachable from the outside. For direct access, configure port forwarding on your router for TCP port 8096, or set up a Tailscale VPN to create a private tunnel between your mobile device and your home network.

### Hub login fails

**Symptom:** Tapping **Sign in to Hub** and entering your credentials returns "Authentication failed."

**Fix:** Verify your Hub username and password. Confirm the Hub URL is entered without a trailing slash (e.g., `https://hub.phlix.example.com` not `https://hub.phlix.example.com/`). If you have forgotten your Hub password, use the password reset flow on the Hub login page.

## Next Steps

- [Web client](./web.md) — access from any browser without installing software
- [Roku](./roku.md) — living room streaming on Roku devices
- [Tizen](./tizen.md) — Samsung Smart TV app
- [Mobile client build guide](../dev/client-mobile.md) — for developers building these apps
