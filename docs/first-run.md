---
title: First-Run Wizard
description: Get your Phlex server running in minutes with the first-run setup wizard.
---

**Phase:** N (End-User Documentation)
**Step:** N.6
**Since:** 0.18.0

## TL;DR

The first-run wizard starts automatically when you boot Phlex with no admin account configured. It walks you through creating your admin login, adding media library folders, choosing library types, setting language/timezone preferences, and enabling DLNA discovery — taking about five minutes from server boot to a ready-to-scan library.

<!-- screenshots TBD — text-first -->

## Screenshots / Flow Description

The wizard runs in your browser and presents each step one at a time. Work through each screen in order.

### Step 1 — Welcome Screen

When you first access your server, the wizard displays a welcome screen. Open your browser and navigate to:

```
http://localhost:32400/web
```

Or, if accessing from another machine on your network, replace `localhost` with your server's LAN IP address (e.g., `http://192.168.1.100:32400/web`).

Click **Get Started** to begin.

### Step 2 — Admin Account Creation

Create your server administrator account. This account has full access to all server settings, library management, and user management.

- **Email** — Enter a valid email address. This is your login username.
- **Password** — Choose a strong password. An on-screen strength meter will update as you type.
- **Confirm Password** — Re-enter your password to confirm there are no typos.

Click **Create Account** when the strength meter shows a strong rating. You can update the email and password later in **Settings → Account**.

### Step 3 — Library Path Configuration

Tell Phlex where your media files live. Click **Add Folder** and browse to each directory you want to include.

Common examples:

| Content type | Example path |
|-------------|-------------|
| Movies | `/media/movies` |
| TV shows | `/media/tv` |
| Music | `/media/music` |
| Photos | `/media/photos` |
| Books | `/media/books` |
| Audiobooks | `/media/audiobooks` |

You can add multiple folders for the same library type (for example, `/data/movies` and `/backup/movies`). Folders that don't exist or are inaccessible will be flagged — correct the path or remove the entry before proceeding.

Click **Continue** when all desired folders are listed.

### Step 4 — Library Type Selection

For each folder you added, choose what kind of content it contains:

- **Movies** — Individual film files
- **TV Shows** — Episodic content organized in folders or by season
- **Music** — Albums, artists, and tracks
- **Photos** — Image collections
- **Books** — E-books and PDFs
- **Audiobooks** — Audio book files

You can create multiple libraries (for example, one Movies library and one TV Shows library) or put everything in a single library. The type helps Phlex fetch the correct metadata and display posters, descriptions, and episode guides.

Click **Continue** when each folder has a type assigned.

### Step 5 — Library Scan Trigger

Choose when Phlex should scan your libraries for media files:

- **Scan Now** — Triggers an immediate background scan. Large libraries may take several minutes. You can continue using the wizard while the scan runs.
- **Scan Later** — Defers the scan to a scheduled time. You can trigger it manually from **Settings → Libraries** whenever you are ready.

You can always change the scan schedule later in **Settings → Libraries → Scan Schedule**.

Click **Continue**.

### Step 6 — Hub Connection

Connect this server to a Phlex Hub for remote access and multi-server management. This step is optional.

- **Connect Now** — Enter your hub URL (e.g., `https://hub.phlex.example.com`) and authenticate with your hub credentials. See [Hub Claim Guide](./hub/claim-server.md) for the full claim flow.
- **Skip** — Defer hub connection. You can set up hub access later from **Settings → Hub**.

Even when skipped, you can connect clients directly to the server over your LAN or configure your own remote access (reverse proxy, Tailscale VPN, etc.).

Click **Continue**.

### Step 7 — Language and Timezone

Set defaults for the server's display language and local time representation:

- **Language** — Select your preferred language from the dropdown.
- **Timezone** — Select your city or region to ensure correcttimestamps on recording schedules, watch history, and DLNA announcements.

These settings affect the web portal, API responses, and any scheduled tasks. They can be changed at any time in **Settings → General**.

Click **Continue**.

### Step 8 — DLNA Server Toggle

DLNA (Digital Living Network Alliance) enables other devices on your network — smart TVs, game consoles, media players — to discover and stream from your Phlex server without needing a dedicated client app.

- **Enable DLNA** — Allows device discovery on your local network. Phlex will announce itself to any DLNA-compatible device.
- **Disable DLNA** — Turns off network discovery. You can still access content through dedicated client apps.

If you enable DLNA, the server will listen on port 1900 (UDP) for SSDP discovery requests and serve content over HTTP on the same port as the web portal.

Click **Continue**.

### Step 9 — Web Dashboard Ready

The wizard is complete. You land on the Phlex web dashboard, which shows:

- Your configured libraries on the home screen
- Ongoing library scans in the top-right notification area
- The navigation sidebar for browsing content, managing libraries, and adjusting settings

Your server is now ready to stream to clients. Download a client app for your device from the [Clients overview](./clients/overview.md).

## Shell Blocks

These commands are useful for operators managing a headless server.

**Verify the server is running:**

```bash
curl http://localhost:32400/api/v1/system/status
```

Expected response includes `"status": "ok"` and the server version.

**Check library paths on disk:**

```bash
ls -la /media/movies
ls -la /media/tv
```

**Trigger a manual library rescan via CLI:**

```bash
php public/index.php library:scan --all
```

**View DLNA server status:**

```bash
curl http://localhost:32400/api/v1/system/dlna
```

## What Can Go Wrong

### Admin account email already in use

**Symptom:** The wizard refuses to create the account and shows "An account with this email already exists."

**Fix:** An admin account was already created on this server (possibly during a previous run that did not complete). If you know the existing credentials, log in with them and change the password from **Settings → Account**. If you have lost access, use the account recovery flow from the login screen. If the server has no other admin, you can reset the database and run the wizard again — but this erases all libraries, watch history, and user accounts.

### Library paths not accessible

**Symptom:** A folder shows a warning icon in step 3, or the scan completes with files missing or a "path not found" error.

**Fix:** Verify the folder exists on the server's filesystem: `ls /media/movies`. If the folder exists but is owned by root, either change ownership (`sudo chown -R phlex:phlex /media/movies`) or grant read access to the phlex process user. If the path is a network mount (NFS, SMB), confirm the mount is still active and the phlex process has network access to the mount server. Correct the path in **Settings → Libraries** after the wizard completes.

### Initial scan hangs or times out

**Symptom:** The scan progress indicator appears stuck, or the wizard shows a timeout error after several minutes for a large library.

**Fix:** Very large libraries (tens of thousands of files) or slow network mounts can exceed the default timeout. From **Settings → Libraries**, defer the scan and trigger it manually at a convenient time: set **Scan Schedule** to a manual-only setting, then click **Scan Now** when the server is lightly loaded. If using network storage, ensure the connection is stable and the mount uses a protocol with decent read performance (SMBv3 or NFSv4 rather than SMBv1).

## Next Steps

- [Libraries overview](./libraries/overview.md) — Add, remove, and manage your media libraries
- [Clients overview](./clients/overview.md) — Connect playback apps on TV, mobile, and desktop
- [Hub remote access](./hub/remote-access.md) — Set up secure remote access without opening ports
- [Live TV](./advanced/live-tv.md) — Watch and record live television
- [CLI reference](./reference/cli.md) — Server management commands
