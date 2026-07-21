# Hardware Acceleration Guide

**Since:** 0.11.0

## Overview

Phlix Media Server supports hardware-accelerated transcoding via GPU encoders. The hardware acceleration system automatically detects available encoders (NVENC, VAAPI, QSV, VideoToolbox, AMF, V4L2) and provides a unified interface for selecting the best encoder for a given codec.

## Architecture

### Components

1. **HwaccelCapability** — Value object representing a hardware accelerator's capabilities
2. **HwaccelProbe** — Runs vendor-specific detection probes
3. **HwaccelRegistry** — Singleton holding probed capabilities
4. **Vendor Probes** — Each vendor (NVENC, VAAPI, etc.) has its own probe class

### Vendor Priority

Hardware vendors are prioritized for fallback selection. Lower values = higher priority:

```php
vendor_priority => [
    'nvenc' => 0,        // NVIDIA GPU (fastest, best quality)
    'vaapi' => 1,         // Linux VAAPI (Intel/AMD)
    'qsv' => 2,          // Intel Quick Sync
    'videotoolbox' => 3, // macOS VideoToolbox
    'amf' => 4,          // AMD GPU
    'v4l2' => 5,         // Video4Linux2 (limited)
]
```

## HwaccelCapability Fields

| Field | Type | Description |
|-------|------|-------------|
| `vendor` | string | Vendor identifier (e.g., 'nvenc', 'vaapi') |
| `encoder` | string | FFmpeg encoder name (e.g., 'h264_nvenc') |
| `decoder` | string | FFmpeg decoder name (e.g., 'hevc_cuvid') |
| `supports_hdr_tone_mapping` | bool | Whether HDR tone mapping is supported |
| `supported_codecs` | string[] | List of supported codecs |
| `supported_profiles` | string[] | List of supported profiles |
| `max_resolution_w` | int | Maximum width in pixels |
| `max_resolution_h` | int | Maximum height in pixels |
| `max_bitrate` | int | Maximum bitrate in bits per second |
| `extra_args` | array | Vendor-specific additional FFmpeg args |

## Usage

### Automatic Encoder Selection

```php
use Phlix\Media\Transcoding\Hwaccel\HwaccelRegistry;

// Get the best encoder for a codec
$capability = HwaccelRegistry::getInstance()->getEncoder('h264');

if ($capability !== null) {
    echo "Using encoder: " . $capability->encoder;
    echo "Vendor: " . $capability->vendor;
}
```

### With FfmpegRunner

```php
use Phlix\Media\Transcoding\FfmpegRunner;

// Probe hardware acceleration at startup
$runner = new FfmpegRunner();
$runner->probeHardwareAcceleration();

// Build a hardware-accelerated transcode command
$cmd = $runner->buildHwaccelCommand(
    inputPath: '/path/to/input.mkv',
    outputPath: '/path/to/output.mp4',
    codec: 'h264',
    params: ['crf' => 23]
);
```

### HDR Transcoding

```php
// Get encoder with HDR tone mapping support
$capability = HwaccelRegistry::getInstance()->getEncoder(
    'hevc',
    require_hdr_tone_map: true
);

if ($capability !== null && $capability->supports_hdr_tone_mapping) {
    // Use this encoder for HDR content
}
```

## Adding a New Vendor

1. Create a new class implementing `VendorProbeInterface` in `src/Media/Transcoding/Hwaccel/VendorProbe/`
2. Implement the 5 methods: `getVendorName()`, `isAvailable()`, `probe()`, `runAcceptanceTest()`
3. Register the probe in `HwaccelProbe::__construct()`
4. Add vendor priority in `config/hwaccel_base.php`

Example:

```php
namespace Phlix\Media\Transcoding\Hwaccel\VendorProbe;

use Phlix\Media\Transcoding\Hwaccel\HwaccelCapability;
use Phlix\Media\Transcoding\Hwaccel\VendorProbeInterface;
use Psr\Log\LoggerInterface;

class NewVendorProbe implements VendorProbeInterface
{
    private const VENDOR_NAME = 'newvendor';

    public function getVendorName(): string
    {
        return self::VENDOR_NAME;
    }

    public function isAvailable(): bool
    {
        // Detection logic
        return file_exists('/some/vendor/device');
    }

    public function probe(string $ffmpeg_path, ?LoggerInterface $logger = null): ?HwaccelCapability
    {
        if (!$this->isAvailable()) {
            return null;
        }

        // Return capability based on detection
        return new HwaccelCapability(
            vendor: self::VENDOR_NAME,
            encoder: 'h264_newvendor',
            decoder: 'hevc_newvendor',
            supports_hdr_tone_mapping: true,
            supported_codecs: ['h264', 'hevc'],
            supported_profiles: ['main', 'high'],
            max_resolution_w: 3840,
            max_resolution_h: 2160,
            max_bitrate: 40000000,
        );
    }

    public function runAcceptanceTest(string $ffmpeg_path, string $test_clip_path, ?LoggerInterface $logger = null): bool
    {
        // Run actual encode test
        return true;
    }
}
```

