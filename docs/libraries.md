---
title: Library Metadata & Ratings
description: Rating system, fuzzy matching, smart collections, and multi-language metadata fallback chain
---

# Library Metadata & Ratings

**Phase:** P1-S9

Phlix implements a comprehensive rating and metadata system that supports numerical ratings, smart collection rules, fuzzy title matching, and multi-language metadata fallback.

## Numerical Ratings

### Rating Scale

Ratings use a **0-10 scale** internally, displayed in the UI as stars or numeric values depending on context.

| Internal Value | Star Display | Numeric Display |
|---------------|--------------|-----------------|
| 0 | No stars | 0.0 |
| 1-2 | ★☆☆☆☆ | 1-2 |
| 3-4 | ★★☆☆☆ | 3-4 |
| 5-6 | ★★★☆☆ | 5-6 |
| 7-8 | ★★★★☆ | 7-8 |
| 9-10 | ★★★★★ | 9-10 |

### Rating Storage

Ratings are stored in the `media_items` table:

- `rating` — Community rating (float 0.0-10.0)
- `user_rating` — Per-user personal rating (int 1-10, nullable)

## Sorting & Filtering

### Sort by Rating

```http
GET /api/v1/media?sort=rating&order=desc&limit=50
GET /api/v1/media?sort=rating&order=asc&limit=50
```

**Parameters:**
- `sort=rating` — Sort by community rating
- `order=asc|desc` — Sort direction (default: desc)

### Filter by Minimum Rating

```http
GET /api/v1/media?min_rating=7.5
```

This returns only items with a community rating >= 7.5.

## Smart Collection Rules

Smart collections use flexible rule-based filtering:

### Rule Types

| Rule | Field | Example |
|------|-------|---------|
| Genre | `genres[]` | `genres[]=Action&genres[]=Sci-Fi` |
| Decade | `yearFrom`, `yearTo` | `yearFrom=1980&yearTo=1989` |
| Rating Threshold | `min_rating` | `min_rating=8.0` |
| Year Range | `yearFrom`, `yearTo` | `yearFrom=2010` |

### Example: High-Rated 80s Action Movies

```http
GET /api/v1/media?genres[]=Action&genres[]=Sci-Fi&yearFrom=1980&yearTo=1989&min_rating=7.0
```

### Rule Combination

Rules are combined with AND logic. Use multiple genre filters for OR behavior within genres.

## Fuzzy Title Matching

Phlix uses **Levenshtein distance** for fuzzy title matching to handle typos and variations:

### How It Works

1. Query text is normalized (lowercase, punctuation removed)
2. Levenshtein distance computed against all titles in library
3. Items with distance <= 3 (or 20% of title length, whichever is smaller) are included
4. Results sorted by relevance (smallest distance first)

### Example Matches

| Query | Title | Distance | Match |
|--------|-------|----------|-------|
| `taron` | "Tarzan" | 2 | ✅ |
| `batmann` | "Batman" | 2 | ✅ |
| `x-men 92` | "X-Men '92" | 3 | ✅ |
| `star trek ds9` | "Star Trek: Deep Space Nine" | 5 | ❌ |

### API Usage

```http
GET /api/v1/media?search=tarzan&fuzzy=true
```

## Multi-Language Metadata Fallback

Phlix supports a **fallback chain** for metadata in multiple languages:

### Fallback Priority

1. **Primary Language** — User's preferred language (from profile settings)
2. **Secondary Language** — Backup language (configurable)
3. **English** — Always available as final fallback
4. **Original Title** — If no translation exists

### Configuration

```json
{
  "metadata": {
    "primaryLanguage": "en",
    "fallbackLanguages": ["es", "fr", "de"],
    "useOriginalTitle": true
  }
}
```

### Fallback Behavior

| Primary | Secondary | Tertiary | Available |
|---------|-----------|----------|-----------|
| English | Spanish | French | English |
| Spanish | English | French | Spanish |
| German | English | French | English |
| Japanese | English | French | Original (Japanese) |

## UI Components

### RatingBadge

Displays the community rating:

```vue
<RatingBadge :rating="8.5" :max="10" size="medium" />
```

**Props:**
- `rating` (number) — Rating value 0-10
- `max` (number) — Maximum value (default: 10)
- `size` (string) — 'small' | 'medium' | 'large'
- `showNumeric` (boolean) — Show numeric value (default: true)

### RatingModal

Allows users to set their personal rating:

```vue
<RatingModal :media-id="uuid" :current-rating="7" @save="onRatingSave" />
```

**Events:**
- `save` — Emitted with new rating value when user saves
- `cancel` — Emitted when user dismisses modal

### UserRatingPicker

Interactive star-based rating input:

```vue
<UserRatingPicker v-model="userRating" :max="10" @change="onRatingChange" />
```

**Props:**
- `modelValue` (number|null) — Current rating
- `max` (number) — Maximum stars (default: 10)

**Events:**
- `update:modelValue` — Two-way binding update
- `change` — Emitted when rating changes

## API Reference

### Set User Rating

```http
POST /api/v1/media/{id}/rating
Content-Type: application/json

{ "rating": 8 }
```

### Get Media with Ratings

```http
GET /api/v1/media/{id}
```

Response includes `user_data.rating` for authenticated users.

### List Media Sorted by Rating

```http
GET /api/v1/media?sort=rating&order=desc&topLevel=1
```

## See Also

- [Smart Playlists](/developers/smart-playlists) — Advanced playlist rules
- [Collections](/developers/collections) — Manual and smart collections
- [Discovery](/developers/discovery) — Metadata sourcing
