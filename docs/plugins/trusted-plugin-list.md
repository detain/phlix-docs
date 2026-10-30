---
title: Trusted plugin signature allowlist
description: How plugin sha256 signatures are checked today and how operators seed the trusted-digest allowlist
---

# Trusted plugin signature allowlist

> **Status:** current with the shipped loader. There is no separate
> expansion-plan document behind this page — the allowlist mechanics
> described here are the whole mechanism (`SignatureVerifier` +
> `TrustedSignaturesConfig` in phlix-server).

## How the trust model works today

1. Plugin authors declare a `sha256:<hex>` digest in the manifest's
   `signature` field (see
   [Signing](developer-guide.md#_9-signing) in the developer guide for
   what the verifier actually hashes — and why manifests today ship
   `"signature": null`).
2. The server builds the verifier from operator configuration:
   `Phlix\Plugins\Signature\TrustedSignaturesConfig::fromEnv()` reads
   the allowlist from `PHLIX_PLUGINS_TRUSTED_SIGNATURES`
   (comma-separated digests) and/or `PHLIX_PLUGINS_TRUSTED_SIGNATURES_FILE`
   (a JSON file of entries). Unset seams mean an **empty allowlist** —
   the documented optimistic default. A malformed entry throws at
   boot: a broken security config never quietly un-trusts keys.
   Advanced deployments can still override the
   `SignatureVerifier::class` container binding in
   `PluginsProvider` directly.
3. When a plugin is installed:
   - **Signed** → the verifier first re-hashes the on-disk
     `plugin.json` and compares byte-for-byte; any mismatch is
     `invalid` regardless of the allowlist. Because the declared
     digest sits inside the hashed file, no real-world manifest can
     satisfy this today — signed installs fail until a detached
     signature flow lands.
   - **Signed + on allowlist + content-matching** → install proceeds
     (reserved for the future detached-signature layout).
   - **Unsigned, allowlist not enforced** → install proceeds with a
     warning in the `plugins` log channel. This is the path every
     bundled plugin takes.
   - **Unsigned, `PHLIX_PLUGINS_REQUIRE_SIGNATURE=1`** → install fails.

## Adding your own trusted digests

Environment seams (no code required):

```bash
# One or more comma-separated digests:
export PHLIX_PLUGINS_TRUSTED_SIGNATURES='sha256:abc123…,sha256:def456…'

# …or a JSON file of entries:
export PHLIX_PLUGINS_TRUSTED_SIGNATURES_FILE=/etc/phlix/plugin-trust.json
```

Container override (advanced):

```php
$builder->addDefinitions([
    \Phlix\Plugins\Signature\SignatureVerifier::class => DI\factory(
        static fn (): \Phlix\Plugins\Signature\SignatureVerifier =>
            new \Phlix\Plugins\Signature\SignatureVerifier(
                trustedSignatures: [
                    'sha256:abc123…', // phlix-plugin-lastfm@1.0.0
                ],
                requireSignature: false,
            ),
    ),
]);
```

## Canonical reference plugin

| Plugin                                                                          | Type                | Version | Signature status                       |
| ------------------------------------------------------------------------------- | ------------------- | ------- | -------------------------------------- |
| [`detain/phlix-plugin-example`](https://github.com/detain/phlix-plugin-example) | `metadata-provider` | `0.1.1` | `unsigned (reference implementation)`  |

`phlix-plugin-example` is the hello-world plugin Phlix publishes
alongside the loader as a working template. It deliberately ships
**unsigned** — its purpose is to be forked and modified, so pinning
its hash to the trusted-key allowlist would be misleading. Operators
who want to install it must accept the unsigned-plugin warning logged
to the `plugins` channel, or leave `PHLIX_PLUGINS_REQUIRE_SIGNATURE`
unset (the default).

## What has NOT shipped

- A curated allowlist published by the hub and signed with a
  long-lived maintainers' key. The in-product catalog
  ([Install from Catalog](install-from-catalog.md)) is a
  *distribution* source (`plugins.json` in a git repo, by default
  `detain/phlix-plugins`) — it curates what is *available*, not what
  is *trusted*.
- An operator UI under `/admin/plugins/trust` for inspecting,
  pinning, and revoking specific plugin signatures.
- Detached (out-of-band) signatures that make the content-integrity
  check usable, and automatic pin renewal on new versions.

Until those land, the contract is unchanged: **the operator vouches
for what they install**, with the digest check as defence-in-depth.
