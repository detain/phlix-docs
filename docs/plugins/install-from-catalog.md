**Phase:** N (End-User Documentation)
**Step:** N.14
**Since:** 0.18.0 (catalog browser reworked to git-repo `plugins.json` sources)

## TL;DR

The plugin catalog is a browsable list of installable plugins, sourced from a
`plugins.json` document in a git repo. The **default catalog** is
[`detain/phlix-plugins`](https://github.com/detain/phlix-plugins) and ships
configured. Browse to **Settings → Plugins**, find a plugin card, and click
**Install** — the catalog browser hands the plugin's `repo` URL to the same
installer as [install-from-URL](install-from-url.md). You can also add your own
catalog URL, and install / uninstall / configure plugins straight from the
catalog view.

---

## 1. What Is the Plugin Catalog

A catalog is a `plugins.json` document hosted in a git repository, listing
installable plugins. The server fetches every configured catalog
**server-side** (not from the browser) so the admin UI is not blocked by
GitHub-raw CORS, and so every fetch goes through one auditable egress path. The
admin Plugins section then renders each catalog's plugins as cards.

The default catalog, `detain/phlix-plugins`, lists the first-party plugins —
`phlix-plugin-anidb`, `phlix-plugin-myanimelist`, and `phlix-plugin-trakt`. The
catalog replaces manual URL pasting for operators who prefer a curated list,
but URL-pasting still works for anything not in a catalog (see
[Install from URL](install-from-url.md)).

For the `plugins.json` format and the full plugin list, see the
[Plugin Catalog reference](plugin-catalog.md).

---

## 2. Browse and Install from the Web UI

1. Browse to **Settings → Plugins** (or `/admin/plugins`).
2. The page renders a card per plugin across every configured catalog. Each
   card shows its title, type, summary, author, and tags.
3. Each card carries its local **install state** — installed / not installed,
   and enabled / disabled.
4. Click **Install** on the chosen plugin. The catalog browser hands the
   plugin's `repo` URL to the installer (the same path as
   [install-from-URL](install-from-url.md)); the plugin is downloaded and
   staged.
5. It lands **disabled** in the plugins table — flip the toggle to enable.

A plugin you installed from a bare URL that is not listed in any catalog still
appears, grouped under an **"Other installed plugins"** section.

---

## 3. Adding Another Catalog

You can point the Plugins section at additional catalogs (a private or
community-maintained list) by adding their URL in the admin UI:

- Paste a catalog URL — it must be an `http://` or `https://` URL.
- The new source is fetched server-side and its plugins join the card grid.
- Operator-added sources are persisted as a `plugins.catalog.sources` override
  in `server_settings`.
- The **default `detain/phlix-plugins` source cannot be removed.** The default
  itself is set in `config/plugins.php` under `catalog.default_source` and can
  be overridden per install.

A catalog that fails to fetch or parse is reported as an error in the UI rather
than blanking the whole page — one dead catalog cannot take the rest down.

---

## 4. Enabling and Configuring

After install:

- **Enable:** flip the toggle in **Settings → Plugins**.
- **Uninstall:** disable, then remove — this deletes the on-disk files and the
  database row.
- **Configure:** click the wrench / configure action to open the plugin's
  settings form. Settings vary by plugin type:

| Plugin Type | Typical Config Fields |
|-----------|---------------------|
| `metadata-provider` | API key, endpoint URL |
| `auth-provider` | Provider URL, client ID/secret, scopes |
| `scrobbler` | Service credentials |
| `transcoder` | Priority, encoding profile |
| `ui-theme` | No required config — applies immediately on enable |

Settings are persisted in the `plugins.settings_json` column. Each plugin
exposes its own fields as declared in its `plugin.json` `settings` block. The
install / uninstall / enable / disable / configure endpoints are **unchanged**
by the catalog rework — only catalog **discovery** is new.

---

## 5. What Can Go Wrong

### Failure 1: Catalog Fails to Load

**Symptom:** A catalog source shows an error in the Plugins section, or its
plugins are missing from the card grid.

**Cause:** The catalog URL was unreachable, timed out, returned non-JSON, or
its document was missing a `plugins` array.

**Fix:** Verify the URL resolves to a valid `plugins.json` (the server resolves
a repository URL to its raw `plugins.json` before fetching). Other catalogs
keep rendering regardless — the failure is isolated to the broken source.

---

### Failure 2: "A url field is required" / "must be an http(s) URL"

**Symptom:** Adding a catalog source fails with `plugin.catalog.url.required`
or `plugin.catalog.url.invalid`.

**Cause:** The submitted URL was empty, or used a scheme other than `http://`
/ `https://`.

**Fix:** Supply a non-empty `http://` or `https://` catalog URL.

---

### Failure 3: Version Incompatibility

**Symptom:** Install fails because the plugin requires a newer phlix-server
than you are running.

**Cause:** The plugin's `plugin.json` declares a `phlix_min_server_version`
higher than the running server.

**Fix:** Upgrade phlix-server before installing.

---

### Failure 4: Plugin Requires Restart

**Symptom:** Plugin is enabled but its hooks do not fire.

**Cause:** Plugin registers event listeners only at container boot, not on
enable.

**Fix:** Restart phlix-server:

```bash
systemctl restart phlix
# or, in the foreground, stop (Ctrl+C) and restart:
php public/index.php
```

The plugin auto-re-attaches on boot for enabled plugins.

---

## 6. Next Steps

- [Plugin Catalog reference](plugin-catalog.md) — the `plugins.json` format and the first-party plugin list
- [Install from URL](install-from-url.md) — for plugins not in any catalog, or for testing unreleased versions
- [Admin Plugins API](../reference/api/admin-plugins.yaml) — the `GET /plugins/catalog` and `/plugins/catalog/sources` wire contract
- [Plugin developer guide](developer-guide.md) — for plugin authors
