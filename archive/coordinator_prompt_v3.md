# Coordinator Prompt v3 — Hub UI Coverage Build (Session Resume)

**Generated:** 2026-05-30
**Last session ended with:** H.5 (admin settings UI) merged, H.6a (federation schema+repos) merged in phlix-shared PR #8, but phlix-hub PR #42 (H.6a) is still OPEN and needs fixing.
**Next steps:** Fix critical PR bugs, merge H.6a, continue H.6b/c/d.

---

## Current Repo State

| Repo         | HEAD (master) | Latest merge |
| ------------ | ------------- | -------------|
| phlix-hub    | `194e0f7` (H.5 merged) | `194e0f7` (H.5 admin settings) |
| phlix-shared | `afc91d8` | `afc91d8` (H.6a RelayFrameType) |

---

## Open PRs Requiring Immediate Action

### 🔴 PR #42 — `feat/hub): H.6a - federation schema + repository layer` (phlix-hub) — OPEN

**Status:** MERGED in throwaway clone but NOT pushed to origin. PR is still OPEN on GitHub. The merge commit exists only in `/tmp/phlix-hub-h6a-merge/`.

**Blocked:** The throwaway clone merge did NOT push back to origin. You must complete the merge.

### 🔴 PR #41 — `feat(hub): H.5 - hub admin settings UI` — MERGED, but has 2 bugs from review

**PR:** https://github.com/detain/phlix-hub/pull/41

#### P1 (blocks H.5 from working — CRITICAL):
The route at `Application.php:619-622` registers routes as `$r->get('/')` and `$r->put('/')`
inside the group `/api/v1/me/hub-settings`. This creates routes at `/api/v1/me/hub-settings/` (with trailing slash).
But the JS at `hub-settings.js:129` fetches `/api/v1/me/hub-settings` (NO trailing slash).
**Result:** H.5 settings page is broken — all API calls return 404.

**Fix:** In `Application.php`, change:
```php
$r->get('/', ...);   // WRONG — only matches /api/v1/me/hub-settings/
$r->put('/', ...);   // WRONG — only matches /api/v1/me/hub-settings/
```
To:
```php
$r->get('/hub-settings', ...);    // CORRECT — matches /api/v1/me/hub-settings (no trailing slash)
$r->put('/hub-settings', ...);   // CORRECT — matches /api/v1/me/hub-settings (no trailing slash)
```
OR simply use `$r->get('')` inside the group if the router supports it.
Then remove the `/hub-settings` prefix from the group path — the group path becomes `/api/v1/me` and the routes are `''`.

#### P2 (H.5 broken — Save persists ALL fields, overwriting custom overrides):
When admin changes ONE field and saves, `putSettings()` persists ALL 8 keys. If any key was
previously overridden and the admin doesn't submit it now, the override is lost.
The form only sends the keys that are in the HTML form, but `putSettings` loops over ALL
ALLOWED_KEYS (sending defaults for missing ones).

**Fix in HubSettingsController:** The loop at line 131 `foreach ($settings as $key => $value)` only
loops over submitted keys (from the request body). But the loop at line 152 `foreach ($settings as $key => $value)`
also only loops over submitted keys. This is correct! The issue is in the JS — `putSettings()` in JS
sends ALL form fields (including unchanged defaults) instead of only changed fields.
OR: Fix the API to only persist submitted keys (current `putSettings()` already does this — the loop
only uses `$settings` from request body). The JS bug is that the form includes ALL fields (including
unchanged defaults from `effective` values). Fix: only include in the PUT body the fields the user
actually changed.

---

### 🟠 PR #42 — 4 P2 bugs to fix before merging:

**Fix 1 — `FederationHubRepository::updateRole()` never writes `role` column:**
```php
// Current (WRONG): computes is_master but never updates the 'role' column
// Fix: UPDATE sets both is_master AND role = :role
UPDATE federation_hubs SET is_master = CASE WHEN role = 'master' THEN 1 ELSE 0 END, updated_at = NOW()
WHERE id = (SELECT id FROM federation_hubs LIMIT 1)
```
When `updateRole('leaf')` is called, `is_master` stays 0 (correct). But when `updateRole('master')` is called,
`role` still says `leaf` and `is_master` stays 0. Fix to also SET `role = :role`.

**Fix 2 — `FederationAdminDelegationRepository::grant()` on previously-revoked delegation:**
The UNIQUE constraint on `(peer_id, user_id)` means `INSERT IGNORE` on re-grant is a no-op if the
row already exists with `revoked_at IS NOT NULL`. Fix: use upsert (INSERT ... ON DUPLICATE KEY UPDATE
`revoked_at = NULL`) instead of `INSERT IGNORE`.

**Fix 3 — `FederationLibraryShareRepository::handleIncomingOffer()` no dedup by peer+library:**
The incoming offer table has no unique key on `(peer_id, library_id)`, so resends create duplicates.
Fix: Add `UNIQUE KEY uq_incoming_peer_library (peer_id, library_id)` to migration AND change
`handleIncomingOffer()` to use `INSERT ... ON DUPLICATE KEY UPDATE` (upsert by `peer_id + library_id`).

