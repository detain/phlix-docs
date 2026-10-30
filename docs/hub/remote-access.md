# Remote Access via the Hub

The Hub's primary job is remote access: reaching your Phlix server from outside your
home network **without configuring port forwarding or a VPN**. Your server dials *out*
to the hub over a relay tunnel, so it works behind NAT as shipped — see
[What Is the Hub?](what-is-the-hub.md) for the concept and
[Claim your server](claim-server.md) to connect one.

## How the hub chooses your connection

A claimed server advertises **direct-connection candidates** to the hub in its
heartbeats: the LAN address, the `phlix.local` mDNS name, the machine hostname, and —
when UPnP or STUN confirms the port is open — its public address. Clients are steered
at the best candidate that actually answers; when none are reachable (you're away from
home, or the port isn't open), traffic flows over the **relay tunnel** instead. The
relay is the safety net: nothing about it requires router configuration.

::: tip The one port trap that breaks the candidates
The advertised candidates are built from `port_forwarding.port`
(`PHLIX_EXTERNAL_PORT`, default **32400**) — **not** from `server.port` (the listen
port, `8096`). With both defaults left alone the hub is handed addresses on a port
nothing listens on. If you want your direct candidates to be usable (e.g. on the LAN),
set the two to agree — `PHLIX_EXTERNAL_PORT=8096`. This does not affect the relay
tunnel, which works regardless. The mechanics live in
`Phlix\Network\PortForwardService::discoverHostnameCandidates()`.
:::

## Do you need any of the alternatives?

You do **not** need port forwarding, UPnP, or a reverse proxy to get remote access via
the hub — those are the *self-managed* routes, useful when you want direct control,
higher throughput, or no dependency on a hub relay at all:

- **Direct access without the relay** (UPnP-IGD auto-mapping, manual port forwarding,
  DMZ, IPv6, reverse proxy): the full step-by-step guide is
  [Remote Access Without the Hub](/advanced/remote-access-without-hub).
- **A VPN back home** (WireGuard/Tailscale): another way to make a server "local"
  from anywhere; no Phlix-specific setup.

## Troubleshooting (hub path)

- **Relay works but direct candidates never win:** almost always the port trap above.
- **Everything is slow:** the relay caps out where your hub's tunnel does; prefer a
  working direct candidate or a reverse proxy for heavy streaming.
- **Server shows unclaimed/offline:** re-check the claim per
  [Claim your server](claim-server.md) — the relay depends on the server's outbound
  dial, so egress firewalls blocking it will sever remote access.

## See Also

- [What Is the Hub?](what-is-the-hub.md) — the relay's role in one page.
- [Remote Access Without the Hub](/advanced/remote-access-without-hub) — the canonical
  direct-connection guide (UPnP, manual mapping, firewall, verification).
- [Hardening](/security/hardening) — what to lock down before exposing anything.
- [Relay Protocol](/dev/relay-protocol) — the tunnel mechanics (engineer-level).
