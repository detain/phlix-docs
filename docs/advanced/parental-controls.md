# Parental & Session Controls

**Since:** 0.16.0

## TL;DR

Phlix provides three layers of household control: **Access Schedules** restrict when users can stream, **Tag Blocking** prevents specific content categories from appearing, and **Stream Limits** cap concurrent streams per user or household.

---

## 1. Access Schedules

### Overview

Access schedules define time windows during which a user (or user group) is allowed to stream. Outside of permitted hours, playback requests are denied with an appropriate error message.

### Use Cases

- Bedtime cutoffs for children (e.g., no streaming after 9 PM on school nights)
- Household bandwidth management during peak hours
- Content-free periods (e.g., no streaming during homework hours)

### Configuring Access Schedules

Admins configure schedules in **Admin → Users → [select user] → Access Schedule**.

Each schedule consists of:

| Field | Description |
|-------|-------------|
| **Days** | Monday–Sunday checkboxes |
| **Start Time** | When access begins (e.g., 07:00) |
| **End Time** | When access ends (e.g., 22:00) |
| **Timezone** | The timezone the schedule is evaluated in |
| **Applies To** | Individual user or user group |
| **Action** | `allow` or `deny` (deny takes precedence) |

Multiple schedules can be stacked — a deny schedule overrides an allow schedule for the same user.

### Schedule Priority

When multiple schedules conflict, the most restrictive rule wins:

1. Explicit `deny` schedules always take precedence
2. Within the same action type, the most recently modified schedule wins
3. If no schedule matches (e.g., no schedule for a given day), access is **denied by default**

### API Behavior

Playback requests made outside permitted hours receive:

```json
{
  "error": {
    "code": "ACCESS_SCHEDULED_DENIED",
    "message": "Streaming is not permitted during this time window.",
    "next_available": "2026-07-09T07:00:00Z"
  }
}
```

Clients should display the `next_available` timestamp to inform users when access resumes.

---

## 2. Tag Blocking

### Overview

Tag blocking prevents content with specific metadata tags from appearing in search results, Explore, recommendations, or being played by users who are blocked from seeing that content.

### Predefined Tag Categories

Phlix ships with blocking-friendly tag categories covering common parental concern areas:

| Category | Tags Blocked |
|----------|--------------|
| **Violence** | `graphic-violence`, `gore`, `self-harm` |
| **Adult Content** | `nudity`, `sexual-content`, `adult-animation` |
| **Language** | `strong-language`, `profanity` |
| **Substance Abuse** | `drug-use`, `alcohol`, `tobacco` |
| **Fear-Inducing** | `horror`, `jump-scares` |
| **Thematic** | `war`, `political`, `religious` |

### Custom Tag Blocking

Admins can also define custom tag rules. Tags come from the media's genre, content rating, and custom metadata fields. Tag rules are configured in **Admin → Security → Content Blocking**.

### Per-User Tag Blocking

Users can set their own tag preferences in **Settings → Content Preferences → Block Tags**. User-level blocking is additive to — never subtractive from — admin-level blocking.

### Tag Inheritance

When tag blocking is active for a user, all related surfaces are filtered:
- **Home screen rows** — Items with blocked tags are removed from all discovery rows
- **Search** — Results are filtered; a note says "Some results hidden due to your content preferences"
- **Direct playback URL** — If a blocked item is requested via direct URL, playback is denied

---

## 3. Stream Limits

### Overview

Stream limits cap the number of simultaneous active streams per user or per household. This prevents a single account from being shared beyond its intended number of simultaneous viewers.

### Plan-Based Limits

Stream limits are typically tied to subscription tiers:

| Plan | Concurrent Streams |
|------|-------------------|
| Individual | 1 |
| Starter | 2 |
| Family | 4 |
| Premium | 6 |

Limits are enforced server-side on every playback initiation request.

### Household vs. Global Limits

- **Per-user limits** — A single user cannot start more than N streams simultaneously
- **Household limits** — All users sharing the same household/family account share a total stream budget

### When a Limit Is Reached

When a user attempts to start a stream that would exceed their limit:

```json
{
  "error": {
    "code": "STREAM_LIMIT_REACHED",
    "message": "Your plan allows {n} simultaneous streams. Please stop another stream before starting a new one.",
    "active_streams": [
      { "media_id": "abc123", "started_at": "2026-07-09T20:00:00Z", "device": "Living Room TV" }
    ]
  }
}
```

Clients can use `active_streams` to prompt the user to pick which stream to stop.

### Transcoding and Stream Slots

Each transcode job (resolution conversion, HDR tone-mapping) consumes a stream slot. Direct play (no transcoding) also consumes a slot because it represents an active viewing session. Only idle (stopped or completed) streams are excluded from the count.

---

## 4. Combining Controls

All three control layers are evaluated together on every playback request:

```
Request → Access Schedule check → Tag Blocking check → Stream Limit check → Allow
```

If any check denies the request, playback is blocked with the corresponding error code. The order of checks is: schedule first, then tags, then stream limits.

---

## Related Pages

- [User Management](/admin/user-management) — Creating users and assigning plans
- [Server Settings](/admin/server-settings) — Global playback restrictions
- [Security Hardening](/security/hardening) — Additional server hardening steps
