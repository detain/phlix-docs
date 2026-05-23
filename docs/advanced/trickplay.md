# Trickplay Thumbnails

**Phase:** 4 (Server Features)
**Step:** 4.4
**Since:** 0.11.0

## TL;DR

Trickplay provides thumbnail seek previews — a grid of preview images at regular intervals that allow you to visually scrub through a video to find a specific scene. When enabled, Phlix generates thumbnail grid images (BIF format) during transcoding, and clients can request specific thumbnails via the trickplay API.

## What is Trickplay?

Trickplay thumbnails (also called "thumbnail seek" or "preview thumbnails") are still images extracted from a video at fixed intervals. Instead of just showing a progress bar, clients display a grid of thumbnails that:

- **Visual preview** — see what's in the video at each point
- **Quick navigation** — click a thumbnail to seek to that position
- **Resume support** — visually identify where you left off

Phlix generates BIF (Bitmap Index Format) thumbnail grids using FFmpeg and serves them via a dedicated API endpoint.

## How It Works

### Generation

When a video is transcoded, the `TrickplayGenerator` class:

1. **Probes** the video duration using FFprobe
2. **Extracts frames** at configurable intervals (default: every 10 seconds)
3. **Assembles grids** — each grid contains 8×4 = 32 thumbnails (default)
4. **Generates index** — BIF XML maps each thumbnail to byte offsets

### Output Files

For a transcode job with ID `abc123`, the following files are created:

```
{trickplay_dir}/trickplay/abc123/
├── bif_00.jpg        # First grid image (thumbnails 0-31)
├── bif_01.jpg        # Second grid image (thumbnails 32-63)
├── bif_02.jpg        # Third grid image (thumbnails 64-95)
└── index.xml         # BIF index mapping byte offsets
```

### BIF Index Format

```xml
<ThumbList>
  <Thumbs>
    <Thumb index="0" time="0" offset="0" length="4096"/>
    <Thumb index="1" time="10" offset="4096" length="4096"/>
    <Thumb index="2" time="20" offset="8192" length="4096"/>
    <!-- ... -->
  </Thumbs>
</ThumbList>
```

Each `<Thumb>` entry contains:
- `index` — thumbnail number
- `time` — timestamp in seconds
- `offset` — byte offset within the grid images
- `length` — size of the thumbnail within the grid

## API Endpoints

Trickplay thumbnails are served via two HTTP endpoints:

### GET /trickplay/{jobId}/thumb-{index}.jpg

Returns a thumbnail grid image.

**Parameters:**
- `jobId` (path) — Transcode job identifier
- `index` (path) — Grid image index (0, 1, 2, ...)

**Response:**
```
HTTP/1.1 200 OK
Content-Type: image/jpeg
Content-Length: 4096
Cache-Control: public, max-age=86400

[binary image data]
```

**Errors:**
- `404 Not Found` — Trickplay not available for this job

### GET /trickplay/{jobId}/index.xml

Returns the BIF index XML for mapping thumbnails to byte offsets.

**Parameters:**
- `jobId` (path) — Transcode job identifier

**Response:**
```
HTTP/1.1 200 OK
Content-Type: application/xml
Content-Length: 1024
Cache-Control: public, max-age=86400

<?xml version="1.0" encoding="UTF-8"?>
<ThumbList>
  ...
</ThumbList>
```

## Configuration

### TrickplayConfig

The `TrickplayConfig` value object encapsulates all settings:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `interval_seconds` | `10` | Time between thumbnails |
| `grid_columns` | `8` | Thumbnails per row in grid |
| `grid_rows` | `4` | Rows per grid image |
| `thumb_width` | `160` | Width of each thumbnail in pixels |
| `thumb_height` | `90` | Height of each thumbnail in pixels |
| `image_format` | `jpeg` | Image format: `jpeg` or `png` |
| `jpeg_quality` | `72` | JPEG quality (1-100) |

### Integration with StreamManager

To enable trickplay generation during transcoding:

