---
title: Reference
description: API, CLI, configuration, and environment-variable reference for Phlix — REST endpoints, WebSocket events, authentication, config files, and protocols
---

# Reference

Complete reference material for Phlix. If you are looking for task-oriented
guides instead, start at [First Run](/first-run) or the
[Developer docs](/developers).

## API

- [Server API Reference](/reference/api) — the full REST API: endpoints,
  WebSocket events, authentication, and plugin hooks.
- [WebAuthn / Passkey API](/reference/api/auth-webauthn) — registration and
  authentication ceremonies for passkey login.
- [JWKS API](/reference/api/hub-jwks) — the Hub's JSON Web Key Set endpoint,
  used to verify Hub-issued tokens.
- [Media Requests API](/reference/api/hub-media-requests) — the Hub media
  request flow (Radarr / Sonarr integration).

## Configuration

- [Environment variables](/reference/env-vars) — every supported variable and
  its default.
- [Config files](/reference/config-files) — file locations, formats, and
  precedence.
- [Admin Reference](/reference/admin-reference) — administrative settings and
  what each one changes.

## Command line & protocols

- [CLI Reference](/reference/cli) — every command, flag, and exit code.
- [Skip Button Protocol](/reference/skip-button-protocol) — the wire format
  clients use for intro/outro skip.

## See also

- [Server architecture](/dev/architecture-server) — how the pieces fit together.
- [Event reference](/dev/event-reference) — events emitted across the system.
- [Plugin SDK](/dev/plugin-sdk) — plugin internals.
