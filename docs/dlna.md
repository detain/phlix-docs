---
title: DLNA / Digital Living Network Alliance
description: Stream media from Phlix to smart TVs, game consoles, and other DLNA devices on your network.
---

**Since:** 0.12.0

## TL;DR

Phlix includes a built-in DLNA/UPnP MediaServer that broadcasts to DLNA-certified devices on your local network. Your smart TV, game console, or network media player can discover Phlix automatically and stream your media — no app required.

## What is DLNA?

DLNA (Digital Living Network Alliance) is a set of interoperability guidelines that lets devices on the same network share digital media. Phlix implements the UPnP MediaServer specification, which means:

- Phlix appears as a "Media Server" on your network
- DLNA-certified devices (smart TVs, PlayStation, Xbox, Chromecast with DLNA, etc.) can discover it automatically
- Clients browse your library and stream directly over HTTP

## Enabling DLNA

DLNA is enabled by default when Phlix starts. The server announces itself on your network via SSDP multicast every 10 minutes on UDP port 1900.

### Via the Admin UI

1. Go to **Admin → DLNA Server**
2. Verify the status shows "Running"
3. Use the **Start** / **Stop** button to toggle the server

### Via Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PHLIX_DLNA_PORT` | `8200` | HTTP port for DLNA device description and SOAP |
| `PHLIX_HTTP_PORT` | `32400` | Main HTTP port |
| `PHLIX_PUBLIC_URL` | — | Set this if Phlix is behind a reverse proxy |

To disable DLNA entirely, set `PHLIX_DLNA_PORT=0`.

### Firewall

Ensure your firewall allows:
- **UDP port 1900** — SSDP discovery
- **TCP port 8200** (or your configured DLNA port) — device description and content browsing

On Linux with UFW:
```bash
sudo ufw allow 1900/udp comment 'DLNA discovery'
sudo ufw allow 8200/tcp comment 'DLNA HTTP'
```

## Browsing Media via DLNA

### On Your TV or Device

1. Open your TV's built-in media player or DLNA/UPnP app (often called "Media", "Multimedia", or "Share")
2. Look for "Phlix Media Server" in the device list
3. Browse your library by content type (Videos, Music, Photos)
4. Select an item to stream

### Typical Navigation Structure

```
Phlix Media Server
├── Videos
│   ├── Movies
│   └── TV Shows
├── Music
│   ├── Artists
│   └── Albums
└── Photos
```

### Play To (Cast from Phlix)

You can also push media from the Phlix web interface to a DLNA renderer (e.g., cast a video to your TV):

1. In Phlix, click the cast icon on any media item
2. Select your TV or DLNA device from the list
3. Playback starts on the target device

## Supported Formats

| Media Type | Formats | Notes |
|-----------|---------|-------|
| Video | MP4, MKV, WebM, AVI | Most modern TVs support H.264/AAC in MP4 |
| Audio | MP3, AAC, FLAC, WAV | |
| Image | JPEG, PNG | |

For older devices that don't support modern codecs, enable transcoding in **Admin → Transcoding**.

## Troubleshooting

### TV Cannot Find Phlix

1. **Verify Phlix is running:**
   ```bash
   curl http://localhost:32400/api/v1/system/status
   ```

2. **Check network:** Phlix and the TV must be on the same subnet (same network segment, not separated by VLANs).

3. **Restart the DLNA server:** Go to **Admin → DLNA Server** and click **Stop**, then **Start**.

4. **Check firewall:** Ensure UDP port 1900 is open on the Phlix server.

### Media Won't Play

1. **Format not supported** — Try a different file format (MP4/H.264 is the most widely supported)
2. **Transcoding needed** — Enable hardware transcoding if your TV doesn't support the codec
3. **Network issue** — Verify the TV can reach Phlix: try opening `http://[phlix-ip]:32400` in a browser on the same network

### "No such object" Error

This means the item ID in the DLNA request is stale. The item was likely deleted or moved. Try:
1. Rescanning your library in **Admin → Library**
2. Power cycling the TV to clear its media cache

### Authentication Prompts

Some DLNA clients cache credentials incorrectly. Try:
1. Power cycling the TV
2. Removing "Phlix Media Server" from the TV's device list and re-discovering

## Security

- DLNA operates **only on your local network** — it is not exposed to the internet
- Anyone on your network can discover Phlix via DLNA
- No authentication is required for DLNA discovery (standard for the protocol)
- For sensitive content, consider using a VPN or disabling DLNA when not in use

## See Also

- [Advanced DLNA Configuration](/advanced/dlna) — detailed architecture, SOAP API, and deep troubleshooting
- [Hardware Transcoding](/advanced/hardware-transcoding) — enabling GPU-accelerated transcoding for legacy devices
- [Reverse Proxy](/advanced/reverse-proxy) — running Phlix behind a reverse proxy with DLNA