```php
use Phlix\Media\Streaming\StreamManager;
use Phlix\Media\Streaming\Trickplay\TrickplayGenerator;
use Phlix\Media\Streaming\Trickplay\TrickplayController;
use Phlix\Media\Streaming\Trickplay\TrickplayConfig;

// Create generator and controller
$generator = new TrickplayGenerator($ffmpegRunner, '/var/media');
$controller = new TrickplayController('/var/media', 'https://phlix.example.com');

// Wire into StreamManager
$streamManager->setTrickplay($generator, $controller);

// Generate trickplay for a transcode job
$result = $streamManager->generateTrickplay($jobId, $inputPath, new TrickplayConfig(
    interval_seconds: 10,
    grid_columns: 8,
    grid_rows: 4,
));
```

### Grid Dimensions

The total grid image dimensions are:
- **Width**: `grid_columns × thumb_width` (default: 8 × 160 = 1280px)
- **Height**: `grid_rows × thumb_height` (default: 4 × 90 = 360px)

### Thumbnails Per Grid

```
thumbnails_per_grid = grid_columns × grid_rows
# Default: 8 × 4 = 32 thumbnails per grid image
```

### Grid Count Estimation

For a 2-hour movie (7200 seconds) with 10-second intervals:
```
thumbnail_count = ceil(7200 / 10) = 720 thumbnails
grid_count = ceil(720 / 32) = 23 grid images
```

## Client Integration

Clients like the Phlix web player use trickplay as follows:

1. **During playback initialization**, check if trickplay exists:
   ```
   GET /trickplay/{jobId}/index.xml
   ```

2. **Display thumbnail strip** by rendering grid images:
   ```
   GET /trickplay/{jobId}/thumb-0.jpg
   GET /trickplay/{jobId}/thumb-1.jpg
   ...
   ```

3. **On user interaction**, use the BIF index to determine which thumbnail corresponds to a seek position, then seek to that time.

## Implementation Details

### FFmpeg Frame Extraction

Individual frames are extracted using FFmpeg:

```bash
ffmpeg -y -hide_banner -loglevel error \
  -i input.mkv \
  -ss 0 -vframes 1 -q:v 2 -f image2 frame_00000.jpg \
  -ss 10 -vframes 1 -q:v 2 -f image2 frame_00001.jpg \
  ...
```

### Grid Assembly

Thumbnails are assembled into a grid using FFmpeg's `tile` filter:

```bash
ffmpeg -y -hide_banner -loglevel error \
  -i frame_00000.jpg \
  -i frame_00001.jpg \
  ... \
  -filter_complex "tile=8x4:margin=2:padding=3" \
  -q:v 2 \
  bif_00.jpg
```

## Troubleshooting

### Trickplay Endpoint Returns 404

1. **Check if trickplay was generated** — trickplay is only created when explicitly generated during transcoding
2. **Verify jobId** — ensure the jobId matches an existing transcode job
3. **Check file permissions** — the trickplay directory must be readable by the web server

### Thumbnails Not Loading

1. **Check grid index range** — ensure the index is within the number of grid images generated
2. **Verify image format** — the endpoint checks for both `.jpg` and `.png` files
3. **Check Content-Type header** — should be `image/jpeg` or `image/png`

### Poor Quality Thumbnails

1. **Increase JPEG quality** in `TrickplayConfig` (higher = better quality, larger files)
2. **Use PNG format** for lossless thumbnails (larger file size)
3. **Adjust thumbnail dimensions** — larger dimensions preserve more detail

### Generation Slow

1. **Increase interval** — fewer thumbnails = faster generation
2. **Use hardware acceleration** — ensure FFmpeg is using GPU when available
3. **Reduce grid count** — smaller images (fewer rows/columns) process faster

## See Also

- [Streaming Protocols](../developers/streaming-protocols.md) — HLS streaming architecture
- [Hardware Transcoding](../advanced/hardware-transcoding.md) — GPU-accelerated transcoding
