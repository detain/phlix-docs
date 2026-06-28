# Managing Plugins in the Admin UI

**Since:** 0.29.0 (@phlix/ui)

## TL;DR

The admin console has a dedicated **Plugins** page (`/admin/plugins`) for managing
every installed plugin from the web UI: install by URL, enable/disable, uninstall,
and **configure** each plugin's settings through a schema-driven form. Secret fields
(API keys, tokens) are masked and preserved unless you actually change them.

This page covers the operator workflow. For installing plugins, see
[Install from URL](./install-from-url) and [Install from Catalog](./install-from-catalog);
for the manifest format and the `settings` schema that drives the configure form, see
[Plugin Manifest](./manifest).

---

## 1. Reaching the page

Sign in as an admin, open the admin console, and click **Plugins** in the sidebar
(it sits next to **Libraries**). The whole `/admin/*` area is admin-gated, so the
page — and all of its actions — are available only to admins.

---

## 2. The plugins table

Each installed plugin is one row:

| Column | Source |
|--------|--------|
| **Name** | `plugin.name` |
| **Version** | `plugin.version` |
| **Type** | `plugin.type` (a badge) |
| **Enabled** | a toggle switch — flipping it enables or disables the plugin |
| **Actions** | **Configure** and **Uninstall** |

The enabled toggle is **not optimistic**: it calls the server and then refetches, so
if a change fails the switch snaps back to the real state. The switch is briefly
disabled while a toggle is in flight to prevent racing rapid clicks.

When no plugins are installed the page shows an empty state with an **Install**
action; a load failure shows an error state with **Retry**.

---

## 3. Install

Click **Install** to open a modal with a single URL field. Paste the plugin's
`plugin.json` URL and submit. On success the list refreshes and the plugin lands
**disabled** (flip its toggle to enable it). Common install failures are surfaced as
friendly messages:

| Server code | Meaning |
|-------------|---------|
| `plugin.url.required` | No URL was provided. |
| `plugin.url.invalid_scheme` | The URL is not a valid plugin URL (use `https://…`). |
| `plugin.install.failed` | The plugin could not be downloaded or read. |

See [Install from URL](./install-from-url) for the full install workflow, CLI
equivalents, and security notes.

---

## 4. Enable / Disable

Use the per-row **Enabled** switch to enable or disable a plugin. Some plugin types
register their hooks only at server boot, so a restart may be required for an
enable/disable to fully take effect — see
[Install from URL → Plugin Requires Restart](./install-from-url#failure-3-plugin-requires-restart).

---

## 5. Uninstall

Click **Uninstall** to open a confirmation modal — a plugin is never removed on a
single click. Confirming removes the plugin and refreshes the list.

---

## 6. Configure

Click **Configure** to open the plugin's settings form. The form is **schema-driven**:
it is built from the plugin manifest's `settings` block (fetched via
`GET /api/v1/admin/plugins/{name}`), with one control per declared setting:

| Manifest type | Control |
|---------------|---------|
| `bool` | toggle switch |
| `int` / `number` / `float` | number input |
| `string` (and others) | text input |
| `secret: true` | password input, prefilled with the `***` mask |

Each field shows its label, description, and a required marker where the manifest
declares it. A plugin with no settings schema shows a "No configurable settings"
message and no Save button.

### Secret handling

Secret-typed fields (API keys, tokens) are **masked** — the server never returns the
real value; it returns `***`. The configure form prefills secrets with that mask, so:

- Leaving a secret untouched (still `***`) **keeps the stored value** — the masked
  sentinel is never written back as the real secret.
- Typing a new value **replaces** the stored secret.

Only changed fields are sent on save. If you change nothing, the form closes with a
"no changes to save" note and issues no request.

### Validation

The save (`PUT /api/v1/admin/plugins/{name}/settings`) validates each value against
the manifest type. On `400 plugin.settings.validation_failed` the offending fields
show inline error messages (e.g. unknown key, type mismatch). Every successful save
is **audit-logged** with the `configure` action.

---

## 7. API reference

The page consumes these admin-gated endpoints (all under `/api/v1/admin/plugins`,
Bearer admin token required — `401` unauthenticated, `403` non-admin):

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v1/admin/plugins` | List installed plugins. |
| `GET` | `/api/v1/admin/plugins/{name}` | Plugin detail incl. `settings_schema` + masked `settings`. |
| `POST` | `/api/v1/admin/plugins/install` | Install by URL (`{ url }`). |
| `POST` | `/api/v1/admin/plugins/{name}/enable` | Enable. |
| `POST` | `/api/v1/admin/plugins/{name}/disable` | Disable. |
| `PUT` | `/api/v1/admin/plugins/{name}/settings` | Save settings (`{ settings: { key: value } }`); secrets masked in the response. |
| `DELETE` | `/api/v1/admin/plugins/{name}` | Uninstall. |

The detail / configure response shape:

```json
{
  "plugin": {
    "name": "my-plugin",
    "version": "1.0.0",
    "type": "metadata-provider",
    "enabled": true,
    "installed_at": "2026-06-12 12:00:00",
    "settings_schema": {
      "api_key": { "type": "string", "required": true, "secret": true, "label": "API key", "description": "…" },
      "page_size": { "type": "integer", "required": false, "secret": false, "label": "Page size", "default": 50 }
    },
    "settings": { "api_key": "***", "page_size": 50 }
  }
}
```

A `default` key appears in a schema entry **only** when the manifest declares one
(so the UI can tell "no default" from "default null").

---

## 8. Next Steps

- [Install from URL](./install-from-url) — install any public plugin by `plugin.json` URL
- [Install from Catalog](./install-from-catalog) — curated, signature-verified plugins in one click
- [Plugin Manifest](./manifest) — the `plugin.json` format and the `settings` schema that drives the configure form
- [Plugin Catalog](./plugin-catalog) — the catalog feed format
- [Trusted Plugin List](./trusted-plugin-list) — author signing-key allowlist
