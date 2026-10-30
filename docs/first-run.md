---
title: First Run
description: From a freshly installed Phlix server to your first playing title
---

# First Run

**TL;DR:** There is no separate setup wizard. A fresh Phlix server is simply a login
page: you create the first account (which automatically becomes the administrator),
then add a library folder and press scan. Ten minutes, start to watch.

Every term used below that sounds like jargon is defined in the
[Glossary](glossary.md).

## Before you start

- Phlix is **installed and running** on some machine (see
  [Install](install/linux.md) if that hasn't happened yet).
- Your media files are **on a folder the server machine can read** — a local disk path,
  or a network share mounted into the server's filesystem (see
  [Libraries](libraries/overview.md)). Phlix scans the server's own folders; it cannot
  browse your laptop's disk from across the room.

## Step 1 — Open the web app

On any device on the same network, visit:

```
http://<your-server>:8096/app
```

The plain address `http://<your-server>:8096/` redirects there. You'll see a sign-in
card — **Username or email**, **Password**, **Sign in** — and a link to create an
account.

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

## Good next steps

- **Add the rest of the household** — profiles vs. real accounts:
  [Adding People to Your Household](adding-people.md).
- **Cast to your TV** — DLNA is shipped **off**; flip it on under **Admin → DLNA**
  (page has a Start/Stop control) and compatible TVs will find the server on the LAN.
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

```
php bin/phlix user:reset-password <username-or-email>
php bin/phlix user:promote <username>          # (re)grant admin
php bin/phlix user:list                        # who exists at all
```

Run these from the Phlix server's own install directory. See
[CLI reference](reference/cli.md) for the rest of the toolbox.

## Related pages

- [Libraries overview](libraries/overview.md)
- [Adding people](adding-people.md)
- [Glossary](glossary.md)
- [Troubleshooting](troubleshooting.md)
