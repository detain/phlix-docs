# MCP (Model Context Protocol)

**Surface:** phlix-hub
**Endpoint:** `POST /mcp` and `GET /mcp`
**Auth:** MCP personal access token (`phlix-mcp-…`)

::: info Note
MCP is a **hub** feature, not a media-server one. The endpoint lives on phlix-hub
and reaches your media servers over the existing relay, so an MCP client only
ever talks to the hub.
:::

## Overview

The hub exposes a [Model Context Protocol](https://modelcontextprotocol.io)
endpoint so an AI assistant — Claude Desktop, an SDK-based agent, or anything
else that speaks MCP — can enumerate the media servers you have claimed, browse
their libraries, and read metadata.

It is an **MCP Streamable HTTP** endpoint served by the hub's ordinary HTTP
worker on the same port as the rest of the API. There is no sidecar process and
no extra port to open.

| Verb | Path | Carries |
| ---- | ---- | ------- |
| `POST` | `/mcp` | Client → server JSON-RPC (`initialize`, `ping`, `tools/list`, `tools/call`) |
| `GET` | `/mcp` | Server → client SSE channel |

Every call runs as the hub account that minted the token, and can only reach
servers that account has claimed. A token can be minted **narrower** than the
account it belongs to, but never wider — see [Scopes](#scopes).

---

## Authentication

The endpoint takes a **personal access token** (PAT), presented as a bearer
token:

```http
POST /mcp HTTP/1.1
Authorization: Bearer phlix-mcp-xxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
```

Every minted token carries the literal prefix **`phlix-mcp-`**. The prefix is
operational, not cryptographic — it makes a leaked token recognisable to a
secret scanner, and it lets the endpoint tell "wrong kind of credential" from
"bad token" in its error message. All of the entropy is in the suffix.

Three things are worth knowing before you wire a client up:

- **The header is the only accepted channel.** There is deliberately no
  `?token=` query-string fallback — query strings end up in access logs.
- **A hub session JWT is not accepted here**, and a PAT is not accepted on the
  ordinary API. The two credentials do not overlap.
- **Tokens are long-lived but finite.** The default lifetime is **90 days**; a
  perpetual token is not offered. Revoking one cuts access immediately without
  waiting for expiry.

### Failure responses

| Status | `code` | Meaning |
| ------ | ------ | ------- |
| `401` | `auth.required` | No bearer token was presented. |
| `401` | `auth.invalid_token` | The token is unknown, expired, revoked, or not an MCP token at all. |
| `429` | — | The PAT-authentication rate limit for your IP is spent. |

Both `401`s carry `WWW-Authenticate: Bearer realm="phlix-hub-mcp"`.

Authentication failures are rate-limited per client IP on the hub's shared
login-grade limiter (bucket `mcp:auth:<ip>`). The counter is incremented **only
on a failed** validation and cleared on success, so a busy agent cannot lock
itself out.

---

## Creating and revoking a token

### In the hub UI

Open **MCP Tokens** in the hub web app (`/app/mcp-tokens`). It is an ordinary
per-user page — not an admin one — because every hub user manages their own
credentials.

1. Enter a **name** for the token (a label for your own reference, truncated to
   191 characters). It appears only in this list.
2. Tick the [scopes](#scopes) you want to grant.
3. Submit. **The plaintext is shown exactly once.** Copy it immediately.
4. To revoke, use the **Revoke** action on any row in the list.

::: warning The plaintext is not recoverable
Only a SHA-256 hash of the token is stored, and no endpoint can return the
plaintext again. If you dismiss the reveal without copying it, the only recovery
is to revoke the token and mint a new one.
:::

The list shows revoked and expired tokens too, each with its own flag, so you
can see the history. Rows are pruned once they have been revoked, or have been
expired for more than 30 days.

### Over the API

These three endpoints are part of the ordinary hub API and are authenticated
with your **hub session**, not with an MCP token.

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `GET` | `/api/v1/me/mcp-tokens` | List your tokens (metadata only) plus `available_scopes`. |
| `POST` | `/api/v1/me/mcp-tokens` | Mint a token. The only response that ever carries the plaintext. |
| `DELETE` | `/api/v1/me/mcp-tokens/{id}` | Revoke a token. |

**Mint request:**

```json
{
  "name": "Claude Desktop",
  "scopes": ["mcp:servers:read", "mcp:library:read"]
}
```

**Mint response (201):**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "token": "phlix-mcp-xxxxxxxxxxxxxxxxxxxxxxxx",
  "name": "Claude Desktop",
  "scopes": ["mcp:servers:read", "mcp:library:read"],
  "expires_at": 1767225600
}
```

`expires_at` is an absolute Unix timestamp in seconds.

Notes on the mint body:

- Unknown scope values are **dropped**, not rejected. A list with nothing known
  left in it is a `400` (`mcp_token.no_valid_scopes`) rather than a token that
  authenticates but authorises nothing.
- **Any `scopes` value that is not a JSON array or object grants every scope**
  the hub offers, including the write scope `mcp:playback:control`. The check is
  `is_array($rawScopes)` in `McpTokenController::create()`, so omitting the key,
  sending `null`, a bare string, a number or a boolean all fall through to "all
  scopes" — `"scopes": "mcp:library:read"` asks for one scope and gets four.
  Only an array (or a JSON object, which decodes to a PHP array) is filtered
  against the known list. Note the asymmetry with the bullet above: a typo
  *inside* an array fails **closed** with a `400`, but a wrong *type* for the
  array itself fails **open**. Always send `"scopes": [ ... ]`.

  Any authenticated hub user can mint such a token — `POST /api/v1/me/mcp-tokens`
  is gated by `AuthMiddleware` alone, not admin-only. The hub's own token UI
  always sends an array, so the fail-open path is reachable only from a direct
  API call. An over-broad token is still bounded by ownership: scope is the
  second gate, and the first is that the account must already own the server.
- Revoking an unknown id, an already-revoked token, or somebody else's token all
  return the same `404` (`mcp_token.not_found`) — they are deliberately
  indistinguishable so the endpoint cannot be used to probe for other users'
  token ids.

---

## Scopes

A scope is a coarse capability label. It is the **second** of two independent
gates on a tool call, and deliberately the weaker one:

1. **Identity and ownership.** Every call re-derives the token's user and runs
   through the hub's production server-proxy and server-list controllers, which
   enforce "the caller owns this server". **A token cannot widen this.**
2. **Scope.** The gate below. It only ever *subtracts* from the first.

Read that ordering literally: granting every scope still does not let a token
see a server its account does not own.

| Scope | Grants |
| ----- | ------ |
| `mcp:servers:read` | Enumerate the media servers the account owns. |
| `mcp:library:read` | Browse libraries and read library/media metadata from an owned server over the relay. |
| `mcp:playback:read` | Read playback information (stream decisions) for an owned media item. |
| `mcp:playback:control` | Pause, resume, stop or seek an **already-running** cast/DLNA session. The only write scope. See the caveat below. |

Scopes are stored as a single space-delimited string. Unknown values are dropped
at mint time, so a typo becomes "no scope" (fail closed) rather than a scope that
silently matches nothing later.

A `tools/call` for a tool whose scope the token does not hold returns a
`403`-shaped tool result with `code: mcp.scope_denied`.

::: warning `mcp:playback:control` is offered — and pre-ticked — even when the tools are off
`available_scopes` is built from the hub's full scope list **unconditionally**,
and the token UI seeds its selection from that list, so
**`mcp:playback:control` appears in the create form and is ticked by default**.

The operator flag described [below](#the-playback-control-flag) gates tool
**registration**, not the scope. Granting this scope therefore does *not* imply
the playback tools exist or work — on a default hub they are not registered at
all. Untick it unless you know your operator has enabled the flag and understands
the caveat.
:::

---

## Tools

`tools/list` returns every registered tool regardless of the presenting token's
scopes — a scope-filtered list would make "the model can't see this tool" and
"the tool was removed" indistinguishable. Each descriptor names the scope it
needs, in `_meta."phlix/scope"` (and, for non-SDK clients reading raw JSON, in a
duplicate `x-phlix-scope` key).

| Tool | Scope | What it does |
| ---- | ----- | ------------ |
| `list_servers` | `mcp:servers:read` | Lists the claimed servers, with online status and whether the relay tunnel is connected. **Call this first** — every other tool needs a `server_id` from it. |
| `list_libraries` | `mcp:library:read` | Lists one server's libraries with id, name and type. |
| `search_media` | `mcp:library:read` | Text search across one server's libraries, returning titles and ids. |
| `get_media` | `mcp:library:read` | Full metadata for one item — title, year, overview, runtime, genres, cast, and season/episode structure for a series. |
| `get_playback_info` | `mcp:playback:read` | How an item *would* be played: container, codecs, direct-play vs transcode, and available audio/subtitle tracks. Read-only; it returns no playable URL. |
| `playback_control` | `mcp:playback:control` | **Off by default.** See below. |

A server whose relay tunnel is not connected cannot answer library or media
queries; those tools return a `503` rather than an empty list.

### Tool errors are not transport errors

When a tool's upstream call returns a 4xx/5xx, the JSON-RPC call still
**succeeds** — the answer was simply "no". That is modelled the way MCP intends,
as `isError: true` on a normal result, with the upstream status in
`_meta."phlix/httpStatus"`, so the model can read the reason and adjust. A
missing tool is `mcp.unknown_tool`.

### The `playback_control` flag

`playback_control` is the only MCP tool that changes server-side state, and it
ships behind an operator flag that is **off by default**:

| Setting | Value |
| ------- | ----- |
| Config key | `mcp_playback_control_enabled` (in the hub's `config/server.php`) |
| Environment variable | `HUB_MCP_PLAYBACK_CONTROL` |
| Default | `false` |

When the flag is off the tool is **not registered at all** — it appears in no
`tools/list`, and a `tools/call` naming it returns `mcp.unknown_tool`.

::: danger This tool is best effort, and that is not hedging
The casting backends it drives are **not production-functional**. Chromecast,
Roku and AirPlay were found not production-functional in a prior audit of
phlix-server, and DLNA renderer control is only present when the operator has
separately configured it.

A call can be correctly authorised, correctly routed, correctly forwarded **and
still do nothing**, because the device backend on the far end does not work. Do
not treat a successful response as evidence that playback changed — re-read the
`status` action instead.

The caveat is repeated in the tool's own description and in a `_phlix` block on
every response it returns, including successful ones.
:::

Within those limits the tool controls an **already-running** session only —
`list_devices`, `status`, `pause`, `stop`, `seek`, plus `play` (resume) on
Chromecast. It **cannot start** playback: the two upstream routes that begin a
session are deliberately outside the proxy's allowlist. `play` is Chromecast-only
because on DLNA the same word means "start this URL", not "resume".

Seek positions are given as plain `position_seconds` and converted per device
family.

---

## Transports: POST and SSE

Both directions live on the same path.

### `POST /mcp`

Carries client → server JSON-RPC. Four methods are implemented:

| Method | Notes |
| ------ | ----- |
| `initialize` | Negotiates the protocol revision; see below. |
| `ping` | Returns an empty result. |
| `tools/list` | The tool catalogue. |
| `tools/call` | Invokes a tool. |

- A JSON-RPC **notification** (a request with no `id`) is answered with an empty
  `202` and no body, ever — not even to report that it was malformed.
- **Batched requests are rejected by name.** MCP removed batching in its
  `2025-06-18` revision; send one request per POST.
- Bodies are capped at **262144 bytes**.
- A JSON-RPC *error* still rides an HTTP `200` — the transport worked. The only
  non-200 statuses are the ones where no JSON-RPC processing happened at all
  (`400`, `401`, `429`).

### `GET /mcp`

Opens the server → client SSE channel. It is authenticated and rate-limited by
exactly the same PAT check as `POST`, so opening a stream is not a second, fresh
budget for a token guesser.

`Accept: text/event-stream` is **required**. A wildcard `Accept` — what a bare
`curl` sends — is refused with `406` (`mcp.sse_not_acceptable`) rather than
handing a non-SSE client a response it will hang on:

```bash
curl -N https://hub.example.com/mcp \
  -H 'Accept: text/event-stream' \
  -H 'Authorization: Bearer phlix-mcp-…'
```

::: info The stream is deliberately quiet
The hub's tool set is fixed at startup (`initialize` advertises
`tools.listChanged: false` for exactly that reason) and the hub exposes no
resources, prompts, subscriptions or progress — so it has nothing it can
legitimately push. The stream carries only SSE **comments** and a `retry:` hint.
It never fabricates a `data:` frame, which would be a protocol violation.

It is still worth opening: the connection is the session's liveness signal, and
some clients treat a missing stream as a degraded server.
:::

Stream tuning (hub-side):

| Setting | Environment variable | Default |
| ------- | -------------------- | ------- |
| Keep-alive comment interval | `HUB_MCP_SSE_KEEPALIVE` | 15 s |
| Hard lifetime ceiling | `HUB_MCP_SSE_MAX_SECONDS` | 900 s |

The ceiling exists so an abandoned stream is reclaimed. A conformant client
reconnects on the `retry:` hint (3000 ms), so it is invisible in practice.

### Sessions and resumability

The hub keeps no per-session state. It issues no `Mcp-Session-Id` (minting one
would promise resumability it does not have) and does not support `Last-Event-ID`
stream resumption.

---

## Protocol versions

::: warning Two different mechanisms — do not conflate them
`initialize.protocolVersion` is **negotiated**. The `MCP-Protocol-Version` HTTP
header is **verified**. Treating the header as negotiable will mislead your
integration.
:::

Revisions this build speaks, newest first: **`2025-06-18`** (the latest),
`2025-03-26`, `2024-11-05`.

**`initialize.protocolVersion` — negotiated.** The hub echoes the revision you
ask for when it supports it, and otherwise answers with `2025-06-18` instead. A
mismatch here is a *downgrade, not an error*; you then decide whether to proceed.
When the value is a substitute rather than an echo, the result carries a `_meta`
block saying so:

```json
{
  "protocolVersion": "2025-06-18",
  "_meta": {
    "phlix/protocolVersionRequested": "2099-01-01",
    "phlix/protocolVersionNegotiated": false,
    "phlix/protocolVersionsSupported": ["2025-06-18", "2025-03-26", "2024-11-05"]
  }
}
```

**The `MCP-Protocol-Version` header — verified.** From revision `2025-06-18` a
client stamps every subsequent request with the agreed revision. The hub checks
it and answers `400` (`mcp.unsupported_protocol_version`, with the supported list
in the body) if it names a revision the hub does not speak. It is **not**
silently downgraded, because that would be re-negotiating behind your back
mid-session.

Absence of the header is not an error: it did not exist before `2025-03-26`, so a
request without it is assumed to be using `2025-03-26`.

---

## Not yet available

- **OAuth.** PAT auth is the only credential today; a full OAuth authorization
  server is separate future work.
- **Resources, prompts, sampling, progress.** The hub implements tools only.

## See also

- [What is the Hub](../hub/what-is-the-hub.md) — how claiming and the relay work
- [Trakt.tv](./trakt.md) and [Last.fm](./lastfm.md) — the other integrations
