# Certificate Management for OpenCloud + Feature Voting

This document provides detailed instructions for configuring SSL/TLS certificates
for local development of the Feature Voting extension within an OpenCloud environment.

## Overview

The OpenCloud development stack uses **mkcert** for locally-trusted SSL certificates
and **Traefik v3** as a reverse proxy with TLS termination. The Feature Voting sidecar
(`voting-app`) communicates with OpenCloud over HTTPS for OIDC authentication, which
requires proper certificate configuration.

## Prerequisites

- **mkcert** installed: `brew install mkcert` (macOS) or `apt install mkcert` (Linux)
- **Docker** and **Docker Compose**
- **OpenCloud compose** project set up at `~/Sites/opencloud`

## Certificate Generation

### 1. Install the Local CA

```bash
mkcert -install
```

This adds the mkcert root CA to your system trust store. Firefox users may need to
also enable `security.enterprise_roots.enabled` in `about:config`.

### 2. Generate Certificates

Navigate to your OpenCloud config directory and generate the cert for your domain:

```bash
cd ~/Sites/opencloud/config/traefik/certs/

# Generate for the OpenCloud domain
mkcert cloud.opencloud.test "*.opencloud.test"
```

This produces two files:
- `cloud.opencloud.test+1.pem` — the certificate
- `cloud.opencloud.test+1-key.pem` — the private key

### 3. Rename for Clarity (Optional but Recommended)

```bash
mv "cloud.opencloud.test+1.pem" server.crt
mv "cloud.opencloud.test+1-key.pem" server.key
```

## Traefik Dynamic TLS Configuration

### File Location

```
~/Sites/opencloud/config/traefik/dynamic/certs.yml
```

### Correct Configuration (Traefik v3)

> **CRITICAL**: Traefik v3 requires `stores` to be a **map**, not a list.
> An incorrect structure will cause Traefik to silently ignore the certificates
> and serve its own default self-signed cert.

```yaml
tls:
  stores:
    default:
      defaultCertificate:
        certFile: /certs/server.crt
        keyFile: /certs/server.key
```

### ❌ INCORRECT Configuration (Common Mistake)

```yaml
# DO NOT use a list under stores — Traefik v3 silently ignores this
tls:
  stores:
    - default:
        defaultCertificate:
          certFile: /certs/server.crt
          keyFile: /certs/server.key
```

### Traefik Volume Mount

Ensure the Docker Compose file mounts both the certs directory and the dynamic config:

```yaml
services:
  traefik:
    volumes:
      - ./config/traefik/certs:/certs:ro
      - ./config/traefik/dynamic:/dynamic:ro
    command:
      - --providers.file.directory=/dynamic
```

## Voting-App Sidecar Configuration

The voting-app sidecar performs OIDC discovery against the OpenCloud server.
In local development with mkcert certificates, the sidecar may fail to verify
the TLS certificate because the mkcert CA is not in the container's trust store.

### Solution: `OC_INSECURE=true`

Set the `OC_INSECURE` environment variable on the voting-app service to skip
TLS certificate verification for OIDC discovery:

```yaml
# feature-voting/opencloud.yml
services:
  voting-app:
    environment:
      OC_DOMAIN: ${OC_DOMAIN:-cloud.opencloud.test}
      OC_INSECURE: "true"
```

> **WARNING**: `OC_INSECURE=true` should ONLY be used in local development.
> In production, use properly signed certificates and set `OC_INSECURE=false`
> or omit it entirely.

### How It Works

The Go sidecar's OIDC middleware checks for `OC_INSECURE`:

```go
// api/middleware/auth.go
if insecure {
    httpClient = &http.Client{
        Transport: &http.Transport{
            TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
        },
    }
}
```

## Verification

### 1. Verify Traefik Serves the Correct Certificate

```bash
echo | openssl s_client -connect cloud.opencloud.test:443 -servername cloud.opencloud.test 2>/dev/null | openssl x509 -noout -issuer -subject
```

Expected output should show your mkcert CA:
```
issuer=O = mkcert, ...
subject=O = mkcert, CN = cloud.opencloud.test
```

### 2. Verify Browser Trusts the Certificate

Navigate to `https://cloud.opencloud.test` in Chrome/Safari. The padlock icon
should be green with no certificate warnings.

### 3. Verify Voting-App OIDC Discovery

```bash
docker compose logs voting-app | grep -i "oidc\|tls\|cert"
```

If you see `x509: certificate signed by unknown authority`, ensure `OC_INSECURE=true`
is set and the container was recreated:

```bash
docker compose up -d --force-recreate voting-app
```

## Troubleshooting

### Browser Shows "Not Secure" Despite mkcert

1. **HSTS Cache**: Chrome may have cached an HSTS policy for the domain.
   - Navigate to `chrome://net-internals/#hsts`
   - Under "Delete domain security policies", enter `opencloud.test` and delete
   - Also delete `cloud.opencloud.test`

2. **Certificate not loaded by Traefik**: Check the Traefik logs:
   ```bash
   docker compose logs traefik | grep -i "cert\|tls\|error"
   ```

3. **Wrong YAML structure**: Use the exact `certs.yml` format shown above.
   A single indent error will cause silent failure.

### "Authentication Service Unavailable" in the Voting App

This means the voting-app sidecar cannot reach the OpenCloud OIDC endpoint.

1. Ensure the sidecar can resolve the OpenCloud domain:
   ```bash
   docker compose exec voting-app ping cloud.opencloud.test
   ```

2. Check that `OC_INSECURE=true` is in the environment:
   ```bash
   docker compose exec voting-app env | grep OC_INSECURE
   ```

3. Force recreate the container to pick up env changes:
   ```bash
   docker compose up -d --force-recreate voting-app
   ```

### Changes Not Reflected After Rebuild

OpenCloud caches the extension manifest and JS chunks at startup. When deploying
new frontend builds:

```bash
# DON'T use restart — it reuses the cached state
docker compose restart opencloud  # ❌

# DO use force-recreate — it ensures fresh volume reads
docker compose up -d --force-recreate opencloud  # ✅
```
