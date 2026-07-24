---
title: Single Sign-On (OIDC & LDAP)
description: Enable and configure OpenID Connect and LDAP external login for Phlix
---

# Single Sign-On (OIDC & LDAP)

Phlix can authenticate users against an external identity provider instead of
(or alongside) local Phlix accounts:

- **OIDC** — any OpenID Connect provider (Authentik, Keycloak, Google, Okta,
  Azure AD, etc.) using the authorization-code flow.
- **LDAP** — a corporate directory (OpenLDAP, Active Directory, FreeIPA, …).

Both are **off by default**. Each is enabled independently from the admin console
and only becomes live once it has been configured.

::: tip Where config lives today
Provider settings (issuer, client ID/secret, LDAP host/base-DN, …) are stored per
plugin and edited through the admin **Integrations → Auth providers** UI. A future
release moves these to DB-backed server settings; the setting *keys* below are
stable.
:::

## Enabling a provider

There are two pieces of state:

1. **The enable flag** — a server setting, `auth.oidc.enabled` or
   `auth.ldap.enabled`, toggled from the admin console.
2. **The provider configuration** — the issuer / client / directory details.

A provider only goes **live** when it is both **enabled** and **configured**.

To turn one on:

1. Open the admin console → **Integrations** → **Auth providers**
   (`/admin/integrations#auth-providers`).
