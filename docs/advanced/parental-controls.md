# Parental & Session Controls

**Since:** 0.16.0

## TL;DR

Phlix provides three per-profile controls: **Access Schedules** are blackout windows that refuse requests during a matching period, **Tag Blocking** filters items out of library queries, and **Stream Limits** cap concurrent streams per profile. They are three separate mechanisms at three different layers — they do **not** compose into a single chain, and they do not all run on every request. See [Combining controls](#_4-combining-controls).

---

## 1. Access Schedules

### Access Schedules Overview

Access schedules define recurring time windows during which a **profile is blocked**. Inside a matching window, **every** authenticated API request that reaches the router is refused with `403` — the check is a global middleware, not a playback-only gate. Outside every window, access is allowed.

::: warning Schedules are blackout windows, not permit windows
This is the opposite of how the rest of this section previously described them, and the distinction is load-bearing: a profile with **no** schedules is **unrestricted**, and access is allowed whenever no schedule matches. `AccessScheduleService::isAccessAllowed()` returns true when no active schedule matches the current day and time, so schedules can only ever take access away. Do not rely on "add one allow-window to lock everything else down" — that is not what the implementation does.
:::

### Use Cases

- Bedtime cutoffs for children (e.g., no streaming after 9 PM on school nights)
- Household bandwidth management during peak hours
- Content-free periods (e.g., no streaming during homework hours)

### Configuring Access Schedules

Schedules are configured on the Parental Controls page, `/app/parental?profile=<id>`, under the **Schedules** tab. It is not admin-only: each handler checks `ProfileAccessPolicy::canManageProfile()`, which permits your own profile or a server admin.

Each schedule consists of:

| Field | Description |
|-------|-------------|
| **Name** | Label for the schedule |
| **Days** | Monday–Sunday checkboxes |
| **Start Time** | When the blackout begins (e.g., 22:00) |
| **End Time** | When the blackout ends (e.g., 07:00) |
| **Active** | Whether the schedule is evaluated at all |

There is **no** timezone field — schedules are evaluated against the server's local
wall-clock time, with no conversion. There is **no** group targeting: a schedule
attaches to exactly one profile. And there is **no** allow/deny action — see below.

Multiple schedules stack as a union; each one can only take access away.

### Schedule Priority

Schedules carry no allow/deny action — every schedule is a block window, and they stack as a union:

1. The first **active** schedule matching the current day and time refuses the request; the rest are not consulted
2. Overnight ranges (for example 22:00–06:00) are supported
3. If no schedule matches (including a profile with no schedules at all), access is **allowed** — the check fails open by design. It is not a deny-by-default gate.

### API Behavior

A request made inside a blackout window receives `403`:

```json
{ "error": "AccessScheduled", "message": "Access denied during scheduled window" }
```

Two sibling `403`s share the same `error` value with different messages:
`"No profile found; access denied"` and `"Profile not found; access denied"`.

The body is flat — there is no nested `error` object, no `code` field and **no
`next_available` timestamp**. Clients cannot tell the user when access resumes.

---

## 2. Tag Blocking

### Tag Blocking Overview

Tag blocking removes items carrying particular metadata tags from library query results for a profile. It is a **row filter, not a playback gate** — it never refuses a stream.

### Tags are free text — there is no built-in vocabulary

Phlix ships **no** predefined tag categories. `profile_tags.tag` is a free-text
`VARCHAR(100)` with no seed data, no enum and no catalog. A tag matches only when
the identical string appears in the item's `metadata.tags` array.

That is also the only source consulted: the matcher reads `metadata.tags` and
nothing else. **Genre and content rating are never looked at** — content-rating
caps are a separate profile feature, not part of tag blocking.

### Blocked and allowed tags

There is one store, not an admin tier plus a user tier. Each row is a
`(profile_id, tag, tag_type)` triple where `tag_type` is `blocked` or `allowed`,
managed on `/app/parental?profile=<id>` under the **Tags** tab.

⚠ The `allowed` list is **subtractive, not additive**: as soon as a profile has any
`allowed` tag, an item carrying none of them is dropped. An allow-list is therefore
far more restrictive than it looks.

### Tag Inheritance

Filtering is applied inside `ItemRepository`, so it reaches only the surfaces that
go through a library query:

- **Filtered** — rows served by `ItemRepository::query()`, single-item lookups
  (`findById`, `findByIds`), DLNA browse, and similar-items.
- **NOT filtered** — **Continue Watching** and **Next Up**. They are built from
  playback state rather than a library query and never touch `ItemRepository`;
  only the profile rating cap is applied to them.
- **NOT filtered** — **Search**. It applies the rating gate only. There is also no
  "Some results hidden due to your content preferences" notice anywhere in the
  product.
- **NOT blocked** — **direct playback**. Tag blocking never denies a stream. What
  does deny direct play is the profile **rating** cap, which returns `404`.

⚠ The filter also depends on a profile id being set on the request context, and the
only thing that sets it is the access-schedule middleware. On any path that skips
the router — direct play among them — tag filtering is inert.

---

## 3. Stream Limits

### Stream Limits Overview

Stream limits cap the number of simultaneous active streams **per profile**. This prevents a single profile from being shared beyond its intended number of simultaneous viewers.

### Per-profile limits

There are no plans, tiers or subscriptions in Phlix, and no household or family
budget. The cap is a single integer per profile,
`profile_stream_limits.max_concurrent_streams`, set through
`PUT /api/v1/profiles/{profileId}/stream-limits`.

No row is created when a profile is created — the only writer is the admin API — so
a profile nobody has configured falls back to the server-wide
`access.default_concurrent_streams` setting, which ships as **1** and is clamped to
1–100. In practice **1** is the live cap for almost every profile.

(`max_total_bandwidth_kbps` is stored and returned by the API but no enforcement
path reads it. Do not rely on it.)

### Where the cap is enforced

It is applied on the `/hls/`, `/dash/` and `/livetv/*` router group, and inline on
direct play. It is **skipped** when no session or device id can be resolved, and
for signed-URL direct play.

### When a Limit Is Reached

When a user attempts to start a stream that would exceed their limit:

The response is `429`:

```json
{
  "error": "StreamLimitExceeded",
  "denial_type": "stream_limit_exceeded",
  "message": "Maximum concurrent streams reached for this profile",
  "profile_id": "..."
}
```

A sibling `403` carries `"denial_type": "profile_not_found"`.

The body is flat and **does not include the active-stream list**. A client that
wants to prompt "which stream should I stop?" must call
`GET /api/v1/profiles/{profileId}/active-streams` separately, which returns
`{ active_streams, count }`.

### Transcoding and Stream Slots

Every session consumes one slot, whether it transcodes or direct-plays. The
`stream_type` column has `transcode` and `relay` members but only `direct` is ever
written, so the two are indistinguishable.

⚠ **Slots are reclaimed on a timeout, not when playback stops.** The streaming path
has no stream-end signal: a session row is cleared once its last heartbeat is more
than 60 seconds old. Stopping a stream therefore does not free its slot
immediately, and with a default cap of 1 a viewer can be locked out of their own
next title for up to a minute.

---

## 4. Combining Controls

::: danger They do not compose into a chain, and they do not all run
The pipeline drawn in earlier revisions of this page does not exist.

- **HLS / DASH / DVR** (`/hls/*`, `/dash/*`, `/livetv/*`) go through the router:
  signed-URL check, then the global access-schedule middleware (`403`), then the
  stream-limit middleware (`429`).
- **Direct play** (`GET /media/{id}/stream`) is served **before the router**, so
  **no access-schedule check applies to it at all**. A profile inside a blackout
  window can still direct-play. It does enforce auth inline, the concurrent-stream
  cap inline (session-authenticated requests only — signed-URL access skips it),
  and the profile rating cap, which returns `404` for an over-cap item.
- **Tag blocking is not a playback gate** in either path. It is a row filter inside
  `ItemRepository` and never blocks a stream.

If you need a hard bedtime cutoff, the access schedule does not deliver one on the
direct-play path.
:::

---

## Related Pages

- [User Management](/admin/user-management) — Creating users and profiles
- [Server Settings](/admin/server-settings) — Global playback restrictions
- [Security Hardening](/security/hardening) — Additional server hardening steps
