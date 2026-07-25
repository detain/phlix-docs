---
title: Single Sign-On (OIDC, LDAP & GitHub)
description: Enable and configure OpenID Connect, LDAP and GitHub external login for Phlix
---

# Single Sign-On (OIDC, LDAP & GitHub)

Phlix can authenticate users against an external identity provider instead of
(or alongside) local Phlix accounts:

- **OIDC** — any OpenID Connect provider (Authentik, Keycloak, Google, Okta,
  Azure AD, etc.) using the authorization-code flow.
- **LDAP** — a corporate directory (OpenLDAP, Active Directory, FreeIPA, …).
- **GitHub** — a GitHub OAuth App (plain OAuth 2.0, not OIDC).

All three are **off by default**. Each is enabled independently and only becomes
live once it has been configured.

::: warning Before you configure OIDC or GitHub: set `PHLIX_DOMAIN`
Both browser flows send an **absolute** `redirect_uri` to the provider, and Phlix
will only build one from a request whose `Host` matches the server's configured
public authority (`PHLIX_DOMAIN`). If neither `PHLIX_DOMAIN` **nor** an absolute
per-provider `redirect_uri` is set, sign-in **fails closed** with
`503 callback_url_not_configured`. See
[Callback URLs and `PHLIX_DOMAIN`](#callback-urls-and-phlix-domain) — read it
before you register anything at your IdP.
:::

::: tip Where config lives
Provider settings (issuer, client ID/secret, LDAP host/base-DN, GitHub client
id/secret, …) are stored **in the database** — one row per provider in the
`plugin_settings` table (migration `093_plugin_settings.sql`), not in a
`settings.json` file. Nothing to do on upgrade: an existing `settings.json` is
imported once, automatically, the first time the provider is read. Secrets are
write-only in every case. The setting *keys* below are the stable contract.
:::

## Enabling a provider

There are two pieces of state:

1. **The enable flag** — a server setting: `auth.oidc.enabled`,
   `auth.ldap.enabled` or `auth.github.enabled`.
2. **The provider configuration** — the issuer / client / directory details.

A provider only goes **live** when it is both **enabled** and **configured**.

To turn one on:

1. Open the admin console → **Integrations** → **Auth providers**
   (`/admin/integrations#auth-providers`).
2. Expand the provider (OIDC or LDAP) and fill in its configuration form
   (see [Provider configuration](#provider-configuration)). Save.
3. Flip the provider's **Enable** toggle.

::: info GitHub has no admin-console card yet
The GitHub provider ships with admin **API** endpoints but no form in the admin
console. Configure and enable it with the two calls in
[GitHub settings](#github-settings); everything else on this page (login flow,
linking, security posture) applies to it identically.
:::

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
admin API (`POST /api/v1/admin/auth-providers/oidc/config`, `.../ldap/config`,
`.../github/config`). Secrets are write-only — they are never returned by the read
endpoint, and leaving a secret field blank keeps the stored value.

::: tip Partial saves: OIDC and GitHub keep what you do not send
Every save endpoint replaces the whole stored settings document. The **OIDC and
GitHub** endpoints therefore treat an optional key that is **absent** from your
request body as "leave it alone" and re-emit the stored value; only an explicitly
**empty** value clears one. So you can `POST` just the fields you want to change,
and — importantly — saving from the admin console's OIDC form (which has no
`redirect_uri` field) does **not** erase a `redirect_uri` you set through the API.
To clear a field on purpose, send it as `""`.

**The LDAP endpoint is not like that yet:** apart from `bind_pw` (blank keeps the
stored password) it rebuilds the document from the request body alone, so an omitted
`port`, `ssl`, `bind_dn`, `user_filter` or `admin_group` is reset to its default
(`389`, `false`, `""`, `(uid={{username}})`, `""`) rather than preserved. The admin
console's LDAP form always sends all of them, so it is safe; if you script this
endpoint, **always send the complete settings map** — read it back with
`GET .../ldap/config` first.
:::

### OIDC settings

| Key | Required | Notes |
|-----|----------|-------|
| `provider_url` | yes | The OIDC **issuer** URL (its `/.well-known/openid-configuration` is discovered from this). Must be `https://` (or `http://localhost` for development). |
| `client_id` | yes | The client ID registered with your IdP. |
| `client_secret` | yes | The client secret (write-only). |
| `scopes` | no | Space-separated scopes. Default: `openid profile email`. |
| `redirect_uri` | no | An **absolute** `http(s)` callback URL, e.g. `https://media.example.com/auth/oidc/callback`. Leave empty to derive it from the request host (requires `PHLIX_DOMAIN` — see [below](#callback-urls-and-phlix-domain)). A relative path is rejected with `400 invalid_redirect_uri`. |

**Redirect / callback URL to register at your IdP:** register

```
https://<your PHLIX_DOMAIN>/auth/oidc/callback
```

as an allowed redirect URI for the Phlix client at your identity provider. This
is where Phlix asks the IdP to return the browser after the user authenticates,
and it must match **exactly** — scheme, host, port and path. See
[Callback URLs and `PHLIX_DOMAIN`](#callback-urls-and-phlix-domain).

### GitHub settings

Create an **OAuth App** (not a GitHub App) under GitHub → Settings → Developer
settings → OAuth Apps, with:

- **Homepage URL** — `https://<your PHLIX_DOMAIN>`
- **Authorization callback URL** — `https://<your PHLIX_DOMAIN>/auth/github/callback`

Then copy the client ID and generate a client secret.

| Key | Required | Notes |
|-----|----------|-------|
| `client_id` | yes | The OAuth App client ID. |
| `client_secret` | yes | The OAuth App client secret (write-only). A GitHub OAuth App is a *confidential* client, so **both** id and secret are required before the provider can go live. |
| `scopes` | no | Space-separated scopes. Default: `read:user user:email`. |
| `redirect_uri` | no | An **absolute** `http(s)` callback URL — must equal the OAuth App's *Authorization callback URL*. Leave empty to derive it from the request host (requires `PHLIX_DOMAIN`). |

There is no admin-console form yet, so save and enable it over the API (any
admin bearer token):

```bash
# 1. Save the configuration.
curl -sS -X POST https://media.example.com/api/v1/admin/auth-providers/github/config \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"client_id":"Iv1.abc123","client_secret":"…","scopes":"read:user user:email"}'
# → {"message":"Settings saved successfully","configured":true}

# 2. Bring it live (no restart needed).
curl -sS -X POST https://media.example.com/api/v1/admin/auth-providers/github/enable \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# → 200 {"name":"github","enabled":true,"live":true,"message":"…"}
# → 409 not_configured if step 1 is incomplete
```

Read the current values back with
`GET /api/v1/admin/auth-providers/github/config` — it returns
`{client_id, scopes, redirect_uri, configured}` and **never** the secret.
`configured: true` means id *and* secret are stored, which is exactly the bar
`enable` uses, so a `true` here can never be followed by a `409 not_configured`.

Users then sign in at
`GET /auth/github/authorize?redirect_uri=/app` (the `redirect_uri` query
parameter is the in-app page to land on afterwards and is **required** — see
[How users log in](#how-users-log-in)), or link GitHub to an existing account with
`GET /auth/identities/link/github` (see [Account linking](#account-linking)).

::: warning GitHub accounts are matched on the numeric id, never the e-mail
The linked identity is `github.<numeric user id>` — GitHub's account id is stable,
while the login name can be changed. Phlix deliberately does **not** match a
GitHub login onto an existing local account by e-mail address (a GitHub e-mail is
not necessarily verified, so that would be an account-takeover primitive). If a
local account already owns the e-mail *or* the username, the GitHub login stops
with `error=email_already_registered` and the user must sign in to that account
and link GitHub through `GET /auth/identities/link/github`.
:::

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

## Callback URLs and `PHLIX_DOMAIN`

This section applies to the two **browser** flows (OIDC and GitHub). LDAP has no
callback and is unaffected.

Both providers require the `redirect_uri` Phlix sends them to be an **absolute**
URL that matches what you registered, character for character — scheme, host,
**port** and path. Phlix resolves it in two steps, in this order:

1. **The provider's `redirect_uri` setting**, if you set one to a valid absolute
   `http(s)` URL. This always wins and works regardless of `PHLIX_DOMAIN`.
2. **Derived from the request** as `<scheme>://<Host><callback path>` — but *only*
   when the request's `Host` matches `PHLIX_DOMAIN`.

If neither yields a URL, the authorize endpoint **fails closed**.

### What `PHLIX_DOMAIN` is

`PHLIX_DOMAIN` is this server's public **authority**: a host, optionally with a
port — `media.example.com` or `media.example.com:8443`. No scheme, no path, no
trailing dot. `scripts/install.sh --domain <domain>` writes it into the
environment file the systemd unit reads, so a box installed with `--domain`
already has it. It is the same value the hub integration turns into
`hub.domain` / `hub.public_url`.

It is used here as an **allowlist**, because `Host` is supplied by the client. Left
open, an attacker could ask an unconfigured Phlix for an authorize URL carrying
*their own* host as the `redirect_uri`, phish that URL to one of your users, and —
against an IdP that accepts wildcard redirect registrations — receive that user's
authorization code. So a `Host` is only turned into a `redirect_uri` when it *is*
your configured authority.

**The port is part of the origin**, with the scheme's default port normalised away
on both sides:

| `PHLIX_DOMAIN` | Request `Host` | Scheme | Result |
|---|---|---|---|
| `media.example.com` | `media.example.com` | https | derives `https://media.example.com/auth/…/callback` |
| `media.example.com` | `media.example.com:443` | https | same — `:443` is the default for https and is normalised away |
| `media.example.com` | `media.example.com:8096` | https | **refused** (`503`) — a different origin |
| `media.example.com` | `192.168.1.10` | https | **refused** (`503`) |
| `media.example.com:8443` | `media.example.com:8443` | https | derives `https://media.example.com:8443/auth/…/callback` |
| `media.example.com:8443` | `media.example.com` | https | **refused** (`503`) |
| _unset or malformed_ | anything | any | **refused** (`503`) — nothing is derived |

A **malformed** value is treated as *unconfigured*, never as an allowlist that
happens to match nothing: `https://media.example.com/`, `media.example.com/app`,
`media.example.com:`, `media.example.com.`, `media.example.com:99999`,
`media.example.com:https` and a blank/whitespace value all mean "no derivation",
so the outcome is the actionable `503` rather than a silently broken login.

::: warning Reaching Phlix directly on `:8096` fails closed by design
phlix-server also listens on its own port (`8096` by default), so a request that
bypasses your reverse proxy arrives with `Host: media.example.com:8096` — a
different origin, so it gets the `503`. Nothing that could have worked is lost:
the callback you registered with GitHub / your IdP is the proxied `https://…`
form, so the provider would have rejected the `:8096` value with
`redirect_uri_mismatch` anyway. The failure just happens earlier, on your server,
where the log says what to fix. If you really do serve sign-in on that port, set
the provider's absolute `redirect_uri` to it and register that with the provider.
:::

### When it is misconfigured

`GET /auth/oidc/authorize` / `GET /auth/github/authorize` answer:

```
HTTP/1.1 503 Service Unavailable
Content-Type: application/json

{"error":"callback_url_not_configured",
 "message":"Sign-in with GitHub is not fully configured on this server. Ask the administrator to check the server log."}
```

- **No `Location` header** — the browser is never sent to the provider.
- **No session or correlation cookie**, and **no OAuth state row** is created, so
  nothing is left half-started and there is nothing to resume or replay.
- **The body is deliberately generic.** These routes are unauthenticated, so the
  response does not tell an anonymous visitor what is unset. `error:
  callback_url_not_configured` is the stable machine-readable code.
- **The detail is in the log.** One `warning` on the `AUTH` channel per refusal,
  carrying which of the two conditions fired (`PHLIX_DOMAIN` not set, versus the
  request `Host` is not `PHLIX_DOMAIN` — the port is compared too), the presented
  `Host`, the configured domain, and both remedies.

If the provider is not enabled and configured at all, you get
`503 provider_not_configured` instead — that check runs first, so this
`callback_url_not_configured` only ever appears to someone who is actively setting
a provider up.

Because `/auth/{provider}/authorize` is a top-level browser navigation, the user
sees that JSON in the tab. That is the same behaviour as the other authorize-time
errors.

### The escape hatch, and when to use it

Set the provider's **`redirect_uri` setting** to the absolute URL you registered
with the IdP / OAuth App. It takes priority over everything above and works with
`PHLIX_DOMAIN` unset. Use it when:

- you serve sign-in on a hostname or port that is not `PHLIX_DOMAIN` (a second
  vanity domain, or Phlix's own `:8096` listener);
- you cannot set `PHLIX_DOMAIN` (for example a container image where the value is
  not plumbed through);
- your proxy presents a `Host` you do not control.

```bash
curl -sS -X POST https://media.example.com/api/v1/admin/auth-providers/oidc/config \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"provider_url":"https://idp.example.com","client_id":"phlix",
       "redirect_uri":"https://media.example.com/auth/oidc/callback"}'
```

Otherwise prefer `PHLIX_DOMAIN`: it is one value for every provider, and it is
what makes the derived URL safe.

::: tip Upgrading an existing OIDC install
Before this change both browser flows sent a **path-only** `redirect_uri`
(`/auth/oidc/callback`), which any spec-strict IdP rejects with
`redirect_uri_mismatch` — so for most installs OIDC login could not complete
anyway and there is nothing to regress. The exception is an IdP that resolves a
relative redirect against the client's root URL (**Keycloak** does): such an
install *was* working and now needs `PHLIX_DOMAIN` set to the hostname users
browse, or an absolute `redirect_uri`. Boxes installed with `scripts/install.sh
--domain` already have `PHLIX_DOMAIN`.

One narrow in-flight window on the upgrade itself: a login started before the
deploy, on an origin the new rule refuses, ends in the `503`; the retry succeeds.
It is bounded by the 600-second OAuth state TTL.
:::

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

### GitHub

Identical in shape to OIDC, minus the OIDC-specific parts (there is no discovery
document and no `id_token`):

1. The client sends the browser to
   `GET /auth/github/authorize?redirect_uri=<same-origin path>`. The
   `redirect_uri` query parameter is **required** and must be a same-origin
   relative path (`400 missing_redirect_uri` / `400 invalid_redirect_uri`
   otherwise); it is the in-app page to land on after login, and is unrelated to
   the `redirect_uri` *setting* that GitHub sees.
2. Phlix redirects to `https://github.com/login/oauth/authorize` with the
   configured scopes, a PKCE challenge and a one-shot `state`, and sets the
   browser-binding cookie.
3. The user authorises the OAuth App, and GitHub redirects back to
   `GET /auth/github/callback`.
4. Phlix consumes the `state`, checks the browser-binding cookie, exchanges the
   code at `https://github.com/login/oauth/access_token` (replaying the *same*
   absolute `redirect_uri` it sent in step 2), then reads the profile from
   `GET https://api.github.com/user`.
5. The account is resolved by `github.<numeric id>` — created on first login,
   matched to your existing account if you had linked it — and Phlix mints a
   session and `302`s to the `redirect_uri` from step 1.

If the user keeps their e-mail private, Phlix makes a best-effort follow-up to
`GET /user/emails` (needs the `user:email` scope) and, failing that, still creates
the account with a deterministic placeholder e-mail.

All GitHub endpoints are hardcoded — provider settings only supply the client
id/secret/scopes — so there is no operator- or user-influenced URL to be coerced
into an SSRF.

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
itself, and list what is linked. All the endpoints below are **authenticated** —
the current user is read from the validated session (Bearer token / session
cookie), never from the request body — and none of them create a new account or
mint a new session.

::: tip Linking is a full round-trip
You can **link** an external identity, **list** what is linked, **unlink** one you
no longer want, and **log in *via* a linked identity**. A freshly-linked identity
resolves to your **existing** account on the next OIDC / LDAP / GitHub login — it
no longer creates a duplicate. Multiple *instances* of the same provider (e.g. two
OIDC issuers) are supported at the platform level; an admin UI for configuring
named instances is a later step.
:::

### The security guarantee: verified links only

Linking **always proves you actually control the external identity** — a
client-claimed identifier is never trusted:

- **OIDC** is verified by a full round-trip to your IdP (authorization-code + PKCE
  flow and id-token validation, exactly like login). The linked identity is the
  IdP-verified subject (`sub`); any `external_id` in the request is ignored.
- **GitHub** is verified by the same OAuth round-trip (authorization-code + PKCE,
  then the profile fetch). The linked identity is the GitHub-verified
  `github.<numeric id>`, never a client-supplied value.
- **LDAP** is verified by a **live bind** with the supplied credentials. Only a
  successful bind links the directory identity; the linked identity is the
  directory's own DN, not anything from the request.

Because the OIDC and GitHub link flows carry the initiating user in **server-side**
state (not a client-visible parameter), an attacker cannot forge or swap the target
account — you can only ever link an identity you can authenticate as, onto your own
account. Linking never changes your primary login and never issues a new session.

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

### Link a GitHub identity

```
GET /auth/identities/link/github        (authenticated)
```

The GitHub equivalent, with the same server-side link intent. The browser goes to
GitHub; on return, `GET /auth/github/callback` attaches the verified
`github.<numeric id>` to your account and `302`s back with a `?linked=github`
marker. `redirect_uri` is optional here and defaults to `/app`. **No login session
is minted, and no session cookies are set** — the link branch is bound and gated by
the same browser-binding cookie as login, and it never mints tokens.

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

### Unlink an identity

```
DELETE /auth/identities/{id}        (authenticated)
```

Removes one external identity from **your own** account. The `{id}` is the `id`
field from [List your linked identities](#list-your-linked-identities). On success
it returns `200 { success, message }`. Your local password and every other linked
identity are left untouched.

Two guards protect you:

- **Own-identity-only.** You can only unlink an identity that belongs to your
  account. The target is resolved within your own identity list (keyed on your
  authenticated session, never on the request body), so an `id` that belongs to
  another account — or that does not exist — returns an indistinguishable
  **`404 identity_not_found`**, never a cross-account removal.
- **Never your last sign-in method.** If removing the identity would leave your
  account with **no local password *and* no other linked identity**, the request is
  refused with **`409 last_sign_in_method`** so you can't lock yourself out. Set a
  local password, or keep at least one other identity, first.

### Logging in with a linked identity

Once you've linked an identity you can **log in with it directly**. The next time
you authenticate through that provider — the OIDC or GitHub flow, or an `ldap:`
login (see [How users log in](#how-users-log-in)) — Phlix resolves the identity to
your **existing** account instead of creating a new one: the login read path looks
the identity up in the `user_identities` store first. No extra step is needed;
linking and logging-in target the same account.

Existing and legacy external users keep logging in exactly as before.

### Conflicts and idempotency

- **Already linked to *another* account →** `409 identity_already_linked`. An
  external identity can belong to only one Phlix account; Phlix never silently
  re-homes it.
- **Already linked to *your* account →** idempotent **success** (LDAP returns
  `created:false`; OIDC and GitHub redirect back with `?linked=oidc` /
  `?linked=github`). Linking twice is safe.

The `user_identities` table's UNIQUE index is the race backstop, so two concurrent
link attempts resolve to exactly one row (a genuine server error is surfaced as a
`5xx`, never mislabeled as a `409`).

## Security posture

- **Session cookies, not URL tokens.** A successful OIDC or GitHub login delivers
  the session as **httpOnly + Secure + SameSite=Lax** cookies (`phlix_session` and
  `phlix_refresh`). Tokens are never placed in the URL or query string, so they
  can't leak via browser history, referrers, or access logs. (`Secure` is applied
  when the request is served over HTTPS.)
- **Same-origin redirect only.** The post-login landing page passed as the
  `redirect_uri` *query parameter* is allowlisted to a **same-origin relative
  path**. Absolute URLs, protocol-relative `//host`, back-slash tricks (`/\host`),
  `javascript:`, and any control/CRLF characters are rejected with
  `400 invalid_redirect_uri`. This prevents an attacker from phishing the flow and
  having a victim's freshly-minted session redirected to a foreign origin. It is
  re-validated on the callback leg, not just at authorize.
- **The OAuth `state` is bound to the browser that started the flow.** At authorize
  Phlix sets a 32-byte HttpOnly + Secure + SameSite=Lax cookie
  (`phlix_oauth_oidc` / `phlix_oauth_github`, `Max-Age` 600 to match the state TTL)
  and persists only its SHA-256 alongside the server-side state. The callback
  compares them with `hash_equals()` **before** any token exchange, account link or
  cookie mint, and answers `403` on a mismatch. Without this, someone could run the
  authorize leg themselves and then have a victim's browser deliver the callback,
  handing the victim a session for the *attacker's* account — `SameSite=Lax` does
  not restrict `Set-Cookie`. The cookie is expired on every response after the
  state is consumed. One consequence: two sign-in flows started in the *same*
  browser at once conflict, and the older tab's callback fails with that `403`;
  retrying it works.
- **`state` is server-side and one-shot.** The PKCE `code_verifier` and the
  authorize-time `redirect_uri` live in the `oauth_state_store` table (600 s TTL),
  never in `$_SESSION` — which under Workerman is process-global and shared between
  concurrent requests. The consume is atomic (`SELECT … FOR UPDATE` + `DELETE`
  inside a transaction), so a code cannot be redeemed twice.
- **The `redirect_uri` sent to the provider cannot disagree between legs.** The
  absolute value resolved at authorize is stored in the state and replayed verbatim
  at token exchange (and re-validated on the way out), so the two legs match
  structurally rather than by coincidence.
- **Brute-force rate limiting.** `ldap:` logins share the same per-IP rate-limit
  budget as local logins. Exceeding it returns `429` with a `Retry-After`.
  The OIDC/GitHub authorize and callback routes are **not** rate-limited.
- **No account enumeration.** A wrong LDAP username or password returns a generic
  `401 "Invalid credentials"`. Only a genuine directory misconfiguration or
  connection failure returns `503` (so operators can tell a config problem from a
  bad password without leaking which usernames exist).
- **Provider error text is never reflected.** Errors handed back to the app come
  from a fixed internal set (e.g. `provider_error`, `internal`,
  `email_already_registered`); a provider's own `error_description` is never echoed
  into the redirect.
- **Distinct identities per provider.** External identities are stored with their
  real provider (`oidc` / `ldap` / `github`) and resolved on login by
  `(provider, provider_instance, external_id)` via the `user_identities` store
  (with a legacy `users` fallback), so the same `sub`/DN/id presented by two
  different providers — or by two instances of the same provider — maps to distinct
  users, never a silent account merge.

## Operational notes

- **Migration 091 applies automatically.** External (passwordless) users are
  created with a null `password_hash`; migration
  `091_users_password_hash_nullable.sql` relaxes that column and is applied by the
  migration runner on upgrade — **no manual step**. Users whose IdP supplies no
  email/username are still created (Phlix assigns a deterministic placeholder
  derived from the provider + external ID).
- **Migration 092 applies automatically.** `092_user_identities.sql` adds a
  `user_identities` join table — the home for multiple external identities per
  account (account-linking and multi-instance providers) — and backfills a row for
  every existing external-identity user, deriving the real provider (`oidc` /
  `ldap`) and de-duplicating any legacy duplicates. It is applied by the migration
  runner on upgrade — **no manual step**. As of S47 the login read path resolves
  the owning account through this table first (falling back to `users.provider` /
  `users.external_id` for any un-backfilled row), which is what makes a linked
  identity usable for login; existing and legacy external users log in unchanged.
- **Multiple providers of the same family.** The auth provider registry can hold
  more than one instance of the same family (e.g. two OIDC issuers) without a
  name collision — the platform foundation for configuring multiple OIDC/OAuth
  providers. Each identity records which instance it belongs to
  (`user_identities.provider_instance`, `''` for the default single instance).
  Configuring/seeding additional named instances from the admin console is a later
  step.
- **Migration 093 applies automatically.** `093_plugin_settings.sql` adds the
  `plugin_settings` table (one row per provider: `plugin_name` primary key +
  `settings_json`), the new home for provider configuration. It is applied by the
  migration runner on upgrade — **no manual step** — and is idempotent, so
  re-running it is safe and never touches existing rows. Nothing needs exporting or
  importing: the first time a provider's settings are read, an existing
  `settings.json` is imported into the table automatically, once.
- **Provider configuration is shared across workers; the enable flag is a server
  setting.** phlix-server runs several resident workers, each with its own
  in-memory provider registry, which is why the config had to leave the filesystem.
  Saving settings or toggling a provider takes effect **without a restart**: the
  worker that served the request updates immediately, and every other worker
  notices on its next sign-in request by comparing a fingerprint of the persisted
  settings. Enable state stays in server settings (`auth.oidc.enabled`,
  `auth.ldap.enabled`, `auth.github.enabled`).
- **Partial settings saves are safe for OIDC and GitHub.** Those endpoints preserve
  any optional key that was absent from the request body and clear only what you
  send as empty, so a client (or an admin form) that does not know about a field
  cannot delete it. The LDAP endpoint still expects the complete map — see the note
  under [Provider configuration](#provider-configuration).
- **Non-blocking OAuth/OIDC I/O.** OIDC discovery, token exchange, userinfo and
  JWKS fetches — and the GitHub token exchange and profile fetch — use a
  non-blocking HTTP client with TLS verification on, so they don't stall the
  worker. LDAP binds remain a bounded (5 s) blocking call — the `ext-ldap`
  extension has no Swoole-hookable async client.
- **Where to look when sign-in fails.** The `AUTH` log channel carries a `warning`
  for every refusal, including the callback-URL failures described in
  [Callback URLs and `PHLIX_DOMAIN`](#callback-urls-and-phlix-domain) (with the
  presented `Host`, the configured domain and the remedy) and `state` /
  browser-binding mismatches. Client-supplied values in those log fields are
  sanitised and length-capped.

## Admin API reference

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v1/admin/auth-providers` | List providers |
| `POST` | `/api/v1/admin/auth-providers/{name}/enable` | Enable (`200` live / `409 not_configured` / `404 unknown_provider`) |
| `POST` | `/api/v1/admin/auth-providers/{name}/disable` | Disable |
| `GET`/`POST` | `/api/v1/admin/auth-providers/oidc/config` | Read / save OIDC config (`provider_url`, `client_id`, `client_secret` write-only, `scopes`, `redirect_uri`) |
| `GET`/`POST` | `/api/v1/admin/auth-providers/ldap/config` | Read / save LDAP config |
| `POST` | `/api/v1/admin/auth-providers/ldap/test` | Dry-run an LDAP bind |
| `GET`/`POST` | `/api/v1/admin/auth-providers/github/config` | Read / save GitHub config (`client_id`, `client_secret` write-only, `scopes`, `redirect_uri`) |
| `GET` | `/api/v1/admin/auth-providers/{oidc,ldap,github}/schema` | The provider's JSON settings schema (for form rendering) |
| `GET` | `/auth/oidc/authorize` | Start the OIDC flow (unauthenticated); `?redirect_uri=<same-origin path>` |
| `GET` | `/auth/oidc/callback` | OIDC callback from the IdP (unauthenticated; also handles the account-link branch) |
| `GET` | `/auth/github/authorize` | Start the GitHub flow (unauthenticated); `?redirect_uri=<same-origin path>` **required** |
| `GET` | `/auth/github/callback` | GitHub callback (unauthenticated; also handles the account-link branch) |
| `POST` | `/auth/login` | Local login, or LDAP with an `ldap:`-prefixed username |
| `GET` | `/auth/identities` | List the current user's linked identities (**authenticated**) |
| `GET` | `/auth/identities/link/oidc` | Start linking an OIDC identity to the current account (**authenticated**) |
| `GET` | `/auth/identities/link/github` | Start linking a GitHub identity to the current account (**authenticated**) |
| `POST` | `/auth/identities/link/ldap` | Link an LDAP identity via a live bind (**authenticated**); body `{username, password}` |
| `DELETE` | `/auth/identities/{id}` | Unlink one of the current user's identities (**authenticated**); `404` if not yours, `409` if it's your last sign-in method |

Both authorize endpoints can answer `503 provider_not_configured` (the provider is
not enabled + configured) or `503 callback_url_not_configured` (no absolute callback
URL resolves — see
[Callback URLs and `PHLIX_DOMAIN`](#callback-urls-and-phlix-domain)).

The admin config UI and its endpoints are also covered in
[Integrations → Auth providers](../admin/integrations#auth-providers), and
`PHLIX_DOMAIN` in
[Reference → Environment variables](../reference/env-vars).
