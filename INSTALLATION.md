# Installing Feature Voting for OpenCloud

This guide covers two installation methods. **Method A (Sidecar Override)** is recommended for most deployments. Method B is provided for users who work directly with the `opencloud-compose` modular `COMPOSE_FILE` pattern.

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

### Step 4 — Start the sidecar

Docker Compose automatically merges `docker-compose.override.yml` with the base file when both are present:

```bash
docker compose up -d voting-app
```

### Step 5 — Restart OpenCloud

```bash
docker compose restart opencloud
```

### Step 6 — Verify

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

Same as Method A, Step 2.

### Step 3 — Add the proxy route

Same as Method A, Step 3.

### Step 4 — Append to COMPOSE_FILE

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

### Step 5 — Restart OpenCloud

```bash
docker compose restart opencloud
```

### Step 6 — Verify

Same as Method A, Step 6.

---

## Configuration

Both methods support the same environment variables via your `.env` file or inline in the compose file:

| Variable | Default | Description |
|:---------|:--------|:------------|
| `OC_OIDC_ISSUER` | `https://cloud.opencloud.test` | Your OpenCloud domain — **must match your `OC_DOMAIN`** |
| `DB_PATH` | `/data/feature-voting.sqlite` | SQLite database path inside the container |
| `VOTING_DB_URL` | _(empty)_ | Optional PostgreSQL DSN. If set, SQLite is not used. Format: `postgres://user:pass@host/db?sslmode=disable` |
| `LOG_LEVEL` | `info` | Log verbosity: `debug`, `info`, `warn`, `error` |

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

Automates Steps 1–4 above. Review the script before running it.

```bash
OC_DOMAIN=your-domain.com \
  curl -fsSL \
    https://raw.githubusercontent.com/Performant-Labs/opencloud-voting/main/install/install.sh \
  | bash
```
