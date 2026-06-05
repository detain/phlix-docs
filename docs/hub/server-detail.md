# Server Detail

**Phase:** H.3 (End-User Documentation)
**Step:** H.3
**Since:** 0.19.0

## TL;DR

The server detail page shows everything about one of your claimed servers — basic info, the active relay session if there is one, and recent heartbeat history. Reach it by clicking **View Details** on any server card in **My Servers** (`/app/servers`). (The legacy detail route `/servers/{id}` still resolves directly.)

---

## The Server Detail Page

Open **My Servers** (`/app/servers`) from the hub's top navigation, then click **View Details** on the server card you want to inspect. (The underlying detail route is `/servers/{id}`, which still resolves directly.)

### Server Info Section

The top section always shows:

| Field | Description |
|---|---|
| **Server Name** | The name you gave the server when you claimed it. |
| **Version** | The running `phlix-server` version (e.g., `0.9.4`). |
| **Status** | `online` (green badge) or `offline` (grey badge). Derived from the last heartbeat timestamp — a server that has not reported in over 2 minutes is considered offline. |
| **Last Seen** | When the server last sent a heartbeat — shown as a relative time (e.g., "2 minutes ago") and as an absolute datetime on hover. |
| **Hostname Candidates** | Zero or more hostnames or IP addresses the server is advertising. These are the values the server reports as its possible network addresses. |

### Active Relay Session Card

If the server currently has an open relay tunnel, a card appears below the server info:

```
┌─ Active Relay Session ─────────────────────────────────────┐
│ Worker Node:  Worker#1                                      │
│ Opened:      2026-05-29 10:00 UTC (2h 14m ago)            │
│ Bytes In:    1.0 MB                                          │
│ Bytes Out:   5.0 MB                                          │
│ Last Frame:  2026-05-29 12:14 UTC (a moment ago)           │
└──────────────────────────────────────────────────────────────┘
```

If there is **no active relay session**, the card is replaced with a gentle empty state:

```
No active relay session.
The server is not currently relaying traffic.
```

### Heartbeat History

Below the relay session card, a **Heartbeat History** section shows the last 20 heartbeat reports the server has sent:

| Uptime | Active Sessions | Active Transcodes | Received At |
|---|---|---|---|
| 1d 2h 15m | 2 | 1 | 2026-05-29 12:00 UTC (4m ago) |
| 1d 2h 0m | 2 | 0 | 2026-05-29 11:45 UTC (19m ago) |
| 23h 45m | 1 | 1 | 2026-05-29 11:30 UTC (34m ago) |
| … | … | … | … |

- **Uptime** — how long the server's `phlix-server` process has been running, formatted as `Xd Xh Xm`.
- **Active Sessions** — the number of concurrent streaming sessions the server is handling right now.
- **Active Transcodes** — how many of those sessions are currently transcoding (e.g., converting a file to a different format or resolution).
- **Received At** — absolute timestamp of when the hub received this heartbeat; shown as relative time with absolute tooltip on hover.

The heartbeat history section is collapsible. Click **Show/Hide Heartbeat History** to expand or collapse it. It starts collapsed.

**No heartbeat history** is shown as:

```
No heartbeat history available.
The server has not sent any heartbeats yet.
```

### Back to My Servers

A **Back to My Servers** link at the top-left returns you to **My Servers** (`/app/servers`).

---

## View Details Button

Every server card on the **My Servers** page (`/app/servers`) has a **View Details** button:

```html
<a href="/servers/{server-id}" class="btn btn-small">View Details</a>
```

Clicking it navigates to `/servers/{id}` for that server.

---

## API Endpoint Consumed

The server detail page is a client-side-rendered shell. Once loaded, the page fetches data from:

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/me/servers/{id}` | `GET` | Returns full server detail: `server`, `relay_session`, and `heartbeat_history` (last 20 rows). |

**Request:** `Authorization: Bearer <jwt>` or the `phlix_hub_token` cookie.

**Response shape (200):**
```json
{
  "server": {
    "id": "uuid",
    "server_name": "My Server",
    "version": "0.9.4",
    "status": "online",
    "last_seen_at": 1748530800,
    "hostname_candidates": ["server.local", "192.168.1.100"],
    "relay_active": true
  },
  "relay_session": {
    "id": "uuid",
    "worker_node": "Worker#1",
    "opened_at": "2026-05-29T10:00:00Z",
    "bytes_in": 1048576,
    "bytes_out": 5242880,
    "last_frame_at": 1748534400
  },
  "heartbeat_history": [
    {
      "id": "uuid",
      "version": "0.9.4",
      "uptime_seconds": 86400,
      "active_sessions": 2,
      "active_transcodes": 1,
      "received_at": 1748534400
    }
  ]
}
```

**Errors:**

| Status | Reason |
|---|---|
| `401` | Not authenticated — redirected to `/login`. |
| `403` | Server exists but is not owned by your account. |
| `404` | Server ID not found. |

`relay_session` is `null` when the server has no active relay tunnel (not omitted from the response).

---

## What Can Go Wrong

### 1. Server not found (404)

**Symptom:** The server detail page shows an error instead of server data.

**Reason:** The server ID in the URL does not exist in the hub database.

**Fix:** Go back to **My Servers** and click **View Details** on a server you have claimed. If you were given a direct URL, verify it is correct.

### 2. Access denied (403)

**Symptom:** The server detail page shows "You do not have permission to view this server."

**Reason:** The server exists but is owned by a different hub account.

**Fix:** Only the hub account that claimed a server can view its detail page. Contact the owner if you need access.

### 3. Server shows as offline

**Symptom:** The status badge shows **offline** even though the server should be running.

**Diagnosis:**
1. Check the **Last Seen** timestamp — if it is more than 2 minutes ago, the server has stopped reporting heartbeats.
2. Check the server's own logs for crashes or network issues.
3. Check the **Heartbeat History** section — if entries have stopped arriving, the server process may have exited.

**Fix:** Restart `phlix-server` on the machine. Verify the server can reach the hub's public URL over HTTPS.

### 4. No heartbeat history visible

**Symptom:** The heartbeat history section shows the empty state.

**Reasons:**
- The server just connected and has not yet sent 20 heartbeats.
- The server is running an older version of `phlix-server` that does not send heartbeats.

**Fix:** Wait a few minutes for heartbeats to accumulate, or upgrade the server to a version that supports the heartbeat API (0.9.4+).

---

## Next Steps

- [Claim a Server](./claim-server.md) — how to add a server to your hub account.
- [Library Sharing](./library-sharing.md) — share library access with other hub users.
- [What is the Hub?](./what-is-the-hub.md) — overview of all hub features.
