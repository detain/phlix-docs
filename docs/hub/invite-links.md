# Invite Links

**Since:** 0.19.0

## TL;DR

Invite links let you share access to a library (or all libraries) on one of your claimed servers. You set the permission level, a maximum number of uses, and an expiry. The recipient opens the link, signs in to the hub (creating a free hub account if they don't have one), taps **Accept Invite**, and the shared library appears under **Shared With Me** on the hub. The hub itself sends no email — copying the URL and messaging it yourself *is* the invite.

---

## The Invite Links Page

Invite links are managed from the **Invite Links** page in the `/app` SPA
(`/app/invite-links`, reachable from the top navigation) and backed by the Hub API
(the `/api/v1/me/invite-links` endpoints below). The public acceptance link
`/invite/{token}` opens the SPA acceptance page at `/app/invite/{token}` — a
recipient who is not signed in gets Log In / Sign Up buttons that return them to the
invite after authenticating; a signed-in recipient gets an **Accept Invite** button,
then a link to their **Shared With Me** libraries. (The older server-rendered
acceptance pages have been retired in favor of this SPA route.)

The invite-links view lists every invite link you have created, one card per link:

```
┌─ Invite Link ────────────────────────────────────────────┐
│ My Server › All Libraries                                │
│ [read]  0 / 1 uses  ·  Expires Jun 5 2026                │
│ URL shown only at creation                 [Revoke]      │
└──────────────────────────────────────────────────────────┘
```

### Reading a link card

Each card shows:

- **Server › Library** — the claimed server this link targets, and the library it
  covers (**All Libraries** when you left the Library select alone).
- **Permission badge** — the stored level rendered raw: `read` or `readwrite`.
- **Uses** — `X / Y uses`, where `Y` is the maximum uses you set and `X` counts
  redemptions. Once `X` reaches `Y` the link simply stops being redeemable — there
  is no separate "exhausted" flag on the card.
- **Expires** — the date the link stops working; past that date redemptions fail.
- **URL visibility** — the invite secret is shown **only once**, in the panel right
  after you create the link (**Copy URL** / **Copy Token** buttons there). Listed
  cards show "URL shown only at creation" because the hub stores only a one-way
  hash of the token and can never reproduce the URL later.
- **Revoke** — deletes the invite link immediately; the card disappears and the URL
  no longer works.

---

## Creating an Invite Link

Click **New Invite** in the top-right corner of the page to open the create modal.

### Fields

| Field | Required | Description |
|---|---|---|
| **Server** | Yes | Select one of your claimed servers from the dropdown. |
| **Library** | No | Select a specific library on that server, or leave it on **All Libraries** to cover every library on the server. This dropdown populates after you select a server. |
| **Permission** | No | **Read** (default) or **Read/Write**. Heads-up: the level is recorded but nothing enforces it yet — see [Share with Friends](./share-with-friends.md#two-permission-levels). |
| **Max Uses** | No | How many times the link may be redeemed. Default: `1`. Any value below `1` is rounded up to `1` by the hub. |
| **Expires In** | No | How long the link works. Options: `7 days` (default), `30 days`, `90 days`, `1 year`, `Never`. After the selected period the link is automatically invalid. |

Click **Create Invite** to generate the link. The modal switches to a one-time
result view showing the **Invite URL** (and the raw token) with **Copy** buttons —
**copy it now and store it somewhere safe**: the hub keeps only a one-way hash of the
secret, so once you close this dialog the URL can never be recovered or re-listed.
Use **Cancel** (or click outside the modal) beforehand to close without creating a link.

---

## Sharing a Link

After creating a link:

1. Click **Copy** in the one-time result panel (before closing it — the URL cannot be recovered afterwards; just create a fresh link if you miss it).
2. Send the URL to your recipient over any channel (email, message, etc.).

Your recipient needs a Hub account to *redeem* it, but they can create that account right on the acceptance page — receiving the link itself asks nothing of them. After accepting, the shared server/library appears in their **Shared With Me** section automatically.

---

## API Endpoints Used

The Invite Links page consumes the following Hub API endpoints:

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/me/invite-links` | `GET` | Fetch all invite links you have created. |
| `/api/v1/me/invite-links` | `POST` | Create a new invite link. |
| `/api/v1/me/invite-links/{id}` | `DELETE` | Revoke an invite link. |
| `/api/v1/me/servers` | `GET` | Populate the server dropdown in the Create modal. |
| `/api/v1/me/libraries?server_id={id}` | `GET` | Populate the library dropdown after a server is selected. |

All endpoints require authentication (`Authorization: Bearer <jwt>` or the `phlix_hub_token` cookie).

---

## What Can Go Wrong

### 1. Library dropdown is empty after selecting a server

**Symptom:** You select a server in the create modal but the Library dropdown shows only "All Libraries" — no per-library options appear.

**Reason:** The dropdown is populated from `GET /api/v1/me/libraries?server_id={id}`, and for a server you own that reads the hub's **`server_libraries` cache** — a snapshot your server pushes to the hub in its heartbeats. If that snapshot is still empty (freshly claimed server, or the server isn't reaching the hub), there are no per-library rows to offer.

**Fix:** Make sure the server is online and its relay connection to the hub is established — the library snapshot refreshes with heartbeats. Confirm the server actually has libraries configured on it. As an interim step, an **All Libraries** link covers every library on the server anyway.

### 2. Invite link is accepted but the library does not appear

**Symptom:** The recipient says they accepted, but sees nothing under **Shared With Me**.

**Diagnosis:**
```bash
# On the hub, check the redemption log line (the 'hub' channel writes to hub.log;
# there is no .logs/hub-audit.log):
grep "Invite link redeemed" .logs/hub.log | tail -20
```

If no line appears, the redeem request never succeeded (see item 4 — the recipient's page would have shown an error in that case).

**Fix:** The library owner should verify that the library being shared has completed a media scan on the server. A library with no scanned content will appear empty even after being shared.

### 3. Link is already used up right after creation

**Symptom:** A newly created link with `Max Uses: 1` shows `1 / 1 uses` before anyone else has clicked it.

**Reason:** You (or a link scanner) already redeemed it once — the count went up on that acceptance. With `Max Uses: 1` a single redemption consumes the link; there is no badge, just the counter. Treat it as consumed.

**Fix:** Create a new link with a higher `Max Uses` if you need to share with more than one person.

### 4. Link recipient sees an error

**Symptom:** The recipient clicks the link and the acceptance page shows an error instead of **Accept Invite**.

**What the page actually says:**

- `Invalid invite token.` — the URL was mangled (no token in the link at all).
- `This invite link was not found.` — the link never existed or was **revoked** by the sender.
- `This invite link has expired or been exhausted.` — the link passed its expiry or hit its `Max Uses`.
- `Session expired. Please log in again.` — sign in again; the page sends you back to the invite.
- Any other failure surfaces the server's own message — for example `This server has reached its collaborator limit`, which means the target server's share quota is full and its owner must free capacity before more people can join.

**Fix:** For the first two, ask the sender to create a fresh link with new settings.

---

## Next Steps

- [Share with Friends](./share-with-friends.md) — the overview of link-based sharing: scopes, permission labels, and what is *not* enforced.
- [Claim your server to the hub](./claim-server.md) — connect a server to the hub before you can create invite links for it.
- [What is the Hub?](./what-is-the-hub.md) — overview of all hub features and account management.
