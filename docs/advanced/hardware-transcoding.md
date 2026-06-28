**Since:** 0.18.0

## TL;DR

Hardware transcoding offloads video encode/decode to your GPU, making 4K and HDR streams smooth without maxing out your CPU. Phlix supports four vendors: **NVIDIA** (NVENC), **Intel** (VAAPI/Quicksync), **AMD** (VAAPI/VCN), and **Apple Silicon** (VideoToolbox). Before this guide helps, you need the correct driver installed, the GPU visible as a device file, and `jellyfin-ffmpeg` in place of stock FFmpeg (stock distro FFmpeg lacks hardware support).

---

## 1. Vendor Overview

| Vendor | APIs | Linux Check | Env Var |
|--------|------|------------|---------|
| NVIDIA | NVENC + CUDA | `nvidia-smi` | `PHLIX_HWACCEL=nvidia` |
| Intel | VAAPI + Quicksync | `vainfo \| grep VAEntrypointEncSlice` | `PHLIX_HWACCEL=vaapi` |
| AMD | VAAPI + VCN | `vainfo \| grep VAEntrypointEncSlice` | `PHLIX_HWACCEL=vaapi` |
| Apple Silicon | VideoToolbox | `system_profiler SPHardwareRAIDTool \| grep -i VideoToolbox` | `PHLIX_HWACCEL=videotoolbox` |

All four vendors use the same `PHLIX_HWACCEL` env var; the value tells Phlix which FFmpeg hardware acceleration flags to emit.

---

## 2. Verify Hardware — Probe Command

The fastest diagnostic is the built-in probe:

```bash
php public/index.php hwaccel:probe
```

Sample output and interpretation:

```
HWACCEL=nvidia         # current env var value (empty = software only)
DEVICE=/dev/dri/renderD128   # VAAPI device (NVIDIA uses /dev/nvidia*)
ENCODERS=nvenc h264_amf vaapi_h264   # hardware encoders detected by FFmpeg
TONEMAP=opencl         # HDR tone-map backend (cuda / opencl / vaapi)
```

If `ENCODERS` shows no hardware encoder, FFmpeg was built without hardware support — see Failure 1 below.

---

## 3. Per-Vendor Driver Checklist

### NVIDIA (NVENC + CUDA)

```
[x] GPU physically installed — nvidia-smi lists it
[x] nvidia-driver installed (apt install nvidia-driver-535)
[x] nvidia-container-runtime configured (for Docker/Podman)
[x] jellyfin-ffmpeg installed — stock ffmpeg does NOT contain NVENC
[x] PHLIX_HWACCEL=nvidia set in environment or config
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

```
[x] CPU supports Quicksync (8th-gen Intel or newer recommended)
[x] intel-media-driver installed (apt install intel-media-va-driver)
[x] vainfo confirms encode capability
[x] User is in the video group (for /dev/dri access)
[x] jellyfin-ffmpeg installed with VAAPI support
[x] PHLIX_HWACCEL=vaapi set
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
sudo systemctl restart phlix
```

### AMD (VAAPI + VCN)

```
[x] GPU is AMD Radeon (GCN 2.0+ for hardware encoding)
[x] amdgpu-driver or rocm installed
[x] VAAPI encode entrypoint visible via vainfo
[x] jellyfin-ffmpeg compiled with AMD VAAPI support
[x] PHLIX_HWACCEL=vaapi set (same env var as Intel)
[x] Quality selector shows "Hardware (AMD)" option
```

Verify install:

```bash
vainfo | grep VAEntrypointEncSlice
```

Note: AMD VAAPI support in FFmpeg varies by driver version. Using `jellyfin-ffmpeg` is strongly recommended over stock distro FFmpeg.

### Apple Silicon (VideoToolbox)

```
[x] macOS 12.3+ (VideoToolbox requires Monterey or later)
[x] Hardware decode confirmed via Activity Monitor → GPU activity
[x] Phlix running on macOS (not Linux containers)
[x] PHLIX_HWACCEL=videotoolbox set
[x] Quality selector shows "Hardware (Apple)" option
```

Verify:

```bash
system_profiler SPHardwareRAIDTool | grep -i VideoToolbox
```

---

## 4. Environment Variable Reference

| Vendor | `PHLIX_HWACCEL` value | FFmpeg override |
|--------|----------------------|-----------------|
| NVIDIA | `nvidia` | `-hwaccel cuda` |
| Intel | `vaapi` | `-hwaccel vaapi` |
| AMD | `vaapi` | `-hwaccel vaapi` |
| Apple Silicon | `videotoolbox` | (macOS only) |

To set permanently, add to your Phlix startup environment or systemd service file:

```bash
# /etc/systemd/system/phlix.service.d/hwaccel.conf
[Service]
Environment="PHLIX_HWACCEL=nvidia"
```

Then `sudo systemctl daemon-reload && sudo systemctl restart phlix`.

---

## 5. HDR Tone-Mapping (NVIDIA)

If you have HDR content and a display that doesn't support direct passthrough, tone-mapping is required. Phlix uses an OpenCL or CUDA filter:

```bash
# With OpenCL tone-mapping (default for NVIDIA on jellyfin-ffmpeg)
FFMPEG_HWACCEL=-hwaccel cuda -vf "tonemap_opencl=format=nv12"

# With CUDA tone-mapping
FFMPEG_HWACCEL=-hwaccel cuda -vf "tonemap_cuda=format=nv12"
```

Set in the same systemd environment file or in `config/ffmpeg.php`:

```php
return [
    'hwaccel' => 'nvidia',
    'tonemap' => 'opencl',
];
```

To verify tone-mapping is active during playback, check the transcode log:

```bash
tail -f .logs/transcode.log | grep -i tonemap
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
php public/index.php hwaccel:probe
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
sudo systemctl restart phlix

# Verify
groups phlix
id phlix
```

If running in Docker, ensure the container is started with `--group-add video` or the appropriate `--device` mappings for VAAPI.

---

### Failure 3 — NVIDIA GPU Not Visible Inside Container

**Symptom:** `nvidia-smi` works on the host but fails inside the Docker container. Transcode falls back to software even though `PHLIX_HWACCEL=nvidia` is set.

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

**Cause:** OpenCL/CUDA tone-map not enabled, or the wrong tonemap backend is active for your hardware.

**Fix:**
```bash
# Force CUDA tonemap for NVIDIA
FFMPEG_HWACCEL_FLAGS="-hwaccel cuda"
TONEMAP_BACKEND=cuda

# Force OpenCL tonemap
TONEMAP_BACKEND=opencl

# Check what's actually being used during a transcode
tail -f .logs/transcode.log
# Look for "tonemap_opencl", "tonemap_cuda", or "tonemap_vaapi"
```

Driver version 525+ recommended for good tone-map performance.

---

## 7. Next Steps

- [HDR Tone-Mapping Guide](live-tv.md) — deeper dive on tone-mapping HDR content via the Live TV pipeline
- [Troubleshooting](../troubleshooting.md) — if hardware acceleration still doesn't activate after these steps
