**Since:** 0.18.0

## TL;DR

Install a public plugin by pasting its `plugin.json` URL into Phlix. Two prerequisites: an admin account on the server and the plugin's HTTPS URL. The plugin lands **disabled** after install — flip the toggle to enable it. For curated, digest-pinned plugins in one click, use the [catalog](install-from-catalog.md) instead.

::: warning A pasted URL that is not in a catalog is refused by default
Only a URL that a configured catalog pins (with both `ref` and `artifactSha256`) carries a supply-chain pin. Anything else is a remote, un-pinned source, and the loader **refuses it** with `Refusing to install unverified plugin source …`. Set `PHLIX_PLUGINS_ALLOW_UNVERIFIED=1` to install un-pinned remote sources anyway — a warning is then logged on the `plugins` channel. `file://` and scheme-less sources are exempt from this gate.
:::

---

## 1. Prerequisites

- **Admin account** on the Phlix server (`users.is_admin = 1`).
- **Plugin's public `plugin.json` URL** — must be `https://` (or `file://` for an operator-local source). The admin install endpoint accepts only those two schemes; `PHLIX_PLUGINS_ALLOW_HTTP=1` does **not** re-open `http://` here, because it is read by the installer, not by this endpoint.
- **Optional:** a [trusted-key allowlist](trusted-plugin-list.md) entry for the author's key. The allowlist ships empty, and while it is empty a signature that matches the manifest contents is accepted without an entry.

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

After install, click **Configure** next to any plugin to open its per-plugin settings form. Settings are persisted in `plugins.settings_json`. Each plugin exposes its own fields (API keys, endpoint URLs, etc.) as declared in its `plugin.json` `settings` block; secret fields are masked and preserved unless you change them. See [Managing Plugins in the Admin UI](./admin-management#_6-configure) for the full configure workflow.

---

## 6. What Can Go Wrong

### Failure 1: Version Incompatibility

**Symptom:** `422` / `plugin.install.failed` with `phlix_min_server_version` in `fields[]`.

**Cause:** Running server is older than what the plugin requires.

**Fix:** Upgrade phlix-server first, or choose a different plugin version.

---

### Failure 2: Signature Verification Failure

**Symptom:** `422` with `"code": "plugin.install.failed"` and an `error` naming the signature. (Every install failure carries this one code — read the `error` string to tell the causes apart.)

**Cause:** The manifest declares a `sha256:…` signature that does not match `sha256(plugin.json)` as installed — the plugin was tampered with or corrupted in transit — or a non-empty trusted-key allowlist does not contain that signature.

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

- [Browse the plugin catalog](install-from-catalog.md) — for curated, digest-pinned plugins in one click
- [Trusted plugin list](trusted-plugin-list.md) — add an author's signing key to the allowlist
- [Plugin developer guide](developer-guide.md) — for plugin authors; understand what types exist and how to implement them
- [Verifying the install](developer-guide.md#verifying-the-install) — common plugin errors and `.logs/` exploration

---

## Security Notes

- **HTTPS only by default.** The controller refuses `http://` even when `PHLIX_PLUGINS_ALLOW_HTTP=1` is set elsewhere.
- **Signatures are honoured, but they are not required.** If the manifest declares a `sha256:…` signature it must match `sha256(plugin.json)` as installed; a mismatch fails the install unconditionally. It must **also** appear in the [trusted-key allowlist](trusted-plugin-list.md) *when the operator has configured a non-empty one* — the allowlist ships empty, so by default a content-matching signature is accepted without an entry. Unsigned plugins install with a warning in the `plugins` log channel, because `PHLIX_PLUGINS_REQUIRE_SIGNATURE` defaults to `0`.
- **CSRF is not required.** The API is Bearer-token authenticated. Browsers do not auto-attach Authorization headers across origins.
- **Every install / enable / disable / uninstall is audit-logged.** Entries land in the `AUTH` log channel with the actor user id and action name. See `docs/dev/architecture-server.md` for log paths.
