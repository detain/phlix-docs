---
title: First Boot
description: Getting started with Hub Admin after installation
---

# First Boot

Instructions for getting started with Hub Admin after installation.

## Initial Setup

1. **Open the hub** in a browser at the URL provided during installation. The
   root path `/` redirects to the Vue web app at **My Servers** (`/app/servers`).
2. **Sign in.** The **first account registered becomes an admin automatically** —
   there is no separate `admin:create` step. (Additional admins are granted on
   the console's **Users** page — `/app/admin/users` — with its admin toggle; see
   the [Admin Console](./admin-console.md).)

::: danger Register before you expose the domain
Sign-ups are **open by default**: anyone who can reach `/signup` can register,
and whichever account registers first owns the hub. The auto-promotion itself
is race-proof (a first-admin election guard admits exactly one winner), but the
ordering hazard is real — if DNS goes live before you have registered, the
first stranger through the door becomes administrator. Do the **first sign-up
before publishing the public domain**, and close the door right after
**Settings → `auth.signups_disabled`** (the console's Settings page overrides
the `HUB_SIGNUPS_ENABLED` env default live — no restart needed).
:::

3. **Open the admin console.** Once signed in as an admin, an **Admin** entry
   appears in the top navigation. It leads to the **Hub Dashboard** at
   `/app/admin/dashboard`. The console is gated by `AdminMiddleware` (a
   non-admin gets `401 auth.required` or `403 auth.not_admin`), so the **Admin**
   nav is only visible to admins.

The admin console has five pages — **Hub Dashboard**, **Users**, **Logs**,
**Settings**, and **Audit Logs** — at `/app/admin/{dashboard,users,logs,settings,audit-logs}`.
See the [Admin Console](./admin-console.md) page for a full tour of each.

## Next Steps

- [Admin Console](./admin-console.md) — full tour of the five admin pages and the admin API
- [Install](./install) — if you haven't installed yet
- [Capacity Planning](./capacity-planning) — plan your deployment
