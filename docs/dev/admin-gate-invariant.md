---
title: Admin Gate Invariant (self-gating controllers)
description: The required-constructor-dependency recipe for controllers that consult AdminMiddleware in their own handlers, the structural pin that holds it, and the shared handler-enumeration helper the pins must consume rather than copy
---

# Admin gate invariant (self-gating controllers)

Most admin surfaces in phlix-server are gated by **route-level middleware**: the
route is registered inside a `$router->group(..., [$adminMiddleware])` block and
the controller never sees the gate. Those controllers are not the subject of this
page.

A handful of controllers instead consult
`Phlix\Server\Http\Middleware\AdminMiddleware` **inside each handler**, because
their routes are registered bare (no group) or because the surface is destructive
enough to want a second, in-body check. This page is the invariant those
controllers must hold, and the recipe for adding another one.

::: tip One sentence version
`AdminMiddleware` is a **required, non-nullable, `readonly` constructor
parameter**. Never nullable, never defaulted, never a setter — and each such
controller carries a **structural pin** that enumerates its handlers by
reflection and asserts every one of them is classified.
:::

---

## The recipe

For a controller that takes its own admin decision:

1. **Take the gate as a required constructor parameter.**

   ```php
   public function __construct(
       private readonly WebhookDispatcher $dispatcher,
       private readonly AdminMiddleware $adminMiddleware,
   ) {
   }
   ```

   Non-nullable, no default value, `readonly`. Constructing the controller
   without a gate is then an `ArgumentCountError` at the `new` — the null state
   is unrepresentable rather than merely unlikely.

2. **Delete any setter.** No `setAdminMiddleware()`, and no other
   after-construction injection path for the gate.

3. **Call `checkAccess()` unconditionally.** No
   `if ($this->adminMiddleware !== null)`, no `?->`, no early `return null`
   when the dependency is missing — there is no missing case left to handle.

4. **Remove the wiring escape hatches.** In `Application`'s factory (and any
   second construction site) drop
   `if ($container->has(AdminMiddleware::class))` and any container-less
   fallback; resolve the middleware and pass it. A container that cannot supply
   it must fail **loudly at route registration**, which is boot time, rather
   than yield a working-but-ungated controller. When the factory reads a
   nullable `$this->container`, `?? throw` is the shape used.

5. **Add the structural pin** (next section). It is not optional: a re-added
   setter that nobody calls changes no behaviour, so **no behavioural test can
   detect it**. That was measured as mutation M2 in S282 and reproduced in each
   later phase.

### Why nullable is a security bug and not a style preference

The dependency is wired by PHP-DI. **`autowire()` silently skips optional
constructor parameters**, so a nullable-with-default gate does not fail when the
wiring is wrong — it arrives as `null`, and an in-body
`if ($this->adminMiddleware === null) { return null; }` then reports
"authorised" *without any admin decision having been taken*. The guard is absent
rather than loud. phlix-server has shipped silently-`null` dependencies this way
before, so "the production wiring calls the setter" is a property of today's
wiring, not of the class.

Two related traps, both on record here:

- **An empty allow-list can be a fail-open.** In the pins below the exempt list
  is empty and that makes the assertion *stricter*, not laxer — but check the
  direction whenever a list is empty by default.
- **A guard can be correct and still guard nothing** if it never re-derives its
  population. That is the entire reason the pin enumerates handlers instead of
  counting gate calls.

---

## The structural pin

Each self-gating controller has a
`tests/Unit/Server/Http/Controllers/<Controller>AdminGateIsStructuralTest.php`
carrying two independent nets, because either alone can be defeated:

**Structural** — reflection over the constructor, the property and the method
list, plus a source-level check that the gate is not compared against `null`:

| Assertion | What it stops coming back |
|---|---|
| the constructor parameter is required and non-nullable | a defaulted or omitted gate |
| the property is non-nullable with no default | a nullable gate |
| the class exposes no `AdminMiddleware` setter | setter injection (invisible to behavioural tests) |
| constructing without the gate raises `ArgumentCountError` | the positive control for the three above |
| the gate method contains no null comparison | `if (… === null) return null;` |
| every dispatchable handler is classified | a **new, ungated** handler |

