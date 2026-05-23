# Reverse Proxy Configuration

**Phase:** N (End-User Documentation)
**Step:** N.23
**Since:** 0.18.0

## TL;DR

Phlix can run behind a reverse proxy (nginx, Caddy, or Apache) to terminate TLS, run in a subfolder, or load-balance across multiple instances. The server itself must be configured with the proxy's base URL so it generates correct absolute links.

## Why Use a Reverse Proxy?

- **TLS termination** — terminate HTTPS at the proxy and forward plain HTTP to Phlix
- **Subfolder deployment** — host Phlix at `https://example.com/phlix/` instead of root
- **Load balancing** — scale horizontally by proxying to multiple Phlix instances
- **Firewall/NAT traversal** — single port (32400) exposed through the proxy

## General Requirements

When Phlix is behind a reverse proxy:

1. Set the ` TRUSTED_PROXY` environment variable or `trusted_proxy` in `config/server.php` to the proxy's IP range
2. Set `trusted_proxies` to include the proxy's IP address to enable `X-Forwarded-*` header processing
3. Ensure the proxy forwards `X-Forwarded-Proto`, `X-Forwarded-Host`, and `X-Forwarded-Port` headers

## nginx Configuration

```nginx
# /etc/nginx/sites-available/phlix
server {
    listen 443 ssl;
    server_name example.com;

    ssl_certificate     /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    # Phlix runs on port 32400
    location /phlix/ {
        proxy_pass http://127.0.0.1:32400/;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;

        # WebSocket support (for live transcoding progress)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

::: warning Subfolder Trailing Slash
When deploying to a subfolder, ensure the `proxy_pass` path ends with `/` so that `/phlix/foo` correctly maps to `/foo` on the upstream. Without the trailing slash, the location prefix is preserved in the upstream path.
:::

## Caddy Configuration

```caddy
# Caddyfile
example.com {
    reverse_proxy /phlix/* localhost:32400
}
```

Caddy automatically handles WebSocket upgrades and `X-Forwarded-*` headers.

## Apache Configuration

```apache
# /etc/apache2/sites-available/phlix.conf
<VirtualHost *:443>
    ServerName example.com
    SSLEngine on
    SSLCertificateFile /path/to/fullchain.pem
    SSLCertificateKeyFile /path/to/privkey.pem

    <Location /phlix>
        ProxyPass http://127.0.0.1:32400/
        ProxyPassReverse http://127.0.0.1:32400/
        RequestHeader set X-Forwarded-Proto "https"
        RequestHeader set X-Forwarded-Host "%{HTTP_HOST}s"
    </Location>

    # WebSocket support
    <Location /phlix/api>
        ProxyPass ws://127.0.0.1:32400/
    </Location>
</VirtualHost>
```

## Phlix Server Configuration

Set the base URL so Phlix generates correct links:

```php
// config/server.php
return [
    // ...
    'base_url' => getenv('BASE_URL') ?: 'https://example.com/phlix/',
    'trusted_proxies' => ['127.0.0.1', '::1'],
    // ...
];
```

Or via environment variable:

```bash
export BASE_URL=https://example.com/phlix/
```

## Troubleshooting

**Problem: Redirects go to the internal port instead of the proxy**

Ensure `trusted_proxies` includes your proxy's IP and the `X-Forwarded-*` headers are being forwarded correctly.

**Problem: WebSocket connections fail**

Verify the `Upgrade` and `Connection` headers are being forwarded. The web interface uses WebSockets for live transcoding progress and real-time updates.

**Problem: Mixed content warnings**

Set `X-Forwarded-Proto: https` so Phlix generates HTTPS links when behind an HTTPS-terminating proxy.
