---
title: DLNA / Play To
description: Streaming Phlix media to DLNA-certified TVs, consoles, and players on the local network
---

# DLNA / Play To

**Since:** 0.18.0

## Overview

DLNA (Digital Living Network Alliance) allows Phlix to stream media to DLNA-certified devices on your local network, such as smart TVs, game consoles, and network media players.

For the complete server-side DLNA documentation, including architecture, configuration, and troubleshooting, see [DLNA Server](../advanced/dlna.md).

## Quick Status Check

There is no dedicated DLNA status endpoint on the public API. To check the
pieces that exist:

```bash
# Is the server up at all?
curl -s http://localhost:8096/health

# Is the SSDP advertiser running? (admin route — requires an admin bearer token)
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:8096/api/v1/admin/dlna/status

# Which renderers has Phlix discovered on the LAN? (authenticated)
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8096/api/v1/dlna/renderers
```

## See Also

- [DLNA Server](../advanced/dlna.md) — complete DLNA server documentation
- [Privacy & Security](../privacy-security.md) — DLNA port 1900/UDP security considerations
- [First Run](../first-run.md) — initial server setup
