---
title: Playlists & Collections
description: Hand-made watch lists in Phlix — making them, adding titles, and who can see them
---

# Playlists

**Since:** recent versions call these *playlists* in the app; the server stores them as
*collections*. Same thing — if you meet the word "collection" in settings, docs, or an
error message, it means your playlist.

## What a playlist is

A named list of movies, shows, or episodes you put together by hand — a date-night
lineup, a comfort-watch rotation, a "watch before the new season" list. Playlists are
yours: other signed-in people on the server don't see them.

## Making one

You create a playlist *from something you want in it*:

1. Find a title in Browse or open its detail page.
2. Choose **Add to playlist** (on cards it's in the card's menu).
3. In the picker, either select an existing playlist or go to the **New playlist** tab,
   type a name, and confirm.

The title lands in the playlist immediately. If creating the new playlist succeeded but
adding the title failed, the app tells you and offers to undo the empty playlist it
just made.

::: tip One honest limitation
There is no rename button in the app. If you typo'd a playlist's name, delete the
playlist and make a new one — the titles inside are unaffected.
:::

## Using and managing playlists

One honest quirk of today's app: nothing in the sidebar links to the playlist list
page. The only door in the app is in the **Add to playlist** picker: its footer carries
a "Manage playlists →" link that opens it. (Or type the address directly into your
browser: `http(s)://your-server/app/playlists`.) It lists all of yours; pick any playlist
to open it:

- **Remove** takes one title out of the list (it stays in your library, obviously).
- **Delete playlist** asks for confirmation first, then removes the list — never the
  media files or library entries, just the playlist itself.
- Start a title from the list like any other item; playing from a playlist doesn't mark
  the playlist "in progress" — watch history is tracked per title as always.

There is no play-button for the whole list, and no sharing a playlist with one
specific person. (Sharing that reaches other households works at the level of a whole
library on the Hub — see [Sharing a library with friends](../hub/share-with-friends.md).)

Rules-based **smart collections** exist on the server — a saved media query that can be
attached to a collection — but nothing updates them by itself: the contents are
re-evaluated only when something asks (request-driven, via the REST
`POST /api/v1/collections/{id}/refresh`), and today's app has no screen to author the
rules. In the web app's day-to-day sense, then, playlists do not auto-update — the
engine is server-side and developer-facing. See
[Smart Playlists](/developers/smart-playlists) for what is actually wired.

Server **admins** get an extra Collections screen in the admin area that lists *every*
collection on the server and can bulk-edit membership — that's an operations tool, not a
second way to make your own list.

## Who can see a playlist

Only you — with one historical footnote: playlists created before the server started
recording owners (a legacy of early versions) have no owner stamped on them, and the
server treats ownerless lists as shared heritage that signed-in members may still see.
Anything you create today is private to your account.

## Related pages

- [Adding people to your household](../advanced/adding-people.md) — profiles and who sees what
- [Sharing a library with friends](../hub/share-with-friends.md) — giving access to whole libraries
- [Watch Together (SyncPlay)](../advanced/syncplay.md) — watching the same thing at the same time
