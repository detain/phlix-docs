# JWKS API

The server publishes its Ed25519 **public** key(s) as a JWKS document so the hub
can verify JWTs the server signed.

The machine-readable OpenAPI spec for this endpoint lives alongside this page at
`docs/reference/api/hub-jwks.yaml`.

## Endpoint

**`GET /.well-known/jwks.json`**

Served directly by the Phlix server — it is *not* proxied through the hub.
No authentication is required; the document contains public key material only.

### Response — `200 OK`

```json
{
  "keys": [
    {
      "kty": "OKP",
      "crv": "Ed25519",
      "x": "<base64url-encoded 32-byte public key>",
      "kid": "<key id>",
      "use": "sig",
      "alg": "EdDSA"
    }
  ]
}
```

Headers:

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `Cache-Control` | `public, max-age=3600` (cacheable for one hour) |

### JWK fields

| Field | Value | Meaning |
|---|---|---|
| `kty` | `OKP` | Octet Key Pair — the Ed25519/Ed448 key type |
| `crv` | `Ed25519` | Edwards curve identifier |
| `x` | base64url | The 32-byte Ed25519 public key |
| `kid` | string | Key ID — `base64url(SHA-256(publicKey)[0..8])`, or an ISO 8601 timestamp for newly generated keys |
| `use` | `sig` | Signature use |
| `alg` | `EdDSA` | EdDSA signatures |

### Response — `429 Too Many Requests`

This endpoint is publicly reachable, so it carries a DoS guard keyed on the
trusted client IP (trusted-proxy aware, so a forged `X-Forwarded-For` cannot mint
a fresh bucket). Exceeding the budget returns `429` with a `Retry-After` header.

The budget is configurable from **Settings → Server** via
`server.rate_limit.jwks.max` and `server.rate_limit.jwks.window`
(default: 120 requests per 60 seconds). Note that these are **restart-scoped** —
the limiters capture their values when the container is built, so a change takes
effect on the next restart. See [Server Settings](/admin/server-settings).

## Graceful degradation

If the private key cannot be loaded, the endpoint returns a **valid but empty**
keyset with HTTP 200 rather than failing:

```json
{ "keys": [] }
```

The failure is logged server-side. This is deliberate: a problem with the signing
key must never take the public JWKS endpoint down, because that would break hub
verification for every other reason too.

## The private key

The corresponding private key is read from `config/hub-server-key.pem` and is
**never** exposed over the network. The reader accepts both formats:

- the app's native `-----BEGIN ED25519 PRIVATE KEY-----`
- a standard PKCS#8 Ed25519 key (`-----BEGIN PRIVATE KEY-----`), such as one
  produced by `openssl genpkey -algorithm Ed25519`

See [Config Files](/reference/config-files) for where this file lives, and
[Pairing Protocol](/dev/pairing-protocol) for how the signed JWTs are used.