2. Expand the provider (OIDC or LDAP) and fill in its configuration form
   (see [Provider configuration](#provider-configuration)). Save.
3. Flip the provider's **Enable** toggle.

Enabling a **configured** provider returns `200` and the provider becomes live
immediately — you do **not** need to restart the server. (The worker that served
the request registers it at once; every other worker registers it on the request
path the first time it is needed, and on its next start/reload.)

If you toggle **Enable** on a provider that has **not** been configured yet, the
request is rejected with `409 not_configured` and a message telling you to
configure it first — the "Enabled" badge always means "provider live", never just
"setting saved".

## Provider configuration

Configuration is edited under **Integrations → Auth providers** and saved via the
admin API (`POST /api/v1/admin/auth-providers/oidc/config` and
`.../ldap/config`). Secrets are write-only — they are never returned by the read
endpoint, and leaving a secret field blank keeps the stored value.

### OIDC settings

| Key | Required | Notes |
|-----|----------|-------|
| `provider_url` | yes | The OIDC **issuer** URL (its `/.well-known/openid-configuration` is discovered from this). |
| `client_id` | yes | The client ID registered with your IdP. |
| `client_secret` | yes | The client secret (write-only). |
| `scopes` | no | Space-separated scopes. Default: `openid profile email`. |

**Redirect / callback URL to register at your IdP:** register

```
https://<your-server>/auth/oidc/callback
```

as an allowed redirect URI for the Phlix client at your identity provider. This
is the path Phlix asks the IdP to return the browser to after the user
authenticates.

### LDAP settings

| Key | Required | Default | Notes |
|-----|----------|---------|-------|
| `host` | yes | — | LDAP server hostname. |
| `port` | no | `389` | `636` is typical for LDAPS. |
| `ssl` | no | `false` | Use SSL/LDAPS. |
| `base_dn` | yes | — | Search base for user lookups. |
| `bind_dn` | no | — | Service-account DN used to search (leave blank for anonymous bind). |
| `bind_pw` | no | — | Service-account password (write-only). |
| `user_filter` | no | `(uid={{username}})` | `{{username}}` is substituted with the submitted username. For Active Directory use e.g. `(sAMAccountName={{username}})`. |
| `admin_group` | no | — | Members of this group DN are granted admin. |

The LDAP form also has a **Test connection** button
(`POST /api/v1/admin/auth-providers/ldap/test`) that dry-runs a bind with the
current form values before you save.

## How users log in

### OIDC

1. The client sends the browser to
   `GET /auth/oidc/authorize?redirect_uri=<same-origin path>`. The `redirect_uri`
   here is the in-app page Phlix returns the user to **after** login — it must be
   a **same-origin relative path** (see [Security posture](#security-posture)).
2. Phlix redirects the browser to your IdP with a PKCE challenge plus a `state`
   and `nonce`.
3. The user authenticates at the IdP, which redirects back to
   `GET /auth/oidc/callback`.
4. Phlix validates the returned id-token (signature, `iss`, `aud`, `exp`),
   consumes the one-time `state`, mints a Phlix session, and `302`s the browser to
   the `redirect_uri` from step 1 — now authenticated.

### LDAP

LDAP login rides the normal login endpoint. Send `POST /auth/login` with an
**`ldap:`-prefixed username** plus the user's directory password:

```json
{ "username": "ldap:jdoe", "password": "…" }
```

Phlix strips the `ldap:` prefix, binds against the configured directory, and — on
success — mints a session exactly like a local login. A user without the `ldap:`
prefix is always treated as a local account.

## Account linking

An **already-signed-in** account can attach one or more external identities to
itself, and list what is linked. All three endpoints below are **authenticated** —
the current user is read from the validated session (Bearer token / session
cookie), never from the request body — and none of them create a new account or
mint a new session.

::: warning What linking does *not* do yet
S45 **records and lists** a link. **Unlinking** an identity, and **logging in *via*
a linked identity** (repointing the login lookup onto the `user_identities` store),
arrive in a **later release**. For now, external login still uses the flows in
[How users log in](#how-users-log-in); a freshly-linked identity becomes usable for
login in that later release. Multiple *instances* of the same provider are also a
later step.
:::

### The security guarantee: verified links only

Linking **always proves you actually control the external identity** — a
client-claimed identifier is never trusted:

- **OIDC** is verified by a full round-trip to your IdP (authorization-code + PKCE
  flow and id-token validation, exactly like login). The linked identity is the
  IdP-verified subject (`sub`); any `external_id` in the request is ignored.
- **LDAP** is verified by a **live bind** with the supplied credentials. Only a
  successful bind links the directory identity; the linked identity is the
  directory's own DN, not anything from the request.

Because the OIDC link carries the initiating user in **server-side** state (not a
client-visible parameter), an attacker cannot forge or swap the target account —
you can only ever link an identity you can authenticate as, onto your own account.
Linking never changes your primary login and never issues a new session.

### List your linked identities

```
GET /auth/identities        (authenticated)
```

Returns the identities linked to the current user:

```json
{
  "identities": [
    {
      "id": "…",
      "provider": "oidc",
      "provider_instance": "",
      "external_id": "oidc.<sub>",
      "linked_at": "2026-07-24 00:00:00"
    }
  ]
}
```

`provider_instance` is `""` for the default single instance. Provider secrets and
internal `provider_data` are **never** returned.

### Link an OIDC identity

```
GET /auth/identities/link/oidc        (authenticated)
```

Starts the OIDC authorization-code + PKCE flow with a server-side **link intent**.
The browser is redirected to your IdP; after you authenticate, the existing
`GET /auth/oidc/callback` attaches the IdP-verified `sub` to your account and
`302`s back to the same-origin app with a `?linked=oidc` marker. **No login session
is minted** — you stay logged in as yourself.

### Link an LDAP identity

```
POST /auth/identities/link/ldap        (authenticated)
Body: { "username": "jdoe", "password": "…" }
```

Performs a live LDAP bind with the supplied credentials. On success the directory
identity is linked and the endpoint returns `200`
`{ success, provider, created, message }` (`created:false` means it was already
linked to you — see idempotency below). A failed bind links nothing and returns a
generic `401 "Invalid credentials"` (no account-enumeration oracle); a genuine
directory/config failure returns `503`.

### Conflicts and idempotency

- **Already linked to *another* account →** `409 identity_already_linked`. An
  external identity can belong to only one Phlix account; Phlix never silently
  re-homes it.
- **Already linked to *your* account →** idempotent **success** (LDAP returns
  `created:false`; OIDC redirects back with `?linked=oidc`). Linking twice is safe.

The `user_identities` table's UNIQUE index is the race backstop, so two concurrent
link attempts resolve to exactly one row (a genuine server error is surfaced as a
`5xx`, never mislabeled as a `409`).

## Security posture

- **Session cookies, not URL tokens.** A successful OIDC login delivers the
  session as **httpOnly + Secure + SameSite=Lax** cookies (`phlix_session` and
  `phlix_refresh`). Tokens are never placed in the URL or query string, so they
  can't leak via browser history, referrers, or access logs. (`Secure` is applied
  when the request is served over HTTPS.)
- **Same-origin redirect only.** The OIDC `redirect_uri` (the post-login landing
  page) is allowlisted to a **same-origin relative path**. Absolute URLs,
  protocol-relative `//host`, back-slash tricks (`/\host`), `javascript:`, and any
  control/CRLF characters are rejected with `400 invalid_redirect_uri`. This
  prevents an attacker from phishing the flow and having a victim's freshly-minted
  session redirected to a foreign origin.
- **Brute-force rate limiting.** `ldap:` logins share the same per-IP rate-limit
  budget as local logins. Exceeding it returns `429` with a `Retry-After`.
- **No account enumeration.** A wrong LDAP username or password returns a generic
  `401 "Invalid credentials"`. Only a genuine directory misconfiguration or
  connection failure returns `503` (so operators can tell a config problem from a
  bad password without leaking which usernames exist).
- **Distinct identities per provider.** External identities are stored with their
  real provider (`oidc` / `ldap`) and looked up by `(provider, external_id)`, so
  the same `sub`/DN presented by two different providers maps to two distinct
  users — never a silent account merge.

## Operational notes

- **Migration 091 applies automatically.** External (passwordless) users are
  created with a null `password_hash`; migration
  `091_users_password_hash_nullable.sql` relaxes that column and is applied by the
  migration runner on upgrade — **no manual step**. Users whose IdP supplies no
  email/username are still created (Phlix assigns a deterministic placeholder
  derived from the provider + external ID).
- **Migration 092 applies automatically (forward-looking, no behaviour change).**
  `092_user_identities.sql` adds a `user_identities` join table — the future home
  for multiple external identities per account (account-linking and multi-instance
  providers) — and backfills a row for every existing external-identity user,
  deriving the real provider (`oidc` / `ldap`) and de-duplicating any legacy
  duplicates. It is applied by the migration runner on upgrade — **no manual step**.
  This is internal foundation only: `users.provider` / `users.external_id` remain
  the **authoritative login-lookup columns**, so login behaviour (including the
  distinct-identities-per-provider guarantee above) is unchanged.
- **Non-blocking OIDC I/O.** OIDC discovery, token exchange, userinfo, and JWKS
  fetches use a non-blocking HTTP client so they don't stall the worker. LDAP
  binds remain a bounded (5 s) blocking call — the `ext-ldap` extension has no
  Swoole-hookable async client.

## Admin API reference

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v1/admin/auth-providers` | List providers |
| `POST` | `/api/v1/admin/auth-providers/{name}/enable` | Enable (`200` live / `409 not_configured` / `404 unknown_provider`) |
| `POST` | `/api/v1/admin/auth-providers/{name}/disable` | Disable |
| `GET`/`POST` | `/api/v1/admin/auth-providers/oidc/config` | Read / save OIDC config |
| `GET`/`POST` | `/api/v1/admin/auth-providers/ldap/config` | Read / save LDAP config |
| `POST` | `/api/v1/admin/auth-providers/ldap/test` | Dry-run an LDAP bind |
| `GET` | `/auth/oidc/authorize` | Start the OIDC flow (unauthenticated) |
| `GET` | `/auth/oidc/callback` | OIDC callback from the IdP (unauthenticated; also handles the account-link branch) |
| `POST` | `/auth/login` | Local login, or LDAP with an `ldap:`-prefixed username |
| `GET` | `/auth/identities` | List the current user's linked identities (**authenticated**) |
| `GET` | `/auth/identities/link/oidc` | Start linking an OIDC identity to the current account (**authenticated**) |
| `POST` | `/auth/identities/link/ldap` | Link an LDAP identity via a live bind (**authenticated**); body `{username, password}` |

The admin config UI and its endpoints are also covered in
[Integrations → Auth providers](../admin/integrations#auth-providers).
