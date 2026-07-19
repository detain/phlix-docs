# Invite Links

**Since:** 0.19.0

## TL;DR

Invite links let you share access to a library (or all libraries) on one of your claimed servers with anyone — no hub account required on their end. You set the permission level, a maximum number of uses, and an expiry. The recipient visits the link, logs in or creates a hub account, and immediately sees the shared library under **"Shared with me"**.

---

## The Invite Links Page

Invite links are managed from the **Invite Links** page in the `/app` SPA
(`/app/invite-links`, reachable from the top navigation) and backed by the Hub API
(the `/api/v1/me/invite-links` endpoints below). The public acceptance link
`/invite/{token}` that you send to recipients now opens the SPA acceptance page at
`/app/invite/{token}` — a recipient who is not signed in gets Log In / Sign Up buttons
that return them to the invite after authenticating; a signed-in recipient gets an
**Accept Invite** button, then a link to their **Shared With Me** libraries.
(These surfaces were migrated to `/app`; the older Smarty pages remain in place until
the migration is verified.)

The invite-links view lists every invite link you have created, one card per link:

```
┌─ Invite Link ──────────────────────────────────────┐
│ Server: My Server                     [Copy URL] [✕]│
│ Library: All Libraries · Permission: Read · Uses: 0/1 │
│ Expires: Jun 5 2026 · Created: May 29 2026           │
└──────────────────────────────────────────────────────┘
```

### Reading a link card

Each card shows:

- **Server** — the claimed server this link targets.
- **Copy URL** — copies the invite URL to your clipboard. The button briefly shows "Copied!" after a successful copy.
- **Revoke (✕)** — deletes the invite link immediately. The card disappears from the list and the URL no longer works.
- **Library** — either "All Libraries" or the specific library name. A link for all libraries is created when `library_id` is not set.
- **Permission** — `Read` or `Read/Write`. Shown as a coloured badge.
- **Uses** — `X / Y` where `Y` is the maximum uses you set and `X` is how many times the link has been used. A link with `X = Y` shows an **Exhausted** badge and the revoke button remains available.
- **Expiry** — the date the link stops working. An expired link shows an **Expired** badge; the revoke button is still available.

---

## Creating an Invite Link

Click **+ New** in the top-right corner of the page to open the Create modal.

### Fields

| Field | Required | Description |
|---|---|---|
| **Server** | Yes | Select one of your claimed servers from the dropdown. |
| **Library** | No | Select a specific library on that server, or leave as "All Libraries" to cover every library on the server. This dropdown populates after you select a server. |
| **Permission** | No | `Read` (default) or `Read/Write`. Read-only recipients cannot modify playlists or download media. |
| **Max Uses** | No | How many distinct people can accept this link. Default: `1`. Minimum: `1`, Maximum: `99`. |
| **Expires In** | No | How long the link works. Options: `7 days` (default), `30 days`, `90 days`, `1 year`, `Never`. After the selected period the link is automatically invalid. |

Click **Create** to generate the link. The new card appears at the top of the list. Click **Cancel** or click outside the modal to close it without creating a link.

---

## Sharing a Link

After creating a link:

1. Click **Copy URL** on the new card.
2. Send the URL to your recipient over any channel (email, message, etc.).

Your recipient does not need a hub account to receive the link — they create or sign in to one when they open it. After accepting, the shared server/library appears in their **"Shared with me"** section automatically.

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

**Symptom:** You select a server in the Create modal but the Library dropdown shows only "All Libraries" — no per-library options appear.

**Reason:** The Library dropdown is populated from the list of libraries you have shared from that server. If you have not shared any libraries yet, only "All Libraries" is available. Creating an invite link for a specific library requires you to have previously shared that library via the [Share with Friends](./share-with-friends.md) flow.

**Fix:** Either select "All Libraries" to cover the entire server, or share at least one library from that server first using the **Shares** page (`/app/shares`).

### 2. Invite link is accepted but the library does not appear

**Symptom:** The sender sees "Invite accepted" but the recipient does not see any shared content.

**Diagnosis:**
```bash
# On the hub, check the invite link redemption record:
# (requires hub admin access)
grep "invite-link-redeemed" .logs/hub-audit.log | tail -20
```

**Fix:** The library owner should verify that the library being shared has completed a media scan on the server. A library with no scanned content will appear empty even after being shared.

### 3. Link shows "Exhausted" immediately after creation

**Symptom:** A newly created link with `Max Uses: 1` shows `Uses: 1/1` and an "Exhausted" badge before anyone has clicked it.

**Reason:** The invite link was already redeemed once during creation (e.g., you tested it yourself). Each invite link can only be accepted once when `Max Uses` is `1`. Treat it as consumed.

**Fix:** Create a new link with a higher `Max Uses` if you need to share with more than one person.

### 4. Link recipient sees "Invalid or expired invite"

**Symptom:** The recipient clicks the link and gets an error message.

**Reasons:**
- The link was revoked by the sender.
- The link has reached its `Max Uses` limit (**Exhausted**).
- The link has passed its expiry date (**Expired**).

**Fix:** Ask the sender to create a fresh link with new settings.

---

## Next Steps

- [Share with Friends](./share-with-friends.md) — share specific libraries or folders with named hub users (requires them to have a hub account).
- [Claim your server to the hub](./claim-server.md) — connect a server to the hub before you can create invite links for it.
- [What is the Hub?](./what-is-the-hub.md) — overview of all hub features and account management.
