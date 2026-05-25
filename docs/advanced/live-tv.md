**Phase:** N (End-User Documentation)
**Step:** N.16
**Since:** 0.18.0

## TL;DR

Live TV lets you watch and record broadcast, cable, and IPTV channels through Phlix. You connect a tuner (HDHomeRun over the network, a USB DVB-T stick on Linux, or an IPTV M3U playlist), configure guide data (Schedules Direct or XMLTV), and you're ready to watch live TV or schedule recordings. Setup takes 10–30 minutes depending on tuner type and guide data source. Once configured, Live TV appears alongside your regular media library.

---

## 1. Tuner Types — Which One to Use

| Tuner | Connection | Platforms | Channels | Notes |
|-------|-----------|-----------|----------|-------|
| HDHomeRun | Network (Ethernet/WiFi) | Any | ATSC/DVB-C/T | Zero-config discovery on LAN |
| USB DVB-T/T2 | USB on server | Linux only | DVB-T/T2 | Kernel drivers required |
| IPTV / M3U | Internet/IPTV | Any | Varies | Playlist from ISP or IPTV provider |

**Recommendation:** HDHomeRun for most users (simplest), IPTV for cord-cutters without an antenna, DVB-T for Linux-only servers with antenna access.

---

## 2. Setting Up an HDHomeRun Tuner

### Step-by-step

1. Connect the HDHomeRun device to your network (wired recommended for reliability).
2. Discover the device IP address:

```bash
# Auto-discover HDHomeRun devices on the LAN
hdhomerun_config discover

# Example output:
# hdhr: 192.168.1.100 / tuners: 2
```

3. Verify the channel lineup is detected:

```bash
# Replace DEVICE_ID with your HDHomeRun device ID
hdhomerun_config DEVICE_ID get /lineup/status
```

You should see a list of channels with numbers and names. If the list is empty, the HDHomeRun may not have found antenna/cable channels — check your antenna placement or cable signal.

4. In the Phlix web UI: go to **Settings → Live TV → Add Tuner → HDHomeRun**.
5. The device IP is auto-detected if it is on the same LAN. Select it and confirm.
6. Phlix scans and imports all detected channels.

### Tuner status and concurrent streams

Each HDHomeRun model specifies a maximum number of simultaneous streams (commonly 2 or 4). The Live TV section of the UI shows each tuner and its current status (**idle / streaming / recording**). You cannot exceed the per-tuner stream limit — a second stream request when all tuners are busy returns an error.

---

## 3. Setting Up a USB DVB-T Tuner (Linux)

> [!WARNING]
> **Experimental / not yet functional.** USB DVB-T tuner support is a stub in
> the current build: frequency scanning returns no channels (the signal engine's
> tune step is a placeholder). The steps below describe the intended workflow but
> will not import channels today. For working Live TV, use an **HDHomeRun** tuner
> (§2) or **IPTV / M3U** (§4), or import channels manually. DVB-T USB scanning is
> tracked on the roadmap.

### Requirements

- Linux server with a kernel supporting DVB-T/T2 (most modern kernels)
- A supported USB DVB-T/T2 stick (e.g., RTL-SDR, Astro DMW, Hauppauge WinTV)
- Antenna connected to the tuner

### Step-by-step

1. Plug the USB tuner into the server. Check `dmesg` for recognition:

```bash
dmesg | grep -i dvb
# Expected: "DVB: registering adapter 0/0" etc.
```

2. Install the required firmware (varies by tuner — check the device docs):

```bash
# Example for RTL-SDR:
apt install librtlsdr0
```

3. In Phlix: go to **Settings → Live TV → Add Tuner → DVB-T**.
4. *(When implemented)* Phlix would scan the available frequency range and import discovered channels. In the current build the scan returns no channels — this path is not yet functional (see the warning above).
5. Until DVB-T scanning lands, use an HDHomeRun tuner or IPTV/M3U, or add channels manually.

**Linux-only note:** DVB-T tuners require the server to be Linux. If your Phlix server runs in Docker on a NAS, USB passthrough must be correctly configured for the container to access the device.

---

## 4. Setting Up IPTV / M3U

### When to use IPTV

When you have an IPTV subscription from an ISP or third-party provider, or when you use a public IPTV service that provides an M3U playlist.

### Step-by-step

1. Get the M3U playlist file from your IPTV provider (usually a `.m3u` or `.m3u8` URL or file).
2. In Phlix: go to **Settings → Live TV → Add IPTV Tuner**.
3. Upload the `.m3u` file or paste the M3U URL.
4. Phlix imports the channel list from the playlist.
5. Optional: upload XMLTV guide data (see §5 below).

**M3U format:** Phlix reads `#EXTINF` lines for channel names and channel numbers. The order in the M3U determines the channel numbering unless overridden.

---

## 5. Setting Up the Electronic Program Guide (EPG)

Live TV is significantly more useful with guide data (EPG) showing program listings and schedules. Phlix supports two sources: **Schedules Direct** (recommended) and **XMLTV** (self-hosted).

### 5a. Schedules Direct (Recommended)

**Account setup:**

