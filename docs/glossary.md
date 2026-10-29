---
title: Glossary
description: Plain-English meanings of the technical words Phlix docs use
---

# Glossary

Everyday meanings for the jargon this documentation uses. Each entry is one plain
sentence; linked pages tell the full story.

**Bearer (token)** — "whoever *bears* this string gets in": the way Phlix apps attach
their login token to each request, like showing a wristband instead of an ID.
See **Token** below.

**Federation** — hubs talking to *other hubs*, with cryptographic handshakes, so a
person on one hub's address book can reach servers shared from another. Advanced; a hub
administrator can switch it off.

**Hub** — a separate, optional service that acts as your address book and remote door:
you claim your servers on it, and it helps your devices find and reach them from outside
your home. Your media never lives on the hub.
See [What is the Hub?](hub/what-is-the-hub.md).

**Invite link** — a one-time URL you create on the Hub that lets one person join your
server as a user or collaborator without you typing out a password. After it's used (or
you revoke it) it stops working.
See [Invite links](hub/invite-links.md).

**Mount** — attaching a folder or disk (a drive, a NAS share, a Docker volume) so the
Phlix server can see the files inside it. A library scans a mount; if nobody mounted
the drive, Phlix can't watch it.

**NAT** — the address-translation your home router does so twenty devices can share one
public IP. Its side effect: computers on the internet can't simply knock on your
server's door — which is exactly the problem the Hub's relay was built to avoid.
See [Remote access](hub/remote-access.md).

**Relay** — the Hub's long-lived connection trick: your server dials *out* to the hub
and keeps the line open, and remote browsing flows back over that already-open line.
No ports opened on your router, no public IP needed.
See [Remote access](hub/remote-access.md).

**Reverse proxy** — a front-door web server (nginx, Caddy, Traefik…) that owns your
domain name and HTTPS certificate and forwards requests to Phlix behind it. You visit
`https://phlix.example.com`; the proxy talks to `127.0.0.1:8096` so you never have to.
See [Reverse proxy](advanced/reverse-proxy.md).

**SSDP** — the local-network shout ("anyone here who serves video?") that lets DLNA
devices and some apps discover your server without you typing an address. Home-LAN only;
it's the first thing that stops working when you leave the house.

**Token** — the login receipt your server hands the app after the right password: a
signed string (`JWT`) that says "this is Maya, expires at 9pm." Apps show it with every
request instead of your password. It can expire and be refreshed — and anyone holding it
holds the access, so it's kept in secure storage. See **Bearer (token)** above.

**Transcode** — re-encoding video *while you watch* so a picky device can play it, or
shrinking it to fit a slow connection. Costs the server real CPU; a direct connection
that "just works" skipped transcoding.
See [Hardware transcoding](advanced/hardware-transcoding.md).

**Tunnel** — inside a relay connection, each browsing session gets its own private pipe
(a "tunnel" multiplexed over one socket) so your server's HTTP responses find their way
back to the right remote device. You'll mostly meet the word in logs.

**Watch group** — the everyday name for what the tech calls a **SyncPlay** room: a
group of people watching the same title, with play/pause kept in sync. One person hosts;
the rest follow.
See [Watch Together (SyncPlay)](advanced/syncplay.md).

**WebSocket** — a phone-call connection (the internet kind): unlike ordinary web
requests that ask-and-hang-up, a WebSocket stays open both ways, which is how watch
groups deliver "someone just paused" a quarter-second later instead of on page refresh.

## Related pages

- [What is the Hub?](hub/what-is-the-hub.md)
- [First run](first-run.md) — where most of these words first appear
- [Troubleshooting](troubleshooting.md)