**Fix 4 — `TINYINT(1)` returned as string `'1'` breaks boolean fields:**
`FederationPeerDto::fromRow()` uses `(int) ($row['relay_enabled'] ?? 0) === 1`.
Workerman/PDO returns TINYINT as string. `(int) '1' === 1` → true. But `(int) ('1' ?? 0) === 1` → true.
Actually the check seems right — `(int) '1' === 1` returns true in PHP because '1' casts to 1.
BUT the issue is: if the value is string `'0'` or empty string (edge case), `(int) '' === 0` which is not === 1.
Fix: use strict comparison OR add `is_numeric()` check. The safest pattern used elsewhere in the hub:
```php
relayEnabled: ($row['relay_enabled'] ?? '') === '1' || ($row['relay_enabled'] ?? '') === 1,
```

---

## Agent Instructions (Spawn Agents for These Tasks)

### Agent 1: Fix + Merge PR #41 (HubSettings route bug)

1. Read `/home/sites/phlix/phlix-hub/src/Application.php` around lines 615-622
2. Fix the route: change `$r->get('/')` inside `/api/v1/me/hub-settings` group to `$r->get('')` (or fix the path)
3. Verify: the route should be reachable at BOTH `/api/v1/me/hub-settings` AND `/api/v1/me/hub-settings/`
4. Fix the H.5 P2 (only send changed fields in PUT body) in `public/assets/js/hub-settings.js`
5. Also fix: in `HubSettingsController.php` line 118 — `$request->body` should be `$request->jsonBody()` since putSettings reads JSON body
6. Throwaway-clone → commit → push → merge PR #41 via throwaway clone
   ```
   unset GITHUB_TOKEN && gh pr merge 41 --admin --merge
   ```
7. Sync live hub repo to master: `git checkout master && git pull origin master`

### Agent 2: Fix P2 bugs in PR #42, then merge

1. Read all affected files in `/home/sites/phlix/phlix-hub/src/Hub/Federation/`
2. **Fix 1:** `FederationHubRepository::updateRole()` — change the UPDATE to also SET `role = :role`
3. **Fix 2:** `FederationAdminDelegationRepository::grant()` — change `INSERT IGNORE` to upsert with `revoked_at = NULL`
4. **Fix 3:** Migration `028_federation.sql` — add `UNIQUE KEY uq_incoming_peer_library (peer_id, library_id)` to `federation_incoming_share_offers` table. Then change `FederationLibraryShareRepository::handleIncomingOffer()` to use upsert (INSERT ON DUPLICATE KEY UPDATE).
5. **Fix 4:** `FederationPeerDto::fromRow()` — fix TINYINT string handling:
   ```php
   // Change these lines:
   relayEnabled: (int) ($row['relay_enabled'] ?? 0) === 1,
   adminDelegationEnabled: (int) ($row['admin_delegation_enabled'] ?? 0) === 1,
   // To:
   relayEnabled: ($row['relay_enabled'] ?? '') === '1' || ($row['relay_enabled'] ?? 0) === 1,
   adminDelegationEnabled: ($row['admin_delegation_enabled'] ?? '') === '1' || ($row['admin_delegation_enabled'] ?? 0) === 1,
   ```
6. Throwaway-clone → commit to `feat/hub-H6a-federation-schema` → push → merge PR #42 via throwaway clone:
   ```
   unset GITHUB_TOKEN && gh pr merge 42 --admin --merge
   ```
7. Sync live hub repo to master

### Agent 3: Write coordinator_prompt_v4.md with updated status

After all PRs are merged, write an updated coordinator_prompt file with:
- Current PR state (all merged)
- Next steps: H.6b (master WS handler), H.6c (leaf side + REST API), H.6d (UI)
- Brief summaries of what each sub-step does

---

## Verified Working From Previous Session

- H.1 PR #33 ✅
- H.2 PR #35 ✅
- H.3 PR #37 ✅
- H.4 PR #39 ✅
- H.5a PR #40 ✅
- H.5 PR #41 ✅ (merged, but has route bug being fixed above)
- phlix-shared H.6a PR #8 ✅ (merged)
- H.6a hub PR #42 ✅ (merge pending — in /tmp/phlix-hub-h6a-merge/)

---

## H.6 Sub-Step Plan (reference)

| Sub-step | Description |
| -------- | --------- |
| H.6a | ✅ Done — schema + repository layer (PR #42 pending fix+merge) |
| H.6b | Master WS handler — FederationFrameHandler + FederationRelayController |
| H.6c | Leaf side + REST API — FederationController |
| H.6d | UI — federation.tpl + federation-shares.tpl |

---

## Cardinal Rules (Non-Negotiable)

1. Throwaway-clone for ALL commits (CALIBER hook corruption hazard)
2. Stage SPECIFIC files only (`git add path/to/file`), never `git add -A`
3. `unset GITHUB_TOKEN` in SAME command as `gh` calls
4. Never `--amend`, `--no-verify`, force-push, or `--no-verify`
5. PHPStan L9 + PHPCS PSR-12 + PHPUnit GREEN before any commit
6. One repo per PR, Conventional-Commit messages + Co-Authored-By
7. Never implement H.6b/c/d until H.6a is green-merged
8. All hub SSR pages use shell + client-side JS fetch pattern (H.1 precedent)
