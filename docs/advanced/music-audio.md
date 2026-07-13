# Music & Audio

**Since:** 0.14.0

## TL;DR

Phlix plays music with a dedicated library experience supporting gapless playback, configurable crossfade, crossfade between albums, high-resolution audio (up to 24-bit/192kHz), and ReplayGain loudness normalization.

---

## 1. Music Library

### Overview

The music library scans audio files and exposes them via a browsable web player and API. Supported formats include MP3, FLAC, M4A/AAC, Ogg Vorbis, Opus, and WMA.

See the [Music Library](/libraries/music) page for a full breakdown of supported formats and tag field mappings.

### Library Organization

Music is organized by the standard hierarchy:

```
Artist
  └── Album
        └── Track
```

Multi-disc albums are represented as a single album with tracks grouped by disc number. Album artist is used for sorting (not track artist) to ensure compilation albums appear correctly.

---

## 2. Gapless Playback

### Overview

Gapless playback eliminates the silence gap between consecutive tracks, essential for listening to live albums, concept albums, and classical works where track transitions are part of the experience.

### How It Works

Phlix's audio engine uses **LADSPA live-crossfade** between tracks rather than simply trimming silence. When track N ends:

1. The last 10ms of track N is captured from the decoder output
2. The first 10ms of track N+1 is captured from its decoder
3. A 10ms linear crossfade is applied
4. The mixed output is sent to the audio buffer

This produces a seamless transition with no audible gap or click.

### Requirements

Gapless requires:
- **Native playback** (no transcoding) — gapless only works when the client plays the original file format directly
- **Sufficient buffer** — the client must buffer at least 500ms of audio ahead
- **Compatible format** — all gapless formats (FLAC, ALAC, WAV) are fully supported

### Client Support

| Client | Gapless Support |
|--------|----------------|
| Web Player | Yes — with LADSPA plugin |
| Mobile (iOS/Android) | Yes — native audio API |
| DLNA / Play To | No — DLNA protocol forces gaps |
| SyncPlay | No — synchronized playback uses shared buffer |

---

## 3. Crossfade

### Overview

Crossfade blends the end of one track into the beginning of the next, so songs overlap rather than cutting abruptly. This is distinct from gapless — crossfade is an *intentional* artistic overlap, while gapless removes *unintended* gaps.

### Crossfade Settings

Users configure crossfade in **Settings → Playback → Crossfade**:

| Setting | Default | Description |
|---------|---------|-------------|
| **Crossfade Duration** | 5s | How much two tracks overlap |
| **Crossfade Shape** | Linear | Fade curve: Linear, Equal-Power, S-Curve |
| **Album Crossfade** | On | Apply crossfade even within the same album |

### Implementation

The server sends crossfade configuration to the player as part of the playback info:

```json
{
  "playback_info": {
    "audio_config": {
      "crossfade_duration_secs": 5,
      "crossfade_shape": "equal_power",
      "album_crossfade": true,
      "replaygain_mode": "track"
    }
  }
}
```

Clients that do not support crossfade ignore these fields.

> [!NOTE]
> **Web player (browser).** The browser web player implements crossfade and gapless
> **client-side** — it alternates between two HTML5 `<audio>` elements and reads your
> **Settings → Playback** crossfade-duration and gapless values directly, rather than
> relying on server-side LADSPA DSP or the `audio_config` block above. Each track is
> fetched with a signed, expiring stream URL, so it works over a direct connection or a
> Hub relay alike. (Native clients still consume the server-provided `audio_config`.)

---

## 4. High-Resolution Audio

### Overview

Phlix supports high-resolution audio formats up to **24-bit / 192kHz** (DXD, DSD64/128, FLAC 192kHz). High-resolution tracks are served without downsampling when the playback device supports the format.

### Supported Hi-Res Formats

| Format | Extension | Max Bit Depth | Max Sample Rate |
|--------|-----------|---------------|-----------------|
| FLAC | `.flac` | 24-bit | 192kHz |
| WAV | `.wav` | 32-bit float | 192kHz |
| DSD | `.dsf`, `.dff` | 1-bit | DSD64 / DSD128 |
| AIFF | `.aiff`, `.aif` | 24-bit | 192kHz |
| ALAC | `.m4a` | 24-bit | 192kHz |

### Bit-Perfect Playback

When a client explicitly requests bit-perfect delivery (no DSP, no volume normalization):

1. Server sends the original file without transcoding
2. Client's audio output matches the source file exactly
3. No sample rate conversion, no bit-depth reduction

Bit-perfect mode is requested via the `X-Phlix-BitPerfect: true` HTTP header on the playback info request.

### ReplayGain

ReplayGain normalizes loudness across tracks so listeners don't need to adjust volume between songs. Phlix supports:

- **Track mode** — each track normalized to a target level (default: -18dB LUFS)
- **Album mode** — all tracks in an album normalized together to preserve relative loudness differences
- **Disabled** — no normalization applied

ReplayGain tags are read from the file's metadata. If no tag is present, Phlix can scan tracks during library scan to generate ReplayGain values server-side.

---

## 5. Audio Scrobbling

Phlix integrates with Last.fm and ListenBrainz for scrobbling — tracking what you listen to and when.

See [Last.fm Integration](/integrations/lastfm) and [Scrobbler Plugins](/developers/scrobbler-plugins) for setup instructions.

---

## Related Pages

- [Music Library](/libraries/music) — Supported formats and tag field reference
- [Last.fm Integration](/integrations/lastfm) — Scrobbling setup
- [Last.fm Plugin Developer Guide](/developers/lastfm-plugin) — Writing scrobbler plugins
