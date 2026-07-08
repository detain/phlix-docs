# Stream Quality / Adaptive Bitrate (ABR)

Phlix serves a **multi-variant HLS ABR ladder** for transcoded playback: one master
playlist listing several quality "rungs" (240p–2160p, clamped to the source) plus an
`Original` variant. Every ABR-capable player (`hls.js` on the web, native HLS on
Safari/iOS, `ExoPlayer`/`AVPlayer` on mobile, the Roku `Video` node) climbs and drops
between rungs automatically the moment the master lists more than one variant — "Auto"
is not special server-side logic, it falls out of standard HLS. Manually pinning a rung
is additional UI on top.

This page is the current, authoritative description of the feature as shipped. It
supersedes the single-CMAF-pipeline description that used to live in
[Streaming Protocols](./streaming-protocols) for **on-demand HLS specifically** — that
page now carries a prominent note pointing here. DASH is unaffected by this work and
remains the legacy single-CMAF-job pipeline (see
[Streaming Protocols](./streaming-protocols)); the multi-variant ABR ladder described
below is **HLS only**.

## Architecture at a glance

```
Scan time:  MediaScanner → ffprobe → ItemRepository::addStream()
            persists width/height/video codec/bitrate/pix_fmt/audio codec
            into media_streams + metadata_json['source']  (A1)

Play time:  AbrLadder::build(SourceProfile, deviceProfile)  →  LadderResult   (A2, pure/no I/O)
                 │
                 ▼
            TranscodeManager::ensureHlsJob()                                  (A5)
                 ├─ builds/reuses the ladder from persisted metadata
                 │  (falls back to a live ffprobe when metadata is absent)
                 ├─ persists the ladder as transcode_jobs.variants (JSON)      (A3)
                 └─ writes master.m3u8 (N × #EXT-X-STREAM-INF, highest-first)
                    + one media_v{id}.m3u8 per variant

Segment request:  HlsController::serveFile()                                  (A6)
                 ├─ parses `seg-v{id}-NNNNN.ts` (or legacy `seg-NNNNN.ts`)
                 └─ TranscodeManager::ensureSegment($jobId, $variant, $index)
                    ├─ per-variant dedup (skip if `{final}.part-*` exists)     (A5/S2)
                    ├─ global in-flight cap → 503 SegmentBusyException        (A5)
                    ├─ FfmpegRunner::buildSegmentCommand() — per-rung capped
                    │  CRF encode, or genuine `-c copy` for Original           (A4)
                    └─ served via Response::withFile() (event-loop streaming,
                       real Range/206, conditional GET)                       (S3)

API:        POST /api/v1/media/{id}/transcode
            GET  /api/v1/transcode/{jobId}/status
            GET  /api/v1/media/{id}/playback-info
            → all three advertise the playable/preview `variants[]` ladder    (A7)

Hub relay:  ServerProxyController allowlists GET/HEAD under /hls, /dash,
            /media, and POST media/{id}/transcode, and now STREAMS large
            segment bodies through instead of buffering them whole            (D1/D2/D3s)

Web player: HlsHandle exposes hls.js's level API → useHlsTranscode reactive
            state → QualityMenu (Auto + rungs + Original)                     (E1-E3)
```

## The ladder (D1–D4, `AbrLadder`)

`Phlix\Media\Streaming\AbrLadder::build()` (`phlix-server/src/Media/Streaming/AbrLadder.php`)
is a **pure, deterministic** function: given a `SourceProfile` (width/height/video
codec/bitrate/audio codec) and a device-profile name, it returns an ordered
`LadderResult` — no DB, no ffprobe, no filesystem, no clock. It is unit-tested
exhaustively (`AbrLadderTest.php`, data-provider over 4K/1080p/720p/480p/240p sources,
H.264 vs HEVC, odd/anamorphic aspect ratios).

Canonical rungs (target **video** bitrate before clamping):

