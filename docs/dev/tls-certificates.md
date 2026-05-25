# TLS Certificates

## Status

**ACME/Let's Encrypt automated provisioning is NOT implemented.**

The `TlsCertificateManager` class throws a `RuntimeException` when
`provisionCertificate()` is called. This is the current build behaviour.

**What is implemented:**
- Manual, out-of-band certificate provisioning (see below)
- Read-side helpers that report whether certificates exist on disk
- Certificate expiry monitoring (via `needsRenewal()`)

**What is NOT implemented:**
- Automated Let's Encrypt/ACME certificate provisioning
- DNS-01 challenge handling
- Automatic renewal via ACME

The intended design for future ACME DNS-01 wildcard provisioning is
documented below under "Planned: ACME Automated Provisioning".

## Manual Provisioning

Operators must provision TLS certificates out-of-band. Place
certificates in the configured `certs_dir` using the following structure:

```
{certs_dir}/
  {subdomain}.phlix.media/
    fullchain.pem   # Certificate chain
    privkey.pem      # Private key
```

For example, for subdomain `abc12345`:
```
/home/phlix/certs/abc12345.phlix.media/fullchain.pem
/home/phlix/certs/abc12345.phlix.media/privkey.pem
```

### Claiming a Subdomain

Use the enrollment API to claim a subdomain:

```bash
curl -X POST /api/v1/servers/{id}/subdomain \
  -H "Authorization: Bearer {token}"
```

The response will include your assigned subdomain (e.g., `abc12345.phlix.media`).

### Certificate Storage Paths

| File         | Path                                           |
| ------------ | ---------------------------------------------- |
| Certificate  | `{certs_dir}/{subdomain}.phlix.media/fullchain.pem` |
| Private key  | `{certs_dir}/{subdomain}.phlix.media/privkey.pem` |

### Self-Signed Certificates (Development)

For development or environments without hub subdomain allocation,
self-signed certificates can be used.

**Generation:**
```bash
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes
```

**Configuration:**
```php
// config/hub.php
return [
    'tls_enabled' => true,
    'tls_cert_path' => __DIR__ . '/tls/cert.pem',
    'tls_key_path' => __DIR__ . '/tls/key.pem',
];
```

## Planned: ACME Automated Provisioning

The intended design for automated certificate provisioning:

### Flow (Not Implemented)
1. Server enrolls with hub (C.3)
2. Server claims subdomain via `POST /api/v1/servers/{id}/subdomain`
3. **FUTURE:** Hub provisions Let's Encrypt certificate via ACME DNS-01 challenge
4. Hub returns certificate paths in the response
5. Server stores certificates locally

### Certificate Renewal
- **FUTURE:** Hub automatically renews certificates 60 days before expiry
- Server fetches updated certificates on next enrollment refresh

### Environment Variables

| Variable         | Default | Description |
| ---------------- | ------- | ----------- |
| `PHLIX_TLS_ENABLED` | `1`   | Enable TLS for the server |
| `PHLIX_DOMAIN`   | `phlix.media` | Base domain for subdomains |

## Security Considerations

- Private keys should have restricted permissions (0600)
- Certificates are stored in `config/tls/` which should be backed up
- Let's Encrypt certificates expire after 90 days
- Self-signed certificates should only be used in development