## Encoding Profiles

Each hardware vendor has a dedicated encoder profile class implementing `HwaccelEncoderProfileInterface`. These profiles map abstract quality levels to concrete FFmpeg encoder flags.

### Profile Classes

| Vendor | Class | Encoder | Notes |
|--------|-------|---------|-------|
| NVIDIA | `NvencProfile` | `h264_nvenc`, `hevc_nvenc` | Preset p1-p7, zerolatency tune |
| VAAPI | `VaapiProfile` | `h264_vaapi`, `hevc_vaapi` | CQP/VBR rate control |
| QSV | `QsvProfile` | `h264_qsv`, `hevc_qsv`, `av1_qsv` | Look-ahead support |
| VideoToolbox | `VideoToolboxProfile` | `h264_videotoolbox`, `hevc_videotoolbox` | macOS only |
| AMF | `AmfProfile` | `h264_amf`, `hevc_amf` | AMD GPUs |
| V4L2 | `V4L2Profile` | `h264_v4l2m2m`, `hevc_v4l2m2m` | Linux kernel API |
| Software | `SoftwareProfile` | `libx264`, `libx265` | CPU fallback |

### Quality Level Mapping

Each profile supports four quality levels with associated bitrate and preset settings:

```php
// Example: NVENC quality levels
'ultra'  => ['bitrate' => 8000000, 'preset' => 'p3', 'bframes' => 0],
'high'    => ['bitrate' => 5000000, 'preset' => 'p4', 'bframes' => 0],
'medium'  => ['bitrate' => 2500000, 'preset' => 'p5', 'bframes' => 0],
'low'     => ['bitrate' => 1000000, 'preset' => 'p6', 'bframes' => 0],
```

### Using the Profile Factory

```php
use Phlix\Media\Transcoding\Hwaccel\HwaccelRegistry;
use Phlix\Media\Transcoding\Hwaccel\HwaccelProfileFactory;

// Get the best profile for a vendor+codec combination
$registry = HwaccelRegistry::getInstance();
$factory = new HwaccelProfileFactory($registry);

$profile = $factory->getProfile('nvenc', 'h264');
$builder = $factory->createCommandBuilder('nvenc', 'h264', 'high');
```

### Using the Command Builder

```php
use Phlix\Media\Transcoding\Hwaccel\HwaccelCommandBuilder;
use Phlix\Media\Transcoding\Hwaccel\Profiles\NvencProfile;
use Phlix\Media\Transcoding\Hwaccel\HwaccelCapability;

$capability = new HwaccelCapability(
    vendor: 'nvenc',
    encoder: 'h264_nvenc',
    decoder: 'h264_cuvid',
    supports_hdr_tone_mapping: true,
    supported_codecs: ['h264', 'hevc'],
    supported_profiles: ['baseline', 'main', 'high'],
    max_resolution_w: 3840,
    max_resolution_h: 2160,
    max_bitrate: 50000000,
);

$cmd = (new HwaccelCommandBuilder(new NvencProfile(), $capability, 'high'))
    ->setInput('/input.mkv')
    ->setOutput('/output.mp4')
    ->setVideoCodec('h264')
    ->setBitrate(5000000)
    ->setResolution(1920, 1080)
    ->build();
```

### Max Concurrent Encodes

| Vendor | Max Concurrent | Notes |
|--------|----------------|-------|
| NVENC | 3 | Per GPU |
| VAAPI | 4 | Per GPU |
| QSV | 6 | Per GPU |
| VideoToolbox | 0 | Unlimited (Apple Silicon) |
| AMF | 2 | Per GPU |
| V4L2 | 1 | Limited hardware |
| Software | 0 | CPU-bound |

## Configuration

The hardware acceleration configuration uses a two-file architecture with `HwAccelConfig` as the single source of truth at runtime.

### Configuration Files

| File | Purpose |
|------|---------|
| `config/hwaccel.php` | Provides `HwAccelConfig` class — **use `\Phlix\Config\HwAccelConfig::get()` at runtime** |
| `config/hwaccel_base.php` | Base hwaccel settings (vendor priority, timeouts, fallback behavior) |
| `config/transcoding.php` | Transcoding-specific settings (tone-mapping, preferred accelerator) |
| `config/ffmpeg.php` | Legacy `hwaccel` key — delegates to `HwAccelConfig::get()` (deprecated) |

### Getting the Merged Configuration

```php
// RECOMMENDED: Get the authoritative merged config at runtime
$config = \Phlix\Config\HwAccelConfig::get();

// Legacy (deprecated): reads the base config only
$baseConfig = require __DIR__ . '/hwaccel_base.php';
```

