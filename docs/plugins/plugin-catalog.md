# Phlix Plugin Catalog

> **Status:** This document lists officially maintained and community-
> contributed plugins for the Phlix Media Server. Plugin installation
> is documented in [install-from-catalog.md](./install-from-catalog.md)
> and [install-from-url.md](./install-from-url.md).

## How the catalog works

The admin **Plugins** section browses a **catalog** of installable plugins
rather than only accepting a single repo URL. A catalog is a `plugins.json`
document hosted in a git repo. The **default catalog** is
[`detain/phlix-plugins`](https://github.com/detain/phlix-plugins) and ships
configured out of the box; operators can add more catalog URLs from the UI.

### The `plugins.json` format

A catalog document looks like this:

```json
{
  "schemaVersion": 1,
  "name": "Phlix Official Plugins",
  "plugins": [
    {
      "name": "phlix-plugin-anidb",
      "title": "AniDB",
      "type": "metadata-provider",
      "summary": "Anime metadata from AniDB.",
      "description": "Longer description shown in the plugin detail panel.",
      "repo": "https://github.com/detain/phlix-plugin-anidb",
      "author": "detain",
      "tags": ["anime", "metadata"]
    }
  ]
}
```

Only **`name`** and **`repo`** are required per entry — every other field
(`title`, `type`, `summary`, `description`, `author`, `tags`) degrades to a
sensible empty default, so a sparse catalog still renders. `repo` is the git
repository URL the plugin installs from (it is handed verbatim to the existing
[install-from-URL](./install-from-url.md) flow).

### Browsing from the admin UI

The server fetches every configured catalog **server-side** (not from the
browser) — both to dodge GitHub-raw CORS restrictions and to keep a single,
auditable egress path. The admin Plugins section then renders each catalog's
plugins as cards. Each card is annotated with its local **install state**
(installed / not installed, and enabled / disabled), so you can install,
uninstall, or configure straight from the catalog view.

A plugin you installed from a bare URL that is **not listed in any catalog**
still appears, grouped under an **"Other installed plugins"** section.

### Adding another catalog

You can point the section at additional catalogs (e.g. a private or
community-maintained list) by adding their URL in the admin UI. The URL must be
an `http://` or `https://` URL. The **default `detain/phlix-plugins` source
cannot be removed**; operator-added sources are persisted as a
`plugins.catalog.sources` override in `server_settings`. The default itself is
set in the server's `config/plugins.php` under `catalog.default_source` and can
be overridden per install.

The wire contract for the catalog browser (the `GET /plugins/catalog` and
`POST`/`DELETE /plugins/catalog/sources` admin endpoints) is documented in the
[Admin Plugins API](../reference/api/admin-plugins.yaml).

## Official Plugins (Maintained by Phlix)

The first-party plugins below are published in the default
[`detain/phlix-plugins`](https://github.com/detain/phlix-plugins) catalog —
`phlix-plugin-anidb`, `phlix-plugin-myanimelist`, and `phlix-plugin-trakt` —
and each installs from its own repository.

### phlix-plugin-anidb

**Type:** `metadata-provider` | **Repository:** `detain/phlix-plugin-anidb`

Anime metadata provider sourcing titles, descriptions, and topics/tags from
**AniDB**. Listed as a catalog plugin in `detain/phlix-plugins`.

### phlix-plugin-myanimelist

**Type:** `metadata-provider` | **Repository:** `detain/phlix-plugin-myanimelist`

Anime metadata provider sourcing descriptions and topics from **MyAnimeList**.
Listed as a catalog plugin in `detain/phlix-plugins`.

### phlix-plugin-trakt

**Type:** `scrobbler` | **Repository:** `detain/phlix-plugin-trakt`

Trakt scrobbler / sync integration. Previously bundled into the server, Trakt
is now maintained in its **own repository** and is published as a catalog
plugin in `detain/phlix-plugins`.

### phlix-plugin-oidc

**Type:** `auth-provider` | **Version:** 1.0.0

OpenID Connect / OAuth2 authentication provider plugin. Adds SSO login
via any OIDC-compliant identity provider (Keycloak, Authelia, Authentik,
Google Workspace, GitHub OAuth).

**Repository:** `detain/phlix-plugin-oidc` (bundled in `src/Plugins/Oidc/`)

**Features:**
- Authorization Code flow with PKCE support
- RS256/RS384/RS512 signature validation
- Discovery document caching (24h)
- Automatic user provisioning on first login
- Account linking for existing users
- Admin UI for provider configuration

**Manifest fields:**
```json
{
  "name": "phlix-plugin-oidc",
  "version": "1.0.0",
  "phlix_min_server_version": "0.11.0",
  "type": "auth-provider",
  "entry": "Phlix\\Plugins\\Oidc\\Plugin",
  "settings": {
    "provider_url": { "type": "string", "required": true, "secret": false },
    "client_id": { "type": "string", "required": true, "secret": false },
    "client_secret": { "type": "string", "required": true, "secret": true },
    "scopes": { "type": "string", "required": false, "default": "openid profile email" }
  }
}
```

**Configuration:**
1. Install the plugin from the admin UI
2. Navigate to **Admin → Auth Providers → OIDC**
3. Enter your OIDC provider's base URL, client ID, and client secret
4. Register `https://your-phlix-server/auth/oidc/callback` as a redirect URI in your OIDC provider
5. Save settings and enable the provider

**Supported providers:**
- Keycloak (any version with OIDC support)
- Authelia
- Authentik
- Google Workspace / Gmail OAuth
- GitHub OAuth (limited — not a true OIDC provider)
- Any OIDC-compliant IdP

## Community Plugins

Community plugins are not officially supported by Phlix. Use at
your own risk.

| Plugin | Type | Description |
|--------|------|-------------|
| _(none yet)_ | | |

## Plugin Types

| Type | Description |
|------|-------------|
| `metadata-provider` | Provides movie/TV show metadata (TMDB, TVDB, etc.) |
| `auth-provider` | External authentication (OIDC, LDAP, SAML, passkeys) |
| `scrobbler` | Scrobbles watched content to third-party services |
| `transcoder` | Alternative transcoding pipelines |
| `storage` | Cloud storage backends |
| `ui-theme` | Web portal visual themes |
| `dlna` | DLNA/Digital Media Server features |
| `syncplay` | SyncPlay replacement for synchronized viewing |
| `livetv` | Live TV / DVR functionality |
| `analytics` | Usage analytics and reporting |
| `admin-plugin` | Admin UI enhancements |

## Plugin Manifest Reference

Full `plugin.json` schema is documented in [manifest.md](./manifest.md).

## Security

All plugins run with the same privileges as the Phlix server process.
Only install plugins from trusted sources. Review the plugin's code
before installing, especially if it requires network access or handles
sensitive data.

Plugins must be signed before they can be installed from the catalog.
See [trusted-plugin-list.md](./trusted-plugin-list.md) for the trust
model and how to add trusted keys.
