---
title: Hub Claim Guide
description: Connect your Phlix server to a Phlix Hub for remote access and multi-server management.
---

**Phase:** N (End-User Documentation)
**Step:** N.11
**Since:** 0.18.0

## TL;DR

Claiming links your self-hosted Phlix server to a Phlix Hub account so you can access it remotely without configuring port forwarding or a VPN. As the server admin, you generate a short claim code from your server's Settings, paste it into the Hub dashboard, and the hub immediately gains access to your server's libraries and live streams.

<!-- screenshots TBD — text-first -->

## Hub Claim Flow

Work through these steps on both your server and the Hub dashboard.

### 1 — Server Admin: Open Hub Settings

On your Phlix server, log in as an administrator and navigate to:

**Settings → Hub**

If this is the first time opening Hub settings, you will be prompted to set a friendly server name (e.g., "Living Room Server" or "NAS-Phlix") which will appear in the Hub dashboard.

### 2 — Server Admin: Generate a Claim Code

Click **Generate Claim Code**.

A code in the format `XXXX-XXXX` (four letters, hyphen, four letters) appears on screen with a **10-minute expiry countdown**. The code is case-insensitive.

Record the code and switch to your Hub dashboard. The countdown begins immediately — complete the Hub dashboard steps before the 10 minutes elapse. If the code expires, generate a new one from the server.

> [!NOTE]
> The 10-minute expiry is intentional. A short window reduces the risk of a claim code being intercepted or reused if it has been shared over an insecure channel.

### 3 — Hub Dashboard: Claim the Server

Open the Hub dashboard at `https://hub.phlix.example.com` (replace with your Hub's actual URL) and navigate to:

**My Servers → Claim a Server**

Enter the claim code from step 2 into the **Claim Code** field and click **Claim**.

The Hub immediately verifies the code with your server. On success:

- Your server appears in **My Servers** with the name you set in step 1
- The server's libraries become available to any Hub user you grant access to
- The Hub relay tunnel is established, enabling remote playback

### 4 — Verify the Connection

Back on your Phlix server's **Settings → Hub** page, the status changes to **Connected** and shows the Hub URL you are connected to.

On the Hub dashboard, the server card shows a green "Online" indicator. Clicking the server opens the Hub's server detail view, which displays the server's libraries and current playback status.

## CLI Alternative

Server administrators who prefer the command line can claim using the `hub:claim` command:

```bash
php bin/phlix hub:claim --code ABCD-1234 --hub https://hub.phlix.example.com
```

- `--code` — the claim code generated from **Settings → Hub** on the server
- `--hub` — your Hub's base URL

On success, the command prints:
```
Server successfully claimed by Hub https://hub.phlix.example.com
Server name: Living Room Server
```

To unclaim (disconnect the server from the Hub) without claiming a new one:

```bash
php bin/phlix hub:unclaim
```

This removes the server from the Hub account and terminates the relay tunnel. Libraries that were shared via Hub become inaccessible to Hub users immediately.

## What Can Go Wrong

### Claim code has expired

**Symptom:** The Hub dashboard shows "Claim code is invalid or has expired" when you try to submit the code.

**Fix:** Return to your server's **Settings → Hub** and click **Generate Claim Code** to get a fresh code. Work quickly — the new code also expires after 10 minutes. Ensure you start the Hub dashboard step before generating a new code so the window is as short as possible.

### Server has already been claimed

**Symptom:** The Hub dashboard shows "This server has already been claimed by another Hub account."

**Fix:** A server can only be claimed by one Hub account at a time. To transfer ownership, the current Hub admin must first unclaim the server from **My Servers → [server name] → Settings → Unclaim Server**. Once unclaimed, any Hub account can claim it.

### Network isolation — server cannot reach the Hub

**Symptom:** The Hub dashboard spins indefinitely after you submit the claim code, then reports "Could not reach server."

**Fix:** The server needs outbound HTTPS access to the Hub's URL (port 443). Check that your server's firewall allows outbound HTTPS connections. If the server is on an isolated network, a proxy or VPN may be required for initial claim. After the claim, the Hub maintains its own outbound relay tunnel so ongoing remote access does not depend on the server initiating outbound connections.

### Claim code entered incorrectly

**Symptom:** "Invalid claim code" even though you are certain the code was entered correctly.

**Fix:** Claim codes are case-insensitive, but hyphens are required — format must be `XXXX-XXXX`. If you are copy-pasting, ensure no extra spaces or invisible characters were included. Generate a fresh code and try again, entering it manually to rule out clipboard issues.

## Next Steps

- [Hub remote access](./remote-access.md) — Access your server from outside your home network using the Hub relay
- [Hub administration](https://hub.phlix.example.com/admin) — Manage connected servers, users, and relay bandwidth from the Hub admin panel
- [Libraries overview](../libraries/overview.md) — Add or manage media libraries after your server is connected