| Rung | Resolution (16:9) | Target video kbps | Included when |
|---|---|---|---|
| 240p | 426×240 | 400 | source ≥ 240p (else a single fallback rung at the clamped size) |
| 360p | 640×360 | 800 | source ≥ 360p |
| 480p | 854×480 | 1400 | source ≥ 480p |
| 720p | 1280×720 | 2800 | source ≥ 720p |
| 1080p | 1920×1080 | 5000 | source ≥ 1080p |
| 1440p | 2560×1440 | 9000 | source ≥ 1440p |
| 2160p | 3840×2160 | 16000 | source ≥ 2160p |
| **Original** | source | source | copy passthrough or the top rung — see below |

Clamp rules actually enforced:

- **Never upscales.** A canonical tier is dropped entirely once its height exceeds the
  source height (1440p/2160p only ever appear for ≥1440p/≥2160p sources).
- **Never exceeds source bitrate.** Each rung's target video bitrate is capped at the
  source's known video bitrate.
- **Device-profile cap.** Rungs whose height/width exceed the device profile's
  (`QualitySelector`: `generic`/`mobile-low`/`mobile-high`/`web`/`tv-4k`) max resolution
  are dropped outright; advertised `BANDWIDTH` never exceeds the profile's max bitrate
  (video headroom is reserved so `maxrate + audio ≤ cap`).
- **Anamorphic-safe.** Each rung's width is derived from the *source's* aspect ratio
  (rounded to an even integer), not a hardcoded 16:9 width, so 2.40:1/anamorphic
  sources aren't distorted.
- **Always ≥1 rung.** A sub-240p source (or a narrow device-profile cap) still yields a
  single clamped rung rather than an empty ladder.
- **Unknown source dimensions** (pre-scan, or A1 metadata absent) cap conservatively at
  a 1080p 16:9 ceiling — never 1440p/2160p — so a metadata-less item is never upscaled,
  and no copy Original is offered.
- **Ordering:** highest-first, matching how the HLS master lists variants.
- **Codecs string:** H.264 High profile at the *lowest* level whose MaxFS covers the
  frame's macroblock count (not height alone) — e.g. a 2048-wide 1080-tier rung
  correctly advertises L4.2 (`avc1.64002A`), not L4.1, and 3840×2160 advertises L5.1
  (`avc1.640033`) — plus AAC-LC (`mp4a.40.2`).

### Original = stream-copy passthrough, or the top rung (D4)

If the source's video is H.264 (h264/avc1/avc) and audio is AAC (aac/mp4a), has known
dimensions, and fits the device-profile cap, `Original` is a genuine **`-c:v copy`**
(and `-c:a copy` if the audio also qualifies) segment at the source's exact
resolution/bitrate — near-zero CPU, labelled `Original (<h>p)`. `LadderResult` then
treats it as a real *additional* highest-priority master variant.

Otherwise `Original` is the **same Rendition as the top clamped transcode rung**,
relabelled `Original (best available)`; `LadderResult::streamVariants()` does not
duplicate a master entry for it — the UI's "Original" choice maps onto that existing
rung.

Video and audio copy decisions are independent in `FfmpegRunner::buildSegmentCommand()`:
an H.264 source with non-AAC audio yields video-copy + audio-reencode and vice versa.
Because a stream copy cannot synthesize a keyframe at an arbitrary point,
`-force_key_frames` is **not** applied to copy segments (the copy path fast-seeks to the
nearest *preceding* source keyframe, so a copy segment's actual start can drift up to
one source GOP from its nominal boundary — acceptable for a manually-pinned Original,
but exactly why copy is never used for the ABR-switching transcoded rungs, which stay
frame-aligned across rungs via an identical `-force_key_frames expr:gte(t,0)` on every
rung).

**On-demand segments currently always transcode via CPU (`libx264`)** — the same
`computeSegmentParams()` path that builds the copy-vs-encode decision for the ladder's
transcoded rungs currently forces a browser-safe libx264/AAC encode (a stream copy can't
force a keyframe at an arbitrary segment boundary). Hardware-accelerated encoders
(NVENC/VAAPI/QSV/AMF/VideoToolbox) exist in the codebase (see
[Hardware Acceleration](./hardware-acceleration)) but are **not currently wired into
the on-demand HLS segment path** — see the CPU-multiplication risk below.

## On-demand per-variant segments (D2, A5/A6, S1–S3)

The segment path from before this program (dedup, in-flight cap, cache sweep) is
**extended with a variant dimension**, not replaced:

