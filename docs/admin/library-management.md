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

- [Server Settings](./server-settings) — server-wide settings store and admin API
- [Dashboard](./dashboard) — visual admin dashboard overview
- [Stats](./stats) — usage and activity statistics
