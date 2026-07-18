---
title: Player Quality & Audio
description: Quality selection, audio tracks, subtitles, and Picture-in-Picture support
---

# Player Quality & Audio

**Phase:** P3B-S8

Phlix supports flexible quality selection, multi-audio tracks, subtitle selection, and Picture-in-Picture (PiP) playback.

## Quality Selector

### Quality Levels

| Label | Resolution | Bitrate (SD) | Bitrate (HD) |
|-------|------------|--------------|--------------|
| Auto | Device-dependent | Variable | Variable |
| 480p | 854×480 | 1.5 Mbps | — |
| 720p | 1280×720 | 3 Mbps | 4 Mbps |
| 1080p | 1920×1080 | 5 Mbps | 8 Mbps |
| 4K | 3840×2160 | 15 Mbps | 20 Mbps |
| Original | Source resolution | Source | Source |

### Quality API

```http
GET /api/v1/media/{id}/playback?quality=720p
```

### Per-Track Quality Override

Individual tracks can have different quality settings:

```json
{
  "tracks": [
    {
      "id": "video-720p",
      "type": "video",
      "quality": "720p",
      "codec": "h264",
      "bitrate": 3000000
    },
    {
      "id": "video-1080p",
      "type": "video",
      "quality": "1080p",
      "codec": "h264",
      "bitrate": 8000000
    }
  ]
}
```

### ABR (Adaptive Bitrate)

Auto quality uses adaptive bitrate streaming:

1. Client measures available bandwidth
2. Requests appropriate quality segment
3. Switches quality without interruption
4. Buffer target: 30 seconds

## Audio Track Selection

### Track Properties

| Property | Description | Example |
|----------|-------------|---------|
| `language` | ISO 639-1 code | `en`, `es`, `fr` |
| `codec` | Audio codec | `aac`, `mp3`, `opus` |
| `channels` | Channel layout | `2.0`, `5.1`, `7.1` |
| `bitrate` | Audio bitrate | 128, 256, 320 kbps |

### Channel Layouts

| Layout | Speakers | Use Case |
|--------|----------|----------|
| `2.0` | Stereo | Most content |
| `5.1` | Front L/R, Center, Surround L/R, Sub | Movies |
| `7.1` | + Rear L/R | Premium content |

### Audio Selection UI

```
┌─────────────────────────────┐
│ Audio Track            [×] │
├─────────────────────────────┤
│ ○ English (AAC 5.1)    [★] │
│ ○ Spanish (AAC 2.0)        │
│ ○ French (AAC 2.0)         │
│ ○ Commentary (AAC 2.0)     │
├─────────────────────────────┤
│ Current: English (AAC 5.1) │
└─────────────────────────────┘
```

### API Usage

```http
GET /api/v1/media/{id}/playback?audio=es
POST /api/v1/media/{id}/playback/audio
{ "trackId": "audio-es-001" }
```

## Multi-Audio HLS

### HLS Master Playlist

```m3u8
#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
1080p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720
720p.m3u8

# Audio groups
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",LANGUAGE="en",URI="audio-en.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Spanish",LANGUAGE="es",URI="audio-es.m3u8"
```

### Audio-Only HLS Playlists

For audio-only streams (music, podcasts):

```m3u8
#EXTM3U
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-TYPE:AUDIO
#EXT-X-PLAYLIST-TYPE:VOD
#EXTINF:10.0
segment0.aac
#EXTINF:10.0
segment1.aac
#EXT-X-ENDLIST
```

## Subtitle Track Selection

### Subtitle Types

| Type | Source | Format |
|------|--------|--------|
| Embedded | Video container | SRT, ASS, SSA in container |
| Sideloaded | External file | SRT, VTT, ASS |
| Closed (CC) | Broadcast | CEA-608/708 |
| HEVC SEI | Video stream | Burned-in |

### Subtitle Selection UI

```
┌─────────────────────────────┐
│ Subtitles / CC         [×] │
├─────────────────────────────┤
│ [✓] Off                     │
│ [ ] English (SRT)           │
│ [ ] Spanish (SRT)          │
│ [ ] French (VTT)           │
│ [ ] English CC (CEA-608)    │
│ [ ] English (Burned-in)     │
├─────────────────────────────┤
│ Text Size: [●●●○○] Medium   │
│ Text Color: [White]         │
│ Background: [Semi]          │
└─────────────────────────────┘
```

