# Voting-App Sidecar Configuration

This document provides detailed instructions for configuring and deploying the
Feature Voting sidecar container alongside OpenCloud.

## Architecture

The Feature Voting extension has two components:

1. **Frontend** — A Vue.js web extension loaded by the OpenCloud shell
   - Built with `@opencloud-eu/extension-sdk`
   - Deployed as static files to `config/opencloud/apps/feature-voting/`
   - Uses OpenCloud's `useRouter` from `@opencloud-eu/web-pkg` for SPA navigation

2. **Backend (voting-app)** — A Go sidecar HTTP service
   - Runs in a separate Docker container
   - Provides REST API at `/api/voting/`
   - Authenticates via OIDC against the OpenCloud IDP
   - Uses SQLite for persistence

## Deployment via Sidecar Override

### Docker Compose Override

Create `feature-voting/opencloud.yml` in the OpenCloud compose directory:

```yaml
services:
  voting-app:
    image: ghcr.io/performant-labs/opencloud-voting:latest
    restart: unless-stopped
    networks:
      - ocis-net
    environment:
      OC_DOMAIN: ${OC_DOMAIN:-cloud.opencloud.test}
      OC_INSECURE: "${OC_INSECURE:-false}"
    volumes:
      - voting-data:/data
    labels:
      traefik.enable: true
      traefik.http.routers.voting-app.rule: Host(`${OC_DOMAIN:-cloud.opencloud.test}`) && PathPrefix(`/api/voting`)
      traefik.http.routers.voting-app.entrypoints: https
      traefik.http.routers.voting-app.tls: true
      traefik.http.services.voting-app.loadbalancer.server.port: 8080

volumes:
  voting-data:
```

### Enabling the Sidecar

Add to your `.env` or `COMPOSE_FILE` variable:

```bash
COMPOSE_FILE=docker-compose.yml:feature-voting/opencloud.yml
```

Or pass it directly:

```bash
docker compose -f docker-compose.yml -f feature-voting/opencloud.yml up -d
```

## Frontend Deployment

### Building

```bash
cd web/
pnpm install
pnpm build
```

### Deploying to OpenCloud

Copy the built files to the OpenCloud apps directory:

```bash
# Clear old build
find ~/Sites/opencloud/config/opencloud/apps/feature-voting -mindepth 1 -delete

# Deploy new build
cp -r dist/* ~/Sites/opencloud/config/opencloud/apps/feature-voting/
```

### CRITICAL: Force-Recreate After Deploy

OpenCloud caches the extension manifest at startup. A simple `restart` will NOT
pick up new JS chunk files:

```bash
# ❌ WRONG — uses cached manifest
docker compose restart opencloud

# ✅ CORRECT — reads fresh files
docker compose up -d --force-recreate opencloud
```

## Navigation Pattern

The extension uses **OpenCloud's official `useRouter`** from `@opencloud-eu/web-pkg`
with **path-based navigation**:

```typescript
import { useRouter } from "@opencloud-eu/web-pkg"

const router = useRouter()

// Navigate using paths (recommended for extensions)
router.push({ path: '/feature-voting/board' })
router.push({ path: '/feature-voting/new' })
```

### Why Path-Based?

OpenCloud prepends the app ID to route names at registration time:
- Route name `voting-board` → becomes `feature-voting-voting-board` at runtime
- Route name `new-feature` → becomes `feature-voting-new-feature` at runtime

While named routes work from the global router context, they fail when called from
within extension component setup because the extension's Vue component may not have
the full router context injected. Path-based navigation is reliable because it
works regardless of the route name resolution context.

### What About `vue-router`'s `useRouter`?

**Do NOT use `useRouter` from `vue-router`**. It returns `undefined` in extension
components because OpenCloud provides its own router via Vue's dependency injection
system (`inject('$router')`), not through `vue-router`'s own injection mechanism.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OC_DOMAIN` | `cloud.opencloud.test` | The OpenCloud domain for OIDC discovery |
| `OC_INSECURE` | `false` | Skip TLS verification for OIDC (dev only) |

## Proxy Configuration

The OpenCloud proxy must be configured to route voting API requests to the sidecar.
Add to `config/opencloud/proxy.yaml`:

```yaml
policies:
  - name: ocis
    routes:
      - endpoint: /api/voting
        backend: https://voting-app:8080
        # ... other routes
```

> **Note**: When using Traefik labels (as shown in the compose override), the proxy
> config entry is not needed — Traefik handles the routing directly.

## Troubleshooting

### Sidecar Returns 401 Unauthorized

The OIDC middleware requires a valid Bearer token. Check:
1. The frontend sends the `Authorization: Bearer <token>` header
2. The `OC_DOMAIN` matches the actual OpenCloud domain
3. The OIDC discovery endpoint is reachable: `curl https://OC_DOMAIN/.well-known/openid-configuration`

### "Authentication Service Unavailable"

See [Certificate Management](./CERTIFICATE_MANAGEMENT.md#authentication-service-unavailable-in-the-voting-app).

### Frontend Shows Old Version After Build

Always use `docker compose up -d --force-recreate opencloud` after deploying new
frontend files. See the "Force-Recreate After Deploy" section above.