- **Segment naming.** `TranscodeManager::segmentFileName()` emits
  `seg-v{renditionId}-{index:05d}.ts` for a multi-variant job (e.g. `seg-v1080p-00042.ts`,
  `seg-voriginal-00000.ts`) and preserves the legacy unprefixed `seg-{index:05d}.ts` for
  a pre-A5 job whose `variants` column is `NULL` (full backward compatibility — no
  migration of in-flight jobs required). Segments stay flat inside the job directory
  (no `v{id}/` subdirectory) because the route's `{file}` placeholder is a single
  non-slash segment.
- **Media playlists.** One `media_v{id}.m3u8` per variant, referencing only that
  variant's own segments; `master.m3u8` lists every clamped rung plus Original as
  `#EXT-X-STREAM-INF` entries (highest bandwidth first) pointing at each
  `media_v{id}.m3u8`.
- **`HlsController::serveFile()`** (A6) recognizes both the legacy and multi-variant
  segment filename shapes via a strict `[a-z0-9]+` id allowlist and routes to
  `TranscodeManager::ensureSegment($jobId, $variant, $index)` — a `null` `$variant`
  selects the legacy single-variant job, a rendition id string selects the matching
  rung.
- **Only requested segments encode.** A client pinned to 480p, or one riding ABR that
  never needs 2160p, never forces every rung to transcode — this is what keeps
  per-variant on-demand encoding tractable (see guardrails below).
- **Dedup, cap, and cache sweep are all keyed per `(jobId, variant)`,** preserving every
  existing seek-cascade protection (`{final}.part-*` dedup, `SEGMENT_MAX_INFLIGHT_GLOBAL
  = 8` → `SegmentBusyException` → HTTP 503 + `Retry-After`, TTL+LRU cache sweep) across
  the whole variant-spanning job.

### Server perf work that shipped alongside (Track S)

These landed interleaved with the ABR work in `phlix-server` because they touch the
same hot paths and matter more once every segment request also carries a variant:

- **S1 — in-worker job-row cache.** `TranscodeManager::getJobRow()` used to re-`SELECT
  *` on every segment request even though the row is immutable post-creation. A bounded
  LRU (256 entries, jobId-keyed) now caches the row — including the **parsed** `variants`
  ladder — and is invalidated on the 4 write sites (terminal sync/reap/cancel/legacy
  failure).
- **S2 — in-worker in-flight segment counter.** Per-variant dedup
  (`segmentEncodeInFlight()`) is now memory-based (a local set + a throttled
  cross-worker snapshot), removing the hot-path filesystem glob for the common
  retry/dedup check. The **global cap** (`countInFlightSegmentEncodes()`) deliberately
  stays a real-time glob — a memory-based cap was reviewed and rejected because it can
  overshoot by the worker count during a seek storm, exactly what the cap exists to
  prevent.
- **S3 — segments/playlists stream via `Response::withFile()`** instead of
  `file_get_contents()`, mirroring how direct-play already streams. This gives real HTTP
  `Range` support (single/suffix ranges, RFC 7233 §2.1 EOF-clamping, 206/416), and
  `Last-Modified`/`If-Modified-Since` → 304 for immutable segments (playlists stay
  `no-cache` and are never short-circuited to 304). **This is the change that made hub
  D3s (streaming pass-through) worthwhile** — the origin no longer buffers a whole
  segment in worker memory before it can be forwarded.
- **S4 — gzip for buffered text/JSON/HTML responses** (segments and other binary/media
  responses are untouched by two independent guards) plus `Cache-Control: immutable,
  max-age=31536000` for hashed `/assets/app/**` static assets, and monotonic `hrtime(true)`
  request timing.

## Source metadata at scan (A1) and the API surface (A6/A7)

`MediaScanner` now persists width/height/video codec/bitrate/pix_fmt/audio codec into
both `media_streams` (via `ItemRepository::addStream()`) and
`metadata_json['source']` during scan/rescan, so the ladder can be built **without a
live ffprobe on every playback start**. `ensureHlsJob()` still falls back to a live
probe when this metadata is absent (older, pre-A1 items) — so nothing breaks for
un-backfilled libraries, it's just slower to start the first play. A one-shot CLI
(`scripts/backfill-source-metadata.php`) idempotently backfills existing items
(`--library`, `--limit`; skips items that already have `source`).

