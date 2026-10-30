**Since:** 0.18.0

::: warning `PHLIX_HWACCEL` is not implemented — do not set it
Earlier revisions of this page told you to export `PHLIX_HWACCEL=nvidia|vaapi|…`.
**No code in phlix-server reads that variable** (verified against current
source; the phlix-server README lists it among dead env names). What actually
works today:

- the built-in probe — `php bin/phlix hwaccel:probe` — detects available
  encoders and the transcoder selects among them automatically; and
- `PREFERRED_ACCELERATOR` (empty default = auto; see `config/transcoding.php`
  and the env census in the phlix-server README) pins a specific accelerator.
  The admin override is the `transcoding.preferred_accelerator` setting.
:::

## TL;DR

Hardware transcoding offloads video encode/decode to your GPU, making 4K and HDR streams smooth without maxing out your CPU. Phlix supports four vendors: **NVIDIA** (NVENC), **Intel** (VAAPI/Quicksync), **AMD** (VAAPI/VCN), and **Apple Silicon** (VideoToolbox). Before this guide helps, you need the correct driver installed, the GPU visible as a device file, and `jellyfin-ffmpeg` in place of stock FFmpeg (stock distro FFmpeg lacks hardware support).

---

## 1. Vendor Overview

| Vendor | APIs | Linux Check | Pin (`PREFERRED_ACCELERATOR`) |
|--------|------|------------|---------|
| NVIDIA | NVENC + CUDA | `nvidia-smi` | `cuda` |
| Intel | VAAPI + Quicksync | `vainfo \| grep VAEntrypointEncSlice` | `vaapi` |
| AMD | VAAPI + VCN | `vainfo \| grep VAEntrypointEncSlice` | `vaapi` |
| Apple Silicon | VideoToolbox | `system_profiler SPHardwareRAIDTool \| grep -i VideoToolbox` | `videotoolbox` |

Pinning is **optional** — selection is automatic via the hardware probe;
`PREFERRED_ACCELERATOR` (accepted values in `config/transcoding.php`:
`''` auto-detect, `cuda`, `qsv`, `vaapi`, `videotoolbox`, `amf`, `opencl`,
`d3d11va`, `dxva2`, `v4l2m2m`) forces a specific accelerator.

---

## 2. Verify Hardware — Probe Command

The fastest diagnostic is the built-in probe:

```bash
php bin/phlix hwaccel:probe
```

Sample output and interpretation:

```text
HWACCEL=nvidia         # current env var value (empty = software only)
DEVICE=/dev/dri/renderD128   # VAAPI device (NVIDIA uses /dev/nvidia*)
ENCODERS=nvenc h264_amf vaapi_h264   # hardware encoders detected by FFmpeg
TONEMAP=opencl         # HDR tone-map backend (cuda / opencl / vaapi)
```

If `ENCODERS` shows no hardware encoder, FFmpeg was built without hardware support — see Failure 1 below.

---

## 3. Per-Vendor Driver Checklist

### NVIDIA (NVENC + CUDA)

```text
[x] GPU physically installed — nvidia-smi lists it
[x] nvidia-driver installed (apt install nvidia-driver-535)
[x] nvidia-container-runtime configured (for Docker/Podman)
[x] jellyfin-ffmpeg installed — stock ffmpeg does NOT contain NVENC
[x] Accelerator auto-selected by the probe, or pinned with PREFERRED_ACCELERATOR=cuda (env or Admin → Transcoding)
[x] Quality selector shows "Hardware (NVIDIA)" option
```

Verify install:

```bash
nvidia-smi
ffmpeg -encoders 2>&1 | grep nvenc
```

Docker note — add to `docker-compose.yml`:

```yaml
services:
  phlix:
    runtime: nvidia
    environment:
      NVIDIA_VISIBLE_DEVICES: all
```

### Intel (VAAPI + Quicksync)

```text
[x] CPU supports Quicksync (8th-gen Intel or newer recommended)
[x] intel-media-driver installed (apt install intel-media-va-driver)
[x] vainfo confirms encode capability
[x] User is in the video group (for /dev/dri access)
[x] jellyfin-ffmpeg installed with VAAPI support
[x] PREFERRED_ACCELERATOR=vaapi set (or left unset for auto-selection)
[x] Quality selector shows "Hardware (Intel)" option
```

Verify install:

```bash
vainfo | grep -E 'VAEntrypointEncSlice'
ls -la /dev/dri/renderD128
groups $USER   # should show 'video'
```

Add user to video group:

```bash
sudo usermod -aG video $USER
sudo systemctl restart phlix-server
```

### AMD (VAAPI + VCN)

```text
[x] GPU is AMD Radeon (GCN 2.0+ for hardware encoding)
[x] amdgpu-driver or rocm installed
[x] VAAPI encode entrypoint visible via vainfo
[x] jellyfin-ffmpeg compiled with AMD VAAPI support
[x] PREFERRED_ACCELERATOR=vaapi set (same lever as Intel)
[x] Quality selector shows "Hardware (AMD)" option
```

Verify install:

```bash
vainfo | grep VAEntrypointEncSlice
```

Note: AMD VAAPI support in FFmpeg varies by driver version. Using `jellyfin-ffmpeg` is strongly recommended over stock distro FFmpeg.

### Apple Silicon (VideoToolbox)

```text
[x] macOS 12.3+ (VideoToolbox requires Monterey or later)
[x] Hardware decode confirmed via Activity Monitor → GPU activity
[x] Phlix running on macOS (not Linux containers)
[x] PREFERRED_ACCELERATOR=videotoolbox set (or left unset for auto-selection)
[x] Quality selector shows "Hardware (Apple)" option
```

