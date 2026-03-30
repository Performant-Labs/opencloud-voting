# Feature Voting for OpenCloud — Installation Guide

This guide installs the Feature Voting extension into an existing
[`opencloud-compose`](https://github.com/opencloud-eu/opencloud-compose)
(`pl-opencloud-server`) deployment.

## Prerequisites

- A running `pl-opencloud-server` deployment at a configured domain
  (e.g. `cloud.opencloud.test` for local dev, or your real domain)
- Docker + Docker Compose v2
- `bash`, `curl`, `unzip`

---

## Step 1 — Download the release assets

From the [Releases page](https://github.com/Performant-Labs/opencloud-voting/releases/latest),
download:

- `feature-voting-web-vX.Y.Z.zip` — the frontend static assets
- `docker-compose.override.yml` — the sidecar service definition

Or use the install script (replaces steps 1–3):

```bash
curl -fsSL https://raw.githubusercontent.com/Performant-Labs/opencloud-voting/main/install/install.sh | bash
```

---

## Step 2 — Deploy the frontend assets

Unzip the frontend assets into your OpenCloud apps directory:

```bash
# Adjust OC_APPS_DIR to your actual path
OC_APPS_DIR="./config/opencloud/apps/feature-voting"
mkdir -p "$OC_APPS_DIR"
unzip feature-voting-web-vX.Y.Z.zip -d "$OC_APPS_DIR"
```

The result should look like:

```
config/opencloud/apps/feature-voting/
├── js/
│   ├── chunks/
│   └── web-app-feature-voting-*.js
└── manifest.json
```

---

## Step 3 — Add the proxy route

Add the following to your `config/opencloud/proxy.yaml` under the `policy` routes list:

```yaml
policy:
  - endpoint: /api/voting/
    backend: http://voting-app:8080
```

> **Note:** The endpoint must end with a trailing slash to match all sub-paths.

---

## Step 4 — Start the sidecar

Copy `docker-compose.override.yml` into your `pl-opencloud-server` directory
(alongside the main `docker-compose.yml`) and start the service:

```bash
cp docker-compose.override.yml /path/to/pl-opencloud-server/
cd /path/to/pl-opencloud-server
docker compose up -d voting-app
```

The sidecar will:
- Pull the pre-built image from GHCR
- Create a SQLite database at `/data/feature-voting.sqlite` in the shared volume
- Start accepting requests at `http://voting-app:8080` on the internal Docker network

---

## Step 5 — Restart OpenCloud (to pick up the proxy route)

```bash
cd /path/to/pl-opencloud-server
docker compose restart opencloud
```

---

## Step 6 — Verify the installation

```bash
# Health check (requires Bearer token — use your admin token)
curl -s https://<your-domain>/api/voting/healthz \
  -H "Authorization: Bearer <token>"
# Expected: {"status":"ok"}

# Feature list
curl -s https://<your-domain>/api/voting/features \
  -H "Authorization: Bearer <token>"
# Expected: {"features": [...]}
```

The Feature Voting board will appear in the OpenCloud Web UI at:
`https://<your-domain>/feature-voting/board`

---

## Configuration

Environment variables for the `voting-app` container (set in `docker-compose.override.yml`):

| Variable | Default | Description |
|:---------|:--------|:------------|
| `OC_OIDC_ISSUER` | `https://cloud.opencloud.test` | Your OpenCloud domain (for JWT validation) |
| `DB_PATH` | `/data/feature-voting.sqlite` | SQLite database path inside container |
| `OC_DB_URL` | _(empty)_ | Optional: PostgreSQL DSN (e.g. `postgres://user:pass@host/db`) |
| `OC_LOG_LEVEL` | `info` | Log verbosity: `debug`, `info`, `warn`, `error` |

---

## Upgrading

1. Download the new release assets
2. Replace the apps directory contents with the new zip
3. Pull the new image: `docker compose pull voting-app`
4. Restart: `docker compose up -d voting-app`

The SQLite database schema is automatically migrated on startup — no manual migration needed.

---

## Uninstalling

```bash
# Remove the sidecar
docker compose stop voting-app
docker compose rm voting-app

# Remove the frontend assets
rm -rf config/opencloud/apps/feature-voting/

# Remove the proxy route from config/opencloud/proxy.yaml
# (delete the /api/voting/ endpoint block)

# Optionally remove the database volume data
# WARNING: this permanently deletes all features and votes
docker volume rm pl-opencloud-server_shared-data
```
