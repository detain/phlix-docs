# SyncPlay

**Since:** 0.17.0

## TL;DR

SyncPlay synchronizes playback across multiple clients so friends and family watching remotely can experience movies and TV shows together in near-realtime. One client acts as the **PIMP** (SyncPlay server), and all other clients connect as **players** that follow the PIMP's playback position.

---

## Overview

SyncPlay is a protocol for synchronized multi-viewer playback over the internet. It solves the problem of watching content "together" when physically apart — everyone sees the same frame at the same time, and any viewer can pause, seek, or change playback state for the entire group.

### Key Concepts

| Role | Description |
|------|-------------|
| **PIMP** (Play Is My Pause) | The session host — one client acts as the authority for playback state. All others follow. |
| **Player** | A client that joins a SyncPlay session and mirrors the PIMP's playback. |
| **Room** | A named session that players join using a room name and optional password. |
| **Watch Party** | A SyncPlay session with a shared media item — everyone watches the same movie or episode. |

### What Is Synchronized

The following states are synchronized across all clients in a SyncPlay room:

- **Play / Pause** — when the PIMP plays or pauses, all players follow
- **Seek position** — when the PIMP seeks, all players seek to the same position
- **Playback speed** — if the PIMP changes speed (e.g., 1.25x), all players follow
- **Media item** — when the PIMP switches to a different movie or episode, all players switch

### What Is NOT Synchronized

- **Volume** — each client controls their own volume independently
- **Subtitle selection** — each client can use their own subtitle track and offset
- **Audio track selection** — each client can choose their own audio language

---

## Creating a SyncPlay Session

### From the Web Player

1. Start playing any video
2. Click the **SyncPlay** icon in the player controls (two arrows forming a circle)
3. Choose **Create Room**
4. Set a room name and optional password
5. Share the room link / name with friends

### From the Mobile App

1. Long-press any title in the library
2. Tap **Watch Together**
3. The app creates a room and starts playback immediately

---

## Joining a SyncPlay Session

### Via Room Name

1. Open the SyncPlay panel in the player
2. Tap **Join Room**
3. Enter the room name and password (if required)
4. The client connects and begins mirroring the PIMP

### Via Invite Link

SyncPlay rooms can be shared via a URL:

```
https://your-phlix.example.com/syncplay/join?room=my-room&token=abc123
```

Clicking the link on a device with Phlix installed opens the app and joins the room directly.

---

## The PIMP (Host) Role

### Responsibilities

The PIMP client:
- Owns the authoritative playback state
- Handles network communication with all players
- Sends position updates at regular intervals (~250ms)
- Handles join/leave events

### PIMP Election

When the current PIMP disconnects or leaves the room, the remaining players vote on a new PIMP. Election uses a simple majority vote based on client ID priority (stable across reconnections). If there is a tie, the player who joined earliest wins.

### PIMP Pause Tolerance

To prevent accidental group-wide pauses, the PIMP client requires a double-press to pause (two taps within 500ms). This prevents single-tap pauses from accidentally pausing for everyone.

---

## Server-Side Architecture

### Relay Mode

For clients behind restrictive NAT (e.g., mobile networks, corporate firewalls), SyncPlay traffic is relayed through the Phlix relay infrastructure:

```
Player A (PIMP) → Relay Server → Player B
                → Relay Server → Player C
```

The relay provides a consistent addressing namespace and handles NAT traversal. Relay connections use WebSocket over TLS.

### Direct Mode

If both PIMP and players can reach each other directly (same LAN or open NAT), SyncPlay uses direct WebSocket connections between clients, bypassing the relay for lower latency.

### State Machine

```
INIT → WAITING_FOR_READY → PLAYING
              ↓                ↓
         PAUSED ←────────── PLAYING
              ↓
           ENDED
```

All clients maintain a copy of the state machine and transition together when the PIMP's state changes.

---

## Configuration

### Server Settings

Administrators can configure SyncPlay in **Admin → Server Settings → SyncPlay**:

| Setting | Default | Description |
|---------|---------|-------------|
| **Enable SyncPlay** | true | Master toggle |
| **Max Room Size** | 10 | Maximum players per room |
| **Allow Public Rooms** | true | Show public rooms in discovery |
| **Relay Required** | false | Force relay for all rooms |
| **Position Update Interval** | 250ms | How often PIMP sends position updates |
| **Max Latency Tolerance** | 2000ms | Max playback drift before resync |

### Environment Variables

```bash
PHLIX_SYNCCAST_ENABLED=true           # Enable SyncPlay
PHLIX_SYNCCAST_MAX_ROOM_SIZE=10       # Max players per room
PHLIX_SYNCCAST_RELAY_REQUIRED=false   # Force relay mode
PHLIX_SYNCCAST_MAX_LATENCY_MS=2000    # Drift threshold for resync
```

---

## Troubleshooting

### "Playback is out of sync"

Run a **resync** from the SyncPlay panel — this forces all players to seek to the PIMP's current position.

### "Cannot join room"

- Check the room name and password are correct
- Ensure the PIMP's server is reachable from your network
- Try refreshing and rejoining

### "Video keeps buffering"

SyncPlay is sensitive to latency. Try:
- Switching to the relay if on direct mode
- Reducing the video quality / bitrate
- Ensuring the PIMP has a stable connection

---

## Related Pages

- [Relay Protocol](/dev/relay-protocol) — Technical details on the relay infrastructure
- [Pairing Protocol](/dev/pairing-protocol) — How clients authenticate with the server
