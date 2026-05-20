# Web Portal

**Phase:** N (End-User Documentation)
**Step:** N.13
**Since:** 0.18.0

> [!TIP]
> The Phlix web portal runs in any modern browser — no software to install. Navigate to your server's web address, sign in with your Hub account or enter a direct server URL, and start streaming immediately. Works on Chrome, Firefox, Safari, and Edge.

## Install / Store Links

- **No installation required** — open the URL in your browser and start using it
- **Supported browsers:** Chrome 110+, Firefox 115+, Safari 16+, Edge 110+
- **Mobile browsers:** Fully functional but optimized for desktop

Bookmark your server's web portal URL:
```
https://your-server-domain.com/web
```
Or for local access:
```
http://192.168.1.100:32400/web
```

## Platform-Specific Notes

- The web portal requires the server's web address to be reachable from your browser — either on the local network or via a Hub relay / reverse proxy.
- Some browser extensions (ad blockers, privacy extensions) may interfere with playback. If playback does not start, try disabling extensions or using an incognito/private window.
- For best playback performance, use a browser with hardware acceleration enabled (Chrome and Edge have this on by default).

## Setup Steps

### Open the Web Portal

1. Open your browser and navigate to your server's web URL.
2. You land on the Phlix login screen.

### Sign In With Hub (Recommended for Multi-Server Users)

1. On the login screen, click **Sign in with Hub**.
2. Enter your Hub URL (e.g., `https://hub.phlix.example.com`) and press **Continue**.
3. Enter your Hub username and password, then click **Sign In**.
4. If your Hub account has multiple servers linked, a picker appears — select the server you want to access.
5. The portal loads your selected server's libraries.

### Sign In With Direct Server URL

1. On the login screen, click **Connect Directly**.
2. Enter your server's direct URL (e.g., `http://192.168.1.100:32400`) and press **Connect**.
3. Enter your server username and password.
4. The portal loads your server's libraries directly.

### No Downloads or Permissions

The web portal uses standard browser APIs and requires no plugins, extensions, or special permissions.

## Hub Connection

1. Click **Sign in with Hub** on the login screen.
2. Enter your Hub URL → authenticate → select a server.
3. The Hub relay provides remote access automatically — no router port forwarding or VPN required.
4. When signed in with Hub, switch between your Hub-linked servers from the user menu in the top-right corner.

Hub login is the recommended way to access your server remotely because the Hub relay handles the connection without exposing your server directly to the internet.

## What Can Go Wrong

### Browser not supported

**Symptom:** The page looks broken or displays a banner "Browser not supported."

**Fix:** Your browser is outdated. Update to the latest version of Chrome, Firefox, Safari, or Edge. Internet Explorer is not supported — use Edge or another modern browser instead.

### WebSocket blocked by network proxy

**Symptom:** The page loads and you can see the library, but playback never starts and the console shows "WebSocket connection error."

**Fix:** Your network is blocking WebSocket connections (`ws://` or `wss://`). Try opening the portal from a different network. If you must use a restricted network, ask your network administrator to allow WebSocket traffic on port 443. As a workaround, use the Phlix mobile or desktop client.

### SSL certificate invalid or self-signed

**Symptom:** The browser shows "Your connection is not private" and refuses to load the page.

**Fix:** Your server is using a self-signed SSL certificate. For production, replace it with a properly signed certificate — [Let's Encrypt](https://letsencrypt.org) provides free automatic certificates. For local testing over HTTPS with a self-signed cert, type `thisisunsafe` on the Chrome warning page to proceed (Chrome only).

## Next Steps

- [Mobile app](./mobile.md) — iOS and Android
- [Windows client](./windows.md) — desktop app with system tray and media key support
- [First-run wizard](../first-run.md) — complete server setup after your first login
