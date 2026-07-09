# Player Experience

**Since:** 0.12.0

## TL;DR

Player experience features let viewers skip over intro and outro segments, set a sleep timer to stop playback automatically, and use Picture-in-Picture (PiP) to keep watching while using other apps.

---

## 1. Skip Intro / Skip Outro

### Overview

Phlix automatically detects and marks intro and outro segments for TV episodes using audio fingerprint clustering. When detected, clients display skip buttons that let viewers jump past familiar content and get straight to the show.

### How Detection Works

The system analyzes audio fingerprints across episodes of the same show:

1. Each episode is fingerprinted using Chromaprint
2. Episodes are compared pairwise using **Jaccard similarity**
3. Episodes with similarity >= 85% are grouped as shared intro or outro
4. Confidence is scored from group size and average similarity (0–100)

See [Intro/Outro Detection](/developers/intro-outro-detection) for the full algorithm and configuration.

### Skip Button Protocol

The server communicates skip boundaries to clients via the `markers` object in playback info:

```json
{
  "playback_info": {
    "id": "abc123",
    "markers": {
      "skip_intro_start": 10,
      "skip_intro_end": 90,
      "skip_outro_start": 2340,
      "skip_outro_end": 2520
    }
  }
}
```

Clients receive the boundaries and control when to show the UI and what to do on click (typically a seek to the `end` position). See [Skip Button Protocol](/reference/skip-button-protocol) for the full protocol specification.

### Configuration

Edit `config/marker_detection.php`:

```php
return [
    'intro_start_seconds' => 0,
    'intro_max_duration' => 180,        // Max intro length (seconds)
    'outro_max_duration' => 120,        // Max outro length (seconds)
    'min_episode_count' => 3,           // Minimum episodes needed for detection
    'jaccard_threshold' => 0.85,        // Similarity threshold (0.0–1.0)
];
```

To force re-detection of a specific show:

```bash
php public/index.php media:rescan-show --show-id=42 --markers-only
```

---

## 2. Sleep Timer

### Overview

The sleep timer stops playback after a configurable duration, useful for falling asleep to music or videos. It is available in the web player and mobile clients.

### Using the Sleep Timer

1. During playback, open the player controls
2. Tap the sleep timer icon (moon or clock)
3. Select a duration: **15 min**, **30 min**, **45 min**, **1 hour**, **Custom**
4. Playback fades out and stops when the timer expires

The timer can be cancelled at any time by opening the controls and tapping the active timer icon.

### Technical Details

The sleep timer is implemented client-side in the web and mobile players. The server provides a `/api/v1/playback/sleep-timer` endpoint that accepts a duration and returns a timer ID, which the client uses to cancel the timer if needed.

---

## 3. Picture-in-Picture (PiP)

### Overview

Picture-in-Picture lets you minimize the player into a floating window so you can browse the interface or use other apps while the video continues playing.

### Browser Support

| Browser | PiP Support |
|---------|-------------|
| Safari (macOS / iOS) | Yes — Native API |
| Chrome (desktop) | Yes — Native API |
| Edge (desktop) | Yes — Native API |
| Firefox | Limited — extension required |
| WebView (Android) | Yes — with Chrome 74+ |

### Using PiP

**In the web player:**
- Click the PiP button in the player controls (or right-click the video and select "Picture in Picture")
- The video shrinks to a floating window in the corner of your screen

**In the mobile app:**
- Swipe up to the home screen or switch apps during playback
- The player minimizes automatically if PiP is enabled in app settings

### Server-Side Requirements

PiP requires the media stream to use HLS or DASH with fragmented MP4. Phlix always produces HLS for web delivery, so no special server configuration is needed. The client uses the standard HTML5 `<video>` API:

```javascript
const video = document.querySelector('video');
if (document.pictureInPictureEnabled) {
  video.requestPictureInPicture();
}
```

---

## Related Pages

- [Intro/Outro Detection](/developers/intro-outro-detection) — Developer guide for the detection algorithm
- [Skip Button Protocol](/reference/skip-button-protocol) — Server-to-client protocol reference
- [Trickplay Thumbnails](/advanced/trickplay) — Visual thumbnail scrubbing during seek
