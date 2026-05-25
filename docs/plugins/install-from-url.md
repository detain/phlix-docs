**Phase:** N (End-User Documentation)
**Step:** N.14
**Since:** 0.18.0

## TL;DR

Install any public plugin by pasting its `plugin.json` URL into Phlix. Two prerequisites: an admin account on the server and the plugin's HTTPS URL. The plugin lands **disabled** after install — flip the toggle to enable it. For curated, signature-verified plugins in one click, use the [catalog](install-from-catalog.md) instead.

---

## 1. Prerequisites

- **Admin account** on the Phlix server (`users.is_admin = 1`).
- **Plugin's public `plugin.json` URL** — must be HTTPS (`http://` refused unless `PHLIX_PLUGINS_ALLOW_HTTP=1`).
- **Optional:** signed plugins need their author key in the [trusted-key allowlist](trusted-plugin-list.md).

---

## 2. Install from the Web UI

1. Browse to **Settings → Plugins** (or `/admin/plugins`).
2. Locate **Install from URL** panel.
3. Paste the plugin's `plugin.json` URL.
4. Click **Install**.
5. Wait for the server to download, validate, and stage the plugin.
6. Find the plugin in the table — it lands **disabled** by default.
7. Flip the toggle to enable it.

Screenshot placeholder: `[screenshot: admin/plugins table with phlix-plugin-example row, toggle off]`

---

## 3. Install from the Command Line

```bash
TOKEN="…your admin bearer token…"

# 1. Install from URL
curl -sS -X POST https://phlix.example.com/api/v1/admin/plugins/install \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://example.com/my-plugin/plugin.json"}'

# 2. Enable
curl -sS -X POST https://phlix.example.com/api/v1/admin/plugins/my-plugin/enable \
     -H "Authorization: Bearer $TOKEN"

# 3. List installed plugins
curl -sS https://phlix.example.com/api/v1/admin/plugins \
     -H "Authorization: Bearer $TOKEN"

# 4. Disable
curl -sS -X POST https://phlix.example.com/api/v1/admin/plugins/my-plugin/disable \
     -H "Authorization: Bearer $TOKEN"

# 5. Uninstall
curl -sS -X DELETE https://phlix.example.com/api/v1/admin/plugins/my-plugin \
     -H "Authorization: Bearer $TOKEN"
```

---

## 4. Reference Plugin Walkthrough

Try the install flow on a fresh server using the reference plugin:

```
https://raw.githubusercontent.com/detain/phlix-plugin-example/main/plugin.json
```

Steps: paste → Install → toggle Enable → confirm in the plugins table. The reference plugin (`phlix-plugin-example`) is a minimal `metadata-provider` that returns `{"title": "Hello, World"}` for a known fixture path — safe to install on any environment.

---

## 5. Plugin Settings

After install, click **Settings** (wrench icon) next to any enabled plugin to open its per-plugin settings form. Settings are persisted in `plugins.settings_json`. Each plugin exposes its own fields (API keys, endpoint URLs, etc.) as declared in its `plugin.json` `settings` block.

---

## 6. What Can Go Wrong

### Failure 1: Version Incompatibility

**Symptom:** `422` / `plugin.install.failed` with `phlix_min_server_version` in `fields[]`.

**Cause:** Running server is older than what the plugin requires.

**Fix:** Upgrade phlix-server first, or choose a different plugin version.

---

### Failure 2: Signature Verification Failure

**Symptom:** `422` / `plugin.signature.mismatch`.

**Cause:** Downloaded tarball was corrupted in transit, or the plugin was tampered with.

**Fix:** Re-download the plugin, or check with the plugin author that the signature is current.

---

### Failure 3: Plugin Requires Restart

**Symptom:** Plugin listener never fires even after enable.

**Cause:** Some plugins (`transcoder-hook`, `ui-theme`) register hooks only at server boot, not on enable.

**Fix:** Restart phlix-server:

```bash
systemctl restart phlix
# or, in the foreground, stop (Ctrl+C) and restart:
php public/index.php
```

---

### Failure 4: ui-theme CSS Breaks Web Portal

**Symptom:** Web portal blank or unstyled after enabling a `ui-theme`.

**Cause:** Theme's CSS conflicts with current portal version.

**Fix:** Disable via CLI:

```bash
curl -sS -X POST https://phlix.example.com/api/v1/admin/plugins/<name>/disable \
  -H "Authorization: Bearer $TOKEN"
```

Then contact the plugin author.

---

## 7. Next Steps

- [Browse the plugin catalog](install-from-catalog.md) — for curated, signature-verified plugins in one click
- [Trusted plugin list](trusted-plugin-list.md) — add an author's signing key to the allowlist
- [Plugin developer guide](developer-guide.md) — for plugin authors; understand what types exist and how to implement them
- [Troubleshooting](developer-guide.md#faq--troubleshooting) — common plugin errors and `.logs/` exploration

---

## Security Notes

- **HTTPS only by default.** The controller refuses `http://` even when `PHLIX_PLUGINS_ALLOW_HTTP=1` is set elsewhere.
- **Signatures are honoured.** If the manifest declares a `sha256:…` signature, install fails unless that signature appears in the [trusted-key allowlist](trusted-plugin-list.md). Unsigned plugins install with a warning in the `plugins` log channel.
- **CSRF is not required.** The API is Bearer-token authenticated. Browsers do not auto-attach Authorization headers across origins.
- **Every install / enable / disable / uninstall is audit-logged.** Entries land in the `AUTH` log channel with the actor user id and action name. See `docs/dev/architecture-server.md` for log paths.