1. Go to [schedulesdirect.org](https://www.schedulesdirect.org) and create an account (~$25/year).
2. Log in and select your lineup (antenna channels by ZIP/postal code or your IPTV provider's channel lineup).
3. Note your username and password for the next step.

**In Phlix:**

1. Go to **Settings → Live TV → EPG Source → Schedules Direct**.
2. Enter your Schedules Direct username and password.
3. Phlix connects and syncs your channel lineup.
4. Initial sync downloads ~14 days of guide data and may take a few minutes.
5. Guide data refreshes automatically every night. To force an immediate refresh, click **Refresh Guide** in the Live TV settings.

**What you get:** Program titles, descriptions, start/end times, categories, and original air dates for each channel. This data powers the program guide in the UI, upcoming program listings, and DVR series rule matching.

### 5b. XMLTV Import (Self-Hosted / Free)

If you prefer not to pay for Schedules Direct, you can use free XMLTV data from [xmltv.org](https://www.xmltv.org) or a similar source. Free XMLTV data is often less complete and may have stale or missing entries for some channels.

**Step-by-step:**

1. Download an XMLTV schedule for your region (e.g., from xmltv.org).
2. In Phlix: go to **Settings → Live TV → EPG Source → XMLTV Import**.
3. Upload the `.xml` or `.xml.gz` file.
4. Phlix parses and imports the guide data.
5. Re-upload periodically (or script it) to keep the guide current.

---

## 6. DVR Scheduling Basics

Once your tuners and guide data are configured, you can schedule recordings.

### Series Rules

When you record a show from the guide, Phlix asks whether to create a **series rule**:

| Option | What it does |
|--------|-------------|
| Record all episodes | Records every future episode of this show |
| New episodes only | Skips reruns; only records episodes flagged as new |
| Specific timeslot | Records only episodes that air in the chosen time slot |

Series rules appear in **Settings → Live TV → Recording Rules** where you can edit or delete them.

### Conflict Resolution

When two shows are scheduled to record at the same time:

1. **Both tuners free** — both recordings start normally.
2. **One tuner busy, one free** — the free tuner records the higher-priority show; the other is marked as conflict.
3. **Both tuners busy** — one show is recorded; the other is marked as conflict and you are notified.

**Conflict resolution preference:** In **Settings → Live TV → DVR**, you can set whether Phlix prefers to keep existing recordings or prioritize new episodes when resolving conflicts.

### Storage

Recordings are stored in the path configured in **Settings → Live TV → Storage**. This can be a dedicated folder (e.g., `/var/recordings`) or a subfolder of an existing media library.

Storage usage is shown in **Settings → Live TV → Storage** with total / used / free bytes.

**Post-recording:** After a recording completes, Comskip runs automatically if enabled (see [Live TV Comskip](live-tv-comskip.md)) to detect and flag commercials.

---

## 7. What Can Go Wrong

### Failure 1: HDHomeRun Not Discovered (UDP Port 65001 Blocked)

**Symptom:** HDHomeRun tuner is connected to the network but does not appear in Phlix during setup.

**Diagnosis:**

```bash
# hdhomerun_config uses UDP port 65001 for discovery
nc -zvu 192.168.1.100 65001

# Or use the discovery command (broadcasts on UDP 65001)
hdhomerun_config discover
```

**Fix:** Open UDP port 65001 on your server firewall, router firewall, or VPN. Alternatively, manually enter the HDHomeRun IP address during setup instead of using auto-discovery. Find the IP via your router's device list or by checking the HDHomeRun's built-in web interface at `http://<hdhomerun-ip>`.

---

### Failure 2: EPG Guide Data Shows Wrong Channels (M3U + XMLTV Mismatch)

**Symptom:** The program guide appears but channel numbers or names don't match the actual channels in the M3U playlist.

**Diagnosis:**

```bash
# Check the first few entries of your M3U playlist — note the #EXTINF channel numbers
head -20 /path/to/playlist.m3u

# Check the corresponding channel IDs in your XMLTV file
grep -m 5 "<channel" /path/to/guide.xml

# The M3U #EXTINF index order should match the XMLTV channel IDs
```

**Fix:** The M3U and XMLTV files must have matching channel references. Re-export the M3U or XMLTV with matching channel identifiers, or switch to Schedules Direct which maintains its own channel map and avoids this mismatch entirely.

---

### Failure 3: DVR Storage Drive Fills Up

**Symptom:** Recordings stop mid-recording or fail to start. The Live TV UI shows a storage error.

**Diagnosis:**

```bash
# Check recording storage path usage
df -h /var/recordings

# List recording file sizes
du -sh /var/recordings/* | sort -rh | head -20
```

**Fix:** Free up space by deleting completed recordings you no longer need, changing the storage path to a larger drive (**Settings → Live TV → Storage**), or setting a maximum storage limit. Enable **auto-delete** to remove old recordings when space is low.

---

### Failure 4: Recording Missed Due to Tuner Conflict

**Symptom:** A scheduled recording did not happen. The recording shows as "Missed" or "Conflict" in the UI. The tuner was busy with another show at the same time.

**Diagnosis:**

```bash
# Check the Live TV tuner status
curl http://localhost:32400/api/v1/livetv/tuners

# Look for a tuner that was busy (status: recording) during the missed show's time slot
```

**Fix:** Conflict resolution follows the priority set in **Settings → Live TV → DVR**. To avoid this: add a second tuner, adjust series rules to avoid overlapping timeslots, set conflict preference to "prioritize new episodes," or check the **Upcoming Recordings** list regularly for conflicts.

---

## 8. Next Steps

- [Live TV Comskip](live-tv-comskip.md) — configure automatic commercial detection and skipping in recordings
- [DLNA / Play To](../clients/dlna.md) — stream live TV or recordings to DLNA-enabled devices
- [Remote Access / Hub](../hub/remote-access.md) — access Live TV from outside your home network
- [Recording Rules](../developers/dvr.md) — managing and editing scheduled recordings