**Behavioural** — every gated handler driven three ways: anonymous (401),
authenticated non-admin (403 `auth.not_admin`), and admin. The admin arm is the
succeeding control beside the 403 experiment, so a blanket-deny regression
cannot read as a pass; its expected status is a body-only outcome the gate can
never emit (for example 400 from a missing-field check), which is what proves the
request reached the handler body.

### The classification assertion

The handler population is **derived** (by reflection, see below) while both
classification lists are **hardcoded**:

- a provider of `handler => expected admin-arm status` for the gated handlers;
- a `UNGATED_REQUEST_HANDLERS` constant naming the deliberately un-gated ones.

A new handler is unclassified until a human edits one of those lists, and that
edit is the review moment. Only the enumeration is derived from the subject, so
the check cannot self-adjust to a regression. The count is asserted against a
hardcoded number first — an enumeration that returned nothing would otherwise
make the classification assertion vacuously true. A secondary net counts
`requireAdmin()` call sites against the number of distinct gated handlers, which
catches a gate deleted from a still-listed handler.

::: warning The pin's directory is part of the contract
`tests/Unit/Support/RouterDispatchableHandlersTest.php` discovers pins by walking
`tests/Unit/Server/Http/Controllers/` **recursively** for
`*AdminGateIsStructuralTest.php`, deriving the class name from the path, then
asserting the pin count and that every pin found `use`s the shared trait. A pin
placed anywhere else in `tests/` is invisible to that enforcement and could fork
the predicate again — so put a new pin under that tree (a subdirectory such as
`Controllers/Admin/` is fine and is exercised), even when the controller's other
tests live elsewhere, and update the asserted count in the same change.
:::

---

## The shared enumeration helper — consume it, never copy it

`tests/Support/Http/RouterDispatchableHandlers.php` is the **one** definition of
"this controller method is a route handler". Pins get it with
`use RouterDispatchableHandlers;` and call
`$this->dispatchableRequestHandlers(Foo::class)`.