Three endpoints advertise the ladder, all using the same flat "Rendition" shape
(`{id, label, width, height, bitrate, video_bitrate, codecs, url, is_original, is_copy}`):

| Endpoint | When | `variants[]` semantics |
|---|---|---|
| `POST /api/v1/media/{id}/transcode` | Starting (or reusing) a job | The **playable** ladder for this job; each `url` is a signed, per-variant `media_v{id}.m3u8`. `null` for a legacy job whose `transcode_jobs.variants` column is `NULL`. |
| `GET /api/v1/transcode/{jobId}/status` | Polling job readiness | Same shape/signing as `start()`, keyed by job id. |
| `GET /api/v1/media/{id}/playback-info` | Pre-flight, before pressing Play | A **preview** ladder built from A1's persisted `metadata_json['source']` — no transcode job is created and the source is **not** probed. Every `url` is `null` (nothing is playable yet). Returns `null` for the whole `quality_ladder` key when the item has no usable source metadata (pre-scan/pre-A1). |

The device profile used to build the ladder is resolved identically in all three
places: an explicit `?profile=` query param wins, otherwise it's derived from the
`X-Phlix-Device-Type` header (`tizen`/`roku` → `tv-4k`, `android`/`ios` →
`mobile-high`, `windows` → `generic`, anything else → `web`). A controller test asserts
the transcode-start and playback-info mapping tables stay byte-identical, since a
pre-flight preview that disagreed with the real job would be actively misleading.

Every streaming URL returned by these endpoints (`master_url`, `dash_url`, each
variant's `url`, each subtitle track's `url`) is signed via `SignedUrl`, prefix-scoped
to the job directory — hls.js/`<video>` can't attach a Bearer header to a bare manifest
request, so one signature on the master authorizes every variant playlist and segment
underneath it. See [Signed Media URLs](../security/signed-media-urls).

There is currently no `auto` sentinel in the server-side payload — "Auto" is purely a
player-side concept (hls.js `currentLevel = -1`); the server only ever advertises the
concrete rungs.

## Hub relay: streaming pass-through (D1–D3s)

The hub's relay browse-proxy (`ServerProxyController`) was extended in three steps:

1. **D1 — allowlist streaming GET/HEAD.** `BROWSE_SCOPE_ALLOWLIST` gained `/hls`,
   `/dash`, `/media`, and `/api/v1/transcode` prefixes (GET+HEAD), so a signed-in owner
   can *play* a paired server's media through the hub relay, not just browse its
   catalog. Ownership (`server.not_found`/`server.not_owned`), relay-online
   (`server.relay_unavailable`/`server.offline`), and path-traversal
   (`hasTraversalSegment()`) gates all run **before** the widened allowlist is
   consulted and are unchanged.
2. **D2 — allow the transcode-start `POST`.** `POST media/{id}/transcode` is now
   allowlisted (the shared `RelayHttpRequest` DTO already permitted POST); every other
   mutating method/path still fails closed with 403.
3. **D3 / D3s — stream large response bodies instead of buffering them whole.** This is
   the significant architectural change, described below.

### Why streaming pass-through, and why it had to wait for S3

Originally the hub browse-proxy buffered every response body **twice**: the relay-ws
worker reassembled every `HTTP_RESPONSE` BODY frame into one blob before publishing it
on `END`, and the HTTP worker then base64-decoded that whole blob in `buildResponse()`.
For a multi-MB HLS/DASH segment (× concurrent viewers, through one relay worker) that's
a real resident-memory spike — and it would have defeated the point of S3, which made
the *origin* stop buffering. D3s reopens the streaming half of D3 once S3 landed.

### Architecture: `ConnectionResponseSink` / `RelayResponseSink`

The streaming path reuses the **existing** chunked `RelayHttpResponseCodec`
HEAD/BODY/END frame protocol end-to-end — nothing buffers a whole body anywhere:

1. **Decision (`ServerProxyController`).** New `STREAMING_BODY_PREFIXES = [/hls, /dash,
   /media]` + `isStreamingPath()`: GET/HEAD under those byte-serving families stream;
   JSON browse, transcode-status polling, and the transcode-start `POST` stay on the
   original simple buffered path. This is a **path-based** heuristic (not a size
   threshold) — the hub can't know a body's size before the first frame arrives, and the
   route already tells it which families serve bytes. Tiny playlists match the prefix
   too, but streaming a one- or two-fragment body is harmless.
2. **Deferred producer (`Response`/`Application`).** A streaming request returns
   `(new Response())->status(200)->stream($producer)`. `Application::onMessage` invokes
   `($response->streamProducer)($connection)` with the live browser `TcpConnection`
   instead of sending a built response — connection ownership stays in the worker
   layer; the controller never touches the socket directly.
3. **Phased cross-process transport (`RelayProxyManager`).** The request envelope
   carries `stream => true`; for a streaming request, `onResponseFrame` publishes each
   frame as its own channel message — `{phase:'head',...}`, `{phase:'body',...}` per
   fragment (**no accumulation**), `{phase:'end'}` — instead of reassembling. The
   buffered path is byte-for-byte unchanged when `stream` is absent/false. A no-`phase`
   message is still handled as a complete buffered reply, so every error/legacy path
   degrades cleanly.
4. **Consumer + sink (`RelayProxyBridge::stream()`, `RelayResponseSink`,
   `ConnectionResponseSink`).** `stream()` pop-loops the per-request channel, driving a
   `RelayResponseSink`: `head()` once → `body()` per fragment → `end()`.
   `ConnectionResponseSink` (new, `src/Http/ConnectionResponseSink.php`) writes each
   fragment straight to the `TcpConnection` — **fixed-length framing** (preserving the
   server's real `Content-Length`/`Content-Range`/`206` verbatim) when the server sent a
   `Content-Length` (every HLS/DASH segment and every direct-play `withFile()` response
   does, post-S3), or **chunked** transfer-encoding when the length is unknown. Range
   seeking on `<video>` therefore keeps working straight through the hub. Hop-by-hop
   headers (`connection`/`keep-alive`/`transfer-encoding`) are dropped; header
   names/values are CRLF-checked to prevent header injection.

### Timeout semantics changed from total-transfer to TTFB-then-inactivity

The pre-D3s buffered model's 60-second timeout was correct only because the whole reply
arrived in one shot on `END`. For a true stream that would 504 any legitimately long
transfer, so it changed to two phases:

- **First phase = time-to-first-byte** — the bridge awaits the head frame for
  `replyTimeoutForPath()` (60s for `/hls`/`/dash`, comfortably above the server's ~30s
  worst-case segment-encode; 30s for `/media`).
- **After the head, it's an inactivity bound** — each response frame re-arms the
  completion timer (throttled to ≤1/s), so a steadily-flowing body streams indefinitely
  and only a genuine mid-transfer stall trips it.

This also fixes a latent bug: `/media/{id}/stream` (large, un-ranged direct-play through
the hub) used to truncate at a 30-second **total**-transfer timeout; it's now
first-byte + inactivity, and direct-play's first byte is effectively instant (server
`withFile()`), so the truncation is gone.

### Back-pressure

- **Browser hop:** `ConnectionResponseSink` installs `onBufferFull`/`onBufferDrain` on
  the connection; when Workerman's send buffer hits its cap, the producing coroutine
  parks on a resume channel until drain — the socket send buffer never grows unbounded.
- **Relay→HTTP hop:** the per-request streaming channel is bounded (32 fragments, ≈2 MB
  of ~64 KB fragments); a stalled consumer stops draining it, which blocks the upstream
  push, giving genuine end-to-end back-pressure. Known, accepted trade-off: a
  *sustained* slow browser on a huge stream can head-of-line-block that HTTP worker's
  shared reply-event subscriber until the fragment drains or the connection closes —
  acceptable for a personal-media relay's concurrency level, and bounded by the
  inactivity timer and tunnel-drop handling.

