# Share Libraries with Friends and Family

## TL;DR

Hub sharing lets you grant access to your media library to friends and family through the hub. Open the **Shares** page (`/app/shares`) → choose what to share → invite by email or link. Recipients see your server under **"Shared with me"** on the same **Shares** page in their hub account without needing to install anything or be on the same network. Permissions are configurable from view-only to full playback with optional download access.

---

## 1. How Hub Sharing Works

The sharing model is simple:

- **You** (library owner) grant access from the **Shares** page (`/app/shares`)
- **Your friend** receives an invite by email or a shareable link
- **Your friend** logs into the hub and sees your server under **"Shared with me"** on the **Shares** page
- **You** retain full control — revoke or change permissions at any time

### Three sharing scopes

| Scope | What the recipient sees |
|---|---|
| Entire library | All items in the selected library |
| Specific folders | Only the folders you chose (e.g., `Movies/Classics`) |
| Specific media items | Only the individual items you selected |

### Three permission levels

| Permission | Browse | Play | Cast / DLNA | Download |
|---|---|---|---|---|
| **View only** | ✅ | ❌ | ❌ | ❌ |
| **View + Playback** | ✅ | ✅ | ❌ | ❌ |
| **View + Playback + Download** | ✅ | ✅ | ✅ | ✅ |

> **Note:** DLNA casting requires the `View + Playback + Download` permission — the download component enables the stream to be redirected to a DLNA renderer.

---

## 2. Granting Access via the Hub Web App

1. Log into the hub at `https://hub.phlix.app` (or your self-hosted hub URL)
2. Open the **Shares** page (`/app/shares`) from the top navigation
3. Click **Share Library**
4. Choose what to share (entire library, specific folders, or specific items)
5. Select the permission level: **View only** / **View + Playback** / **View + Playback + Download**
6. Choose invite method:
   - **Email** — enter the recipient's address; optionally set an expiry date
   - **Shareable link** — generates a direct link anyone can use
7. Click **Send Invite**

### Per-profile sharing (content filtering)

You can restrict shared content to G-rated media for certain recipients. This uses the same rating filter system as user profiles. When granting access, enable **"Restrict to G-rated content"** — the recipient will only see media approved for general audiences in that shared library, regardless of the actual library contents.

---

## 3. Granting Access

Library sharing is managed entirely from the **Shares** page (`/app/shares`) —
there is no server-side CLI for sharing. Grant, list, change, and revoke access
from the **Shares** page described in §2 above:

- **Grant** — click **Share Library**, choose the library/folder/item, pick a
  permission level (**View only** / **View + Playback** / **View + Playback +
  Download**, the last of which enables DLNA casting), and send the invite.
- **List** — the **Shares** page lists every active share and its permission level.
- **Change / Revoke** — adjust the permission level or revoke access inline;
  revocation takes effect immediately.

Sharing state lives on the hub, not on the media server, so these actions are
only available through the hub web app.

---

## 4. Accepting a Share Invite

### Via email invite

1. Open the invite email (check **spam** if it doesn't arrive within a few minutes)
2. Click **Accept Invite** — if you don't have a hub account yet, create one first
3. Log into the hub — the shared server appears under **"Shared with me"** in your dashboard
4. Select the shared server to browse and play the library

### Via shareable link

1. Click the link — if you're not logged in, sign in or create a hub account
2. The shared library is immediately accessible under **"Shared with me"**

---

## 5. Managing Shared Access

As a library owner, you can manage all active shares from the **Shares** page (`/app/shares`):

- **View** all active shares and their permission levels
- **Change** a permission level for an existing share
- **Revoke** access at any time (immediate effect)
- **Set an expiry** on email invites — after the expiry date the link becomes invalid

As a recipient:

- Shared libraries appear under **"Shared with me"** on the **Shares** page
- You cannot re-share content you have been given access to
- Your access can be revoked by the library owner at any time

---

## 6. What Can Go Wrong

### 1. Friend doesn't receive the invite email

**Symptom:** The sender sees "Invite sent" but the recipient cannot find the email.

**Diagnosis:**
```bash
# Check the hub audit log for invite events:
grep "share_invite_sent" .logs/hub-audit.log | tail -20

# Verify the email address — the most common cause is a typo
```

**Fix:** Ask the recipient to check their spam/junk folder. If still not found, re-send the invite with a verified email address. For enterprise users, ask their mail admin to allow-list `noreply@phlix.app`.

---

### 2. Friend creates an account with a different email than invited

**Symptom:** The invite link is clicked but the library doesn't appear under "Shared with me" after login.

**Diagnosis:**
```bash
# Check the hub audit log for invite acceptance:
grep "share_invite_accepted" .logs/hub-audit.log | tail -10
# The log shows the invited email vs. the accepting account email
```

**Fix:** The invite is tied to the exact email address it was sent to. The friend must use the same email address that received the invite, or the library owner must grant access afresh to the friend's actual email address via the dashboard or CLI.

---

### 3. Shared library appears empty or doesn't appear

**Symptom:** Friend accepts the invite and logs in, but the shared server shows no libraries or an empty library.

**Diagnosis:**
```bash
# On the server, check library status via the API:
curl -s http://localhost:32400/api/v1/libraries -H "Authorization: Bearer $TOKEN"

# Check if a scan is currently running:
ps aux | grep -i "media_scanner\|phlix" | grep -v grep

# Manually trigger a rescan of a library (use the library id from the call above):
curl -X POST http://localhost:32400/api/v1/libraries/{id}/rescan \
  -H "Authorization: Bearer $TOKEN"
```

**Fix:** Library sharing requires the library scan to be complete. If a scan is still in progress, wait for it to finish. If no scan is running, trigger one manually. The friend should refresh the hub page after the scan completes and verify the library contents.

---

### 4. View-only user cannot cast to DLNA

**Symptom:** Friend logs in, browses the shared library, but pressing **Cast** or **Play To** on a DLNA device does nothing or shows an error.

**Diagnosis:**
Check the current permission level on the share from the hub's **Shares** page
(`/app/shares`) — it lists each share and its permission level.

**Fix:** DLNA casting requires `View + Playback + Download` permission. Ask the
library owner to upgrade your permission level from the hub's **Shares** page
(`/app/shares`) — change the share's permission to **"View + Playback +
Download"**.

---

## 7. Next Steps

- [Claim your server to the hub](./claim-server.md) — connect your server to the hub before you can share libraries
- [Hub: what is the hub?](./what-is-the-hub.md) — overview of all hub features and account management
- [Self-host the hub](./self-host-the-hub.md) — run your own hub instance for full control
- [Troubleshooting](../troubleshooting.md) — if sharing issues persist after trying the fixes above
