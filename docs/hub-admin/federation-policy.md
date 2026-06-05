# Hub-Admin: Federation Policy

## TL;DR

Phlix Hub ships hub-to-hub **federation**, and it runs unconditionally — there is no enable/disable flag. Federation uses a **master/leaf** model: one hub is designated the master and other hubs join it as leaves. Once peered, hubs can share libraries across the trust boundary, relay leaf servers through the master, and delegate admin access. Federation is managed from the **Federation page** (`/app/federation`) and the `/api/v1/me/federation/*` REST API; peers are added **manually** (there is no automatic discovery). The one real auth limitation: there is **no cross-hub end-user single-sign-on** — a user account does not span hubs, and each hub issues its own user sessions. A single Phlix Hub instance comfortably handles ~5000 users and ~200 servers on its own, so federation is for genuinely multi-hub deployments rather than capacity overflow.

```text
# Federation REST API (live; gated by admin auth)
GET    /api/v1/me/federation/hub-config
PUT    /api/v1/me/federation/hub-config
GET    /api/v1/me/federation/peers
POST   /api/v1/me/federation/peers
DELETE /api/v1/me/federation/peers/{id}
PUT    /api/v1/me/federation/peers/{id}/relay
PUT    /api/v1/me/federation/peers/{id}/admin-delegation
```

