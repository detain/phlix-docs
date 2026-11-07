---
title: Player Overview
description: What the Phlix player does — quality and track controls, chapters, and where each feature is documented
---

# Player

Phlix's player covers everything that happens while an item is playing:
adaptive and pinned quality selection, audio- and subtitle-track switching,
chapter markers, and Picture-in-Picture. The feature detail lives on two
pages; this page orients you first.

## Feature map

| Feature | What you get | Documented in |
| --- | --- | --- |
| Quality selection | **Auto** (ABR) or a pinned rung — 480p, 720p, 1080p, 4K, **Original** | [Player Quality & Audio](player-quality-audio) |
| Audio tracks | Switch between tracks on multi-audio sources (per-track language, channel layout) | [Player Quality & Audio](player-quality-audio) |
| Subtitles | Embedded and sidecar subtitle tracks; selection modes and burn-in behavior | [Player Quality & Audio](player-quality-audio) |
| Picture-in-Picture | Detach playback into a floating window (browser support varies) | [Player Quality & Audio](player-quality-audio) |
| Chapters | Markers from MKV/MP4/WebM containers, chapter list overlay, timeline display | [Player Chapters](chapters) |
| Trickplay | Sprite-sheet previews when scrubbing the timeline | [Player Chapters](chapters) |
| Skip intro/outro | Detected intro/outro ranges with skip buttons on the timeline | [Player Chapters](chapters) |

## Where the player runs

The web portal (`/app`) ships the player described above. Each client —
Roku, Tizen, Windows, mobile, and the console — embeds or re-implements parts
of this surface; see [Clients Overview](../clients/overview) for what each one
supports. Quality rungs themselves are produced by the server: how it encodes
them is covered in [Hardware Transcoding](../advanced/hardware-transcoding).

## See Also

- [Player Chapters](chapters) — extraction, markers, trickplay, skip intro/outro
- [Player Quality & Audio](player-quality-audio) — rungs, tracks, subtitles, PiP
- [Libraries Overview](../libraries/overview) — organizing the media the player opens