The `HwAccelConfig::get()` method merges settings from both `hwaccel_base.php` and `transcoding.php`, resolving any conflicts and providing the complete configuration used by the runtime.

### Configuration Options

::: warning Not every key in these files is wired up
`HwAccelConfig::get()` merges both files, but the merged array only reaches
`FfmpegRunner::setConfig()`, and `FfmpegRunner` reads just five keys from it.
The remaining keys are consumed only by `HwaccelRegistry`, which is **always
constructed with its own hardcoded defaults** — `HwaccelRegistry::getInstance()`
calls a `private` constructor with no arguments, so nothing can hand it a
configured value. Editing those keys has no effect. They are listed below as
*inert* rather than removed, because the files still declare them.
:::

**From `config/hwaccel_base.php`:**

| Key | Status | Notes |
|---|---|---|
| `enabled` | **Consumed** | Enable/disable hardware acceleration (default: `true`) |
| `prefer_hardware` | **Consumed** | Prefer hardware over software (default: `true`) |
| `vendor_priority` | *Inert* | Vendor fallback order (lower = higher priority). The registry's own default is used instead — and note that default includes `'software' => 100` while this file omits it |
| `probe_timeout` | *Inert* | The real probe timeouts are the hardcoded `ShellTimeout::FFMPEG_TIMEOUT` (10s) and `ShellTimeout::GPU_TOOL_TIMEOUT` (5s) constants |
| `test_clip_path` | *Inert* | Path for the acceptance-test clip |
| `fallback_to_software` | *Inert* | Read at `HwaccelRegistry.php:160,206`, but only ever as the constructor default `true` |

**From `config/transcoding.php`:**

| Key | Status | Notes |
|---|---|---|
| `preferred_accelerator` | **Consumed** | Preferred accelerator (`cuda`, `qsv`, `vaapi`, …) or `null` for auto |
| `tone_mapping_mode` | **Consumed** | HDR tone-mapping mode (`none`, `zscale`, `libplacebo`) |
| `prefer_hdr_output` | **Consumed** | Prefer HDR10 output over SDR tone-mapping |
| `include_software_fallback` | *Inert* | Include software encoding in accelerator lists |

::: danger `include_software_fallback` is not an admin setting
It was briefly exposed in `server-settings.schema.json` and was **removed in
phlix-shared v0.27.0** because it is inert in both directions — nothing reads the
merged value. Do not re-expose it. The separate `hwaccel.fallback_to_software`
key is the one that is genuinely read, but it too needs wiring before it could be
exposed, for the `getInstance()` reason above.
:::

## Detection Methods by Vendor

| Vendor | Detection Method |
|--------|------------------|
| NVENC | `nvidia-smi` command |
| VAAPI | `/dev/dri` devices + `vainfo` |
| QSV | `vainfo` with Intel GPU |
| VideoToolbox | macOS + system_profiler |
| AMF | `vainfo` with AMD GPU |
| V4L2 | `/dev/media*` devices |
| Software | Always available (libx264) |

## Requirements

