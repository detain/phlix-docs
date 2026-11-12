# Device Sessions

## TL;DR

**Settings → Sessions** lists every device signed in to your account and lets you sign any of them out.

1. Open **Settings → Sessions** (page title: *Device sessions*).
2. Find the device you do not recognize and press **Sign out** on its row.
3. To keep only the device you are using, press **Sign out others**.

---

## 1. What the page shows

Each row is one *login*: one time you signed in on one device. A row carries the device name (or *Unknown device* when the app that signed in did not report one), when it was signed in, and when it was last used. The row for the device you are holding is marked **This device**.

The list shows at most the 200 most recently used logins. If you have more, the header reads "200+ active sessions" rather than an exact total.

## 2. Signing out one device

Press **Sign out** on a row and confirm. That device must sign in again; every other device keeps its session, and your password is not changed.

## 3. Signing out all other devices

Press **Sign out others** and confirm. Every login except the current one is ended. The app does this by ending the other logins one at a time, so on an account with many devices it can take a moment, and a failure partway through reports that it could not finish; press **Refresh** and repeat.

::: tip Password reset ends everything
If you changed your password because a device was lost, a password reset (see [Admin password reset](../troubleshooting.md#admin-password-reset)) revokes *all* sessions for the account, including the one you are using.
:::

## 4. Login family: why one row can stand for several tokens

Signed-in apps hold a short-lived access token and refresh it in the background. All the tokens that descend from one sign-in form a *login family*, and the page shows one row per family. Ending a row ends the whole family, so the device cannot refresh its way back in.

## 5. Two different "sessions"

Phlix uses the word for two unrelated things:

| | Login session (this page) | Playback session |
|---|---|---|
| What it is | A signed-in device (a login family) | A device currently playing or remote-controllable |
| Where you see it | Settings → Sessions | Now-playing / remote control |
| API | `GET /api/v1/auth/sessions`, `DELETE /api/v1/auth/sessions/{id}` | `GET /api/v1/me/sessions`, `DELETE /api/v1/sessions/{id}` |
| Ending it | Device must sign in again | Stops that playback |

Signing out a login does not stop a stream by itself, and ending a playback session does not sign the device out. See the [API reference](../reference/api.md#login-session-endpoints) and the [glossary](../glossary.md).
