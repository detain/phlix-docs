# UI Theme Plugin Guide

## Overview

A `ui-theme` plugin restyles the Phlix web portal by contributing
**token themes**: validated maps of semantic CSS custom properties.
Since server 0.44.0 there are no CSS or JS asset files involved — the
SPA applies a theme by writing the token values onto the document with
`el.style.setProperty()`, which is why plugin themes need no CSP
relaxation. A theme's entry class implements
`Phlix\Theming\ThemeSourceInterface` (alongside
`Phlix\Plugins\Contract\LifecycleInterface`) and returns its payloads
from `providedThemes()`.

> **History note.** Earlier revisions of this page described a
> manifest-level `theme` block (`css` / `js` / `thumbnail` / `version`
> fields), a `ThemePluginInterface`, and a server-side `ThemeMiddleware`
> that substituted Smarty markers in the portal layout. None of that
> ever shipped: the manifest `theme` key is never read by the loader,
> and the portal is a SPA with no server-rendered layout to inject
> into. What ships is the token contract below.

## Manifest Structure

A `ui-theme` plugin uses the ordinary manifest — `type: "ui-theme"`
plus an `entry` class. There is **no `theme` key**; theme data comes
from the entry class, not the manifest. From the shipped reference
plugin (`detain/phlix-plugin-sample-theme/plugin.json`):

```json
{
    "name": "phlix-plugin-sample-theme",
    "version": "1.0.0",
    "phlix_min_server_version": "0.44.0",
    "type": "ui-theme",
    "entry": "Phlix\\PluginSampleTheme\\SampleThemePlugin",
    "events": [],
    "signature": null
}
```

## The Entry Class

```php
<?php

declare(strict_types=1);

namespace Phlix\PluginSampleTheme;

use Phlix\Plugins\Contract\LifecycleInterface;
use Phlix\Theming\ThemeSourceInterface;

final class SampleThemePlugin implements LifecycleInterface, ThemeSourceInterface
{
    public function themeSourceName(): string
    {
        // Canonical, stable, lowercase slug. The host keys provenance
        // on this name: re-registering the same name REPLACES that
        // source's themes (never appends), and disabling the plugin
        // removes exactly the themes it contributed.
        return 'sample-theme';
    }

    /**
     * @return list<array<array-key, mixed>>
     */
    public function providedThemes(): array
    {
        // MUST be cheap and non-blocking: called synchronously on each
        // worker during plugin enable. Return a literal / precomputed
        // array — no network, no filesystem, no sleeping.
        return [[
            'id'      => 'sample-dusk',
            'name'    => 'Sample Dusk',
            'dark'    => true,
            'extends' => 'midnight',
            'tokens'  => [
                '--accent' => '#6ea8fe',
                '--bg'     => '#05060a',
                // …see the allowlist below.
            ],
        ]];
    }
}
```

The entry class **is** instantiated by the loader. An empty `providedThemes()`
list is a valid, leak-free registration (a source that is currently
unconfigured).

## Payload Contract (validated, fail-closed)

Every payload is checked by `Phlix\Theming\ThemeTokenValidator` before
registration. Validation is **all-or-nothing**: one bad key or value
rejects the entire source, and on the enable path fails the plugin
enable. A `ui-theme` plugin with an invalid payload simply does not
enable — there is no partial registration.

### Payload keys — exactly these five

| Key       | Type          | Required | Meaning |
| --------- | ------------- | -------- | ------- |
| `id`      | string        | yes      | Lowercase ASCII slug (`^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$`), unique across the registry. |
| `name`    | string        | yes      | Human label, max 64 characters. |
| `dark`    | bool          | yes      | Drives `color-scheme` in the SPA. |
| `extends` | string\|null  | yes      | Id of a base theme whose tokens this one layers over; `null` for a standalone theme. |
| `tokens`  | array<string,string> | yes | CSS custom property → sanitised value. |

Anything else is a typo or an unhandled field and rejects the payload.

### Reserved ids

`nocturne`, `daylight`, `midnight` are owned by the built-in token set
(`Phlix\Theming\BuiltInThemes::IDS`). A plugin may not claim one — doing
so would silently replace a shipped theme for every user.

### Token keys

`tokens` may only set properties on `Phlix\Theming\ThemeTokenAllowlist`
— the semantic design tokens the SPA reads. The headline groups:

```php
// Accent ramp (the six semantic accent tokens are how a plugin re-hues
// the UI; the raw --amber-*/--blue-* ramps they derive from are
// theme-invariant and NOT settable):
'--accent', '--accent-hover', '--accent-active', '--accent-soft',
'--accent-ring', '--accent-text',
// Background + elevation stack:
'--bg', '--surface', '--surface-2', '--surface-3', '--surface-glass',
'--surface-glass-strong',
// Text ramp:
'--text', '--text-muted', '--text-subtle', '--text-faint', '--text-on-accent',
// Borders:
'--border', '--border-subtle', '--border-strong',
// Status colors:
'--error', '--error-bg', '--success', '--success-bg', '--warning',
'--warning-bg', '--info', '--info-bg',
// Atmosphere:
'--grain-opacity', '--vignette', '--ambient',
```

(See `src/Theming/ThemeTokenAllowlist.php` for the complete list,
including the legacy `--color-*` compatibility block.)

### Value grammar and contrast rules

Values are validated against a strict grammar (`#rgb`/`#rgba`/
`#rrggbb`/`#rrggbbaa`, `rgb()`/`rgba()`/`hsl()`-family forms, and a
number set for opacity-style tokens; max 128 characters). Two
foreground tokens carry computed contrast laws: `--accent-text` (hue
used as foreground on `--bg`/`--surface`) and `--text-faint` (the
placeholder tier) must clear WCAG AA body contrast (4.5:1) — tests
derive it from the hex values, so pick them deliberately. `extends`
lets you start from a built-in's full token map and override only what
you want to change.

## Distribution and Activation

1. Package the plugin (composer-installed `vendor/`, zip or URL or
   catalog source) and install it through **Admin → Plugins** —
   upload, install-from-URL, or the in-product catalog.
2. **Install is not enable**: enabling the plugin is what registers
   its themes into `ThemeSourceRegistry` (by design).
3. The theme list is served at `GET /api/v1/themes` (and
   `GET /api/v1/themes/{id}`); plugin sources are merged with the
   built-ins. Workers refresh via the registry's fleet-sync staleness
   flush, so a newly enabled theme appears without a restart.

## Per-User Selection

Users pick the active theme in their profile settings: the portal
issues `PUT /api/v1/users/me/settings` with `{ "theme": "<id>" }`. The
server validates the id against the built-ins **and** the live
`ThemeSourceRegistry`; an unknown or removed id is rejected (400)
before any write. Clearing the selection back to "unset" is not
currently supported — pick a theme.

## See Also

- [Plugin Developer Guide](../plugins/developer-guide.md) — manifest,
  lifecycle, and packaging for all plugin types.
- [`detain/phlix-plugin-sample-theme`](https://github.com/detain/phlix-plugin-sample-theme)
  — the reference theme plugin this page's code samples are taken from.
