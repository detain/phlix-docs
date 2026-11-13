# Auth architecture: bearer and cookie custody

## TL;DR

Phlix authenticates HTTP API calls two ways at once. **Bearer custody** — the client holds the access token and sends `Authorization: Bearer` — serves every first-party client in the estate (TVs, phones, consoles, CLI). **Cookie custody** — the server and hub mint `HttpOnly` `SameSite=Lax` session and refresh cookies alongside the JSON body, and authenticate requests whose identity comes from the jar — serves same-origin browser sessions of the shared SPA. Both hosts run a single classification law per request that decides which custody a caller is *in*, and both enforce a CSRF origin guard on every cookie-sourced state-changing request. The WebSocket surfaces remain on the transitional bearer-subprotocol / query-token dual carrier: a cookie-carried WebSocket handshake is **not shipped on either host**, and the query-token ban that will eventually retire `?token=` is **not in effect**. This page is the shipped-state authority for that program; the per-repo source files named throughout are the law itself.

---

## The custody split: browsers and devices

The estate sorts clients into two classes (recorded as constants in `phlix-ui`-consumable contract code — `COOKIE_MODE` and its `CookieMode` type in `phlix-contracts` `src/auth.ts`; the export lives on contracts master ahead of the consumer tag-pins that mirror it):