It answers a question about the **dispatcher**, not about type spellings.
`Router::callHandler()` makes exactly one call —
`$instance->$method($request, $params)` — so a public method's body runs unless
PHP refuses that call, and PHP refuses it in exactly two ways: an
`ArgumentCountError` (more than two *required* parameters; fewer is fine, PHP
accepts surplus arguments) or a `TypeError` (a declared type on parameter #1
rejects the `Request`, or one on parameter #2 rejects the `array`). Acceptance is
decided by asking each declared type whether it accepts the actual value the
router passes, so union, intersection, nullable, `mixed`, `object`, untyped,
`static` and inherited all fall out of one question, and an unrecognised type
counts as accepting — unknown must **widen** the enumeration, never narrow it.

::: danger Do not copy this helper into a pin
It **was** six verbatim private copies of a `declaresARequestParameter()`
helper, and that duplication is exactly why its correctness claim went stale
unnoticed: the copies matched only a native type spelled `Request` (or an
`@param` mentioning `Request`) while asserting in their own docblock that "the
population is closed". It was not closed. Both of

```php
public function purgeAllWebhooks(mixed $request, array $params): Response
public function purgeAllWebhooks(Request|Response $request, array $params): Response
```

were measured slipping through **all six** pins *and* through
`phpstan analyse -c phpstan.neon.dist` (level 9) while being fully dispatchable —
precisely the regression class these pins exist to prevent. One implementation,
pinned by `tests/Unit/Support/RouterDispatchableHandlersTest.php` against a
fixture carrying every shape with an asserted denominator.
:::

### Known limits, as documented in the helper

The trait states what it does **not** close. Read this before trusting it:

- **Only `Router::callHandler()` is modelled.** A controller method reached some
  other way — a closure route that calls it, a CLI command, a WebSocket or DLNA
  dispatcher, a `call_user_func_array()` with a different argument list — is
  outside the predicate. At the time of writing `callHandler()` is the only
  dynamic `$instance->$method($request, …)` in `src/`.
- **Only public methods are enumerated** (including inherited ones), so a
  `__call()` forwarder to a private method is unmodelled.
- **Reachability is not asserted.** A dispatchable method that no route
  registers is still listed. Over-inclusion forces a classification, which is a
  review moment; under-inclusion is the fail-open.
- **A variadic spanning both slots is a deliberate, measured over-inclusion.**
  `foo(Request ...$requests)` is enumerated even though the router's call
  `TypeError`s (a variadic's declared type governs argument #2 as well, and only
  parameters #1 and #2 are interrogated). Left unmodelled on purpose — the
  direction is fail-safe — and pinned by *calling* it, so the gap is measured
  rather than described.
- **Comment stripping removes the comment class and only that class.** The
  secondary call-site counts and the per-method source slices run over tokenised
  source with `T_COMMENT` / `T_DOC_COMMENT` removed, so a docblock quoting the
  counted literal can no longer inflate a count or stand in for the real call. A
  single-quoted string, heredoc or nowdoc holding the same text still counts;
  closing that too would need token-sequence matching instead of
  `substr_count()`. No controller does it today.

---

## Where the invariant holds today

| Controller | Handlers | Gate shape | Step |
|---|---:|---|---|
| `LibraryController` | 16 | required ctor param | S282 (pin re-based in S323 phase 2) |
| `ThemeMediaController` | 3 | required, non-nullable, `readonly` | S323 phase 1 |
| `Webhooks\WebhookAdminController` | 5 | required, non-nullable, `readonly` | S323 phase 2 |
| `MediaMatchController` | 2 | required, non-nullable, `readonly` | S323 phase 2 |
| `MediaPosterController` | 2 | required, non-nullable, `readonly` | S323 phase 2 |
| `Arr\SyncController` | 3 | required, non-nullable, `readonly` | S323 phase 2 |

Handler counts are the reflection-enumerated populations the pins assert. The four
phase-2 controllers cover twelve endpoints:

```text
GET|POST                /api/v1/admin/webhooks
PUT|DELETE              /api/v1/admin/webhooks/{id}
POST                    /api/v1/admin/webhooks/{id}/test
GET                     /api/v1/media/{id}/match/search
POST                    /api/v1/media/{id}/match/apply
GET                     /api/v1/media/{id}/posters
PUT                     /api/v1/media/{id}/poster
POST                    /api/v1/admin/sync/trash-guides
GET                     /api/v1/admin/sync/status
PUT                     /api/v1/admin/sync/enable
```

`MediaPosterController` has **two** construction sites —
`Application::getMediaPosterController()` and `WebPortalRouter`'s admin group —
and both pass the gate as a constructor argument; they must move together,
because a required parameter cannot be satisfied by a path that still uses a
setter.

### Severity differs between the two phases, and the difference is real

`ThemeMediaController` (phase 1) took its in-body check with **no** prior auth
check, so a gate-less construction would have exposed its two mutation endpoints
to an **anonymous** caller. The four phase-2 controllers all refuse an
unauthenticated caller *before* consulting the middleware (`requireAuth()`, or
the equivalent empty-`$request->userId` check), so the missing decision would
have degraded them to **any authenticated user** — never to an anonymous one.
Both were latent: every production wiring site supplied the middleware, and no
exploitation is claimed for either.

### The pattern is established, not universally applied

⚠ **One instance of the old shape is still live.**
`src/Server/Http/Controllers/Admin/MaintenanceController.php` holds
`private readonly ?AdminMiddleware $adminGuard = null` and its `requireAdmin()`
returns "authorised" when that dependency is absent — the same self-disabling
guard. It is **out of S323's scope and owned by S338.**

Its exposure is lower than the six above: the eight `/maintenance/*` routes are
registered inside `AdminRoutes`' `[$adminMiddleware]` group, so the in-body check
is a second gate rather than the only one, and
`tests/Unit/Admin/Maintenance/MaintenanceContainerWiringTest.php` pins the
wiring. That "latent, therefore fine" argument is exactly the one this invariant
rejects — it is a property of the current route registration, not of the class.
Treat this page's recipe as the target shape for it, including the pin's
directory requirement noted above.

---

## See also

- [Server architecture → Adding a new binding](architecture-server#adding-a-new-binding)
  — where the `autowire()` behaviour that makes a nullable gate dangerous lives.
- [Theme media → Authorization](../developers/theme-media#authorization) — the
  worked example, endpoint by endpoint.
- [Security hardening](../security/hardening) — operator-facing checklist.
- [Test Harness](test-harness) — how to run the pins
  (`--filter 'AdminGateIsStructural|RouterDispatchableHandlers'`).