### API Usage

```http
GET /api/v1/media/{id}/playback?subtitles=en
POST /api/v1/media/{id}/playback/subtitles
{ "trackId": "sub-en-001", "mode": "external" }
```

### Subtitle Modes

| Mode | Behavior |
|------|----------|
| `off` | No subtitles |
| `external` | Display from sideloaded file |
| `burned` | Use baked-in subtitles from video |
| `cc` | Use closed captions from stream |

## Picture-in-Picture (PiP)

### Browser Support

| Browser | Version | Notes |
|---------|---------|-------|
| Chrome | 71+ | Full support |
| Firefox | 79+ | Full support |
| Safari | 13+ | macOS Safari only |
| Edge | 79+ | Chromium-based |

### PiP API

```typescript
// Enter PiP
const video = document.querySelector('video');
try {
  await video.requestPictureInPicture();
} catch (err) {
  console.error('PiP failed:', err);
}

// Exit PiP
document.exitPictureInPicture();

// Listen for events
video.addEventListener('enterpictureinpicture', (e) => {
  console.log('Entered PiP:', e.pictureInPictureWindow);
});

video.addEventListener('leavepictureinpicture', () => {
  console.log('Left PiP');
});
```

### PiP Controls

When in PiP mode:

- **Play/Pause** — Toggle playback
- **Skip** — Seek forward/back 10 seconds
- **Next/Previous** — Skip to next/previous track (in playlists)
- **Close** — Exit PiP and return to main player

### Limitations

1. **One PiP window** per browser context
2. **DRM content** may not support PiP
3. **Audio** continues when PiP is minimized
4. **Touch devices** may have limited PiP support

### Mobile Considerations

- **iOS**: PiP requires `PictureInPicture` capability in entitlements
- **Android**: PiP works in Chrome for Android with proper manifest

## Complete Playback Session Example

```http
GET /api/v1/media/{id}/playback
```

```json
{
  "sessionId": "sess_abc123",
  "manifest": "/stream/{id}/master.m3u8",
  "quality": "auto",
  "audio": {
    "tracks": [
      { "id": "en-aac-51", "language": "en", "codec": "aac", "channels": "5.1", "default": true },
      { "id": "es-aac-20", "language": "es", "codec": "aac", "channels": "2.0", "default": false }
    ],
    "selected": "en-aac-51"
  },
  "subtitles": {
    "tracks": [
      { "id": "off", "label": "Off", "type": "none" },
      { "id": "en-srt", "language": "en", "codec": "srt", "type": "external" }
    ],
    "selected": "off"
  },
  "trickplay": {
    "enabled": true,
    "spriteUrl": "/stream/{id}/trickplay.jpg",
    "thumbWidth": 360,
    "thumbHeight": 90
  }
}
```

## Client Capability Negotiation

A client can tell the server which codecs it is able to decode by sending an
`X-Phlix-Client-Capabilities` request header on playback-info requests. The value
is a JSON codec-support map, for example:

```http
X-Phlix-Client-Capabilities: {"eac3":false,"aac":true}
```

When the header is present, the server's `direct_play` verdict reflects whether
the client can decode the item's (first/default) audio codec — a client that
declares it **cannot** decode e.g. E-AC-3 is steered to transcode instead of
direct play, avoiding a "video plays but audio is silent" result. When the header
is **absent, empty, or malformed**, `direct_play` keeps its previous always-`true`
behavior, so existing clients are unaffected.

## Loudness Normalization

The server can apply EBU R128 loudness normalization (`loudnorm`) to transcoded
audio so volume is consistent across titles. It is **disabled by default** and
enabled by an operator in `config/ffmpeg.php` (`loudness.enabled = true`, with
`I`/`LRA`/`TP` targets). See [Config files → Loudness normalization](/reference/config-files#loudness-normalization-sv-3-3).

Because normalization is an audio **filter**, it applies only to **re-encoded**
audio. Rungs that copy the source audio stream (the `original` variant) and
**direct-play** sessions are not normalized — a copied stream is never decoded,
so no filter can be applied to it.

## See Also

- [Stream Quality / ABR](/developers/stream-quality-abr) — Technical ABR details
- [Streaming Protocols](/developers/streaming-protocols) — HLS/DASH implementation
- [Subtitle Processing](/developers/subtitle-processing) — Subtitle extraction and conversion
