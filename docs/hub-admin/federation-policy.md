# Hub-Admin: Federation Policy

## TL;DR

A single Phlex Hub instance handles up to ~5000 users and ~200 servers — sufficient for the vast majority of deployments. Hub-to-hub federation (where two independent hub instances share users, servers, or libraries across trust boundaries) is intentionally not implemented in v1. Library sharing, server claiming, and relay all work within a single hub. Future federation (hub-to-hub API, cross-hub JWT auth, federated server metadata) is planned but not yet built. Operators needing multi-hub federation should track the roadmap; operators choosing a single-hub deployment get a fully functional system.

```bash
# Federation API — future endpoints (NOT YET AVAILABLE in v1)
# GET /api/v1/hubs/{hub-id}/servers         # list servers on a specific hub
# GET /api/v1/hubs/{hub-id}/users          # list users on a specific hub
# POST /api/v1/federation/peers           # announce this hub as a federation peer
```

> **Note:** Federation endpoints above are design notes for future planning, not implemented features. Do not attempt to call them against a v1 hub.

---

## v1 Single-Hub Decision

### What v1 Delivers

A single Phlex Hub instance handles:
- Up to ~5000 user accounts
- Up to ~200 claimed servers
- Library sharing within the same hub instance
- Server relay and streaming through the hub

### What v1 Explicitly Does Not Include

- Hub-to-hub communication (federation)
- Cross-hub library sharing
- Automatic peer discovery between hubs
- Shared JWT/SSO across multiple hub instances

### Why Single-Hub Was Chosen for v1

1. **Simplicity:** No trust model, NAT traversal, or cross-hub identity complexity
2. **Sufficiency:** ~5000 users and ~200 servers cover the vast majority of deployments
3. **Industry precedent:** Jellyfin and Emby — the closest analogs — do not implement true federation either; this is an unsolved problem in personal media serving
4. **Clear migration path:** When scaling beyond a single hub is needed, the migration path is well-defined

### What This Means for Users

- Each user account lives on one hub — there is no cross-hub login
- A server can only be claimed to one hub at a time — first claim wins
- Library sharing only works within the same hub instance — shared libraries are not visible on other hubs
- If you have accounts on two separate hubs, they are independent — no automatic synchronization

### What This Means for Operators

- Multiple independent hub instances do not know about each other
- Each hub operator manages their own users, servers, and content policies
- There is no automatic peering with unknown hubs
- Cross-hub collaboration requires manual account linking (see §Manual Federation)

---

## Future Federation Design (Roadmap — Not Yet Implemented)

> ⚠️ This section describes a future design for when federation is needed. None of this is implemented in v1. Treat as planning reference only.

### Hub-to-Hub API

If/when federation is added, the hub-to-hub API would expose:

```
GET /api/v1/hubs/{hub-id}/servers    # list servers registered on a specific hub
GET /api/v1/hubs/{hub-id}/users      # list user accounts on a specific hub
GET /api/v1/hubs/{hub-id}/libraries  # list shared libraries on a specific hub
```

These endpoints would be authenticated via mutual TLS or a pre-shared federation key.

### Cross-Hub User Auth

Instead of each hub issuing its own JWTs with no cross-hub validity, a federated auth model would:

- Accept JWTs issued by other trusted hubs
- Maintain a shared JWKS list of all federation peers' public keys
- Allow a user on Hub A to access resources on Hub B without creating a new Hub B account

### Federation Protocol

A hub announces itself as a federation peer by:
1. Publishing its public key to a shared JWKS endpoint
2. Exchanging server metadata with known peers
3. Periodically updating its presence in the peer registry

Federation peers exchange:
- Server metadata (hostname, library descriptions, server capabilities)
- User identity assertions (verifying a user exists on Hub A without revealing their personal data)
- Content policy declarations (what type of content a hub allows/rejects)

### Federation Challenges

The following challenges make federation non-trivial and are the reason it was deferred past v1:

| Challenge | Description |
|---|---|
| **NAT traversal** | Servers behind NAT cannot be directly addressed by peers — requires relay or hole-punching |
| **Trust model** | Each hub must decide which other hubs are trusted; trust is not transitive |
| **User identity across hubs** | A user on Hub A is not the same entity as a user on Hub B — no shared identity layer |
| **Data privacy between operators** | Hub operators may have different privacy policies; federation must not leak user data across trust boundaries |
| **Content policy heterogeneity** | One hub may allow adult content; another may not — cross-hub sharing raises content policy conflicts |
| **No industry standard** | Jellyfin, Emby, Plex, and other media servers have not solved true federation — there is no spec to follow |

---

## Inter-Hub Policy (Even for v1 Single-Hub)

Even though v1 does not implement federation, hub operators should be aware of the following inter-hub policy expectations:

### Publishing Your Hub URL and Terms of Service

Hub operators should publish:
- The public URL of their hub (e.g., `https://hub.example.com`)
- A terms of service document covering content policy, acceptable use, and DMCA procedures
- A privacy policy covering what user data the hub collects and how it is handled

This is a prerequisite for any future federation participation.

### No Automatic Peering with Unknown Hubs

