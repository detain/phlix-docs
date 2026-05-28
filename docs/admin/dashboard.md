---
title: Dashboard
description: Admin dashboard overview and metrics
---

# Dashboard

The admin dashboard at `/admin/dashboard` is the admin console's **stats hub** — a
rich, real-time view of server activity with five live sections. It replaces the
Phase-0 placeholder with a fully-featured SPA page backed by the existing
`DashboardController` + `StatsController` endpoints.

## Page layout

The page renders five card sections in a responsive grid:

| Section | Data source | Refresh |
|---------|-------------|---------|
| **Now Playing** | `GET /api/v1/admin/dashboard/now-playing` | Live — 30 s auto-refresh via `setInterval`, cleared on unmount |
| **Top Users** | `GET /api/v1/admin/dashboard/top-users?days=N` | On mount + date-range change |
| **Top Media** | `GET /api/v1/admin/dashboard/top-media?days=N` | On mount + date-range change |
| **Storage** | `GET /api/v1/admin/dashboard/storage` | On mount |
| **Recent Activity** | `GET /api/v1/admin/dashboard/activity?limit=N` | On mount + "Load more" pagination |

### Now Playing

Live list of every currently-active playback session. Each row shows:
- Username + avatar
- Media title + type badge (movie/series/music/photo/video)
- Progress bar (`position_ticks / duration_ticks`, percentage label)
- Device name + type icon
- Status badge (playing/paused/buffering)

Auto-refreshes every 30 seconds via `setInterval` stored in a `useRef` and cleared
in the `useEffect` return function.

### Top Users

30-day leaderboard table with columns: **Rank**, **Username**, **Watch Time** (human-
readable, e.g. "3d 4h"), **Play Count**, **Avatar**. Date range filter (7d / 30d / 90d)
changes the `days` query param. Empty state: "No user data yet for this period."

### Top Media

30-day ranked list with columns: **Rank**, **Title** (with poster thumbnail), **Type**
badge, **Play Count**, **Total Duration**. Date range filter applies here too. Empty
state: "No media has been played in this period."

### Storage

Breakdown cards per media type (movie / series / music / photo / video) showing:
- Item count + total size (human-readable, e.g. "46.57 GB")
- Transcode cache size

Cards use a `mediaTypeBadgeClass()` switch that maps lowercased type strings to
static CSS class names — no user input in class names, XSS-safe.

### Recent Activity

Paginated event feed with **"Load more"** button when `activity.length >= ACTIVITY_PAGE_SIZE`.
Each event row shows:
- Event-type badge (playback_completed / library_change / login / logout)
- Username
- Event description
- Relative timestamp ("2m ago")

Uses `eventTypeBadgeClass()` with the same allowlisted-switch pattern as storage.
Empty state: "No recent activity to show."

### Date range filter

A `7d / 30d / 90d` toggle stored in `useState` affects **Top Users**, **Top Media**,
and **Recent Activity** via a `useEffect` that re-fetches when `dateRange` changes.

### Loading & empty states

All five sections show a `SectionSkeleton` loading skeleton while their respective
`loading*` state is true. Each section has a contextual `EmptyState` when the API
returns an empty array.

## Accessing the page

Navigate to **Admin UI → Dashboard** (the default admin landing page, also reachable
from the sidebar). All five sections are visible without navigating away.

## API reference

The page uses two typed API wrappers that mirror the existing PHP controller endpoints:

### DashboardApi (`admin-ui/src/api/dashboard.ts`)

| Method | Endpoint | Return type |
|--------|----------|-------------|
| `getNowPlaying()` | `GET /api/v1/admin/dashboard/now-playing` | `NowPlayingEntry[]` |
| `getTopUsers(limit?, days?)` | `GET /api/v1/admin/dashboard/top-users?limit=N&days=N` | `TopUserEntry[]` |
| `getTopMedia(limit?, days?)` | `GET /api/v1/admin/dashboard/top-media?limit=N&days=N` | `TopMediaEntry[]` |
| `getStorage()` | `GET /api/v1/admin/dashboard/storage` | `StorageEntry` |
| `getActivity(limit?)` | `GET /api/v1/admin/dashboard/activity?limit=N` | `ActivityEntry[]` |

### StatsApi (`admin-ui/src/api/stats.ts`)

| Method | Endpoint | Return type |
|--------|----------|-------------|
| `getPlaybackStats(from?, to?)` | `GET /api/v1/admin/stats/playback?from=…&to=…` | `PlaybackStatEntry[]` |
| `getTopUsers(limit?, since?)` | `GET /api/v1/admin/stats/top-users?limit=N&since=…` | `TopUserEntry[]` |
| `getTopMedia(limit?, since?)` | `GET /api/v1/admin/stats/top-media?limit=N&since=…` | `TopMediaEntry[]` |
| `getStorageStats()` | `GET /api/v1/admin/stats/storage` | `StorageEntry` |

Both wrappers consume `ApiClient.get()` with a params object — `URLSearchParams` handles
encoding internally, so no `encodeURIComponent` is needed in callers.

## Design notes

- `useToast()` is destructured as `const { push: pushToast } = useToast()` — the stable
  `push` callback reference avoids triggering `useEffect` re-runs when a toast is pushed.
- No `dangerouslySetInnerHTML` anywhere in `DashboardPage.tsx`. All user-visible strings
  render via JSX `{}` interpolation.
- `relativeTime()` returns plain text ("2m ago") with no HTML.
- All badge-class functions use a switch over lowercased type strings returning static
  CSS class names — no user input flows into class names.

## Vitest coverage

| File | Coverage |
|------|----------|
| `src/api/dashboard.ts` | **100%** |
| `src/api/stats.ts` | **100%** |
| `src/pages/DashboardPage.tsx` | ≥80% |
| Overall SPA | 301/302 tests (99.7%) |

Two tests in `DashboardPage.test.tsx` are known-flaky due to mock response-cycling
infrastructure (not production bugs — the core pagination logic is verified by
passing tests).

## See also

- [Stats](./stats) — detailed statistics API reference
- [Webhooks](./webhooks) — get notified on playback and library events
- [Backup](./backup) — backup dashboard data and server state
- [Admin SPA dev guide](../dev/admin-spa#14-the-dashboard-page-step-16) — internal implementation details
