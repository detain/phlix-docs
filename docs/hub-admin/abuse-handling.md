# Hub-Admin: Abuse Handling

## TL;DR

Hub operators receive DMCA notices at `abuse@yourhub.com` and must act through the hub dashboard or CLI. The hub can suspend servers, ban users, and forward notices to server owners — but cannot remove content from servers it only relays for. For GDPR requests, the hub exposes all user data it holds via export command and deletes user records on request, though data on the user's own server must be handled separately by the server owner. All abuse actions are audit-logged with timestamp, admin ID, action, and reason.

```bash
# Suspend a server (stops relay, server appears offline)
php bin/hub.php server:suspend <server-id> --reason "DMCA notice received"

# Ban a user (prevents login)
php bin/hub.php user:ban <user-id>

# Export all user data (GDPR right to access)
php bin/hub.php user:export <user-id>

# Delete user and cascade relay sessions/grants (GDPR right to erasure)
php bin/hub.php user:delete <user-id>

# Review audit log for a user
php bin/hub.php audit:list --user <user-id>
```

---

## DMCA / Takedown Workflow

### Receiving the Notice

- Hub operators receive DMCA notices at `abuse@yourhub.com`
- Forward the notice text to the hub operator's internal abuse queue
- Log receipt: timestamp, sender email, notice text (store securely, not in shared logs)

### Locating the Server and User

- Use the hub dashboard to search by server hostname or user email
- CLI equivalent: `php bin/hub.php audit:list --server <server-id>` to find associated activity
- Verify `server_id` in the DMCA notice matches the claimed server — cross-reference with hub's server registry

### Available Actions

**1. Suspend server**

```bash
php bin/hub.php server:suspend <server-id> --reason "DMCA notice received"
```

- Stops relay immediately; server appears offline in hub dashboard
- Users see "server unavailable" in hub dashboard when browsing shared libraries
- Unsuspend when resolved: `php bin/hub.php server:unsuspend <server-id>`

**2. Remove content (out of hub's control)**

- Hub only handles relay, not content storage — it cannot delete files on the server
- Instruct server owner via email notification from hub dashboard
- Hub sends automated email to server admin with DMCA notice text attached
- Server owner must delete infringing content and confirm in writing

**3. Ban user**

```bash
php bin/hub.php user:ban <user-id>
```

- Prevents the user from logging into the hub
- Does not affect their server (banning is hub-only)
- Unban when resolved: `php bin/hub.php user:unban <user-id>`

**4. Forward to server owner**

- Hub sends email notification to the registered server admin address
- Includes full DMCA notice text
- Hub retains copy of forwarded notice in audit log

### Audit Logging

- All abuse actions are logged: timestamp, admin ID performing action, action taken, reason
- CLI: `php bin/hub.php audit:list --action=suspend` to list all suspensions
- CLI: `php bin/hub.php audit:list --server <server-id>` for server-specific history
- CLI: `php bin/hub.php audit:list --user <user-id>` for user-specific history

---

## GDPR Data Handling

### What the Hub Stores Per User

- Email address
- Hashed password (Argon2ID)
- Server claims: `server_id` + `claim_date` pairs (what servers this user has claimed)
- Relay session metadata: WebSocket session tokens, connection timestamps, duration

### What the Hub Does NOT Store

- Media filenames or folder structure
- Playback history or watch history
- Library content or metadata
- Any media stream content

### Data Export (right to access)

```bash
php bin/hub.php user:export <user-id>
```

- Outputs JSON containing: email, server claims with claim dates, relay session summary
- Hub does not include media data (it does not have it)
- Output should be handed to the requesting user within 30 days of verified request

### Data Deletion (right to erasure / right to be forgotten)

```bash
php bin/hub.php user:delete <user-id>
```

- Removes the user record from the hub database
- Cascade deletes: relay sessions for that user, shared library grants for that user
- Hub cannot delete data on the user's own server — server owner must handle separately
- Coordination required: notify server owner that user data on hub has been deleted; server owner should delete any remaining user data on their server
- GDPR Article 17: deletion must occur within 30 days of a verified request

### Data Retention: Relay Session Metadata

- Relay session metadata is retained for 90 days
- After 90 days, metadata is automatically purged
- This applies to session timestamps, duration, and connection metadata — not user identity records (those are deleted immediately on `user:delete`)

---

## Suspending a Server

```bash
# Suspend (stops relay, server offline in hub dashboard)
php bin/hub.php server:suspend <server-id> --reason "DMCA notice received"

# Unsuspend (restore relay after issue resolved)
php bin/hub.php server:unsuspend <server-id>
```

- Suspended servers cannot relay connections through the hub
- Users see "server unavailable" for any shared libraries hosted on the suspended server
- Suspension is hub-only: the server itself is unaffected; it simply cannot relay via this hub
- Include a clear `--reason` for audit trail

---

## Audit Log Review

```bash
# All actions by a specific user
php bin/hub.php audit:list --user <user-id>

# All actions involving a specific server
php bin/hub.php audit:list --server <server-id>

# All suspension actions (across all users/servers)
php bin/hub.php audit:list --action=suspend

# All ban actions
php bin/hub.php audit:list --action=ban
```

- Each audit entry contains: timestamp, admin ID, action, reason, affected entity (user/server)
- Audit log is append-only — entries are never modified or deleted
- Use audit log to reconstruct the full timeline when investigating repeated abuse

---

## What Can Go Wrong

### DMCA Notice Forwarded to Wrong Server

**Symptom:** Innocent server suspended; actual infringer remains active.

**Cause:** `server_id` in DMCA notice did not match the claimed server; cross-reference error.

**Fix:** Always verify `server_id` in the notice matches the server's claimed ID in the hub registry before suspending; if wrong server was suspended, run `php bin/hub.php server:unsuspend <server-id>` and locate the correct server.

### User Data Not Fully Deleted (hub gone, server still has data)

**Symptom:** User's hub data is deleted but their data on their own server remains.

**Cause:** Hub only controls hub-side data; server-side data is under the server owner's control.

**Fix:** Coordinate with the server owner when a GDPR deletion request is received; hub should send a notification to the server owner requesting they delete the user's server-side data; document the coordination in the audit log.

### False Positive Suspension (innocent server caught in automated abuse detection)

**Symptom:** Legitimate server suspended incorrectly; server owner disputes the suspension.

**Cause:** Automated abuse detection or mistyped server ID in a DMCA notice.

**Fix:** Verify server identity before suspending; if suspended in error, immediately unsuspend; direct server owner to the appeal process via `abuse@yourhub.com`; log the false positive in the audit record with resolution notes.

---

## Next Steps

- [Hub claim and setup](../hub/claim-server.md) — understanding server claiming and hub identity
- [Hub shared libraries](../hub/share-with-friends.md) — how shared libraries work between server and hub
- [Hub-admin install & first boot](install.md) — hub setup and admin account creation