v1 hubs do not automatically discover or peer with other hubs. A hub operator must explicitly configure federation peers. Unknown hubs cannot:
- Query your hub's server list
- Authenticate users against your hub
- Access your hub's library metadata

### Manual Federation: OAuth-like Account Linking

The only cross-hub interaction available in v1 is manual account linking, similar to OAuth trust:

1. User on Hub A wants to access resources on Hub B
2. Hub A issues a cross-hub identity token for that specific user
3. User presents the token to Hub B
4. Hub B validates the token against Hub A's public key
5. Hub B creates a shadow account for the user (mapped to their Hub A identity) with scoped access

This is not true federation — it is a bilateral manual trust agreement between two specific hub operators.

### Content Policy

Each hub operator sets their own rules about what content can be served from their hub. There is no cross-hub content policy enforcement. If Hub A serves content that Hub B's operator considers objectionable, Hub B can:
- Block access from Hub A's users to Hub B's servers
- Decline to federate with Hub A at all
- File a DMCA or abuse complaint with Hub A's operator

---

## Migration Path: From Single to Multi-Hub

If a hub grows beyond the v1 single-hub capacity (~5000 users, ~200 servers), the migration path to multi-hub is:

### Step 1: Identify the Split Point

Determine whether the split is:
- **Geographic:** users in different regions (e.g., US East vs. EU West)
- **Organizational:** different tenant groups that need isolation
- **Scale-based:** pure capacity overflow

### Step 2: Export User Accounts

```bash
# Export all user accounts from the source hub
php bin/hub.php user:export --all --format json > users-export.json

# Export all server claims
php bin/hub.php server:export --all --format json > servers-export.json

# Export all library sharing grants
php bin/hub.php share:export --all --format json > shares-export.json
```

### Step 3: Import into New Hub Instances

```bash
# Create Hub A (e.g., US East) and import users
php bin/hub.php user:import --hub us-east --file users-export.json

# Create Hub B (e.g., EU West) for the second region
php bin/hub.php user:import --hub eu-west --file users-export.json

# Filter imports by region during import (e.g., only EU users to EU hub)
php bin/hub.php user:import --hub eu-west --file users-export.json --filter-region eu
```

### Step 4: Server Reassignment

Servers must be re-claimed to the new hub:

1. Server owner logs into the new hub
2. Server owner runs the claim flow against the new hub
3. Old hub releases the server claim (automatic after re-claim to new hub)

```bash
# On the server, claim to the new hub
php bin/phlex hub:claim --hub https://eu-west.hub.example.com --token <new-hub-token>
```

### Step 5: Verify Library Access

After migration:
- Users on Hub A cannot see Hub B's libraries (and vice versa)
- Shared library grants do not cross hub boundaries — re-establish shares if needed
- Cross-hub access requires federation (future work) or manual account linking

---

## What Can Go Wrong

### User Expects Cross-Hub Library Sharing (not available in v1)

**Symptom:** User on Hub A expects to see libraries shared by their friend on Hub B, but no cross-hub sharing is visible.

**Cause:** Library sharing in v1 only works within the same hub instance. Cross-hub sharing requires federation, which is not yet implemented.

**Fix:** Check whether both users are on the same hub (compare hub URLs in the dashboard). If on different hubs, explain that cross-hub sharing is not yet available. Direct users to the federation roadmap and the manual account linking option.

### Hub Operator Assumes Federation Exists (it does not)

**Symptom:** Hub operator sets up two independent hub instances expecting them to share users and servers automatically.

**Cause:** v1 does not implement any federation. Each hub is fully independent with no shared state.

**Fix:** Review this doc to understand v1's single-hub scope. If cross-hub collaboration is needed, consider: (a) consolidating to a single hub if under the ~5000 user / ~200 server limit, or (b) using the manual account linking approach for specific cross-hub use cases. Track the federation roadmap for future multi-hub support.

### Server Owner Tries to Claim to Two Hubs Simultaneously (first claim wins)

**Symptom:** Server owner attempts to claim the same server to a second hub and gets an error, or discovers the server is registered to a different hub than expected.

**Cause:** A server can only be claimed to one hub at a time. The first hub to receive and persist the claim owns the server relationship. Subsequent claims to other hubs are rejected.

**Fix:** If the server was claimed to the wrong hub unintentionally:
1. Contact the hub operator of the hub that currently holds the claim
2. Request that the hub operator release the server claim: `php bin/hub.php server:release <server-id>`
3. Once released, claim the server to the correct hub: `php bin/phlex hub:claim --hub https://correct-hub.example.com`

Note: Releasing a server claim does not delete any media or data on the server — it only removes the relay association with the hub.

---

## Next Steps

- [Hub-admin overview](hub-admin/overview.md) — hub dashboard and admin CLI reference
- [Hub claim and setup](hub-claim.md) — understanding server claiming and hub identity
- [Hub shared libraries](hub-shared-libraries.md) — how shared libraries work within a single hub
- [Hub-admin abuse handling](hub-admin/abuse-handling.md) — DMCA workflow, GDPR data handling, audit log review