**Status note:** D1/D2 are merged and released (hub v0.2.0). D3s (the streaming
pass-through described above) is fully implemented, review-clean across four rounds
(`NO FINDINGS`), and its TestEngineer pass is complete — full local gate green
(`phpstan` L9 no-baseline, `phpcs` PSR-12, `phpunit` 1151 tests/15125 assertions,
17 pre-existing skips, line coverage 57.86% ≥ the 40% gate, `composer validate --strict`)
with no new-code coverage regressions. `psalm` remains un-runnable on the dev box used
for every review round (requires PHP ≥8.3.16; the box runs 8.3.6) — this is a version
gate, not a code finding, and must be confirmed on CI / the live box (PHP 8.5.4) before
D3s ships. It is the final hub relay architecture for streaming and is ready to merge to
`master`, pending only that psalm confirmation and the coordinator's git cycle (a
separate D4-style hub version bump follows once D1–D3s are sealed together). Treat the
architecture above as current.

## Client behavior

### Web player (`@phlix/ui` v0.74.0) — shipped

- **`HlsHandle`** (`src/components/player/hls-playback.ts`) exposes hls.js's level API:
  `levels`, `getCurrentLevel()`/`setCurrentLevel()`, `setNextLevel()`,
  `autoLevelEnabled` getter/setter, `bandwidthEstimate`, and an `onLevelSwitched`
  subscription. The native-HLS path (Safari/iOS) degrades to Auto-only no-ops — there is
  no level API to surface there.
- **`useHlsTranscode`** lifts these into reactive `levels`/`currentLevel`/`autoEnabled`/
  `activeLevelHeight` refs plus a `setLevel(n | 'auto')` action. `autoEnabled` (not
  `currentLevel`) is the reliable "are we in Auto" signal — `currentLevel` can lag
  briefly after `setLevel('auto')` until hls.js's `LEVEL_SWITCHED` settles.
- **`QualityMenu`** is fed the live ladder from hls.js (`Auto (→ 720p)`-style label +
  discrete rungs highest-first + `Original`), wired inside `Player.vue` (not
  `PlayerPage.vue` — a deliberate deviation from the original plan wording, since
  `useHlsTranscode` lives in `Player` and no server variant data flows into
  `phlix-ui` separately). Picking a rung pins it (`setCurrentLevel`); picking Auto
  restores ABR. The choice persists to `usePreferencesStore.defaultQuality` and seeds
  hls.js's `startLevel` on the next source load. The menu hides entirely on
  native/Safari or when there's only one quality. No re-transcode is needed for a web
  level switch — every variant is already in one master playlist.
- Web ABR does **not** need per-client server coordination: switching is purely a
  client-side hls.js decision among the segments the master already advertises.

### Native clients — contracts-ready, not yet wired (Track G paused)

`@phlix/contracts` v0.2.0 (`src/playback.ts`) ships the `Rendition` type,
`RenditionId`/`AutoQuality`/`QualitySelection` helpers, `TranscodeStartResponse`/
`TranscodeStatusResponse`, `PlaybackInfo.quality_ladder?`, and a `pickDefaultRendition()`
helper — the additive, backward-compatible shape every native client needs to consume
the server's `variants[]`. **This is the extent of what has shipped for native clients.**
Tizen, Windows, mobile, and Roku have **not** individually been updated to pin
`@phlix/contracts` v0.2.0 or to build a quality picker (Track G, steps G1–G4, are
intentionally paused pending resumption) — do not assume a quality menu exists on those
platforms yet. "Auto" already works there today regardless, because the multi-variant
master alone drives native ABR (Safari/iOS native HLS, ExoPlayer, AVPlayer, and the Roku
`Video` node all perform ABR against a multi-variant master with zero extra client code)
— it is *manual pinning* on those platforms that is not yet built.

The one exception: **phlix-console** (the PHP/BrightScript-adjacent TUI client) shipped
its own quality overlay (`v`-key, Auto + real `variants[]` rungs) directly against the
server's `variants[]`/`Rendition` shape, ahead of and independent from the
`@phlix/contracts` release — it was judged a client-local concern (a fixed, short
in-terminal list) rather than something to push upstream into shared contracts or
SugarCraft.

## ABR guardrails and risks

These are the mitigations actually relied on in production, not aspirational:

