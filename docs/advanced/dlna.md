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
| SoapArgumentExtractor | `SoapArgumentExtractor.php` | Namespace-aware, XXE-safe extraction of SOAP action arguments from the action element's direct children |
| PlayToManager | `PlayToManager.php` | "Play To" feature for casting to renderers |

## Enabling DLNA

DLNA has **two independent switches**, because they carry very different risk:

| Setting | Governs | Default |
|---------|---------|---------|
| `dlna.enabled` | The **SSDP advertiser** — the broadcast that makes this server appear in a TV's source list | **ON** |
| `dlna.cds_enabled` | The **ContentDirectory browse service** — the SOAP endpoints a control point uses to list and stream your library | **OFF** |

The SSDP advertiser announces itself via multicast every 10 minutes on port 1900/UDP by
default. The ContentDirectory browse service ships **disabled** and is turned on from the
admin console — see [DLNA Server (admin)](../admin/dlna-server).

::: danger `cds_enabled` exposes the library with NO authentication
DLNA/UPnP has no concept of credentials. Turning `cds_enabled` on lets **any** device on
the local network browse and stream the entire library without logging in, deliberately
bypassing the auth gate. That is why it ships off — it is the right choice for a trusted
home LAN and the wrong one for a shared or untrusted network.
:::

The admin Start/Stop toggle persists `dlna.cds_enabled` and schedules a graceful worker
reload (the ContentDirectory routes are registered once per worker at boot), so a change
takes effect across all workers a moment after saving rather than instantly.

### Access control

Even with `cds_enabled` on, the ContentDirectory (browse/stream) routes are guarded by an
**IP allowlist middleware** — DLNA carries no credentials, so an IP gate is the only thing
standing between a caller and the whole library. Two settings control it (both take effect
immediately, no restart):

| Setting | Default | Governs |
|---------|---------|---------|
| `dlna.allowed_cidrs` | `[]` | An array of CIDR ranges (e.g. `192.168.1.0/24`, `192.168.1.50/32`, `fd00::/8`) explicitly permitted to reach the DLNA CDS routes. A matching entry always wins. |
| `dlna.restrict_to_lan` | `true` | When on, a caller matching no explicit CIDR is still allowed if it is on the local network (loopback, RFC1918, IPv4 link-local, IPv6 loopback/ULA/link-local). When off, an explicit `allowed_cidrs` match is the only way in. |

::: danger An empty allowlist is never "allow all"
With the shipped defaults (`allowed_cidrs = []`, `restrict_to_lan = true`), DLNA CDS is
**LAN-only** — off-LAN callers are denied. Turning `restrict_to_lan` off while the
allowlist is empty **denies everyone** (a valid, deliberate lockdown, not a way to open
DLNA up). No combination of these two keys ever results in "anyone can reach DLNA".
:::

The client IP is taken **spoof-resistantly** (`getTrustedClientIp()`; trusted proxies are
loopback by default), so a forged `X-Forwarded-For` from off-LAN cannot smuggle a LAN
identity past the gate. **If you front DLNA with a reverse proxy that is not on loopback,
add it to `TRUSTED_PROXIES`** — otherwise every request appears to come from the proxy and
the allowlist/LAN check runs against the proxy's IP, not the real client's. See
[Reverse proxy](./reverse-proxy) and
[Server Settings → DLNA access control](../admin/server-settings#dlna-access-control).

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

The ContentDirectory service provides Browse and Search actions. Inbound SOAP control
requests are parsed by `Phlix\Dlna\SoapArgumentExtractor`, which reads action arguments
**only from the direct children of the SOAP action element** (namespace-aware, XXE-safe:
parsed with `LIBXML_NONET` and never `LIBXML_NOENT`). This prevents a same-named element
nested inside embedded DIDL-Lite metadata — e.g. `<Filter><ObjectID>…</ObjectID></Filter>`
— from bleeding into a top-level argument such as `ObjectID`. Both live parsers
(`DlnaContentDirectoryController::parseSoapBody` on `POST /dlna/content_directory` and the
legacy `CdsControlHandler` on `POST /cds/control`) are direct-child scoped.



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

- The ContentDirectory browse/stream routes are gated by an **IP allowlist** and are
  **LAN-only by default** (`dlna.restrict_to_lan = true`, `dlna.allowed_cidrs = []`) — an
  empty allowlist is never "allow all". See [Access control](#access-control) above.
- SSDP uses UDP port 1900 — ensure firewall rules are appropriate
- DLNA/UPnP itself has **no authentication** — anything the IP gate admits can browse and
  stream the whole library without signing in; that is why the IP allowlist matters
- Media streaming uses HTTP — consider using a VPN for sensitive content
- See [Privacy & Security](../privacy-security.md) for more information

## See Also

- [Reverse Proxy](../advanced/reverse-proxy.md) — running Phlix behind a reverse proxy
- [Hardware Transcoding](../advanced/hardware-transcoding.md) — enabling GPU-accelerated transcoding
- [Troubleshooting](../troubleshooting.md) — general troubleshooting tips
