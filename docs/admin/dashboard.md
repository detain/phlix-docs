---
title: Dashboard
description: Reading your Phlix admin dashboard
---

# Reading Your Dashboard

The dashboard is the first page you see after signing in as an admin. It answers the
"what's happening on my server right now — and lately?" question without you having to
ask the database anything. This page walks through the five panels, what each number
means, and what the dashboard deliberately does *not* tell you.

## Where it is

Open **Dashboard** in the admin sidebar (the URL is `/app/admin/dashboard`; the older
`/admin/dashboard` address simply redirects there). You must be signed in with an admin
account — everyone else gets an access-denied response.

## The five panels

### Now Playing

A live list of everything with an active session on your server right now. The panel header
counts the sessions ("N active sessions"), and each row shows who is watching, what
they're watching, the type of media (movie / episode / music badge), and how far along
they are — a progress bar with a percentage.

The panel refreshes itself every 30 seconds while you're looking at it. If you switch to
another browser tab, the refresh pauses until you come back — the page doesn't keep
polling your server in the background.

A row appears when a client has an active session — paused counts, stopped doesn't.
"Now Playing" really means "has a session", not "the picture is moving this second".

### Top Users

A leaderboard of who has watched the most. Columns: rank, username, total watch time
(written out like "2h 15m"), and play count. The **Date range** menu at the top of the
page changes the window for this panel and Top Media together (last 7, 30, or 90 days).
If nobody has watched anything in the chosen period the panel simply says
"No user data yet".

Watch time counts what the server was told you watched. Skipping around, leaving a
title paused for an hour, or using a client that reports progress differently will all
skew it — it's a fun ranking, not a billing meter.

### Top Media

The same idea for titles: rank, title (it links to that item's page), type badge, how
many times it was played, and total watch time. Same Date range menu. When the list is
empty the panel says "No media data yet".

::: tip Deleted things disappear from the leaderboards
Both lists hide activity from deleted users and plays of deleted items, rather than
showing blank rows. So a "Top Users" chart can honestly change shape when you clean up
an account — the plays didn't happen more or less, they just stopped being attributable.
:::

### Storage

A snapshot of what your library weighs: one card per media type found in your library,
each with its item count and total size. Below the cards, a line reports the size of the
transcode cache (only once it has something in it). The transcode cache is disposable
work product — it regenerates as people watch, so a big number there is normal. It also
lives outside what a backup archive carries (the archive holds the database dump, config
files, the data directory, and SSL certificates — see
[Backup & Restore](../advanced/backup-restore.md)), which is fine precisely because it
can be rebuilt.

Storage sizes are what the database recorded at scan time. If you replaced files on disk
without rescanning, give it a minute after a rescan before trusting these numbers.

### Recent Activity

A plain event feed — playback completions, library changes, logins and logouts — newest
first, with relative timestamps like "2m ago". Click **Load more** to page further back.
If the feed looks thin, that's because it shows the event kinds it collects, not every
API call your clients make. An empty feed simply reads "No recent activity".

## What this page is not

- **Not a debugging tool.** If something looks wrong, the panels tell you *that*, not
  *why*. The detailed statistics endpoints and the logs pages are the next step —
  see [Stats](./stats.md).
- **Not permission-aware in shades of grey.** It's all-or-nothing: admins see it,
  everyone else doesn't.
- **Not real-time to the second.** Now Playing is up to 30 seconds stale; the other
  panels load when the page loads (or when you change the range) and stay put until
  you reload.

## See also

- [Stats](./stats.md) — the detailed numbers behind Top Users / Top Media
- [Webhooks](./webhooks.md) — get told about these events somewhere else instead
- [Backup](./backup.md) — what to keep so this history survives a disk failure
- [Admin SPA internals](../dev/admin-spa.md#the-dashboard-page) — how the page is built
  (developer documentation)