- FFmpeg compiled with hardware acceleration support
- Appropriate drivers/gpu for the vendor
- See [FFmpeg HWAccel Documentation](https://trac.ffmpeg.org/wiki/HWAccelIntro)

## HDR Tone-Mapping (Since 0.11.0)

When transcoding HDR (High Dynamic Range) content to SDR (Standard Dynamic Range), the system applies tone-mapping to preserve visual quality while converting the extended luminance range to displayable SDR levels.

### HDR Metadata Detection

The system detects HDR content via ffprobe color metadata:

- **color_transfer**: `smpte2084` (PQ) or `arib-std-b67` (HLG) indicates HDR
- **color_space**: Typically `bt2020nc` for HDR content
- **color_primaries**: Typically `bt2020` for HDR content
- **max_luminance**: Extracted from `mastering_display_luminance` tag (e.g., 1000, 4000 nits)
- **avg_luminance**: Extracted from `ambient_luminance` tag

### Tone-Mapping Architecture

```
HwaccelToneMapper
├── Detects HDR from ffprobe results
├── Selects appropriate vendor tone mapper
└── Generates vendor-specific filter chain
```

### Vendor-Specific Tone Mapping

| Vendor | Hardware Support | Filter Chain | Notes |
|--------|-----------------|-------------|-------|
| NVENC | ✅ Yes | `hwupload`, `tonemap_cuda`, `scale_cuda` | Primary: CUDA-based |
| VAAPI | ✅ Yes | `hwupload`, `tonemap_vaapi`, `scale_vaapi` | Primary: VAAPI built-in |
| QSV | ✅ Yes | `hwupload`, `vpp_tonemap`, `scale_qsv` | VPP filmic mode |
| VideoToolbox | ❌ No | `zscale`, `format` | CPU fallback |
| AMF | ✅ Yes | `hwupload`, `tonemap_amf` | AMD GPU |
| V4L2 | ❌ No | `zscale`, `format` | V4L2 request API limitation |
| Software | ❌ No | `zscale`, `format` | CPU fallback |

### Tone-Mapping Filter Parameters

#### NVENC (tonemap_cuda)

```
tonemap_cuda=transfer=smpte2084:primaries=bt2020:tonemap=hable:desat=0.5:peak=10.0
```

- **transfer**: Source transfer function (smpte2084 for PQ, arib-std-b67 for HLG)
- **primaries**: Color primaries (bt2020)
- **tonemap**: Tone mapping curve (hable, mobius, linear)
- **desat**: Desaturation threshold for bright colors
- **peak**: Reference peak luminance

#### VAAPI (tonemap_vaapi)

```
tonemap_vaapi=transfer=bt2020:primaries=bt2020:tonemap=hable:desat=0.5
```

#### QSV (vpp_tonemap)

```
vpp_tonemap=mode=1:desat=0.5:peak=10.0
```

- **mode**: 1 = filmic, 2 = fixed, 3 = linear
- **desat**: Desaturation parameter
- **peak**: Peak luminance for tone mapping

#### Software Fallback (zscale)

```
zscale=transfer=bt709:min_luminance=2.0:max_luminance=10.0:param1=0.18:param2=0.14
```

- **transfer**: Target transfer function (bt709 for SDR)
- **min_luminance**: Minimum luminance reference
- **max_luminance**: Maximum luminance reference
- **param1/param2**: Tone mapping curve parameters

### Usage Example

```php
use Phlix\Media\Transcoding\Hwaccel\HwaccelCommandBuilder;
use Phlix\Media\Transcoding\Hwaccel\HwaccelRegistry;
use Phlix\Media\Transcoding\Hwaccel\ToneMapping\HdrMetadata;
use Phlix\Media\Transcoding\Hwaccel\ToneMapping\HwaccelToneMapper;
use Phlix\Media\Transcoding\Hwaccel\Profiles\NvencProfile;

// Get HDR metadata from ffprobe
$probeResult = $ffmpegRunner->probe('/path/to/hdr/video.mkv');
$colorMeta = $ffmpegRunner->extractColorMetadata($probeResult);

if ($colorMeta['color_transfer'] === 'smpte2084' || $colorMeta['color_transfer'] === 'arib-std-b67') {
    $hdr = new HdrMetadata(
        color_space: $colorMeta['color_space'],
        color_transfer: $colorMeta['color_transfer'],
        color_primaries: $colorMeta['color_primaries'],
        max_luminance: $colorMeta['max_luminance'],
        avg_luminance: $colorMeta['avg_luminance']
    );

    // Build HDR transcode command with tone mapping
    $registry = HwaccelRegistry::getInstance();
    $capability = $registry->getEncoder('hevc', require_hdr_tone_map: true);
    $profile = new NvencProfile();

    $cmd = (new HwaccelCommandBuilder($profile, $capability, 'high'))
        ->setInput('/path/to/hdr/video.mkv')
        ->setOutput('/path/to/sdr/output.mp4')
        ->setVideoCodec('hevc')
        ->setHdrMetadata($hdr)
        ->build();
}
```

### Tone Mapping Classes

| Class | Description |
|-------|-------------|
| `HdrMetadata` | Value object for HDR source metadata |
| `ToneMapFilterChain` | Result container for generated filter chains |
| `HwaccelToneMapper` | Main orchestrator for tone mapping |
| `HwaccelToneMapperInterface` | Interface for vendor tone mappers |
| `ToneMapperFactory` | Factory for creating vendor tone mappers |
| `NvencToneMapper` | NVIDIA NVENC implementation |
| `VaapiToneMapper` | VAAPI implementation |
| `QsvToneMapper` | Intel QSV implementation |
| `VideoToolboxToneMapper` | Apple VideoToolbox implementation (software fallback) |
| `AmfToneMapper` | AMD AMF implementation |
| `V4L2ToneMapper` | V4L2 implementation (software fallback) |
| `SoftwareToneMapper` | CPU-based zscale implementation |

## See Also

- [Stream Quality / ABR](./stream-quality-abr) — the on-demand multi-variant HLS ABR
  ladder. Its per-variant segment encoder currently always runs the **CPU** `libx264`
  path described above, not this file's hardware-accelerated encoders — wiring
  `HwaccelRegistry`/`HwaccelCommandBuilder` into that path is a candidate future
  mitigation for the ABR feature's CPU-multiplication risk on GPU-equipped boxes.
- [Streaming Protocols](./streaming-protocols) — HLS/DASH manifest and on-demand
  transcode fundamentals.
