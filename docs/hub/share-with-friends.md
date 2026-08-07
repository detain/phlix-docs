# Share Libraries with Friends and Family

## TL;DR

Hub sharing lets you grant access to your media library to friends and family
through the hub. Create an **invite link** on `/app/invite-links` and send it to
them. Recipients see your server under **Shared With Me** (`/app/shared-with-me`)
in their hub account without needing to install anything or be on the same network.

::: warning There is no email invite, and permissions are not enforced
phlix-hub has **no mailer of any kind** — it cannot send an invite email. Sharing
is link-based. And the two permission levels (`read`, `read/write`) are stored and
displayed but **not enforced** by any code path. Both are described accurately
below.
:::

---

## 1. How Hub Sharing Works

The sharing model is simple:

- **You** (library owner) create an invite link on `/app/invite-links`
- **Your friend** opens the link
- **Your friend** logs into the hub and sees your server under **Shared With Me**
  (`/app/shared-with-me`)
- **You** retain control — you can revoke at any time

### Two sharing scopes

Both are at library granularity. Folder-level and item-level sharing do not exist —
a share carries a single `library_id` and there is no sub-library plumbing at all.

| Scope | What the recipient sees |
|---|---|
| Whole server | Every library on that server — leave **Library** unset on the invite link |
| One library | Only the library you selected |

### Two permission levels

| Permission | Stored value |
|---|---|
| **Read only** | `read` (default) |
| **Read / Write** | `readwrite` |

::: danger The level is recorded, not enforced
Nothing consults `permission_level` before permitting an action — the hub's
`canWrite()` helpers have no production callers. There is also no download tier and
no DLNA tier: neither concept exists in the sharing model, and no permission gates
DLNA casting.
:::

---

## 2. Granting Access via the Hub Web App

1. Log into the hub at `https://hub.phlix.app` (or your self-hosted hub URL)
2. Open **Invite Links** (`/app/invite-links`) from the top navigation
3. Click **New Invite**
4. Choose the **server**, and optionally a **library** (leave unset to share every
   library on that server)
5. Select the permission level: **Read only** or **Read / Write**
6. Set **max uses** and an **expiry** (`7 days` default, `30 days`, `90 days`,
   `1 year`, `Never`)
7. Copy the generated URL and send it to your friend however you like

### Content filtering is not available per share

There is no "Restrict to G-rated content" option, and no rating filter of any kind
attaches to a hub share. Content-rating caps are a **media-server profile** feature
and have no wiring to hub sharing.

---

## 3. Granting Access

Library sharing is managed entirely from the **Shares** page (`/app/shares`) —
there is no server-side CLI for sharing. Grant, list, change, and revoke access
from the **Shares** page described in §2 above:

- **Grant** — create an invite link on `/app/invite-links` (see §2).
- **List** — the **Shares** page (`/app/shares`) lists every active share and its
  permission level.
- **Revoke** — click **Revoke** on the row; it takes effect immediately.
- **Change** — not available in the UI. Use `PATCH /api/v1/me/shares/{id}`.

Sharing state lives on the hub, not on the media server, so these actions are
only available through the hub web app.

---

## 4. Accepting a Share Invite

There is one method: the shareable link. (The hub cannot send email.)

1. Click the link — if you're not logged in, sign in or create a hub account
2. The shared library is immediately accessible under **Shared With Me**
   (`/app/shared-with-me`)

---

## 5. Managing Shared Access

As a library owner, you can manage all active shares from the **Shares** page (`/app/shares`):

- **View** all active shares and their permission levels
- **Revoke** access at any time (immediate effect)

Changing a permission level is API-only, and expiry is set on the **invite link**
rather than on an existing share.

As a recipient:

- Shared libraries appear under **Shared With Me** (`/app/shared-with-me`)
- You cannot re-share content you have been given access to
- Your access can be revoked by the library owner at any time

---

## 6. What Can Go Wrong

### 1. An invite link is not tied to an email address

::: danger Treat an invite link as a bearer token
Earlier revisions of this page said the invite "is tied to the exact email address
it was sent to". **The opposite is true.** Redeeming a link creates the share for
**whoever redeems it**, using their own account email. A link is bounded only by its
**max uses** and its **expiry** — not by identity.

Anyone who obtains the URL, by forwarding or interception, can redeem it. Send links
over a channel you trust, set a low max-use count, and keep the expiry short.
:::

**Symptom:** Someone other than the intended recipient now has access.

**Fix:** Revoke the share on `/app/shares`, and delete or expire the invite link so
it cannot be redeemed again.

---

### 2. Shared library appears empty or doesn't appear

**Symptom:** Friend accepts the invite and logs in, but the shared server shows no libraries or an empty library.

**Diagnosis:**
```bash
# On the server, check library status via the API:
curl -s http://localhost:8096/api/v1/libraries -H "Authorization: Bearer $TOKEN"

# Check if a scan is currently running:
ps aux | grep -i "media_scanner\|phlix" | grep -v grep

# Manually trigger a rescan of a library (use the library id from the call above):
curl -X POST http://localhost:8096/api/v1/libraries/{id}/rescan \
  -H "Authorization: Bearer $TOKEN"
```

**Fix:** Library sharing requires the library scan to be complete. If a scan is still in progress, wait for it to finish. If no scan is running, trigger one manually. The friend should refresh the hub page after the scan completes and verify the library contents.

---

### 3. Cannot cast to DLNA

**Symptom:** Friend logs in, browses the shared library, but pressing **Cast** or **Play To** on a DLNA device does nothing or shows an error.

**This is not a permissions problem.** No share permission gates DLNA casting —
there is no download or cast tier, and `permission_level` is not enforced anywhere.
Raising the permission level will not change the outcome. Investigate the DLNA
setup on the media server instead; see [DLNA](/advanced/dlna).

---

## 7. Next Steps

- [Claim your server to the hub](./claim-server.md) — connect your server to the hub before you can share libraries
- [Hub: what is the hub?](./what-is-the-hub.md) — overview of all hub features and account management
- [Self-host the hub](./self-host-the-hub.md) — run your own hub instance for full control
- [Troubleshooting](../troubleshooting.md) — if sharing issues persist after trying the fixes above
