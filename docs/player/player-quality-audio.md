---
title: Player Quality & Audio
description: Quality ladder, audio and subtitle tracks, device-profile direct play, and Picture-in-Picture support
---

# Player Quality & Audio

Phlix exposes the quality ladder, audio tracks and subtitle tracks of an item through a single
**playback-info** request. The player then switches quality client-side (hls.js ABR), picks audio
and subtitle tracks from the returned lists, and supports Picture-in-Picture (PiP).

::: info There is no server-side "switch" API
Quality, audio track and subtitle selection are **not** driven by `?quality=`, `?audio=`,
`?subtitles=` query parameters or `POST .../playback/audio|subtitles` endpoints — none of those
exist. The only playback-info query parameters the server reads are `forceTranscode`,
`excludeHevc` and (for the ladder preview) `profile`. Everything else is a client-side choice
over the data described below.
:::

## Playback-Info Request

```http
GET /api/v1/media/{id}/playback-info
```

Also reachable as `GET /api/v1/media/{id}/playback` on the web-portal router (GET only; it returns a
`playback_info` envelope with `media_sources`/`markers` plus the same track lists). Neither
endpoint accepts a `POST`. See the [API reference](/reference/api#playback-endpoints).

```json
{
  "item_id": "abc123",
  "intro_marker": { "start_seconds": 10, "end_seconds": 90 },
  "outro_marker": null,
  "chapters": [],
  "skip_button_spec": {},
  "quality_ladder": [
    { "id": "v1080", "label": "1080p", "width": 1920, "height": 1080, "bitrate": 8000000,
      "codecs": "avc1.640028,mp4a.40.2", "url": null, "is_original": false, "is_copy": false,
      "video_bitrate": 7800000 }
  ],
  "audio_tracks": [
    { "id": "…", "index": 0, "stream_index": 1, "codec": "aac", "language": "en",
      "channels": 6, "bitrate": 384000, "title": null, "default": true }
  ],
  "subtitle_tracks": [
    { "id": "…", "index": 0, "stream_index": 2, "language": "en", "label": "English",
      "codec": "webvtt", "source": null, "delivery": "external", "hearing_impaired": false,
      "url": "/api/v1/media/abc123/subtitles/…?sig=…" }
  ],
  "crossfade": { "enabled": false, "duration": 0, "fade_out": 0, "fade_in": 0 }
}
```

(Example values are illustrative; field names are the server's payload keys. `skip_button_spec`
and `crossfade` are abbreviated.)

An optional `playback_constraints` block is echoed **only** when `forceTranscode` and/or
`excludeHevc` was supplied on the request (`{"force_transcode": true, "exclude_hevc": false}`).

## Quality Selector

### Quality ladder preview

`quality_ladder` is a **preview** of the ABR ladder a play would produce — each rung's `url` is
`null` because nothing is playable yet. It is `null` when the item has no scanned source metadata
(width/height). The ladder is built per device profile; the profile comes from `?profile=` or, when
absent, is mapped from the `X-Phlix-Device-Type` header (unknown or empty falls back to `web`).
Rung sizes and bitrates are computed from the source — see
[Stream Quality / ABR](/developers/stream-quality-abr#the-ladder-d1–d4-abrladder) for the ladder rules.

### Device profiles and direct play

`QualitySelector` decides, per device profile, whether a source can be **direct-played** or must be
transcoded:

| Profile | Max resolution | Max bitrate | Direct-play video codecs | Containers |
|---------|----------------|-------------|--------------------------|------------|
| `generic` | 3840×2160 | 100 Mbps | h264, h265, vp9 | mp4, mkv, webm |
| `mobile-low` | 854×480 | 1.5 Mbps | h264 | mp4 |
| `mobile-high` | 1280×720 | 4 Mbps | h264, h265 | mp4 |
| `web` | 1920×1080 | 10 Mbps | h264, vp9 | mp4, webm |
| `tv-4k` | 3840×2160 | 50 Mbps | h264, h265, vp9 | mp4, mkv, ts |
| `samsung-tizen` | 3840×2160 | 50 Mbps (20 Mbps for 1080p-class sources) | h264, h265, vp9 | mp4, mkv, ts |

`samsung-tizen` adds extra gates: native audio codecs only (AAC/AC-3/E-AC-3/MP3), a 2-channel audio
budget, H.264 level ≤ 5.2, HEVC Main/Main 10 ≤ level 120, no HDR, anamorphic or interlaced direct
play, and VP9 limited to limited-range colour and 20 Mbps. A source that fails any gate is
transcoded instead.

Two request-side constraints override the verdict at stream-creation time: `forceTranscode`
skips direct play entirely, and `excludeHevc` treats the profile as if it never declared HEVC.

### ABR (Adaptive Bitrate)

"Auto" is standard HLS behaviour, not special server logic. When the master playlist lists several
variants, hls.js (or the native player) measures bandwidth and switches rungs automatically.
Pinning a rung is a client-side choice made by selecting a level in the player; there is no server
call for it. See [Stream Quality / ABR](/developers/stream-quality-abr#client-behavior).

## Audio Track Selection

### Track Properties

Each entry in `audio_tracks`:

| Property | Description | Example |
|----------|-------------|---------|
| `id` | Stream row id | — |
| `index` / `stream_index` | Per-type ordinal / container stream index | `0` / `1` |
| `language` | Language code (`und` when unknown) | `en`, `es` |
| `codec` | Audio codec | `aac`, `ac3`, `eac3` |
| `channels` | Channel **count** (integer, `0` when unknown) | `2`, `6`, `8` |
| `bitrate` | Bitrate in bits per second | `384000` |
| `title` | Stream title, or `null` | `Commentary` |
| `default` | Container default-disposition flag | `true` |

### Channel Layouts

| Channels | Layout | Use Case |
|----------|--------|----------|
| `2` | Stereo | Most content |
| `6` | 5.1 | Movies |
| `8` | 7.1 | Premium content |

### Audio Selection UI

```text
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

### Switching audio

The player builds this menu from `audio_tracks`. For transcoded HLS, the master playlist carries
the audio renditions (`media_a{N}.m3u8`) and hls.js switches between them client-side — there is no
audio-switch endpoint. See [Streaming Protocols](/developers/streaming-protocols) for the
playlist and filename reference.

## Subtitle Track Selection

### Subtitle Delivery

Every subtitle track in `subtitle_tracks` is delivered **externally**: `delivery` is always
`"external"` and `url` is a signed sidecar URL that a `<track>` element loads alongside the stream.
Nothing is muxed into the container for the player. Both embedded text subtitles and sideloaded
files are exposed this way; embedded **bitmap** subtitles (PGS, DVD) have no text and are not listed.
See [Subtitle Processing](/developers/subtitle-processing) for extraction and conversion.

| Field | Description |
|-------|-------------|
| `language`, `label` | Language code and display label |
| `codec` | Delivered format (default `webvtt`) |
| `source` | Origin of a sideloaded track, or `null` |
| `hearing_impaired` | SDH/CC flag |
| `url` | Signed sidecar URL (`null` if it cannot be minted) |

### Subtitle Selection UI

```text
┌─────────────────────────────┐
│ Subtitles / CC         [×] │
├─────────────────────────────┤
│ [✓] Off                     │
│ [ ] English                 │
│ [ ] Spanish                 │
│ [ ] French                  │
├─────────────────────────────┤
│ Text Size: [●●●○○] Medium   │
│ Text Color: [White]         │
│ Background: [Semi]          │
└─────────────────────────────┘
```

Selecting a track is a client-side action: the player attaches the chosen track's `url` to the
video element; "Off" simply hides it.

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

## Playback Flow

1. `GET /api/v1/media/{id}/playback-info` — read `quality_ladder`, `audio_tracks`, `subtitle_tracks`
   (optionally with `?forceTranscode=1` / `?excludeHevc=1` and `X-Phlix-Client-Capabilities`).
2. Start the stream through the transcode/stream endpoints (see
   [Streaming Protocols](/developers/streaming-protocols)); the response gives the HLS master URL.
3. hls.js (or the native player) handles rung and audio-rendition switching; the player attaches
   subtitle `url`s as text tracks.

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

## Browser HLS Compatibility

Web playback uses hls.js with Media Source Extensions (MSE), which is stricter than a native
player. For a transcoded stream to play in a normal browser, three things must line up:

- **8-bit H.264 video.** 10-bit ("High 10") output cannot be decoded by any browser; Phlix forces
  8-bit (`yuv420p`) on all software transcode paths.
- **Stereo AAC audio.** Re-encoded HLS audio is **downmixed to stereo** (`-ac 2`). Surround layouts —
  in particular AC-3 **5.1(side)** sources — otherwise encode to AAC with a PCE and
  `channel_configuration=0` in the ADTS header, which **hls.js cannot parse**: it fails to build the
  audio SourceBuffer and the entire player load errors even when the video is valid. Direct-play /
  stream-copy (`original`) rungs keep the source layout untouched.
- **CSP `blob:` allowances.** The server's Content-Security-Policy allows `media-src 'self' blob:` and
  `worker-src 'self' blob:` so hls.js can attach its MSE `blob:` object URL and spawn its transmux Web
  Worker. If these are stripped (e.g. by a reverse proxy rewriting the CSP), the browser rejects
  playback with `MEDIA_ELEMENT_ERROR: Media load rejected by URL safety check`.

## See Also

- [Stream Quality / ABR](/developers/stream-quality-abr) — Technical ABR details
- [Streaming Protocols](/developers/streaming-protocols) — HLS/DASH implementation
- [Subtitle Processing](/developers/subtitle-processing) — Subtitle extraction and conversion
