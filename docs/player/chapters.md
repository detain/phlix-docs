---
title: Player Chapters
description: Video chapter extraction, trickplay generation, chapter markers, and skip intro/outro
---

# Player Chapters

**Phase:** P2-S6

Phlix supports video chapters, trickplay thumbnails, chapter markers in the player timeline, and skip intro/outro functionality.

## Chapter Extraction

### Supported Formats

Chapters are extracted from multiple container formats:

| Container | Method | Notes |
|------------|--------|-------|
| MKV | mkvmerge | Binary chapter atoms |
| MP4/M4A/M4B | mp4 chpl atom | Native MP4 chapter support |
| WebM | Matroska spec | WebM containers |
| AVI | IDIAVIMultiPartMPL | Legacy format |

### Extraction Tools

#### mkvmerge (MKV)

```bash
mkvmerge --identify video.mkv
mkvextract tracks video.mkv 0:chapters.xml
```

#### chromaprint (Audio Fingerprinting)

For files without embedded chapters, chromaprint can detect chapter boundaries based on audio fingerprints:

```bash
chromaprint --verbose --file video.mkv fingerprint.txt
```

## Trickplay Sprite Sheet Generation

Trickplay provides visual scrubbing previews in the player timeline.

### Specifications

| Parameter | Value |
|-----------|-------|
| Thumbnail size | 360×90 pixels |
| Tiles per row | 10 |
| JPEG quality | 80% |
| Format | JPEG sprite sheet |

### Generation Pipeline

1. **Extract frame** at each tick interval
2. **Resize** to 360×90 pixels
3. **Compress** as JPEG at quality 80
4. **Composite** into sprite sheet (10 tiles × N rows)

### Sprite Sheet Layout

```
[row 0: ticks 0-9]   (3600×90)
[row 1: ticks 10-19] (3600×90)
...
[row N: remaining]    (3600×90)
```

### API Usage

```http
GET /api/v1/media/{id}/trickplay
```

Returns sprite sheet URL and metadata.

## Chapter Markers in Player Timeline

### Display

Chapter markers appear as **clickable dots** on the player timeline:

```
|=====●=====●=====●=====●=====|
  Ch1    Ch2    Ch3    Ch4
```

### User Interaction

1. **Hover** — Tooltip shows chapter title and start time
2. **Click** — Seek to chapter start position
3. **Scrub indicator** — Current position shown relative to chapters

### Timeline Integration

```typescript
interface ChapterMarker {
  start: number       // Start time in seconds
  end: number         // End time in seconds
  title: string       // Chapter title
  thumbIndex?: number // Trickplay thumbnail index
}
```

## Chapter List Overlay

Press the **chapters button** (or `C` key) to open the chapter list overlay:

```
┌────────────────────────────────────┐
│ Chapters                     [×]  │
├────────────────────────────────────┤
│ ▶ Chapter 1: Opening          0:00 │
│   Chapter 2: The Journey    5:32   │
│   Chapter 3: Confrontation  12:45 │
│   Chapter 4: Resolution      21:18 │
│   Chapter 5: Credits         28:03 │
├────────────────────────────────────┤
│ Currently playing: Chapter 2      │
└────────────────────────────────────┘
```

### Navigation

- **Click** chapter to seek
- **Up/Down arrows** to navigate
- **Enter** to select highlighted chapter
- **Escape** to close overlay

## Skip Intro/Outro Markers

### Marker Structure

```json
{
  "intro": {
    "start": 0,
    "end": 90,
    "confidence": 95
  },
  "outro": {
    "start": 3540,
    "end": 3600,
    "confidence": 88
  }
}
```

### Detection Sources

| Source | Priority | Format |
|--------|----------|--------|
| EDL (Comskip) | 1 | `start end 3` (commercial type) |
| Embedded chapters | 2 | Container-specific |
| Audio fingerprint | 3 | chromaprint analysis |
| ML detection | 4 | Intro/outro model |

### Skip Button Behavior

The player shows **Skip Intro** or **Skip Outro** buttons when:

1. Position is within the skip range
2. User hasn't already skipped this segment
3. Confidence >= 70%

### Button Actions

| Button | Action | State |
|--------|--------|-------|
| Skip Intro | Seek to `intro.end` | Shown during intro |
| Skip Outro | Seek to end - 5s | Shown during outro |
| Skip | Mark as "skipped", seek | User preference |

## Player Integration

### Web Client

```typescript
// Check for available chapters
const markers = await api.getMediaMarkers(mediaId);

// Render timeline with chapter dots
player.on('timeupdate', () => {
  const currentChapter = markers.chapters.find(
    c => c.start <= player.currentTime && c.end > player.currentTime
  );
  updateChapterDisplay(currentChapter);
});
```

### Mobile Clients

Chapter support on mobile uses the same API with platform-specific UI:

- **iOS**: Bottom sheet chapter list
- **Android**: Slide-up panel with seek functionality

### Chapter JSON Storage

```json
{
  "chapters": [
    {
      "start": 0,
      "end": 332,
      "title": "Opening Credits"
    },
    {
      "start": 332,
      "end": 765,
      "title": "Act One"
    }
  ]
}
```

## Related Documentation

- [Comskip / Live](/developers/comskip-live) — Commercial detection
- [Chromaprint](/developers/chromaprint) — Audio fingerprinting
- [Intro/Outro Detection](/developers/intro-outro-detection) — ML-based marker detection