- **CLASS BROWSER** — the shared Vue SPA served same-origin at `/app` on server and hub. Browser sessions default to cookie custody: the SPA persists nothing readable to scripts; credentials ride `withCredentials` on same-origin calls. A bearer fallback store exists by design (see [Client custody](#client-custody)) for cross-origin and custom-server-URL deployments.
- **CLASS DEVICE** — every first-party native client (Windows, mobile, Tizen, Roku, console) and CLI tooling. No cookie jar exists on these platforms; they keep bearer custody permanently and are marked as such to the server (`X-Phlix-Device-Type`), which never routes them into cookie-mode behavior.

The split is a *server-side decision per request* (`classifyRequest` below) and a *client-side decision at boot* (the probe below). They must agree, and the server is deliberately lenient about a device presenting bearer credentials while a jar sits in some browser's cookie store: bearer always wins precedence.

---

## Cookie emission: names, attributes, lifetimes

| | phlix-server | phlix-hub |
|---|---|---|
| Policy SSOT | `src/Auth/CookiePolicy.php` | `src/Hub/CookiePolicy.php` |
| Session cookie | `phlix_session` (`AuthController::SESSION_COOKIE`) | `phlix_hub_token` (`CookiePolicy::SESSION_COOKIE`) |
| Refresh cookie | `phlix_refresh` (`AuthController::REFRESH_COOKIE`) | `phlix_hub_refresh` (`CookiePolicy::REFRESH_COOKIE`) |
| Attributes | `HttpOnly`, `SameSite=Lax`, `Secure` per scheme law | identical |
| Lifetimes | access cookie `Max-Age` = the minted token's `expires_in`; refresh cookie = `AuthManager::refreshTtl()` — never a literal in the controller | same law (`refreshTtl` from the hub's `AuthManager`) |
| Emission points | login / register / LDAP arm / OAuth minters / refresh — every JSON auth answer dual-emits body + cookies | signup / login / refresh — `AuthController::attachAuthCookies()` |
| Logout | `AuthController::logout()` clears **both** cookies *and* performs real server-side teardown when an identity is attached — per-user `tokens_not_valid_after` watermark plus session termination (`AuthManager::logout()`, the M-1 cure); anonymous hits keep the pure-clear form. GET and POST both routed. | `logoutJson` clears both cookies *and* revokes the presented refresh lineage: `AuthManager::logout()` validates a refresh JWT (body token first, else the `phlix_hub_refresh` cookie) and cuts its `jti` through `RefreshTokenRevocationService`; every later `refresh()` presenting that token is refused against the `auth_revoked_refresh_tokens` registry (consulted on the refresh path only). Deliberately narrower than the server cure: the hub grows **no** per-user `tokens_not_valid_after` watermark and no session-termination sweep — its `AuthManager` records explicitly that refresh-jti revocation "has no per-user bulk API" — so stateless access JWTs, and any refresh token never handed to `logout()`, ride out their TTL. The true asymmetry: server logout kills a user's whole issued lineage; hub logout kills exactly the lineage presented to it |

The hub's names are deliberately the legacy-surface names (`phlix_hub_token` / `phlix_hub_refresh`) revived, not new names — jar hygiene for installs that had already seen the deleted pre-reintroduction emission surface.

The lifetime rule is a *derivation law*: a cookie whose `Max-Age` disagreed with its token's `exp` would either strand a still-valid credential in the jar or serve a dead one. Both hosts derive the two from the `AuthManager` → `JwtHandler` that minted the tokens, so moving the TTL settings moves the jar with it (`phlix-server` `AuthController::attachAuthCookies()` docblock; `phlix-hub` same method).

---

## The switches: env + settings matrix

| Knob | Server | Hub |
|---|---|---|
| Master switch | setting `auth.cookie.enabled` — **fail-open**: only an explicit `false` disables emission (`CookiePolicy::cookieModeEnabled()`) | same key, same fail-open law (`CookiePolicy::cookieModeEnabled()`) |
| Emission belt | honored at `attachAuthCookies()` itself *and* in classification — with the switch off the host "never sets auth cookies at all, on any path" | same belt at the attach choke point |
| Rollback semantics | flip-off stops **new** cookies; an unexpired jar keeps authenticating until its tokens expire — the switch governs emission, not validation | same, with the law pinned explicitly: the `AuthMiddleware` cookie fallback is deliberately *not* gated by the switch (rollback posture — stop minting, don't strand live sessions) |
| Insecure opt-in | env `PHLIX_COOKIE_INSECURE=1` **or** stored setting `auth.cookie.insecure` (twin) | env `HUB_COOKIE_INSECURE=1` **or** the same stored twin (`CookiePolicy::insecureOverride()` reading the hub settings resolver) |
| Production warning | opting into insecure cookies under `PHLIX_ENV=production` logs **once per worker process** (`warnProductionInsecureOnce()`, named source in the message for both entry paths) | no warn-once twin — the opt-in is honored silently |
| `Secure` flag law | `Secure` unless (a) the scheme is eligible: HTTPS or an addressed `localhost`/`127.0.0.1`/`::1` host (any port), or (b) the insecure opt-in is set — never a *silent* downgrade (`cookiesSecure()` / `schemeEligible()`) | same three-limb law (`cookiesSecure()` / `schemeEligible()`, `LOCALHOST_HOSTS`) |
| WebSocket query-token kill switch | **not in effect**: no `PHLIX_WS_QUERY_TOKEN` env and no `auth.ws_query_token` read anywhere in server `src/`/`config/` — the shared-schema key is forward-looking (see [Not yet shipped](#not-yet-shipped)) | n/a |

The cookie settings keys (`auth.cookie.enabled`, `auth.cookie.insecure`, `auth.ws_query_token`) are declared in `phlix-shared` `schemas/server-settings.schema.json` on master, riding the next shared release (those declarations post-date the `v0.54.0` peel). The server reads `auth.cookie.enabled` today — the master switch at the emission/classification choke points (including the OIDC and GitHub callback minters) — and `auth.cookie.insecure` in `CookiePolicy::insecureOverride()`, while `auth.ws_query_token` is reserved for the PHASE-B flip and has no reader yet.

---

## Request classification and authentication order

**Server** (`src/Server/Http/RequestAuthenticator.php`): identity resolves **bearer first, cookie second** — an `Authorization: Bearer` header wins outright; only in its absence does a valid `phlix_session` cookie authenticate the request (`isCookieAuthenticated()` marks the request as cookie-sourced for the CSRF gate). `AuthController::classifyRequest()` decides the custody *mode* for emission/rotation: a `X-Phlix-Device-Type` marker or a non-same-site `Origin` forces bearer class; `Sec-Fetch-Site` is read there as a browser signal only — **the server does not reject on it** (the hub's stricter belt below is one-directional).

**Refresh rotation law** (`AuthController::refresh()`): a body `refresh_token` takes precedence over the `phlix_refresh` cookie; **rotation of the refresh pair happens only when the request classifies as cookie custody.** A bearer client replaying its old body-carried refresh token never triggers a jar rotation (the pre-program scaffolding that rotated unconditionally was itself a shipped bug, cured in the dual-emit work).

**Hub**: the same bearer-first order (`AuthMiddleware::extractToken()` — a presenting bearer header wins, otherwise the `phlix_hub_token` cookie is consulted; the file-head docblock carries the order law), the same classification (`AuthController::classifyRequest()`), and the same rotation-only-in-cookie-mode law.

---

## CSRF posture (shipped)

Cookie custody buys XSS-resistant storage at the cost of the CSRF surface; both hosts close that surface with an **origin guard**, not a synchronizer token:

- **Server** — `RequestAuthenticator::validateCsrfOrigin()` runs on every *state-changing* request (POST/PUT/DELETE/PATCH) that authenticated via cookie, with a deliberate method-law exception for `GET /auth/logout` (logout changes state in effect, so it is gated despite the verb — see `HttpHandler`'s GET arm). `validateSameSiteOrigin()` requires `Origin` (or `Referer` fallback) to *name the host*; a request carrying **neither** header is refused (fail-closed), and a literal `null` Origin is refused. Refusal is `403` with body `{"error":"CSRF validation failed","code":"csrf.invalid_origin"}`.
- **Hub** — `src/Http/Middleware/CsrfOriginGuard.php` emits the **byte-identical** `403` envelope. It runs **before identity hydration**, but auth *failures* (`401`) are answered before the guard — an attacker cannot use the guard's differing answers to oracle which requests carried a live cookie. Bearer-lineage requests are **CSRF-immune by pinned law** (a header the browser cannot auto-attach needs no origin check). The hub additionally enforces the `Sec-Fetch-Site: cross-site` **reject belt** inside its origin-allowance rule (`CookiePolicy::stateChangingRequestOriginAllowed()`) — a design add the server has not grown; the hub is therefore one-directionally stricter, never looser.
- **Zero new wire codes**: `csrf.invalid_origin` was already registered in `phlix-contracts` `src/errors.ts` (with its CSRF family) before either guard shipped; both hosts simply emit the pre-registered code.
- **CORS**: both hosts allowlist exact origins — no wildcard pairs with credentials on either. The postures differ by design: the **server** reflects the requesting origin back with `Access-Control-Allow-Credentials: true` (`CorsManager`, enabling credentialed calls for allowlisted browser origins), while the **hub never emits the credentials header at all** (`CorsPolicy`) — hub cookie custody is strictly same-origin, and cross-origin REST there stays bearer.

Browser-level `SameSite=Lax` plus that CORS posture mean a cross-site page cannot get a credentialed state-changing request *through* the network layer; the origin guard is the same-layer enforcement for everything that does arrive, including `curl` with a stolen jar.

---

## WebSocket auth carriers — law table

The HTTP cookie program deliberately stopped at the HTTP boundary. WebSockets cannot attach `Authorization` headers, and the handshake is not a CORS-checked request, so carrier rules live there separately:

| Surface | Accepted carriers, in precedence order | Cookie carrier? | Notes |
|---|---|---|---|
| Server SyncPlay WS `:8097` | 1. `Sec-WebSocket-Protocol: bearer, <jwt>` subprotocol · 2. `?token=` query (transitional) | **No** | `SyncPlayAuthMiddleware::resolveHandshakeToken()` — both carriers present with different values → rejected pre-101; the marker-only `bearer` echo is sent only when the client actually offered it; query tokens are redacted in every log line (`redactTokenQuery`). Server-repo law table: `phlix-server` `docs/dev/WEBSOCKET_AUTH_CARRIERS.md` ("TRANSITIONAL DUAL-CARRIER"). |
| Hub syncplay relay lane `:8804` | 1. `bearer` subprotocol | **No** | First-party clients dial `['bearer', <token>]` (`phlix-ui` `src/api/hubRelay.ts`; mobile reuses the same builder against `:8804/syncplay/{server_id}`). On this lane query-string tokens are **refused by design** — stricter than the server's transitional state. The hub has **no cookie-carrier WebSocket surface at all** across `:8802–:8805` — pinned by its WS auth law suite. |
| Any first-party **client** dial | `bearer` subprotocol only | — | The shared SPA builds the protocol list from the store's access token and *never* writes a credential into the WebSocket URL — the `WEBSOCKET_URL_QUERY_REFUSED` construction law in `phlix-ui` `src/api/syncplay.ts`. It also never emits `['bearer', '']` (an empty subprotocol entry throws in the WHATWG constructor): **no token → no protocols offered.** |

The last row's consequence is the honest current limit: a **cookie-custody browser session that has lost its in-memory access token** (hard reload) offers no bearer and meets a server that does not yet read cookies on the handshake — watch-party reconnect for that shape waits on the server-side cookie carrier below. HTTP API access for the same session is unaffected; only WS authentication is.

The estate-wide retirement of `?token=` (the query carriers' end-of-life census and flip) is its own program; the transitional acceptance remains **fully in effect** on `:8097`.

---

## Client custody

Inside `@phlix/ui` (v0.99.26 era), custody is a store choice resolved at boot:

- **Boot probe**: same-origin `/app` builds call `GET /api/v1/auth/me` with `credentials: 'include'`; a `200` answer (the jar authenticated) selects cookie custody. The probe is memoized per target server.
- **`CookieTokenStore`**: reads of the access token return `null` (scripts never see it), writes are no-ops, and a strictly in-memory mirror exists only where a caller structurally requires the JWT (WS subprotocol building, immediate post-login window). The former `LocalStorageTokenStore` is **kept** as the bearer fallback mode — cross-origin API bases, custom server URLs, and dev harnesses still run it.
- **401 handling**: one refresh flight **per credential store** (not per API instance — the SPA keeps several clients alive at once), with a hold window so concurrent 401s queue behind it instead of stampeding `/auth/refresh`. Logout is credentials-consistent: the cookie route clears the jar on the server and the store drops its mirror locally.
- The store mode type mirrors the contracts `CookieMode` union; a sentinel test in the UI reddens when the released contracts pin finally exports the type, retiring the mirrored literal.

---

## Devices, CLI, and the e-reader contract

- **Windows** keeps its OS-credential (DPAPI) vault under bearer custody by ruling; **mobile** migrated its WS dial from the query carrier to the bearer subprotocol and keeps tokens in secure storage — both are CLASS DEVICE: the cookie program changes nothing for them.
- **CLI**: `php bin/phlix user:create <username> --email=<email> --password-file=<path>` (or `--password-file=-` for stdin) keeps passwords off the process argv, where `ps` and shell history would leak them; the flag's resolution and the `-` stdin form live in `src/Console/Commands/UserCreateCommand.php`.
- **OPDS / HTTP Basic** (e-readers) is a **separate credentials contract** and was confirmed untouched by the entire program: no cookies are set or read on that path, no CSRF guard applies (nothing cookie-sourced exists there), and the dual-emit work explicitly routes around it. E-reader clients keep sending `Authorization: Basic` per request exactly as before.

---

## Not (yet) shipped

Named here so nobody re-derives the design plan and mistakes it for the code: the design document describes a staged program; these legs have **no shipped implementation** as of the tips recorded in the fix register (verified by absence-grep, not by prose):

1. **Refresh grace window** — replaying a just-rotated refresh token within a grace period is not implemented; the cookie-mode rotation law above is the shipped behavior.
2. **WS cookie carrier (`:8097`)** — the server reads no cookies during the WebSocket handshake; the transitional dual-carrier table remains the law.
3. **Query-token PHASE-A env gate + PHASE-B denial** — no `PHLIX_WS_QUERY_TOKEN` handling exists; `auth.ws_query_token` is declared in the shared schema and read by no server code; `?token=` continues to authenticate on `:8097`.
4. **Server-side `Sec-Fetch-Site` reject belt** — the hub enforces it; the server reads the header only as a classification signal (the hub is one-directionally stricter by design).

---

## Where the law lives

| Concern | Server | Hub | Client |
|---|---|---|---|
| Cookie policy SSOT | `src/Auth/CookiePolicy.php` | `src/Hub/CookiePolicy.php` | — |
| Emission / clear | `src/Server/Http/Controllers/AuthController.php` | `src/Http/Controllers/AuthController.php` | — |
| Auth order + CSRF gate | `src/Server/Http/RequestAuthenticator.php`, `src/Server/Workerman/HttpHandler.php` | `src/Http/Middleware/AuthMiddleware.php`, `src/Http/Middleware/CsrfOriginGuard.php` | — |
| Custody store | — | — | `src/api/tokenStore.ts`, `src/api/client.ts` |
| WS carriers | `src/Server/WebSocket/SyncPlayAuthMiddleware.php` + repo law-table doc | relay dial surfaces (no cookie carrier exists to read) | `src/api/syncplay.ts`, `src/api/hubRelay.ts` |
| Wire vocabulary | `phlix-contracts` `src/errors.ts` (`csrf.invalid_origin` family), `src/auth.ts` (`COOKIE_MODE`) | | |
| Settings schema | `phlix-shared` `schemas/server-settings.schema.json` (`auth.cookie.*`) | | |

## Related pages

- [Privacy & security — how the web portal stores tokens](/privacy-security)
- [Server architecture](/dev/architecture-server) · [Hub architecture](/dev/architecture-hub)
- [Environment variables](/reference/env-vars) — `PHLIX_COOKIE_INSECURE`, `HUB_COOKIE_INSECURE` rows
- [SyncPlay (advanced)](/advanced/syncplay) — watch-party surfaces
- [Hardening](/security/hardening)