> **Note:** The endpoints above are real and served by `FederationController`, gated behind admin authentication. See [Federation REST API](#federation-rest-api) for the complete route list.

---

## How Federation Is Modelled

### Master and leaf hubs

Federation uses a **master/leaf** topology (`federation_hubs.role` is an `ENUM('master','leaf')`):

| Term | Meaning |
|---|---|
| **Master hub** | The designated authority hub. Other hubs connect to it as leaves. Exactly one master per federation. |
| **Leaf hub** | A hub that connects to the master. A leaf can share libraries cross-hub, have its servers relayed through the master, and accept admin delegation from the master. |
| **Peer** | Either side of a federation link, as recorded in `federation_peers`. Each peer is added manually with its public key. |

A leaf hub auto-connects to its master on boot and maintains a persistent WebSocket tunnel.

### What federation delivers today

- **Peer management** — add, list, and remove peer hubs.
- **Cross-hub library sharing** — a hub offers a library to a peer (an outgoing offer); the peer's admin accepts or rejects it (an incoming offer).
- **Relay peering** — per-peer toggle to make a leaf's servers reachable through the master's relay.
- **Admin delegation** — grant a master-hub admin user admin access on a leaf hub.

### What is not implemented

> ⚠️ Two capabilities are genuinely absent. State these clearly to operators so they do not assume them.

- **Cross-hub end-user SSO** — a user account does not span hubs. Each hub issues its own user sessions; a login on Hub A does not authenticate that person on Hub B. (Hub-to-hub *operator* trust is implemented; cross-hub *end-user* identity is not.)
- **Automatic peer discovery** — hubs never auto-discover each other. Every peer is added manually via `POST /api/v1/me/federation/peers`. There is no discovery protocol.

---

## Single-Hub vs. Federated

### What a single hub delivers

A single Phlix Hub instance handles, on its own:

- Up to ~5000 user accounts
- Up to ~200 claimed servers
- Library sharing within the hub
- Server relay and streaming through the hub

For the vast majority of deployments this is sufficient, and you may never need a second hub. Federation exists for genuinely multi-hub topologies (separate organizations, regions, or trust domains that want to cooperate), not as a workaround for capacity.

### Why a single hub is often enough

1. **Simplicity:** No second hub to operate, no peer trust to manage.
2. **Sufficiency:** ~5000 users and ~200 servers cover most deployments.
3. **Clear path to multi-hub:** When you do need more than one hub, federation is already there — peer them and share.

### What this means for users

- Each user account lives on one hub — there is **no cross-hub login** (no end-user SSO).
- A server can only be claimed to one hub at a time — first claim wins.
- Libraries **can** be shared across hubs once the hubs are peered (an admin on each side approves the share); they are not visible across hubs until that share is set up.
- If a person has separate accounts on two hubs, those accounts are independent — there is no automatic synchronization of the person's identity between them.

### What this means for operators

- Hubs do not know about each other until you **manually peer** them.
- Each hub operator manages their own users, servers, and content policies.
- There is no automatic peering with unknown hubs — you add each peer deliberately with its public key.
- Cross-hub collaboration (shared libraries, relay, admin delegation) requires configuring the peer link on both hubs (see [Configuring Federation](#configuring-federation)).

---

## Federation Architecture

This section describes how the shipping federation feature is built.

### Hub-to-hub transport

Leaf hubs connect to the master over a persistent **WebSocket** tunnel served by `FederationWorker` on **port 8804**. The inbound path is `/relay/federation/{hub_id}`, and the incoming `hub_id` is validated against the `federation_peers` table before the connection is accepted. The tunnel reuses the existing binary relay frame protocol.

```text
 ┌─────────────┐   WebSocket federation tunnel (port 8804)   ┌─────────────┐
 │ Master Hub  │◄───────────────────────────────────────────│  Leaf Hub A │
 │             │   /relay/federation/{hub_id}                │             │
 │ - peer reg  │   - HUB_HELLO handshake                     │ - shares to │
 │ - share agg │   - library share announcements             │   master    │
 │ - admin pool│   - admin-delegation push                   │ - admin from│
 │ - relay agg │   - relay aggregation                       │   master    │
 └─────────────┘                                             └─────────────┘
        ▲
        │
 ┌─────────────┐
 │  Leaf Hub B │
 └─────────────┘
```

### Hub-to-hub trust

Inter-hub trust uses **per-peer public keys** plus a WebSocket handshake:

1. When you add a peer, you supply that peer's public key; it is stored in `federation_peers.public_key` (this hub's own key lives in `federation_hubs.public_key`).
2. A connecting leaf opens the WebSocket and sends a `HUB_HELLO` frame identifying itself.
3. The master verifies the presented public key against the stored `federation_peers` record before establishing the session.

This is **not** mutual TLS and **not** a single shared pre-shared key — it is a per-peer public-key exchange combined with the `HUB_HELLO` handshake. Each peer relationship has its own key.

> **Scope of trust:** this establishes trust *between hub operators*. It does **not** create cross-hub *end-user* identity — see [What is not implemented](#what-is-not-implemented).

### Cross-hub library sharing flow

1. On the offering hub, an admin creates an outgoing share to a peer (`POST /api/v1/me/federation/library-shares/outgoing`).
2. The offer appears on the receiving hub as an incoming offer (`GET /api/v1/me/federation/library-shares/incoming`).
3. An admin on the receiving hub **accepts** or **rejects** it (`POST .../incoming/{id}/accept` or `.../reject`).
4. Once accepted, the shared library is available across the peer link.

### Database schema

Federation is backed by migration `028_federation.sql`, which creates six tables:

| Table | Purpose |
|---|---|
| `federation_hubs` | This hub's own identity: name, URL, public key, and `role` (`master`/`leaf`). |
| `federation_peers` | Known peer hubs, each with its public key, relay toggle, and admin-delegation toggle. |
| `federation_sessions` | Active hub-to-hub WebSocket sessions (heartbeat, byte counters, liveness). |
| `federation_library_shares` | Outgoing library share offers made to peers. |
| `federation_incoming_share_offers` | Incoming share offers received from peers, with accept/reject state. |
| `federation_admin_delegations` | Admin delegations granting master-hub users admin access on leaf hubs. |

---

## Federation REST API

All federation routes are served by `FederationController` and gated by `[AuthMiddleware, AdminMiddleware]` — they require an authenticated **admin** session. They live under `/api/v1/me/federation/*`.

### Hub configuration

```text
GET  /api/v1/me/federation/hub-config    # this hub's role, URL, public key
PUT  /api/v1/me/federation/hub-config    # set role (master/leaf) and config
```

### Peers

```text
GET    /api/v1/me/federation/peers                          # list peers + status
POST   /api/v1/me/federation/peers                          # add a peer (URL + public key)
DELETE /api/v1/me/federation/peers/{id}                     # remove a peer
PUT    /api/v1/me/federation/peers/{id}/relay               # toggle relay for this peer
PUT    /api/v1/me/federation/peers/{id}/admin-delegation    # toggle admin delegation
```

### Library shares

```text
GET    /api/v1/me/federation/library-shares/outgoing            # outgoing offers
POST   /api/v1/me/federation/library-shares/outgoing            # offer a library to a peer
DELETE /api/v1/me/federation/library-shares/outgoing/{id}       # revoke an outgoing offer
GET    /api/v1/me/federation/library-shares/incoming            # incoming offers
POST   /api/v1/me/federation/library-shares/incoming/{id}/accept
POST   /api/v1/me/federation/library-shares/incoming/{id}/reject
```

### Admin delegations

```text
GET    /api/v1/me/federation/admin-delegations        # list delegations
POST   /api/v1/me/federation/admin-delegations        # delegate admin to a peer user
DELETE /api/v1/me/federation/admin-delegations/{id}   # revoke a delegation
```

### Where to manage it

The federation UI is the **Federation page** at `/app/federation` (`FederationPage`), reachable from the hub's top navigation. A legacy server-rendered page also exists at `/federation` (and `/federation/shares`). For automation, use the `/api/v1/me/federation/*` API directly.

The master hub additionally accepts hub-to-hub WebSocket connections at `/relay/federation/{hub_id}` (handled by `FederationWorker` on port 8804). That endpoint is for hub-to-hub traffic, not for operator or browser use.

---

## Inter-Hub Operating Policy

Beyond the mechanics, federation between independent operators carries policy expectations. These apply to operators who **are** federating.

### Publishing your hub URL and terms of service

Before peering with another operator, publish:

- The public URL of your hub (e.g., `https://hub.example.com`)
- A terms of service document covering content policy, acceptable use, and DMCA procedures
- A privacy policy covering what user data the hub collects and how it is handled

A prospective peer will want this before they add you.

### No automatic peering with unknown hubs

Hubs do **not** automatically discover or peer with other hubs. A hub operator must explicitly configure each federation peer (with that peer's public key). Until you add a hub as a peer, it cannot:

- Open a federation tunnel to your hub
- See or accept your library share offers
- Have its servers relayed through your hub

### Content policy

Each hub operator sets their own rules about what content can be served from their hub. There is no cross-hub content policy enforcement. If a peer serves content your operator considers objectionable, you can:

- Revoke the relay toggle or shared libraries for that peer
- Remove the peer entirely (`DELETE /api/v1/me/federation/peers/{id}`)
- File a DMCA or abuse complaint with that peer's operator

---

## Configuring Federation

To federate two hubs, configure the peer relationship on **both** sides.

### Step 1: Decide the topology

Choose which hub is the **master** and which are **leaves**. Set each hub's role via the Federation page or `PUT /api/v1/me/federation/hub-config`. Exactly one hub is the master.

### Step 2: Add the peer on both hubs

On each hub, add the other as a peer with its public key (from the Federation page or `POST /api/v1/me/federation/peers`). Each hub's own public key is available from `GET /api/v1/me/federation/hub-config`. Because peers are added manually, you must do this on **both** hubs — there is no auto-discovery.

Once both records exist, the leaf opens its WebSocket to the master, the master validates the leaf's public key against `federation_peers`, and the peer moves to a connected state.

### Step 3: Enable the capabilities you want

Per peer, toggle:

- **Relay** (`PUT /api/v1/me/federation/peers/{id}/relay`) — to expose the leaf's servers through the master's relay.
- **Admin delegation** (`PUT /api/v1/me/federation/peers/{id}/admin-delegation`) — to grant master admins access on the leaf.

### Step 4: Share libraries (optional)

To share a library across the link:

1. On the offering hub, create an outgoing offer (`POST /api/v1/me/federation/library-shares/outgoing`).
2. On the receiving hub, an admin accepts the incoming offer (`POST /api/v1/me/federation/library-shares/incoming/{id}/accept`).

### A note on user accounts

Federating two hubs does **not** merge their user accounts. There is no cross-hub end-user SSO: each person still authenticates separately on each hub. Federation links the hubs (and their libraries, relay, and admin delegation), not individual end-user identities.

---

## What Can Go Wrong

### Shared library does not appear on the peer hub

**Symptom:** An operator created an outgoing library share, but the peer hub does not see the library.

**Cause:** A cross-hub share has two halves. The outgoing offer must be accepted on the receiving hub before the library is available, and the two hubs must be peered first.

**Fix:** Confirm both hubs have each other added as peers (with public keys) and that the link is connected. Then, on the receiving hub, check incoming offers (`GET /api/v1/me/federation/library-shares/incoming`) and accept the offer (`POST .../incoming/{id}/accept`).

### Operator expects user accounts to span both hubs

**Symptom:** After federating two hubs, an operator expects a user who logs into Hub A to be automatically signed in on Hub B.

**Cause:** There is **no cross-hub end-user SSO**. Federation establishes hub-to-hub trust (and shares libraries/relay/admin delegation), but each hub still issues its own user sessions. A user account does not span hubs.

**Fix:** Explain that the person needs an account on each hub they use. If the goal was cross-hub admin access (not end-user access), use **admin delegation** instead (`PUT /api/v1/me/federation/peers/{id}/admin-delegation` and the `/admin-delegations` endpoints).

### Peer never connects

**Symptom:** Two hubs are configured but the federation link never establishes.

**Cause:** Peers are added manually with public keys, and the master validates the leaf's key on the `HUB_HELLO` handshake. A missing peer record, a wrong public key, or the master's federation port (8804) being unreachable will all prevent the link.

**Fix:** Verify the peer exists on **both** hubs and that each side has the other's correct public key (compare against `GET /api/v1/me/federation/hub-config`). Ensure the leaf can reach the master's `/relay/federation/{hub_id}` endpoint on port 8804.

### Server owner tries to claim to two hubs simultaneously (first claim wins)

**Symptom:** A server owner attempts to claim the same server to a second hub and gets an error, or discovers the server is registered to a different hub than expected.

**Cause:** A server can only be claimed to one hub at a time. The first hub to receive and persist the claim owns the server relationship. Subsequent claims to other hubs are rejected.

**Fix:** If the server was claimed to the wrong hub unintentionally, contact the operator of the hub that currently holds the claim and ask them to release it from their hub's server management, then claim the server to the correct hub. Releasing a claim does not delete media or data on the server — it only removes the relay association with that hub.

---

## Next Steps

- [Hub-admin install & first boot](install.md) — hub setup and admin account creation
- [Hub claim and setup](../hub/claim-server.md) — understanding server claiming and hub identity
- [Hub shared libraries](../hub/share-with-friends.md) — how shared libraries work within a single hub
- [Hub-admin abuse handling](abuse-handling.md) — DMCA workflow, GDPR data handling, audit log review
