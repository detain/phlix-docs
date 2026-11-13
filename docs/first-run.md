---
title: First Run
description: From a freshly installed Phlix server to your first playing title
---

# First Run

**TL;DR:** There is no separate setup wizard. A fresh Phlix server is simply a login
page: you create the first account (which automatically becomes the administrator),
then add a library folder and press scan. Ten minutes — start to watch — once the
server itself is installed. Not there yet? The install guides add roughly 10–20
minutes (about 15 on Linux), so plan for about half an hour from blank machine to
first title.

Every term used below that sounds like jargon is defined in the
[Glossary](glossary.md).

## Before you start

- Phlix is **installed and running** on some machine (see
  [Install](install/linux.md) if that hasn't happened yet).
- Your media files are **on a folder the server machine can read** — a local disk path,
  or a network share mounted into the server's filesystem (see
  [Libraries](libraries/overview.md)). Phlix scans the server's own folders; it cannot
  browse your laptop's disk from across the room.

## Step 1 — Open the web portal

On any device on the same network, visit:

```text
http://<your-server>:8096/app
```

The plain address `http://<your-server>:8096/` redirects there. You'll see a sign-in
card — **Username or email**, **Password**, **Sign in** — and a link to create an
account.

::: warning Do this on a trusted network
`8096` is the server's plaintext HTTP portal. Anyone on the same network can see the
password you type in Step 2. Run the first ritual at home, over the LAN — not over
public Wi-Fi — and complete the [Hardening Checklist](security/hardening.md) (TLS in
front before anything reaches the internet) **before** following any of the remote-access
guides, which build on this same account.
:::

## Step 2 — Create the first account (it becomes admin)

Press the sign-up link and fill in:

- **Email** — a valid address; this is also a login name.
- **Username** — at least 3 characters.
- **Password** — at least 8 characters.

Normally sign-ups on a Phlix server wait for admin approval (the default
signup mode — see [Adding people](adding-people.md)). The **first account ever**
is the bootstrap exception: it's created active *and* as an administrator, immediately,
on any fresh server. No email verification is involved — the "email" is just a label and
a login handle; Phlix doesn't send mail.

Sign in with those credentials. You land on **Browse**, which is, as expected, empty.

## Step 3 — Point Phlix at your media

Go to **Admin → Libraries** and press **Add library**:

- **Name** — anything you'll recognize ("Movies", "Kids TV").
- **Type** — one of: movie, series, music, photo, video, book, audiobook.
- **Paths** — the folders to scan, one per line. They must exist **on the server's
  filesystem**; a missing or unreadable folder is flagged.

Save, then run **Scan** on the new library (the row shows live progress). A first scan
also fetches metadata and artwork for movies and shows — expect it to take longer than
later rescans. When it finishes, titles appear under Browse.

::: tip Folders can be managed later without drama
The library's menu has **Rescan**, **Recheck all metadata**, **Prune removed** (drop
index rows for files you deleted), and **Regenerate media assets** (posters, previews).
You can also add more paths to the same library by editing it.
:::

## Step 4 — Watch something

Click any title, press play. The web player usually starts instantly. If it buffers or
looks off, your device may have needed the server to convert the video on the fly
(*transcoding*) — that's normal; see
[Hardware transcoding](advanced/hardware-transcoding.md) if your server struggles.

## Ports at a glance

A fresh Phlix server listens on two TCP ports; enabling DLNA (off by default)
adds exactly one more — the UDP :1900 discovery listener on the LAN. Open only
what you actually use, and scope your firewall rules to your LAN (worked
`ufw`/`firewalld` examples: [Troubleshooting](troubleshooting.md)):

| Port | Protocol | What it is | Who needs it |
| --- | --- | --- | --- |
| 8096 | TCP | Web portal (`/app`), REST API, streaming | Every client device on your network |
| 8097 | TCP | WebSocket — watch parties (SyncPlay) | Only if clients connect to SyncPlay directly rather than through the Hub relay |
| 1900 | UDP | SSDP multicast — DLNA discovery (announcements and search replies) | LAN only, and only once DLNA is switched on in `config/dlna.php` and the service is restarted |

DLNA is not a separate port: its device description, browse and streaming
endpoints ride the already-open :8096, so turning the feature on opens **no**
new inbound TCP hole. The switch must be set in the config file followed by a
full restart — a fresh install never spawns the discovery worker, so the
admin-UI toggle alone cannot bring :1900 up
([DLNA Server](advanced/dlna.md)).

Nothing else needs an inbound hole. If you claim the server to a Hub, remote
access rides a single **outbound** connection the server keeps to the Hub's
tunnel port (8802 by default) — your router and firewall stay untouched
([Claim your server](hub/claim-server.md)). If you self-host a Hub of your own,
its listener map — 8800 dashboard/API plus the 8802/8803 relay surfaces — is in
[Hub architecture](dev/architecture-hub.md); the SyncPlay relay (8804) and the
hub-to-hub federation tunnel (8805) are covered in
[Federation policy](hub-admin/federation-policy.md).

## Good next steps

- **Harden before you expose** — work through the [Hardening Checklist](security/hardening.md)
  and, if the server will be reachable from outside the LAN, the
  [Reverse Proxy guide](advanced/reverse-proxy.md). Every remote-access option below assumes
  this step is done.
- **Add the rest of the household** — profiles vs. real accounts:
  [Adding People to Your Household](adding-people.md).
- **Cast to your TV** — DLNA is shipped **off**; flip it on in `config/dlna.php`
  and restart the server (the Admin → DLNA toggle alone won't bring discovery up),
  and compatible TVs will find the server on the LAN.
- **Watch from outside the house** — claim the server on a Hub:
  [Claim your server](hub/claim-server.md). (A *relay* handles the hard part —
  no router settings to touch.)
- **Watch together with friends** — [Watch Together (SyncPlay)](advanced/syncplay.md).
  Heads-up: it needs your server's port **8097** reachable by your guests, which home
  networks usually don't offer by default.
- **Keep your data safe** — [Backup & restore](advanced/backup-restore.md).

## If you get locked out

There is no "forgot password" email flow — Phlix sends no mail. Recovery happens on the
server itself, at a terminal:

```bash
php bin/phlix user:reset-password <username-or-email>
php bin/phlix user:promote <username>          # (re)grant admin
php bin/phlix user:list                        # who exists at all
```

Run these from the Phlix server's own install directory. See
[CLI reference](reference/cli.md) for the rest of the toolbox.

## Related Pages

- [Libraries overview](libraries/overview.md)
- [Adding people](adding-people.md)
- [Glossary](glossary.md)
- [Troubleshooting](troubleshooting.md)
- [Plugins](plugins/install-from-catalog.md)
