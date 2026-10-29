# Parental & Session Controls

**Since:** 0.16.0

## TL;DR

Every profile on your server can have three kinds of guardrails:

1. **Access schedules** — time windows when a profile is *locked out* of the server
   (think bedtime).
2. **Tag blocking** — hiding items you've tagged (think "gory", "spoilers") from that
   profile's library browsing.
3. **Stream limits** — capping how many things one profile can have going at once.

They are three independent tools, and each has real limits you should know before you
rely on it. Read [What they can't do](#_4-what-they-can-t-do) before bedtime-shaming anyone.

Everything below is set per profile on the **Parental Controls** page. Two honest quirks:
no menu links to it yet — you open it by typing the address
`http(s)://your-server/app/parental?profile=<id>` — and the `<id>` (the profile's
internal identifier) isn't shown anywhere in the app either. You can read it from your
browser's developer tools while the Profiles page loads, from the server's API, or from
the database. You don't have to be an admin to manage your *own* profile's controls; an
admin can manage anyone's.

---

## 1. Access Schedules (bedtime windows)

### How they work

You add a window — days of the week, a start time, an end time, plus an **Active**
switch so you can park a rule without deleting it. While the clock is inside a matching
window, that profile is blocked: the server refuses *every* request it makes, not just
video — so browsing the library is blocked too, which is usually what you want at 9pm.

Multiple windows simply stack: any one matching window locks the profile out.

::: warning These are "no-watch" windows, not "allowed" windows
A schedule only ever **takes access away**. A profile with no schedules can watch
whenever it likes, and if none of its schedules match the current moment, it can watch
then too. If you want "only allowed 4–6pm on Tuesdays", you'd have to build it out of
everything-but windows — the feature has no "allow only during" mode.
:::

::: warning And if the schedule can't be read, access stays allowed
If the server hits a quiet database hiccup while looking up a profile's schedules, the
lookup comes back empty and the request is treated as "no schedule applies" — allowed.
Think of a curfew as a firm reminder the server enforces when it can see the rulebook,
not a deadbolt. (If the database connection is fully dead, requests fail loudly instead
— you won't get silent streaming through a broken server.)
:::

### Setting one up

| Field | What it means |
|-------|---------------|
| **Name** | A label to remember it by ("School nights") |
| **Days** | Which days the window applies (Mon–Sun checkboxes) |
| **Start Time** | When the lockout begins (e.g. 22:00) |
| **End Time** | When it lifts (e.g. 07:00 — an end before the start means it runs past midnight) |
| **Active** | Switch the rule on or off |

Two honest footnotes: there is **no timezone setting** — windows are read against the
server's own clock, so if the server lives in another timezone, do the math yourself.
And schedules attach to exactly one profile; there's no "all the kids" group to aim at.

### What a locked-out person sees

An error like "Access denied during scheduled window" — that's it. The message does not
include *when* access comes back, so apps can't kindly say "unlocks at 7am". If your
child asks, they just have to wait for the window to end.

---

## 2. Tag Blocking (hiding labeled items)

### How it works

Phlix stores free-text tags in each item's metadata. You type a tag into the profile's
**Tags** tab and mark it **Blocked** (hide it) or **Allowed** (see the warning below),
and items carrying that exact tag disappear from that profile's library pages.

There is **no built-in list of tags** — nothing ships pre-tagged, and there's no menu
of categories to pick from. A tag only matches when the identical word appears in the
item's tags. That means tag blocking is only as good as your tagging: until items
actually carry the tags, blocking them hides nothing.

Genre and age rating are **not** tags and are never consulted here — the profile's
content-rating cap is a separate feature that works separately.

::: warning The "Allowed" list is a trap for the unwary
Marking tags as *Allowed* doesn't whitelist them — it hides **everything that isn't on
the list**. The moment a profile has even one allowed tag, any item without one of those
tags vanishes from its browsing. It's a "menu-only" mode. If your goal is "hide the bad
stuff but let the rest stand", use **Blocked**, not Allowed.
:::

### Where tag blocking reaches — and where it doesn't

Tag blocking is a **hiding rule for library listings**, not a wall. Concretely:

- **Hidden** — the library browse pages, item detail lookups, DLNA browsing, and
  "more like this".
- **NOT hidden** — **Continue Watching**, **Next Up**, and **Search**. Those surfaces
  apply only the rating cap, never tags. A half-watched blocked show keeps staring at
  the profile from the home row until it's finished or removed from history.
- **NOT blocked** — playback itself. Nothing about tag blocking stops a stream from
  starting if someone has the link or the item somehow opens. (What *does* refuse a
  too-old title at play time is the rating cap — that returns a "not found".)

---

## 3. Stream Limits (how many at once)

### How it works

You set one number: how many streams this profile may have active simultaneously.
Try to start one more and the server says no. Phlix has no household-wide budget and no
plan tiers — it's strictly per profile.

If you never touch the setting, the server-wide default applies, and that **ships as 1**.
One stream per profile, everywhere, until you raise it (the allowed range is 1–100).

::: warning Two gotchas worth knowing
1. **Stopping a stream doesn't free the slot instantly.** The server considers a stream
   finished when its last heartbeat is more than 60 seconds old — so with the default
   cap of 1, turning off one show and immediately starting another can bounce. About a
   minute's patience is the workaround.
2. **A "max bandwidth" field exists in the API but does nothing.** The screen may show
   it; no code enforces it. Don't count on it.
:::

When the cap is hit, the person sees "Maximum concurrent streams reached for this
profile". The error doesn't list *which* streams are hogging the slots; the app can look
that up separately, but don't assume every client will.

---

## 4. What they can't do

It's important to go in with clear eyes — these controls are useful speed bumps, not a
fortress:

- **The bedtime window has a back door.** Direct playback of a file (the stream URL
  path most in-app "play" buttons use for compatible files) does not consult the access
  schedule at all — it's handled on a faster path that skips that check. A locked-out
  profile can finish a video that was already direct-playing when the window began.
  The stream-limit and rating checks *do* run there; the schedule does not. If you need
  a hard cutoff, the honest answer is: you can't get one from this feature alone.
- **Nothing here is adversarial.** A kid who can edit the profile's controls (and each
  profile can manage its own) can undo all of it. These guardrails are for households
  where the grown-up controls the admin account.
- **Fail-open by design.** If the server can't match a rule to something — no schedule
  matches the moment, no tag on the item — the answer is *allow*, not *block*. Rules
  only ever subtract access; the absence of a rule never does.
- **The three controls don't run in one chain.** A request may be checked by any subset
  of them depending on which door it came in (streaming endpoint, library query, or
  direct file). The sections above say which applies where.

---

## Related Pages

- [User Management](/admin/user-management) — creating users and profiles
- [Server Settings](/admin/server-settings) — the global defaults behind these switches
- [Security Hardening](/security/hardening) — additional server hardening steps

---

## For developers — how the above maps to code

| Behavior | Implementation |
|----------|----------------|
| Schedule check | Global router middleware calling `AccessScheduleService::isAccessAllowed()`; no matching active window ⇒ allowed (fail-open). Overnight ranges supported. 403 body is flat: `{"error":"AccessScheduled","message":"Access denied during scheduled window"}` — no `next_available` field; sibling 403s reuse the error for missing/no profile. |
| Direct-play bypass | `GET /media/{id}/stream` is served before the router: schedule middleware never runs there; auth, stream-limit (session-auth only; signed URLs skip it) and the rating cap (`404`) run inline. |
| Tag filtering | Row filter inside `ItemRepository` (`query`, `findById`, `findByIds`); driven by `profile_tags.tag` — free-text `VARCHAR(100)`, matched exactly against `metadata.tags`. `allowed`-typed rows apply a subtractive filter. Depends on a profile id being present on the request context, which only the access-schedule middleware sets — so it is inert on non-router paths. Continue Watching / Next Up / Search never pass through it (rating gate only). |
| Stream cap | `profile_stream_limits.max_concurrent_streams`, written via `PUT /api/v1/profiles/{id}/stream-limits`; unset profiles fall back to `access.default_concurrent_streams` (default **1**, clamped 1–100). Enforced on the `/hls/`, `/dash/`, `/livetv/*` router group and inline on direct play; skipped when no session/device id resolves or for signed URLs. 429 `{"error":"StreamLimitExceeded","denial_type":"stream_limit_exceeded",…}` (flat, no active list); `GET /api/v1/profiles/{id}/active-streams` → `{active_streams,count}`. Sessions are reclaimed on a 60-second heartbeat timeout (30 s heartbeat interval) — there is no stream-end signal. A request with NO device identifier at all (no `X-Device-ID` header and no User-Agent) passes through uncounted; a missing session id does not — it falls into a synthetic (profile, device) bucket (M-3). A user with no resolvable profile is refused with a named `profile_not_found` 403, not skipped. Signed URLs skip the cap entirely (the signature is the control). `max_total_bandwidth_kbps` is stored and echoed but never enforced. |
| Who may manage a profile's controls | `ProfileAccessPolicy::canManageProfile()` — own profile or server admin. |