Verify:

```bash
system_profiler SPHardwareRAIDTool | grep -i VideoToolbox
```

---

## 4. Setting the Accelerator

| Vendor | `PREFERRED_ACCELERATOR` value | What FFmpeg runs under the hood |
|--------|-------------------------------|---------------------------------|
| NVIDIA | `cuda` | CUDA decode + NVENC encode |
| Intel | `vaapi` (or `qsv`) | `-hwaccel vaapi` |
| AMD | `vaapi` | `-hwaccel vaapi` |
| Apple Silicon | `videotoolbox` | (macOS only) |

Leaving `PREFERRED_ACCELERATOR` unset (the default, `''`) means the probe
selects automatically by `vendor_priority` (`config/hwaccel_base.php`).
The accepted values are listed in `config/transcoding.php`:
`cuda`, `qsv`, `vaapi`, `videotoolbox`, `amf`, `opencl`, `d3d11va`, `dxva2`,
`v4l2m2m`.

To set it permanently, add a drop-in to the server's systemd unit (installed
as `phlix-server.service`):

```bash
# /etc/systemd/system/phlix-server.service.d/hwaccel.conf
[Service]
Environment="PREFERRED_ACCELERATOR=cuda"
```

Then `sudo systemctl daemon-reload && sudo systemctl restart phlix-server`.
The same value is settable at runtime as the admin `transcoding.preferred_accelerator`
setting (no restart needed — the merged config re-reads it).

---

## 5. HDR Tone-Mapping

If you have HDR content and a display that doesn't support direct passthrough, tone-mapping is required. Phlix applies either the CPU `zscale` filter or `libplacebo` (both ship in `jellyfin-ffmpeg` builds); there is no CUDA/OpenCL tone-map filter path in this build:

```bash
# CPU zscale
TONE_MAPPING_MODE=zscale

# libplacebo (higher quality, needs the filter compiled into your FFmpeg)
TONE_MAPPING_MODE=libplacebo
```

The default is `none` (no tone-mapping — HDR content passes through or falls
back per `config/transcoding.php`). Set the mode in the same systemd drop-in,
in `config/transcoding.php` (`'tone_mapping_mode' => ...`), or at runtime as
the admin `transcoding.tone_mapping_mode` setting.

To verify tone-mapping is active during playback, check the application log:

```bash
tail -f .logs/app.log | grep -i tonemap
```

---

## 6. What Can Go Wrong

### Failure 1 — FFmpeg Has No Hardware Support

**Symptom:** Quality selector shows only "Original" and "Medium (Web)" — no "Hardware" option. Transcode falls back to software and 4K playback stutters.

**Cause:** Stock distro FFmpeg is compiled without NVENC, VAAPI, or VideoToolbox support.

**Fix:**
```bash
# Verify what's missing
ffmpeg -encoders 2>&1 | grep -E 'nvenc|vaapi|videotoolbox'
# Should show encoder names if hardware support is present

# Replace with jellyfin-ffmpeg (recommended for all hardware vendors)
apt install jellyfin-ffmpeg5   # Debian/Ubuntu

# After install, re-run probe
php bin/phlix hwaccel:probe
```

---

### Failure 2 — VAAPI Device Permission Denied

**Symptom:** Transcode fails with `Cannot open shared VA display` or `/dev/dri/renderD128: Permission denied`. `dmesg` shows access denied to render node.

**Cause:** User running Phlix is not in the `video` group.

**Fix:**
```bash
# Add phlix user to video group
sudo usermod -aG video phlix

# Restart Phlix to pick up new group membership
sudo systemctl restart phlix-server

# Verify
groups phlix
id phlix
```

If running in Docker, ensure the container is started with `--group-add video` or the appropriate `--device` mappings for VAAPI.

---

### Failure 3 — NVIDIA GPU Not Visible Inside Container

**Symptom:** `nvidia-smi` works on the host but fails inside the Docker container. Transcode falls back to software even though `PREFERRED_ACCELERATOR=cuda` is set.

**Cause:** `nvidia-container-runtime` is not configured in the Docker/Podman compose file.

**Fix:**
Add `runtime: nvidia` to the compose service:

```yaml
services:
  phlix:
    runtime: nvidia
    environment:
      NVIDIA_VISIBLE_DEVICES: all
```

Verify inside the container:

```bash
nvidia-smi
```

---

### Failure 4 — HDR Tone-Map Falls Back to Software

**Symptom:** HDR10 content plays but colors look washed out, or tone-mapping is slow and drops frames.

**Cause:** `transcoding.tone_mapping_mode` is `none` (the default — nothing is applied), or the mode is set to `libplacebo` but your FFmpeg build lacks the libplacebo filter (Phlix then falls back to the CPU `zscale` chain or software).

**Fix:**
```bash
# Pick a mode your FFmpeg actually supports
TONE_MAPPING_MODE=zscale       # CPU zscale chain (works with jellyfin-ffmpeg)
TONE_MAPPING_MODE=libplacebo   # GPU-assisted; requires libplacebo in the build

# Check what's actually being used during a transcode
tail -f .logs/app.log | grep -iE 'tonemap|transcod'
```

Driver version 525+ recommended for good tone-map performance.

---

## 7. Next Steps

- [HDR Tone-Mapping Guide](live-tv.md) — deeper dive on tone-mapping HDR content via the Live TV pipeline
- [Troubleshooting](../troubleshooting.md) — if hardware acceleration still doesn't activate after these steps
