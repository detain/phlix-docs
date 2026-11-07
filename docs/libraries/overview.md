---
title: Libraries
description: Organize and browse your media collections
---

# Libraries

Phlix organizes your media into **Libraries** — each a dedicated space for one type of content.

## Library Types

| Library | What it holds | Key features |
|---------|---------------|---------------|
| [Movies](./movies) | Films & trailers | Posters, fanart, ratings |
| [TV Shows](./tv-shows) | Series & episodes | Season grid, per-season pages, per-directory matching |
| [Music](./music) | Albums & tracks | By Artist, Album, Genre |
| [Photos](./photos) | Images & albums | EXIF, timeline, albums |
| [Books](./books) | eBooks & comics | PDF, EPUB, CBZ |
| [Audiobooks](./audiobooks) | Audio books | Chapters, resume, sleep |

## Adding Content

Every library scans your filesystem (or a network share) for supported media files and builds a rich, searchable catalog automatically.

Two naming patterns decide whether items match metadata — worth checking before your first scan, because a file named ad lib still imports but may match the wrong title (or none):

```text
Movies:     Movie Name (Year).ext          →  Avatar (2009).mkv
TV shows:   Show Name S01E01.ext           →  The Expanse S01E01.mkv
```

The full rules — folder layouts, specials, multi-version movies, compact formats — live in [Movies: Naming Conventions](./movies#_2-naming-conventions) and [TV Shows: Folder and File Naming Conventions](./tv-shows#_1-folder-and-file-naming-conventions).

## See Also

- [First Run](../first-run) — initial setup guide
- [Install](../install/linux) — server installation
