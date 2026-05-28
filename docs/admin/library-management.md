---
title: Library Management
description: Admin filesystem-browse endpoint (library path picker) and its allowed-roots jail
---

# Library Management

When an admin adds or edits a media library, the path-picker needs a safe way to
explore the server's filesystem and choose a directory. Phlix exposes a single,
admin-only **filesystem-browse** endpoint for exactly this: it lists the
immediate subdirectories of a path, jailed to a small set of configured roots so
a picker can never wander outside them.

::: tip UI coming in Phase 1.1
This page documents the **path-picker API** only. The graphical
add / edit / scan **Library Management** screens in the admin console land in
Phase 1.1 — until then, the endpoint below is the only library-management
surface. It is intentionally **not** a general file manager: it lists
directories only (never files) and supports no read, write, or delete.
:::

## Browse Filesystem

```http
GET /api/v1/admin/fs/browse?path=<absolute-path>
```

Lists the immediate **subdirectories** of `path` (files are excluded), sorted by
name. The result is restricted to the configured [allowed roots](#allowed-roots)
— any path that resolves outside them is rejected.

### Query Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `path` | No | Absolute path whose subdirectories to list. When empty or absent, the configured allowed roots are returned as the entry list (the picker's starting point). |

## Authentication

The endpoint sits in the `/api/v1/admin` route group and is gated by the admin
middleware. Send a valid admin JWT as a Bearer token:

```http
Authorization: Bearer <admin-access-token>
```

- An **unauthenticated** request returns `401`.
- A **non-admin** request returns `403`.

Both error responses are JSON.

## Responses

### Starting point (no `path`)

With an empty or absent `path`, the configured roots are returned as the entry
list so the picker has somewhere to begin. `path` and `parent` are `null`:

```json
{
  "success": true,
  "data": {
    "path": null,
    "parent": null,
    "entries": [
      { "name": "home", "path": "/home" },
      { "name": "mnt", "path": "/mnt" },
      { "name": "media", "path": "/media" },
      { "name": "data", "path": "/data" }
    ]
  }
}
```

### Directory listing

For a valid directory under an allowed root, `entries` holds its immediate
subdirectories (sorted by name), `path` is the canonical (resolved) directory,
and `parent` is the parent directory **only when the parent is itself within the
jail** — otherwise `null` (so the picker stops at a root):

```json
{
  "success": true,
  "data": {
    "path": "/media/movies",
    "parent": "/media",
    "entries": [
      { "name": "Action", "path": "/media/movies/Action" },
      { "name": "Comedy", "path": "/media/movies/Comedy" }
    ]
  }
}
```

### Error responses

| Status | When | Body |
|--------|------|------|
| `400` | The path resolves but is **not a directory** (e.g. a file). | `{ "success": false, "error": "Not a directory" }` |
| `403` | The path resolves **outside the allowed roots** — including `../` escapes and symlinks that point out of the jail. | `{ "success": false, "error": "Path is outside the allowed roots" }` |
| `404` | The path does **not exist** / cannot be resolved by `realpath()`. | `{ "success": false, "error": "Path not found" }` |

The checks run in the order `404` → `400` → `403`, so a non-existent or
non-directory path reports the more specific `404`/`400` rather than `403`.

## Scanning a Library

Scanning indexes a library's filesystem for media and updates the catalog. As of
**Phase 1.1b the scan runs asynchronously** — off the HTTP request. The scan and
rescan endpoints no longer scan inline; they **enqueue a job** and return `202`
immediately, and a background [Library Scan Worker](../dev/library-scan-worker)
drains the queue. Use the [scan-status](#scan-status) endpoint to poll a job's
progress.

All four endpoints below are **admin-gated** (the `scan-status` job row exposes a
server filesystem path in `current_path`), require a valid admin Bearer token
(`401` unauthenticated, `403` non-admin), and return `404` when the library does
not exist.

### Enqueue a scan

```http
POST /api/v1/libraries/{id}/scan
```

Queues an **incremental** scan. Returns `202 Accepted` with the new job id:

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440099",
  "status": "queued",
  "message": "Library scan queued"
}
```

### Enqueue a rescan

```http
POST /api/v1/libraries/{id}/rescan
```

Queues a **full rescan** (purge + rescan). Identical contract to `scan`, with a
`rescan`-typed job and the message `"Library rescan queued"`:

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440100",
  "status": "queued",
  "message": "Library rescan queued"
}
```

::: tip CLI is still synchronous
The `php bin/phlix library:scan {libraryId} [--rescan]` console command is
**unchanged** — it scans synchronously and blocks until done. Only the HTTP
endpoints became asynchronous.
:::

### Scan status {#scan-status}

```http
GET /api/v1/libraries/{id}/scan-status
```

Returns the **latest** scan job for the library, or `null` when the library has
never been scanned (still a valid `200`, not a `404`):

```json
{
  "scan_status": {
    "id": "550e8400-e29b-41d4-a716-446655440099",
    "library_id": "550e8400-e29b-41d4-a716-446655440001",
    "type": "scan",
    "status": "running",
    "items_found": 0,
    "items_added": 0,
    "items_updated": 0,
    "items_removed": 0,
    "current_path": null,
    "error": null,
    "queued_at": "2026-05-27 12:00:00",
    "started_at": "2026-05-27 12:00:05",
    "completed_at": null
  }
}
```

A UI polls this endpoint after enqueueing to follow the job through its
lifecycle: `queued → running → completed` (or `failed`, where `error` carries the
exception message).

::: warning Progress is coarse, not per-item
In this release `status` is the **only** live signal. `LibraryManager` reports no
per-file counts, so `items_found` / `items_added` / `items_updated` /
`items_removed` stay `0` and `current_path` stays `null`. Treat scan-status as a
**lifecycle indicator** (queued / running / completed / failed), **not** a live
per-file progress bar. Real per-item counters may be wired through in a later
step. See the [Library Scan Worker](../dev/library-scan-worker#coarse-progress-is-intentional)
developer page.
:::

### Scan history

```http
GET /api/v1/libraries/{id}/scan-history?limit=N
```

Returns recent scan jobs for the library, **newest first**. `limit` defaults to
`20` and is clamped to `[1, 100]`:

```json
{
  "history": [
    { "id": "…", "type": "scan", "status": "completed", "queued_at": "…", "completed_at": "…" }
  ]
}
```

Each entry has the same shape as the `scan_status` job row above.

## Allowed Roots

Directory listing is jailed to the roots declared in `config/filesystem.php`:

```php
return [
    'browse_roots' => ['/home', '/mnt', '/media', '/data'],
];
```

| Root | Purpose |
|------|---------|
| `/home` | User home directories. |
| `/mnt` | Mounted volumes. |
| `/media` | Removable / external media mounts. |
| `/data` | Application / library data volume. |

This list is the **security boundary** for the endpoint — keep it conservative.
There is intentionally **no environment-variable override**, so the boundary
stays explicit and auditable in code. Each root is canonicalised with
`realpath()` at startup; a configured root that does not resolve on the host is
silently dropped (it can never be browsed).

### The Traversal Jail

Every candidate `path` is canonicalised with `realpath()` before any check.
Because `realpath()` collapses `..` segments **and** resolves symlinks to their
real targets, a single prefix test against each root is enough to keep the
listing inside the jail:

```
$real === $root  ||  str_starts_with($real . '/', $root . '/')
```

The trailing-slash form is deliberate (a plain prefix check, **never**
`str_contains`): it ensures a sibling such as `/home-backup` cannot match the
`/home` root, while `/home/alice` does. The consequences:

- A `../` path escaping a root canonicalises to its real location and fails the
  prefix test → `403`.
- A symlink pointing outside the jail resolves to its real target via
  `realpath()` and fails the prefix test → `403`.
- A path under no configured root → `403`.

This mirrors the canonical path-jail pattern used elsewhere in the server (e.g.
`AudiobookController::validateMediaPath()`), so the browse endpoint cannot be
used to read directory structure outside the allowed roots.

## See Also

- [Library Scan Worker](../dev/library-scan-worker) — how the async scan queue and worker work
- [Server Settings](./server-settings) — server-wide settings store and admin API
- [Dashboard](./dashboard) — visual admin dashboard overview
- [Stats](./stats) — usage and activity statistics
