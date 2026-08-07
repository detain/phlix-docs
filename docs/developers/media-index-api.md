# Media Index API

**Since:** 0.14.0

## Overview

The Media Index API provides bucket-based navigation data for the adaptive index rail on library pages. Rather than returning a flat paginated list of media items, it returns one bucket per distinct sort value (letter, decade, rating, etc.) with cumulative row offsets — allowing the client to jump directly to any section of the library grid without scanning from offset zero.

## Endpoint

#### `GET /api/v1/media/index`

Returns index bucket metadata for a library, scoped to the current sort field and any active filters.

```http
GET /api/v1/media/index?field=name&order=asc&libraryId=<uuid>&limit=50&offset=0
```

**Authentication:** Required (Bearer token).

### Query Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `field` | `name\|year\|rating\|runtime\|date_added` | `name` | Sort field that determines bucket type |
| `order` | `asc\|desc` | `asc` | Sort direction |
| `libraryId` | uuid | — | Scope to one library (optional) |
| `topLevel` | bool | `false` | Show only top-level items (series → shows, no episodes) |
| `limit` | int | `50` | Maximum number of buckets to return |
| `offset` | int | `0` | Pagination offset |

### Response

```json
{
  "field": "name",
  "buckets": [
    { "key": "A", "label": "A", "offset": 0, "count": 142 },
    { "key": "B", "label": "B", "offset": 142, "count": 98 },
    { "key": "C", "label": "C", "offset": 240, "count": 87 }
  ],
  "total": 1204
}
```

| Field | Description |
|---|---|
| `field` | The sort field used (mirrors the `field` query param, normalized) |
| `buckets` | Array of bucket objects (see below) |
| `total` | Total count of items in the library matching the current filters |

### Bucket Object

| Field | Type | Description |
|---|---|---|
| `key` | `string` | Bucket identifier — the raw sort value |
| `label` | `string` | Human-readable label for display in the rail |
| `offset` | `int` | Absolute row offset in the media_items table for the first item in this bucket |
| `count` | `int` | Number of items in this bucket |

**`offset` invariant:** `buckets[n].offset = sum(buckets[0].count … buckets[n-1].count)`. The client uses this value to call `ensureRange(offset, offset + limit)` when the user clicks a bucket — jumping to the correct page of items.

::: warning The invariant only lines up with the grid for some fields
An offset is only useful if the bucket ordering matches the grid's `ORDER BY`.
That holds for `field=name`, where buckets group on `UPPER(LEFT(sort_title,1))` and
the grid orders on `sort_title, name`. It does **not** hold for:

- **`field=rating`** — the grid orders by `rating_score DESC` while the buckets
  group and order on `content_rating`. These are unrelated orderings.
- **`field=date_added`** — the buckets are emitted newest-first and only reversed
  when `order=desc`, so both directions are misaligned.
- **rows with no value** — items with `year <= 0`, `runtime <= 0` or a blank genre
  are dropped from the buckets but still occupy rows in the grid, so every offset
  after them is short by their count.
- **divergent filters** — `minRating` applies to the grid only, and profile tag
  filtering removes rows *after* `LIMIT`/`OFFSET` has been applied.

Treat a jump on those fields as approximate.
:::

### Bucket Label Formats by Field

| Field | `key` example | `label` example | Notes |
|---|---|---|---|
| `name` | `"A"`, `"B"`, `"#"` | `"A"`, `"B"`, `"#"` | `#` groups non-alphabetic titles; article-stripped |
| `year` | `"1990s"`, `"2000s"` | `"1990s"`, `"2000s"` | Decade start year; collapses to decades when >30 distinct years |
| `rating` | `"PG"`, `"R"` | `"PG"`, `"R"` | Fixed set: G, PG, PG-13, R, NC-17, Unrated |
| `runtime` | `"1-30min"`, `"31-60min"` | `"1–30 min"`, `"31–60 min"` | 5 fixed ranges; values outside all ranges are excluded |
| `date_added` | `"today"`, `"this_week"` | `"Today"`, `"This week"` | 5 relative buckets; boundaries shift with current date |

### Error Handling

> [!TIP]
> **Graceful fallback:** If the server does not implement this endpoint (older versions), it returns a `404`. The client receives the 404 and falls back to `{field, buckets: [], total: 0}` — the adaptive rail is hidden and browsing continues normally with no error shown.

Any non-ok HTTP response (401, 404, 500, etc.) is treated the same way: the rail is hidden, no error surfaces to the user.

## Offset-Based Jumping

The `offset` field is the critical contract between server and client. Clicking bucket "C" (offset=240) in a library sorted by name causes the grid to call:

```
ensureRange(240, 240 + limit)
```

This fills the grid starting at row 240 — the exact position of the first item whose name begins with C.

::: warning The alignment is not covered by any test
The offset **arithmetic** — that each bucket's `offset` is the running sum of the
preceding buckets' `count`s — is covered by unit tests
(`tests/Unit/Media/Library/IndexBucketsTest.php`,
`tests/Unit/Server/WebPortal/WebPortalRouterMediaTest.php`). But those run against
hand-written counts and a mocked `ItemRepository`: **no test compares a bucket
offset to an item's real row position in `media_items`**, so drift between
`ItemRepository::valueBuckets()`'s `ORDER BY` and the grid query's `ORDER BY` would
not be caught automatically. (Earlier revisions of this page claimed
"server↔rail integration tests" verified it; no such test exists.)
:::

## Backward Compatibility

The legacy `GET /api/v1/media/letter-index` endpoint is preserved and remains functional. It returns a different shape (`{letters: [{letter, offset, count}], total}`) and is used by external consumers that have not yet migrated. New clients should prefer `/api/v1/media/index` for adaptive rail support.

## Implementation

The endpoint is implemented in `WebPortalRouter::getMediaIndex()` and uses:

1. `ItemRepository::valueBuckets()` — aggregates distinct sort values with item counts from the DB
2. `IndexBuckets::build()` — transforms raw distinct values into typed bucket objects (letter/decade/rating/range/relative)
3. `IndexBuckets::withOffsets()` — computes cumulative row offsets from bucket counts

The `ItemRepository` query reuses the same `buildFilters()` logic as `GET /api/v1/media`, so most filters (search, genres, ratings, year range, etc.) apply to both endpoints. Two do **not**: `minRating` is applied to the grid query only, and profile tag filtering runs in PHP on the grid's result page after `LIMIT`/`OFFSET`. Both make the bucket counts larger than the rows the grid actually returns.