- **On-demand per-variant encoding multiplies CPU.** Mitigated by: per-variant dedup
  (skip if `.part-*` already in flight), a **global** in-flight segment cap
  (`SEGMENT_MAX_INFLIGHT_GLOBAL = 8` → `SegmentBusyException` → HTTP 503 +
  `Retry-After`, checked with a real-time filesystem glob deliberately kept
  memory-independent so it can't be overshot fleet-wide by S2's per-worker counters),
  and the fact that **only requested segments ever encode** — pinning 480p or letting
  ABR settle low never forces 1080p/2160p/Original to transcode. Raise the cap constant
  only after load-testing. On-demand segment encoding is currently CPU-only
  (`libx264`); see [Hardware Acceleration](./hardware-acceleration) for the
  encoder-detection framework that exists in the codebase but is not yet wired into
  this path — that wiring is the most direct future mitigation for this risk on
  GPU-equipped boxes.
- **ABR mis-estimates bandwidth from on-demand encode latency.** The first segment of a
  rung the player hasn't fetched yet is slower to arrive than its steady-state encode
  time (cold cache). Mitigated by advertising the rung's real **encoded** bitrate (not a
  download-time-derived estimate) in `BANDWIDTH`, and by the player's tuned
  `fragLoadPolicy` (30s time-to-first-byte tolerance, from the earlier
  seek-cascade-fix work) so a slow first fragment isn't treated as a load failure.
- **Segment-boundary consistency across rungs, for seamless switching.** Every
  transcoded rung shares byte-identical segment-duration/keyframe framing
  (`-force_key_frames expr:gte(t,0)`, `-t`, `-output_ts_offset`, `-muxdelay
  0 -muxpreload 0`) — only scale/bitrate/level differ between rungs — so hls.js can
  switch levels at any segment boundary without a gap or overlap. The stream-copy
  Original is the deliberate **exception**: because a copy can't force a keyframe, its
  segment start can drift up to one source GOP from the nominal boundary. That's why
  Original is never used as one of the ABR-switching ladder rungs — it's a
  separately-selected endpoint.
- **Hub streaming pass-through must not regress the buffered browse path or its
  timeout semantics for tiny JSON responses.** Enforced by keeping the streaming
  decision path-based (only `/hls`, `/dash`, `/media` byte-serving families stream;
  everything else — including transcode-start `POST` and status polling — stays on the
  original buffered `bridge->request()`/`buildResponse()` path, byte-for-byte
  unchanged) and reviewed independently across four rounds with `NO FINDINGS`.

## Verifying it live

A real production checkpoint (see the program worklog) confirmed, against a real
1920×1072 H.264/AAC file with **no A1-backfilled metadata** (exercising the live-probe
fallback):

- `POST /api/v1/media/{id}/transcode` → 5 variants: `original` (`is_copy: true`,
  genuine stream-copy detected), `720p`, `480p`, `360p`, `240p` — **1080p correctly
  omitted** (source-clamp working against a real sub-1080p source).
- `GET master.m3u8` → 5×`#EXT-X-STREAM-INF`, highest-first, correct
  `BANDWIDTH`/`RESOLUTION`/`CODECS` per rung.
- `GET media_v240p.m3u8` → correct VOD media playlist referencing `seg-v240p-NNNNN.ts`.
- `GET seg-v240p-00000.ts` → a real on-demand transcode (0.72s), ffprobe-verified
  genuine H.264 430×240 output.
- `GET seg-voriginal-00000.ts` → a real stream copy (0.22s, faster than transcoding),
  ffprobe-verified exact source 1920×1072 preserved.
- `GET /api/v1/transcode/{jobId}/status` → `variants[]` matches the start response.
- `GET /api/v1/media/{id}/playback-info` on an un-backfilled item → `quality_ladder:
  null`, the expected graceful degradation.

## See also

- [Streaming Protocols](./streaming-protocols) — HLS/DASH fundamentals, manifest
  structure, and the legacy single-CMAF-job DASH pipeline (still current for DASH).
- [Hardware Acceleration](./hardware-acceleration) — the GPU encoder-detection
  framework; not currently wired into the on-demand ABR segment path (see the CPU
  guardrail above).
- [Signed Media URLs](../security/signed-media-urls) — how `master_url`/`dash_url`/each
  variant `url` are signed for player consumption without a Bearer header.
- [Web App](../clients/web) — the player's quality menu from an end-user perspective.
