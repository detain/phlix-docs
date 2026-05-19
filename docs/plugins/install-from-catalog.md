**Phase:** N (End-User Documentation)
**Step:** N.14
**Since:** 0.18.0

## TL;DR

The plugin catalog is a hub-hosted, browsable list of curated plugins — each signature-verified against the Phlex hub's published keys. Browse to **Settings → Plugins → Browse Catalog**, pick a plugin, click **Install**, and the verified plugin lands in one click. Catalog plugins carry SHA256 signatures and are moderated by the hub team, so you don't need to manage your own trusted-key allowlist for community plugins.

---

## 1. What Is the Plugin Catalog

The catalog is a JSON endpoint served by the Phlex hub (`https://catalog.phlex.media/v1/plugins` or similar), listing every community plugin that has passed hub moderation and carries a valid signature from a registered author. Operators can browse by plugin type, search by name, and install in one click. The catalog replaces manual URL pasting for operators who prefer curated plugins.

Plugin types available in the catalog: `metadata-provider`, `auth-provider`, `notifier`, `scrobbler`, `tuner`, `transcoder-hook`, `ui-theme`, `library-type`, `subtitle-provider`, `arr-integration`, `analytics-sink`.

---

## 2. Browse and Install from the Web UI

1. Browse to **Settings → Plugins** (or `/admin/plugins`).
2. Click **Browse Catalog** (or navigate directly to `/admin/plugins/catalog`).
3. Use the **type filter** dropdown to narrow by category (`metadata-provider`, `auth-provider`, `notifier`, `scrobbler`, `tuner`, `transcoder-hook`, `ui-theme`, etc.).
4. Click a plugin card to expand its detail panel: description, author, version, `phlex_min_server_version`, signature status.
5. Click **Install** on the chosen plugin.
6. The plugin is downloaded, signature-verified, and staged automatically.
7. It lands **disabled** in the plugins table — flip the toggle to enable.

Screenshot placeholder: `[screenshot: plugin catalog browse view with type filter and install button]`

---

## 3. Enabling and Configuring

After install:

- **Enable:** flip the toggle in **Settings → Plugins** table.
- **Configure:** click the wrench icon to open the plugin's settings form. Settings vary by plugin type:

| Plugin Type | Typical Config Fields |
|-----------|---------------------|
| `metadata-provider` | API key, endpoint URL |
| `auth-provider` | Provider URL, client ID/secret, scopes |
| `notifier` | Webhook URL, channel/room, auth token |
| `scrobbler` | Service credentials |
| `tuner` | Device ID, lineup URL |
| `transcoder-hook` | Priority, encoding profile |
| `ui-theme` | No required config — applies immediately on enable |

Settings are persisted in the `plugins.settings_json` column. Each plugin exposes its own fields as declared in its `plugin.json` `settings` block.

---

## 4. Updating Catalog Plugins

When a catalog plugin ships a new version:

- A badge appears on the plugin card in the catalog view.
- The **Update** button triggers `install` again; the loader replaces on-disk files and retains `enabled` state and `settings_json`.
- After update, the plugin auto-re-attaches on the next server restart (or immediately if it does not require restart — see Failure 3 below).

---

## 5. Removing a Catalog Plugin

Same as URL-installed plugins: **Settings → Plugins** → toggle **Disable** → click **Uninstall**. This removes the on-disk files and the database row. Catalog browsing state is preserved (the plugin remains browsable in the catalog; you can reinstall).

---

## 6. What Can Go Wrong

### Failure 1: Version Incompatibility

**Symptom:** "This plugin requires phlex-server ≥ 1.2.0; you are running 1.1.4" shown in the catalog detail panel.

**Cause:** Running server is older than the plugin's `phlex_min_server_version`.

**Fix:** Upgrade phlex-server before installing. The catalog shows compatibility info before you install — pay attention to the version badge.

---

### Failure 2: Signature Verification Failure

**Symptom:** Install fails with "Signature verification failed."

**Cause:** Plugin tarball was corrupted during download, or hub moderation was bypassed.

**Fix:** Report to hub moderation at [github.com/detain/phlex-plugin-catalog](https://github.com/detain/phlex-plugin-catalog). Do not bypass the signature check manually.

---

### Failure 3: Plugin Requires Restart

**Symptom:** Plugin is enabled but its hooks do not fire (e.g., `transcoder-hook` never intercepts a transcode).

**Cause:** Plugin registers event listeners only at container boot, not on enable.

**Fix:** Restart phlex-server:

```bash
systemctl restart phlex
# or
php bin/phlex restart
```

The plugin auto-re-attaches on boot for enabled plugins.

---

### Failure 4: ui-theme CSS Breaks Web Portal

**Symptom:** Web portal blank or partially styled after enabling a `ui-theme`.

**Cause:** Theme uses CSS selectors that conflict with the current portal DOM structure.

**Fix:** Disable immediately via CLI:

```bash
curl -sS -X POST https://phlex.example.com/api/v1/admin/plugins/<name>/disable \
  -H "Authorization: Bearer $TOKEN"
```

Then contact the plugin author with your Phlex server version and portal DOM details.

---

## 7. Next Steps

- [Install from URL](install-from-url.md) — for plugins not yet in the catalog, or for testing unreleased versions
- [Trusted plugin list](trusted-plugin-list.md) — how the hub's signature allowlist works and how to request plugin listing
- [Plugin developer guide](developer-guide.md) — for plugin authors; learn how to publish a plugin to the catalog
- [Plugin catalog source](https://github.com/detain/phlex-plugin-catalog) — file an issue or PR to add or update a community plugin listing
