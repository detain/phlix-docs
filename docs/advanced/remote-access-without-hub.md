**Since:** 0.18.0

## TL;DR

You can access your Phlix server from outside your home network without using the hub relay. Three methods are available: **Cloudflare Tunnel** (recommended — no open ports, free, reliable), **WireGuard VPN** (full traffic tunnel, higher security), and **Tailscale VPN** (simplest managed VPN, handles NAT traversal automatically). Port forwarding is documented as a last resort but has significant limitations (carrier-grade NAT, dynamic IPs, security exposure). The hub relay remains the easiest option — these alternatives give you full control but require more configuration.

---

## 1. Why Access Without the Hub?

- **Privacy**: All traffic stays between you and your server; nothing routes through Phlix's relay infrastructure
- **No third-party relay**: Removes the hub from the connection path entirely
- **Avoid subscription fees**: Hub relay may have usage limits; self-hosted alternatives are free
- **Lower latency**: Direct connection can be faster than relay for geographically close clients

The hub relay ([Remote Access via the Hub](../hub/remote-access.md)) remains the easiest setup. These alternatives require more configuration but give you full control.

---

## 2. Option 1: Cloudflare Tunnel (Recommended)

Cloudflare Tunnel creates a secure reverse proxy from your server to Cloudflare's edge — no open ports needed.

### Install cloudflared

```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
  -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared
```

### Authenticate with Cloudflare

```bash
cloudflared tunnel login
```

This opens a browser window to authenticate with your Cloudflare account and authorize the tunnel.

### Create a tunnel

```bash
cloudflared tunnel create phlix
```

Save the tunnel credentials file (typically at `~/.cloudflared/<tunnel-id>.json`).

### Configure the tunnel

Create or edit `~/.cloudflared/config.yml`:

```yaml
tunnel: <your-tunnel-id>
credentials-file: /root/.cloudflared/<your-tunnel-id>.json

ingress:
  - hostname: server.yourdomain.com
    service: http://localhost:32400
  - service: http_status:404
```

Replace `<your-tunnel-id>` with the ID from the create step and `server.yourdomain.com` with your desired subdomain (must be a domain you control in Cloudflare).

### Run the tunnel

```bash
cloudflared tunnel run phlix
```

For production, run as a systemd service:

```bash
cloudflared service install
```

### Route DNS

```bash
cloudflared tunnel route dns phlix server.yourdomain.com
```

This creates a CNAME record in Cloudflare pointing to your tunnel.

### Access your server

Visit `https://server.yourdomain.com` — Cloudflare handles TLS and proxies requests to your server on port 32400.

---

## 3. Option 2: WireGuard (VPN)

WireGuard creates a full VPN tunnel. All traffic (not just HTTP) routes through the VPN. Higher security but requires a VPN app on clients.

### Server setup

```bash
# Install WireGuard
apt install wireguard

# Generate server keypair
cd /etc/wireguard
umask 077
wg genkey > server_private.key
wg pubkey < server_private.key > server_public.key

# Create server config /etc/wireguard/wg0.conf
cat > /etc/wireguard/wg0.conf <<'EOF'
[Interface]
Address = 10.0.0.1/24
ListenPort = 51820
PrivateKey = <contents of server_private.key>
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE
EOF

# Enable IP forwarding
echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
sysctl -p
```

### Generate client keys

```bash
wg genkey > client_private.key
wg pubkey < client_private.key > client_public.key
```

### Add client peer to server config

Append to `/etc/wireguard/wg0.conf`:

```ini
[Peer]
PublicKey = <contents of client_public.key>
AllowedIPs = 10.0.0.2/32
```

### Start WireGuard

```bash
systemctl enable wg-quick@wg0
systemctl start wg-quick@wg0
```

### Client config

Export this to the client device:

```ini
[Interface]
PrivateKey = <contents of client_private.key>
Address = 10.0.0.2/24
DNS = 1.1.1.1

[Peer]
PublicKey = <contents of server_public.key>
Endpoint = your-server-public-ip:51820
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
```

Import this config into the WireGuard app on the client. Connect before accessing Phlix.

### Access Phlix

With the VPN active, access your server at `http://10.0.0.1:32400` (VPN tunnel address) or by LAN IP if on the same network.

---

## 4. Option 3: Tailscale (Simplest VPN)

Tailscale is a managed VPN that handles NAT traversal automatically. Easiest setup but requires a Tailscale account (free tier available).

### Install Tailscale

```bash
curl -fsSL https://tailscale.com/install.sh | sh
```

### Authenticate

```bash
tailscale up --accept-routes
```

This opens a browser for authentication. After auth, your device joins your tailnet.

### Access Phlix

Once connected, access your server at:

```
https://phlixMachineName.tailcale.mesh:32400
```

Replace `phlixMachineName` with the hostname of your Phlix server (run `hostname` on the server to find it).

### Tailscale Funnel (public HTTP without port forwarding)

To make Phlix publicly accessible via your tailnet without port forwarding:

