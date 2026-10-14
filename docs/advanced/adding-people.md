# Adding People to Your Household

There are three different things people usually mean by "add someone to Phlix", and they
live in different places. This page tells you which one you want and how to do it.

| You want to… | You're really creating… | Where |
|---|---|---|
| Give someone on your couch their own shelf, watch list and limits | a **profile** (inside your account) | **Profiles** page (`/app/profiles`) |
| Give someone their own login, from their own device | a **user account** | the sign-up page, or **Admin → Users** |
| Let a friend use your server from far away without touching your library | a **Hub invite link** | the Hub — see [Invite links](../hub/invite-links.md) |

## Profiles: the couch-friendly way

A profile is a name on your account — like on a streaming service you already know.
Everyone on the same Wi-Fi shares one TV-sized login, and each person taps their face.

1. Sign in, open the **account menu** (top-right — it carries your username), and press
   **Manage Profiles**. The page is titled *Manage Profiles* (`/app/profiles`).
2. Press **+ Add profile**, type a name (at least 3 characters), save.
3. That's it. Once an account has **two or more profiles**, the *Who's watching?* screen
   appears after sign-in and anyone can tap theirs; the account menu's
   **Switch Profile** item calls that screen back up. With a single profile none of
   that appears — life stays as it was.

What a profile has of its own:

- **Watch history and "Continue Watching"** — history is recorded per profile, so
  Maya's half-watched show doesn't follow Sam to the bedroom.
- **A content-rating cap** — set from Admin → Users → Profiles (see below).
- **Optional bedtime windows, tag blocks, and stream limits** — on the Parental Controls
  page, whose tabs are *Schedules*, *Tags*, and *Stream Limits*. (It's currently a
  direct-URL page, not a menu item — the linked guide tells you how to open it.) See
  [Parental & Session Controls](parental-controls.md).

What a profile does **not** have: its own password. Profiles sit inside one account;
anyone who can open the app can tap any profile. There is a PIN you can set per profile
(Admin → Users, 4 or 6 digits), but be honest with yourself about what it does today:
**no shipping app actually asks for the PIN when switching profiles.** The PIN is stored
and can be verified by the API, yet the web, mobile, Roku, Tizen and console clients
never prompt for it. Treat it as a placeholder for future enforcement, not a lock.

::: tip Deleting
Every account keeps at least one profile — the last one cannot be deleted. Deleting any
other asks for confirmation and warns that the profile cannot be recovered (its watch
history goes with it).
:::

## User accounts: their own login

Give each person a real account if they'll watch from their own phone/laptop/TV and you
want to know *who* did *what* in the admin stats, or you want per-person passwords.

Three doors exist:

1. **They sign themselves up** — on the login screen's sign-up page (email, username of
   3+ characters, password of 8+ characters). What happens next is governed by
   **Admin → Settings → "New user signup mode"**, which has three settings: **open**
   (accounts work immediately), **approval** (the default — the account lands in a
   *Pending* queue at the top of **Admin → Users** and can't log in until you approve
   it), or **disabled** (registration is refused outright). Either way, the *first*
   account ever created on a fresh server becomes the admin automatically — that's how
   you bootstrap.
2. **You create them** — **Admin → Users → Add user**: username, email, password, and an
   **admin** checkbox. Hand out admin only to people you'd hand your password to.
3. **Via the Hub** — a friend who got a Hub invite link claims *their own* account on
   your server through the Hub flow; that's remote access, not household — see
   [Invite links](../hub/invite-links.md).

Every account always has at least one profile — the server quietly creates a default one
the first time an account needs a profile. More can be added per account on the Profiles
page. Ratings, PINs and per-profile details for *anyone's* profiles are managed under
**Admin → Users**: press **Profiles** on a user's row to open their profiles dialog, with
the content-rating selector and a *Set PIN* option for each.

## Who sees what afterwards

- Every account — first or fiftieth — can see and browse the **same library** unless
  you start using [sharing permissions](../hub/library-sharing.md) or
  [rating caps](parental-controls.md). Phlix has no per-account library assignments.
- Playlists are per account, not per profile — see
  [Playlists & Collections](../libraries/collections.md).
- The dashboard's "who watches most" counts **accounts**, since activity is attributed
  to the logged-in user.

## Related pages

- [Parental & Session Controls](parental-controls.md) — ratings, curfews, stream caps
- [User Management](../admin/user-management.md) — the admin side of accounts
- [Invite links](../hub/invite-links.md) — bringing in remote friends via the Hub
- [Glossary](../glossary.md) — what "profile", "account", and "claim" mean here
