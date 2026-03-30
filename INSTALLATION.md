This application consists of two parts: a **Web Extension** (UI) and a **Sidecar API** (Backend). Both are required and are installed together.

This guide covers two **installation methods** and two **configuration approaches**. Review the table below to choose the path that fits your needs.

| Decision | Options | Best For |
|:---------|:--------|:---------|
| **Installation method** | [Method A (Override)](#method-a--sidecar-override-recommended) | **Quick Start**: Self-contained and easiest to set up. |
| | [Method B (Append)](#method-b--compose_file-append-opencloud-compose-modular-pattern) | **Standard**: Aligns with official `opencloud-compose` patterns. |
| **Configuration approach** | [Path 1 (.env)](#configuration-path-1--env-file) | **Simplicity**: Keeps all settings in a single file. |
| | [Path 2 (Inline)](#configuration-path-2--inline-in-the-compose-file) | **Control**: Allows overriding hidden or advanced defaults. |

---

## Prerequisites

- A running [`opencloud-compose`](https://github.com/opencloud-eu/opencloud-compose) deployment
- Docker Compose v2
- Your OpenCloud domain (e.g. `cloud.opencloud.test` for local dev, or your production domain)

---

## Method A — Sidecar Override (Recommended)

This method drops a single compose override file into your deployment directory. It's self-contained, requires no changes to your existing `docker-compose.yml`, and works with any `opencloud-compose` setup.

### Step 1 — Download the compose override

```bash
curl -fsSL \
  https://github.com/Performant-Labs/opencloud-voting/releases/latest/download/docker-compose.override.yml \
  -o docker-compose.override.yml
```

> If your OpenCloud domain is not `cloud.opencloud.test`, set it now:
> ```bash
> sed -i "s|cloud.opencloud.test|your-domain.com|g" docker-compose.override.yml
> ```

### Step 2 — Deploy the frontend assets

Download and unzip the frontend bundle into your OpenCloud apps directory:

```bash
VERSION=$(curl -fsSL https://api.github.com/repos/Performant-Labs/opencloud-voting/releases/latest \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['tag_name'])")

curl -fsSL \
  "https://github.com/Performant-Labs/opencloud-voting/releases/download/$VERSION/feature-voting-web-${VERSION}.zip" \
  -o feature-voting-web.zip

mkdir -p config/opencloud/apps/feature-voting
unzip -q -o feature-voting-web.zip -d config/opencloud/apps/feature-voting
rm feature-voting-web.zip
```

### Step 3 — Add the proxy route

Add the following to `config/opencloud/proxy.yaml` under the `policy:` list:

```yaml
policy:
  - endpoint: /api/voting/
    backend: http://voting-app:8080
```

### Step 4 — Configure

Choose a configuration approach and apply it before starting the sidecar:

- [Path 1 — via `.env` file](#configuration-path-1--env-file)
- [Path 2 — inline in the compose file](#configuration-path-2--inline-in-the-compose-file)

### Step 5 — Start the sidecar

Docker Compose automatically merges `docker-compose.override.yml` with the base file when both are present:

```bash
docker compose up -d voting-app
```

### Step 6 — Restart OpenCloud

```bash
docker compose restart opencloud
```

### Step 7 — Verify

```bash
# Replace <token> with a valid Bearer token from your OpenCloud session
curl -s https://your-domain.com/api/voting/healthz \
  -H "Authorization: Bearer <token>"
# → {"status":"ok"}
```

The board is available at `https://your-domain.com/feature-voting/board`.

---

## Method B — COMPOSE_FILE Append (opencloud-compose Modular Pattern)

This method matches the convention used by [`opencloud-compose`](https://github.com/opencloud-eu/opencloud-compose) for optional add-ons like Collabora, Radicale, and monitoring. It requires appending a named compose file to your `COMPOSE_FILE` variable rather than using an automatic override.

Use this method if:
- You already manage your compose stack via `COMPOSE_FILE` in `.env`
- You want to keep your setup consistent with upstream opencloud-compose conventions
- You intend to submit a PR to the upstream project

### Step 1 — Download the named compose file

```bash
curl -fsSL \
  https://github.com/Performant-Labs/opencloud-voting/releases/latest/download/opencloud.yml \
  -o feature-voting/opencloud.yml
```

### Step 2 — Deploy frontend assets

Same as [Method A, Step 2](#step-2--deploy-the-frontend-assets).

### Step 3 — Add the proxy route

Same as [Method A, Step 3](#step-3--add-the-proxy-route).

### Step 4 — Configure

Choose a configuration approach and apply it before starting the sidecar:

- [Path 1 — via `.env` file](#configuration-path-1--env-file)
- [Path 2 — inline in the compose file](#configuration-path-2--inline-in-the-compose-file)

### Step 5 — Append to COMPOSE_FILE

In your `.env` file, append the new compose file:

```dotenv
# Before (example)
COMPOSE_FILE=docker-compose.yml:traefik/opencloud.yml

# After
COMPOSE_FILE=docker-compose.yml:traefik/opencloud.yml:feature-voting/opencloud.yml
```

Then bring up the new service:

```bash
docker compose up -d voting-app
```

### Step 6 — Restart OpenCloud

```bash
docker compose restart opencloud
```

### Step 7 — Verify

Same as [Method A, Step 7](#step-7--verify).

---

## Configuration

The voting-app container reads four environment variables. There are two ways to set them.

### Configuration Path 1 — `.env` file

The compose files expose user-facing aliases in your `.env` file and translate them to the container variables automatically. This is the simpler approach and keeps all your deployment settings in one place.

| `.env` variable | Default | Description |
|:----------------|:--------|:------------|
| `OC_DOMAIN` | `cloud.opencloud.test` | Your OpenCloud domain. Sets the OIDC issuer and proxy base URL. |
| `VOTING_DB_URL` | _(empty)_ | Optional PostgreSQL DSN. If set, SQLite is not used. Format: `postgres://user:pass@host/db?sslmode=disable` |
| `LOG_LEVEL` | `info` | Log verbosity: `debug`, `info`, `warn`, `error` |

> `DB_PATH` (the SQLite file location inside the container) is hardcoded to `/data/feature-voting.sqlite` in the compose files. To change it, use Path 2.

**Example `.env` addition:**

```dotenv
OC_DOMAIN=cloud.example.com
LOG_LEVEL=debug
# VOTING_DB_URL=postgres://user:pass@db-host/voting?sslmode=disable
```

---

### Configuration Path 2 — Inline in the compose file

Edit the `environment:` block in `docker-compose.override.yml` (Method A) or `feature-voting/opencloud.yml` (Method B) to set the container variables directly. Use this approach when you need to override values that have no `.env` alias, such as `DB_PATH`.

| Container variable | Default | Description |
|:-------------------|:--------|:------------|
| `OC_OIDC_ISSUER` | `https://cloud.opencloud.test` | OIDC issuer URL for JWT validation — must match your OpenCloud domain |
| `DB_PATH` | `/data/feature-voting.sqlite` | SQLite database path inside the container |
| `OC_DB_URL` | _(empty)_ | Optional PostgreSQL DSN. If set, SQLite is not used. Format: `postgres://user:pass@host/db?sslmode=disable` |
| `OC_LOG_LEVEL` | `info` | Log verbosity: `debug`, `info`, `warn`, `error` |

**Example compose snippet:**

```yaml
environment:
  OC_OIDC_ISSUER: "https://cloud.example.com"
  DB_PATH: "/data/feature-voting.sqlite"
  OC_LOG_LEVEL: "debug"
  # OC_DB_URL: "postgres://user:pass@db-host/voting?sslmode=disable"
```

---

## Upgrading

1. Download the new frontend zip and re-unzip into the apps directory (overwrite)
2. Pull the new image: `docker compose pull voting-app`
3. Restart: `docker compose up -d voting-app`

The SQLite schema is migrated automatically on startup — no manual steps needed.

---

## Uninstalling

```bash
# Stop and remove the sidecar
docker compose stop voting-app
docker compose rm -f voting-app

# Remove the frontend assets
rm -rf config/opencloud/apps/feature-voting/

# Remove the proxy route from config/opencloud/proxy.yaml

# For Method A: remove the override file
rm docker-compose.override.yml

# For Method B: remove feature-voting/opencloud.yml and
# remove it from COMPOSE_FILE in .env

# Optional: delete the database (IRREVERSIBLE — deletes all features and votes)
docker volume rm $(docker volume ls -q | grep shared-data)
```

---

## One-liner (Method A only)

Automates Steps 1–3 above. Review the script before running it.

```bash
OC_DOMAIN=your-domain.com \
  curl -fsSL \
    https://raw.githubusercontent.com/Performant-Labs/opencloud-voting/main/install/install.sh \
  | bash
```

---

## Expected OpenCloud Deployment

Feature Voting is designed and tested against a specific OpenCloud deployment model. If your setup differs materially from what is described here, the installation steps may need adjustment.

### Deployment model

This app assumes OpenCloud is deployed using the official
[`opencloud-compose`](https://github.com/opencloud-eu/opencloud-compose) Docker Compose stack — specifically, the base `docker-compose.yml` from that repository (version 5.0 or later).

```
opencloud-compose/
├── docker-compose.yml        ← base stack (required)
├── traefik/opencloud.yml     ← recommended (TLS + routing)
├── config/
│   └── opencloud/
│       ├── proxy.yaml        ← where the /api/voting/ route goes
│       └── apps/             ← where the frontend zip is unpacked
│           └── feature-voting/
└── .env                      ← OC_DOMAIN, LOG_LEVEL, etc.
```

### What it depends on

| Dependency | How it's used |
|:-----------|:--------------|
| **Docker network `opencloud-net`** | The `voting-app` container must be on the same network as the `opencloud` container so the proxy can route to it by service name (`http://voting-app:8080`). The base `docker-compose.yml` defines this network. |
| **Docker volume `shared-data`** | The SQLite database is stored in this shared volume. The base compose file defines it; the voting-app container mounts it at `/data`. If your deployment uses a different shared volume name, update `DB_PATH` and the volume reference in your compose file. |
| **OpenCloud proxy service** | The OpenCloud proxy (built into the `opencloud` container) must be configured to forward `/api/voting/` requests to the sidecar. This is done via `config/opencloud/proxy.yaml`. Without this route, all voting API calls return 401 or 404. |
| **OIDC issuer** | The sidecar validates Bearer tokens by fetching the JWKS from `${OC_OIDC_ISSUER}/.well-known/openid-configuration`. This must be the same issuer your OpenCloud instance uses — typically `https://${OC_DOMAIN}`. |
| **Web apps directory** | OpenCloud serves static files from the volume mount `${OC_APPS_DIR:-./config/opencloud/apps}:/var/lib/opencloud/web/assets/apps`. The frontend zip must be unpacked under a `feature-voting/` subdirectory of that path. |

### Minimum OpenCloud version

OpenCloud **5.0** or later is required. Earlier versions used a different proxy configuration format and a different web extension manifest schema.

### What this app does NOT require

- Keycloak or external LDAP (the built-in OpenCloud IDM is sufficient)
- Collabora, OnlyOffice, or any other add-on service
- PostgreSQL (SQLite is the default; PostgreSQL is optional via `VOTING_DB_URL` / `OC_DB_URL`)
- A reverse proxy beyond the one built into the `opencloud` container

### Kubernetes / non-Compose deployments

This app has not been tested on Kubernetes. The concepts are directly portable (same Docker image, same environment variables, same proxy route), but the networking, volume, and proxy configuration will differ. If you deploy OpenCloud via Helm charts, treat the compose files in this repo as a reference implementation rather than an operational manifest.
