# DLNA Server

**Since:** 0.12.0

## TL;DR

Phlix includes a built-in DLNA/UPnP MediaServer that broadcasts via SSDP, allowing DLNA-certified devices on your local network (smart TVs, game consoles, network media players) to discover and stream media from your Phlix library automatically.

## What is DLNA?

DLNA (Digital Living Network Alliance) is a set of interoperability guidelines for sharing digital media between multimedia devices on a home network. Phlix implements the UPnP MediaServer specification, which allows:

- **Device discovery** via SSDP (Simple Service Discovery Protocol) multicast
- **Content browsing** through the Content Directory service (Browse/Search actions)
- **HTTP streaming** to any DLNA-compliant renderer (Play To feature)

## Architecture

Phlix's DLNA server is implemented in `src/Dlna/` and consists of:

| Component | File | Purpose |
|----------|------|---------|
| DlnaServer | `DlnaServer.php` | Main server class, SOAP handling, device description |
| ContentDirectory | `ContentDirectory.php` | UPnP ContentDirectory:1 service (browse/search) |
| AvTransport | `AvTransport.php` | AVTransport:1 service (play/pause/seek) |
| DeviceRegistry | `DeviceRegistry.php` | Tracks discovered DLNA renderers |
| LibraryBridge | `LibraryBridge.php` | Connects ContentDirectory to Phlix media library |
| CdsServer | `CdsServer.php` | HTTP handler for ContentDirectory SOAP calls |
| PlayToManager | `PlayToManager.php` | "Play To" feature for casting to renderers |

## Enabling DLNA

DLNA is enabled by default when Phlix starts. The server announces itself via SSDP multicast every 10 minutes on port 1900/UDP.

### Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| DLNA Port | `8200` | HTTP port for DLNA device description and SOAP |
| SSDP Announce Interval | `600s` | How often SSDP announcements are sent |
| UDN Prefix | `uuid:phlix-server-` | Unique device identifier prefix |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `PHLIX_PUBLIC_URL` | Public URL used in DLNA announcements. Set if behind a reverse proxy. |
| `PHLIX_HTTP_PORT` | HTTP port the server listens on (default: 32400) |

### Device Identification

The DLNA server announces with:
- **Friendly Name**: `Phlix Media Server` (configurable)
- **Manufacturer**: Phlix
- **Model**: `Phlix Media Server 1.0`
- **UDN**: `uuid:phlix-server-{serverId}` — unique per installation

## How Clients Discover Phlix

DLNA clients (such as smart TVs) use SSDP to discover MediaServers on the network:

1. Client sends `M-SEARCH` multicast to `239.255.255.250:1900`
2. Phlix responds with HTTP/NOTIFY containing device description URL
3. Client fetches device description XML from `http://{phlix}:8200/description.xml`
4. Client calls `Browse` action via SOAP to list content

### Discovery Response Example

```http
NOTIFY * HTTP/1.1
HOST: 239.255.255.250:1900
CACHE-CONTROL: max-age=1800
LOCATION: http://192.168.1.100:8200/description.xml
NT: urn:schemas-upnp-org:device:MediaServer:1
NTS: ssdp:alive
SERVER: Phlix/0.12.0 UPnP/1.0
USN: uuid:phlix-server-abc123::urn:schemas-upnp-org:device:MediaServer:1
```

## Content Directory

The ContentDirectory service provides Browse and Search actions:

### Browse Action

Lists containers and items under a given ObjectID:

```
Browse(ObjectID, BrowseFlag, Filter, StartingIndex, RequestedCount, SortCriteria)
```

**BrowseFlags:**
- `BrowseMetadata` — return metadata for a single object
- `BrowseDirectChildren` — return child objects (containers/items)

**Returns:** DIDL-Lite XML containing media items

### Search Action

Searches for media matching criteria:

```
Search(ContainerID, SearchCriteria, Filter, StartingIndex, RequestedCount, SortCriteria)
```

**Supported Search Properties:**
- `dc:title` — item title
- `dc:creator` — creator/artist
- `upnp:artist` — artist
- `upnp:album` — album

### Object Hierarchy

```
0 (Root)
├── library-video (container)
│   └── [media items]
├── library-audio (container)
│   └── [media items]
└── library-images (container)
    └── [media items]
```

## Supported Media Formats

Phlix's DLNA server serves media in the following formats:

| Media Type | Formats | DLNA Profile |
|-----------|---------|--------------|
| Video | MP4, MKV, WebM, AVI | `AVC_MP4_MP_HD` |
| Audio | MP3, AAC, FLAC, WAV | `AAC_ADTS` |
| Image | JPEG, PNG | `JPEG_LRG` |

### Streaming URLs

Media items include a `upnp:res` element with an HLS streaming URL:
```
http://{phlix}:32400/api/v1/streaming/hls/{itemId}/master.m3u8
```

Clients that support HLS (most modern DLNA renderers) can stream directly. For older devices, you may need to enable transcoding.

## Play To Feature

The Play To feature allows you to "push" media from Phlix to a specific DLNA renderer (e.g., cast a video to your smart TV):

1. In the Phlix web interface, click the cast icon on any media item
2. Select a discovered DLNA renderer from the device list
3. Phlix sends `SetAVTransportURI` and `Play` commands to the renderer
4. Playback is controlled remotely — Phlix acts as the controller

Renderer discovery happens via:
- **SSD P multicast** for renderers on the local network
- **Cached device registry** for previously seen devices

## Troubleshooting

### TV Cannot Find Phlix

1. **Verify Phlix is running**:
   ```bash
   curl http://localhost:32400/api/v1/system/status
   ```

2. **Check SSDP is announced** (requires network debugging tool):
   - Phlix sends UDP packets to `239.255.255.250:1900`
   - Firewalls must allow UDP port 1900 outbound

3. **Check network connectivity**:
   - Phlix and the TV must be on the same subnet
   - Check if `PHLIX_PUBLIC_URL` is set correctly if using VLANs

### Media Won't Play on TV

1. **Check format support** — most TVs only support MP4/H.264 natively
2. **Enable transcoding** — enable hardware transcoding in `docs/advanced/hardware-transcoding.md`
3. **Check DLNA profile** — some TVs are picky about protocol-info strings

### "No such object" Error

This usually means the item ID passed to `Browse` doesn't exist. Common causes:
- Item was deleted from library but client still has stale reference
- Library rescan changed item IDs

### Authentication Prompt Loop

Some DLNA clients cache credentials incorrectly. Try:
1. Power cycling the TV
2. Removing the Phlix app/device from TV settings
3. Re-adding via DLNA discovery

### Slow Content Loading

- Ensure `PHLIX_HTTP_PORT` is not conflicting with another service
- Check the server is not under heavy load from transcoding
- Verify network throughput between Phlix and the TV

## Security Considerations

- DLNA operates on the local network only — not exposed to the internet
- SSDP uses UDP port 1900 — ensure firewall rules are appropriate
- No authentication on DLNA discovery — anyone on the network can discover Phlix
- Media streaming uses HTTP — consider using a VPN for sensitive content
- See [Privacy & Security](../privacy-security.md) for more information

## See Also

- [Reverse Proxy](../advanced/reverse-proxy.md) — running Phlix behind a reverse proxy
- [Hardware Transcoding](../advanced/hardware-transcoding.md) — enabling GPU-accelerated transcoding
- [Troubleshooting](../troubleshooting.md) — general troubleshooting tips