```bash
# Enable Funnel on port 32400
tailscale funnel 32400

# Check Funnel status
tailscale funnel status
```

Funnel exposes `https://phlixMachineName.tailcale.mesh:32400` to the public internet via Tailscale's relay — no router port forwarding needed.

---

## 5. Option 4: Port Forwarding (Last Resort)

Manual port forwarding is the fallback when VPN and tunnel solutions aren't available. This method has significant limitations (see What Can Go Wrong).

### Method A: UPnP (Automatic)

If your router supports UPnP:

```bash
# Run the connectivity check
php scripts/check-connectivity.php

# Look for "UPnP IGD: Found" in output
```

### Method B: Manual Port Forward

1. Find your server's LAN IP:

```bash
hostname -I | awk '{print $1}'
```

2. Log into your router (typically `http://192.168.1.1` or `http://192.168.0.1`)
3. Find the port forwarding / NAT / firewall section
4. Add a forward: external port `32400` → `<your-server-lan-ip>:32400` (TCP)
5. Save and apply

### Method C: Dynamic DNS (for Changing Public IPs)

If your ISP gives you a dynamic (changing) public IP, use Dynamic DNS:

```bash
# Using Cloudflare API for DDNS
# */5 * * * * curl -s "https://api.cloudflare.com/client/v4/zones/<zone-id>/dns_records/<record-id>" \
#   -X PUT -H "Authorization: Bearer <your-api-token>" \
#   -H "Content-Type: application/json" \
#   --data '{"data":"'"$(curl -s ifconfig.me)"'"}'
```

Or use a noip.com dynamic update script.

### Check your public IP

```bash
curl ifconfig.me
# or
curl icanhazip.com
```

Users outside your network then access: `http://<your-public-ip>:32400`

---

## 6. What Can Go Wrong

### Failure 1: Cloudflare Tunnel Token Expired or Revoked

**Symptom:** Tunnel connection drops; `cloudflared tunnel run` shows authentication errors.

**Diagnosis:**

```bash
# Check tunnel status
cloudflared tunnel list

# Check tunnel logs
journalctl -u cloudflared -n 50

# Test tunnel connectivity
cloudflared tunnel ingress validate
```

**Fix:** Re-authenticate the tunnel:

```bash
cloudflared tunnel login
cloudflared tunnel run phlix
```

If credentials were revoked, recreate the tunnel:

```bash
cloudflared tunnel delete phlix
cloudflared tunnel create phlix
cloudflared tunnel route dns phlix server.yourdomain.com
cloudflared tunnel run phlix
```

---

### Failure 2: WireGuard — Firewall Blocking UDP 51820

**Symptom:** Client connects but no traffic passes; `wg` shows "handshake did not complete."

**Diagnosis:**

```bash
# On the server, check if UDP 51820 is open
ss -ulnp | grep 51820

# Check firewall rules
iptables -L -n | grep 51820
ufw status
```

**Fix:**

```bash
# Allow UDP 51820 through firewall
ufw allow 51820/udp

# Or for iptables
iptables -A INPUT -p udp --dport 51820 -j ACCEPT
```

Also verify the client has `PersistentKeepalive = 25` and that `AllowedIPs` includes `0.0.0.0/0` for full tunnel mode.

---

### Failure 3: Tailscale — Device Not Showing Up in Tailnet

**Symptom:** Cannot reach server via `phlixMachineName.tailcale.mesh:32400`; device missing from Tailscale admin console.

**Diagnosis:**

```bash
# Check Tailscale status on server
tailscale status

# Verify IP address
tailscale ip -4

# Check if Funnel is enabled
tailscale funnel status
```

**Fix:** Re-authenticate the device:

```bash
# Log out and back in
tailscale logout
tailscale up --accept-routes

# If using Funnel, re-enable
tailscale funnel 32400
```

Ensure both client and server are on the same Tailscale network (same auth key or same organization).

---

### Failure 4: Port Forwarding — Carrier-Grade NAT (CGNAT)

**Symptom:** Port forwarding is configured but external connection fails; `curl ifconfig.me` shows an IP in the `100.x.x.x–100.127.x.x` range.

**Diagnosis:**

```bash
# Check public IP range
curl ifconfig.me

# If the IP starts with 100., you are behind CGNAT
```

**Fix:** CGNAT cannot be worked around with port forwarding. Options:

1. **Use Cloudflare Tunnel or Tailscale** instead — these bypass CGNAT entirely
2. **Request a public IP** from your ISP (some offer this as a business service)
3. **Use a VPN** (WireGuard with a VPS relay) to tunnel out of CGNAT

---

## 7. Next Steps

- [Remote Access via the Hub](../hub/remote-access.md) — the easiest remote access option using the hub relay
- [Claim Your Server's Public Hostname](../hub/claim-server.md) — set up `*.phlix.media` subdomain for your server
- [Self-Host the Hub](../hub/self-host-the-hub.md) — run your own hub instance for full control
- [Reverse proxy](reverse-proxy.md) — verify your server is correctly exposed for remote access
