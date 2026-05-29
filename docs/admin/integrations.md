# Integrations

Phlix supports several integration points with external services. Each integration is configured and managed independently.

## Webhooks

The Webhooks page (`/admin/webhooks`) in the admin console provides full CRUD management for webhook subscriptions, plus a per-webhook test trigger.

### What it does

Webhooks send signed HTTP POST requests to configured endpoints when events occur on the server. Each request carries a JSON payload and is verified with `X-Phlix-Signature: sha256=<hmac>` so receivers can authenticate the source.

### Managing webhooks in the UI

| Action | How |
|--------|-----|
| List | DataTable showing name, URL, event count badge, and row actions (Edit / Test / Delete) |
| Add | "Add Webhook" button opens a modal with name, URL, secret (with Show/Hide toggle), and event multi-select grouped by category |
| Edit | Row action opens the same modal pre-filled. Leave secret blank to keep the current value |
| Delete | Row action shows a confirm modal, then calls `DELETE /api/v1/admin/webhooks/{id}` |
| Test | Row action fires `POST /api/v1/admin/webhooks/{id}/test` and shows the delivery result (green checkmark or red X with message) |

The event multi-select lists the 7 subscribable events from the catalog, grouped into 5 categories:

| Category | Events |
|----------|--------|
| Playback | `playback.started`, `playback.ended` |
| Library | `library.updated` |
| Downloads | `download.complete` |
| Recordings | `recording.started`, `recording.stopped` |
| Alerts | `alert` |

`webhook.test` is **not** shown — it is used internally by the test button only.

### API contract

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/admin/webhooks` | List all webhooks |
| `POST` | `/api/v1/admin/webhooks` | Register a new webhook |
| `PUT` | `/api/v1/admin/webhooks/{id}` | Update name, URL, or events (secret never returned; omit secret field to keep existing) |
| `DELETE` | `/api/v1/admin/webhooks/{id}` | Remove a webhook |
| `POST` | `/api/v1/admin/webhooks/{id}/test` | Fire a test dispatch |

The backend is documented in [`webhooks.md`](./webhooks).

### Note on other integrations

Arr sync and authentication providers are covered above (step 1.4b). Trakt.tv OAuth connect/disconnect and Last.fm scrobbling connect/disconnect are documented in [`services.md`](./services) (step 1.4c).

## Arr sync

The Arr sync section (`/admin/integrations#arr-sync`) connects to TRaSH-Guides-compatible indexers (Sonarr/Radarr/Bazarr/Prowlarr) to keep media metadata — season packs, quality profiles, and release profiles — in sync across yourarr stack.

### What it does

- Displays the last sync timestamp (or **Never synced** if no sync has run yet) and the current enabled/disabled state.
- A **Sync now** button manually triggers a POST to pull the latest release profiles from the configured TRaSH-Guides instance.
- An **Enable / Disable** toggle controls whether auto-sync runs on schedule.

### Managing arr sync in the UI

| Action | How |
|--------|-----|
| Check status | The card shows `last_sync_at` (ISO timestamp) or "Never synced" and an enabled/disabled badge |
| Sync now | **Sync now** button fires `POST /api/v1/admin/sync/trash-guides`; button label changes to "Syncing…" with a spinner for the duration; toast on success or error updates the last-sync time |
| Toggle auto-sync | Enable/disable toggle fires `PUT /api/v1/admin/sync/enable { enabled: bool }`; success toast confirms |

### API contract

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/admin/sync/status` | Returns `{ enabled, last_sync_at, last_sync_timestamp }` |
| `POST` | `/api/v1/admin/sync/trash-guides` | Triggers a manual TRaSH-Guides sync |
| `PUT` | `/api/v1/admin/sync/enable` | Body `{ enabled: bool }` — enables or disables auto-sync |

## Auth providers

The Auth providers section (`/admin/integrations#auth-providers`) lets admins configure external authentication backends — **OIDC** (OpenID Connect) and **LDAP** — so users can log in with their corporate or identity-provider credentials instead of local Phlix accounts.

### What it does

- Lists all registered auth providers (OIDC, LDAP) with an enable/disable toggle per provider.
- Expanding a provider reveals its configuration form, pre-filled from the current server settings.
- LDAP additionally exposes a **Test connection** button that fires a dry-run `POST` with the current form values and reports success or failure.

### Managing auth providers in the UI

| Action | How |
|--------|-----|
| List providers | Provider cards for OIDC and LDAP show name, whether they are currently enabled, and a **Configure** expand control |
| Enable/disable | Toggle switch per provider fires `POST /api/v1/admin/auth-providers/{name}/enable\|disable` |
| Configure OIDC | Clicking **Configure** expands a form with `provider_url`, `client_id`, `client_secret` (optional, write-only), and `scopes`; Save fires `POST /api/v1/admin/auth-providers/oidc/config` |
| Configure LDAP | Clicking **Configure** expands a form with `host`, `port`, `ssl` (switch), `base_dn`, `bind_dn`, `bind_pw` (optional, write-only), `user_filter`, `admin_group`; Save fires `POST /api/v1/admin/auth-providers/ldap/config`; **Test connection** fires `POST /api/v1/admin/auth-providers/ldap/test` with the current form values and shows a result toast |
| Pre-fill | All forms call the GET settings endpoint before rendering so the current values are shown (secrets never returned — shown as empty with "(unchanged)" placeholder) |

### API contract

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/admin/auth-providers` | Lists all providers `{ providers: [{ name, supports_authentication }] }` |
| `POST` | `/api/v1/admin/auth-providers/{name}/enable` | Enables a provider |
| `POST` | `/api/v1/admin/auth-providers/{name}/disable` | Disables a provider |
| `GET` | `/api/v1/admin/auth-providers/{name}/config-schema` | Returns the provider's JSON schema for form rendering |
| `GET` | `/api/v1/admin/auth-providers/oidc/config` | Returns `{ provider_url, client_id, scopes, configured }` |
| `POST` | `/api/v1/admin/auth-providers/oidc/config` | Body `{ provider_url, client_id, client_secret?, scopes }` |
| `GET` | `/api/v1/admin/auth-providers/oidc/schema` | Returns the OIDC config schema |
| `GET` | `/api/v1/admin/auth-providers/ldap/config` | Returns `{ host, port, ssl, base_dn, bind_dn, user_filter, admin_group, configured }` |
| `POST` | `/api/v1/admin/auth-providers/ldap/config` | Body `{ host, port, ssl, base_dn, bind_dn, bind_pw?, user_filter, admin_group }` |
| `POST` | `/api/v1/admin/auth-providers/ldap/test` | Body same as LDAP save; returns `{ success, message }` |
| `GET` | `/api/v1/admin/auth-providers/ldap/schema` | Returns the LDAP config schema |
