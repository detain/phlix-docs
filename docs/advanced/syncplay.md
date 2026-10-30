# Watch Together (SyncPlay)

**Since:** 0.17.0

> [!NOTE]
> **Words this app uses:** the everyday name for this feature is a **watch group** — everyone pressing play together, staying in step. *SyncPlay* is the technical name you'll see in settings, URLs and error messages; "room" appears verbatim inside some screens' buttons and fields (the web dialog literally says "Create room" / "Join room"). They all refer to the same thing.

## TL;DR

A **watch group** keeps playback in lockstep across everyone's devices, so household members on different TVs — or friends on the other side of the country — can start, pause and seek as one. One person is the **host**: their play, pause and seek commands lead, and everyone else follows. Your Phlix server coordinates the group; devices never talk to each other directly.

---

## How It Feels to Use It

1. Someone starts a watch group and picks the title.
2. Everyone else joins — by picking the group from a list, or typing its ID.
3. From then on it behaves like one shared remote: when the host pauses, all screens pause; when the host seeks ahead, all screens jump.
4. If someone's playback drifts more than about two seconds behind or ahead, their player quietly corrects itself — no button needed.

### Who is the host?

- The **first person in the group is the host.**
- Only the host's playback controls move the group. If you join as a follower and press pause on your own player, the group is unaffected — the player shows you're in a group and defers to the host.
- The host can **pass the lead** to another member (host transfer).
- If the host leaves or their connection drops, the group **elects the member who joined earliest** as the new host automatically. Nobody votes; the rule is simply "oldest member inherits."

### What stays synchronized

- **Play / pause** — the host starts or stops, everyone does
- **Seek** — the host jumps to a scene, everyone jumps (small player-side nudges are tolerated, see drift below)
- **Media item** — the group shares one current title, and switching within the group's queue moves everyone

### What is NOT synchronized (on purpose)

- **Volume** — everyone sets their own
- **Playback speed** — there is no speed control in group commands; each player runs at its own pace setting
- **Subtitle selection and offset** — each viewer picks their own track
- **Audio track selection** — each viewer picks their own language

---

## Starting or Joining a Watch Group on the Web

1. Open any title in the web player.
2. In the player's control bar, click the **person icon** (its tooltip/label is "SyncPlay"; it reads "In SyncPlay room" once you're inside a group).
3. The dialog offers **"Create or join a room"**:
   - **Create room** — type a **Room name**, click **Create**. You are the host.
   - **Join room** — pick a group from the **Public rooms** list when it shows one, or type the **Room ID** you were given (it looks like `sp_…`) and click **Join**.
4. A "Joined {name}" confirmation appears and the player's sync controls take over: transport buttons become **"Play for everyone" / "Pause for everyone"**, and rewind/fast-forward move the whole group.

Groups created from the player are always open — there is no password box in the dialog. Room IDs are not guessable, which is the practical privacy control: share the ID only with people you want watching.

A standalone page exists at `https://your-server/app/syncplay` (after signing in) where you can create a group or join by ID before opening a title. A pre-filled invite link you can send to someone is simply:

```text
https://your-server/app/syncplay?room=<room-id>
```

It opens the join form with the ID filled in — the person still has to be signed in to your server with their own account.

### On mobile

In the mobile player, tap the **SyncPlay** button in the overlay controls to open the same create/join dialog (create by name, join by ID).

### On Roku

During playback press the **`*` / Options** key to open the **Watch Together** overlay. It lists the server's existing groups (name and member count; locked ones marked) — select one to join, or press **Create Group** (the name comes from your device name; the Roku has no text keyboard for it). Roku has real constraints — see [Roku client notes](../clients/roku.md).

---

## Watching from Outside Your Home Network

The honest picture:

- **Everyone in a group needs to reach the sync service on your server: TCP port 8097.** On your home LAN that just works. From outside, you must expose or tunnel that port (a VPN is the safe default; the same port must be reachable plaintext — see the Roku caveat below).
- **Devices signed in through the Hub** synchronize *your own* devices with each other: Hub-relay rooms are scoped to the server's owner, so a friend signing in with their own Hub account lands in their own room namespace, not yours. For multi-household parties, invite people to your server itself (see [Share with friends](../hub/share-with-friends.md)) and have them connect where they can reach `:8097`.
- **Roku** cannot do encrypted WebSockets at all — its plain-socket API speaks `ws://` only, so watch-together on a Roku requires the server's plaintext `:8097` to be reachable from the device, and refuses to run in Hub mode.
- **Password-protected groups** (created from the admin screen) currently can't be joined from the web dialog, and Roku joins to them fail outright — no client sends a password yet. Create open groups and simply keep the room ID to yourselves.

---

## Staying in Step (Drift and Re-syncing)

Followers continuously compare their own clock with the host's reported position (the group exchanges position reports and clock-offset messages; the web client reports its position every five seconds and on every command). Behavior you can actually see:

- A tiny gap is tolerated — no micro-seeks interrupting anyone.
- Once a player is more than **~2 seconds** off, it seeks to the host automatically.
- The player's status pill tells you the state: **"Synced"**, **"Out of sync"**, or **"Re-syncing…"** while a correction lands.

There is deliberately **no manual "resync" button** — corrections are automatic. If someone is still visibly off, check their connection, or have them leave and rejoin the group.

If a connection drops: web clients retry the sync connection automatically with growing delays; a Roku drop ends that device's session and it re-joins manually.

---

## For Administrators

There is no SyncPlay settings panel and no server toggle — watch groups are always on. What **Admin → SyncPlay** does give you is a **group management screen**:

- A table of live groups (name, members, host).
- **Create SyncPlay group** — give it a name and, optionally, a password ("Leave empty for an open group"). Note the password caveat above: joining clients can't supply one yet, so prefer open groups.
- **Join SyncPlay group** — enter a Group ID (intended for checks and demos).

If you want watch-together to work for remote guests, the port to plan for is **8097/tcp** in addition to the usual server port — see [Remote access](../hub/remote-access.md).

---

## Troubleshooting

### "Playback is out of sync"

Wait a moment — automatic correction kicks in at roughly a two-second gap (the status pill shows "Re-syncing…"). If it never settles: that viewer's device has a slow or unstable path to your server's `:8097`; leave and rejoin, and check reachability.

### "Cannot join room"

- Room IDs are the `sp_…` string from the group's detail or the admin table — names don't work for joining on web/mobile.
- The joiner must be signed in to the same server as the group.
- If the group was created from the admin screen **with** a password, joining fails — no client can enter a password yet (see honest limitation above).
- If nobody can reach the server's `:8097`, the sync connection itself can't open.

### "Video keeps buffering"

Sync playback is not the same as video delivery: buffering is about the media stream, not the group. Try a lower quality for that viewer, or check their bandwidth to the server. The group keeps its logical position even if one player buffers; that player catches up automatically when it can.

---

## Related Pages

- [Glossary](../glossary.md) — what WebSocket, relay and NAT mean in plain words
- [Web client](../clients/web.md) · [Mobile app](../clients/mobile.md) · [Roku channel](../clients/roku.md)
- [Relay Protocol](/dev/relay-protocol) — Technical details on the relay infrastructure
- [Pairing Protocol](/dev/pairing-protocol) — How clients authenticate with the server
- [API Reference — SyncPlay WebSocket Authentication](/reference/api#syncplay-websocket-authentication) — how a device proves its login when opening the `:8097` sync connection
