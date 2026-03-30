# Installing Feature Voting on OpenCloud

This guide is for **OpenCloud administrators** who want to add the Feature Voting extension to an existing OpenCloud deployment. No programming knowledge is required.

Feature Voting has two components that install together:
- A **web extension** (the UI that appears in the OpenCloud app switcher)
- A **sidecar container** (a small backend service that stores features and votes)

---

## Before You Start

You will need:

| Requirement | How to check |
|:------------|:-------------|
| A running OpenCloud deployment (v5.0+) | You can log in at your OpenCloud URL |
| Docker Compose v2 | `docker compose version` shows `v2.x` or later |
| Terminal/SSH access to the server | You can run `docker compose ps` and see your OpenCloud containers |
| Your OpenCloud domain | e.g. `cloud.example.com` or `cloud.opencloud.test` for local dev |
| `curl`, `unzip`, and `python3` installed | These are pre-installed on most Linux servers and macOS |

> [!TIP]
> **Don't have OpenCloud yet?** Download the deployment files from [opencloud-compose](https://github.com/opencloud-eu/opencloud-compose), copy `.env.example` to `.env`, set `INITIAL_ADMIN_PASSWORD`, and run `docker compose up -d`. See the [opencloud-compose README](https://github.com/opencloud-eu/opencloud-compose#readme) for full instructions.

> [!IMPORTANT]
> All commands in this guide must be run **from your OpenCloud deployment directory** — the folder that contains your `docker-compose.yml` and `.env` files. **Do not `cd` into subdirectories** while running these steps.
>
> ```bash
> cd /path/to/your/opencloud-compose
> ```

---

## Choose Your Installation Method

Check your `.env` file:

```bash
grep COMPOSE_FILE .env
```

- **If it prints a `COMPOSE_FILE=...` line** → Use [**Method A — COMPOSE_FILE append**](#method-a--compose_file-append-recommended) (recommended)
- **If it prints nothing** → Use [**Method B — Override file**](#method-b--override-file)

> [!IMPORTANT]
> If you followed the OpenCloud setup guide and added Traefik (most users), you have `COMPOSE_FILE` set. Use **Method A**.

---

## Method A — COMPOSE_FILE Append (Recommended)

This is the standard pattern used by OpenCloud for add-ons like Collabora, Radicale, and monitoring. If you have `COMPOSE_FILE` set in your `.env`, this is the method to use.

### Step 1 — Download the compose file and add it to your stack

Run these two commands from your deployment directory (do **not** `cd` into the `feature-voting` folder):

```bash
mkdir -p feature-voting
curl -fsSL \
  https://github.com/Performant-Labs/opencloud-voting/releases/latest/download/opencloud.yml \
  -o feature-voting/opencloud.yml
```

Then open your `.env` file and add `feature-voting/opencloud.yml` to your `COMPOSE_FILE` line:

```dotenv
# Before (your existing line — yours may look different)
COMPOSE_FILE=docker-compose.yml:traefik/opencloud.yml

# After — append the new file with a colon separator
COMPOSE_FILE=docker-compose.yml:traefik/opencloud.yml:feature-voting/opencloud.yml
```

### Step 2 — Deploy the web extension

Download and unpack the frontend assets into your OpenCloud apps directory:

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

After this, you should see files inside `config/opencloud/apps/feature-voting/`:
```bash
ls config/opencloud/apps/feature-voting/
# Expected: manifest.json  js/
```

### Step 3 — Add the proxy route

OpenCloud needs to know where to send Feature Voting API requests. Create (or edit) the file `config/opencloud/proxy.yaml`.

> [!NOTE]
> The compose file you downloaded in Step 1 automatically mounts this file into the OpenCloud container. You just need to create it on disk.

**If the file already exists** (e.g. you have Radicale or another add-on), add the following lines at the end of the existing `routes:` list:

```yaml
      # Feature Voting API sidecar
      - endpoint: /api/voting/
        backend: http://voting-app:8080
```

**If the file does not exist**, create it with this content:

```yaml
additional_policies:
  - name: default
    routes:
      # Feature Voting API sidecar
      - endpoint: /api/voting/
        backend: http://voting-app:8080
```

> [!WARNING]
> YAML is sensitive to indentation. The `endpoint` and `backend` lines must be indented with **spaces** (not tabs), matching the indentation shown above.

### Step 4 — Set your domain

If your OpenCloud domain is **not** `cloud.opencloud.test`, you need to tell the sidecar which domain to use for authentication. Open your `.env` file and make sure `OC_DOMAIN` is set:

```dotenv
OC_DOMAIN=cloud.example.com
```

If `OC_DOMAIN` is already set in your `.env` (which it should be if your OpenCloud is working), no change is needed — the voting sidecar reads the same variable.

### Step 5 — Start the services

```bash
# Start the voting sidecar
docker compose up -d voting-app

# Restart OpenCloud so it picks up the new proxy route and web extension
docker compose restart opencloud
```

### Step 6 — Verify

1. **Check the container is running:**
   ```bash
   docker compose ps voting-app
   # STATUS should show "Up" and "(healthy)"
   ```

2. **Open your browser**, go to your OpenCloud instance, and log in. Click the **app switcher** (grid icon in the top-left corner) — you should see **"Feature Voting"** listed. Click it to open the board.

> [!NOTE]
> The voting API is protected behind OpenCloud's proxy, which requires authentication for all requests. You must be logged into OpenCloud to use Feature Voting — there is no unauthenticated access to the API.

---

## Method B — Override File

Use this method **only** if you do NOT have `COMPOSE_FILE` set in your `.env` — meaning you start OpenCloud by passing `-f` flags directly on the command line.

> [!WARNING]
> If `COMPOSE_FILE` is set in your `.env`, Docker Compose **ignores** the override file. Use [Method A](#method-a--compose_file-append-recommended) instead.

### Step 1 — Download the compose override

```bash
curl -fsSL \
  https://github.com/Performant-Labs/opencloud-voting/releases/latest/download/docker-compose.override.yml \
  -o docker-compose.override.yml
```

Docker Compose automatically merges `docker-compose.override.yml` with `docker-compose.yml` when both are present in the same directory.

### Step 2 — Deploy the web extension

Same as [Method A, Step 2](#step-2--deploy-the-web-extension).

### Step 3 — Add the proxy route

Same as [Method A, Step 3](#step-3--add-the-proxy-route).

### Step 4 — Set your domain

Same as [Method A, Step 4](#step-4--set-your-domain).

### Step 5 — Find your compose project name

The override file needs to connect to the Docker network and volume created by your main OpenCloud stack. It uses the `COMPOSE_PROJECT_NAME` variable to find them.

Check what yours is:
```bash
grep COMPOSE_PROJECT_NAME .env
```

If nothing is printed, Docker Compose defaults to the **folder name** (e.g. `opencloud-compose`). In that case, add this to your `.env`:

```dotenv
COMPOSE_PROJECT_NAME=opencloud-compose
```

> [!TIP]
> You can also check the existing network name with:
> ```bash
> docker network ls | grep opencloud-net
> ```
> The output will show something like `opencloud-compose_opencloud-net`. The part before `_opencloud-net` is your project name.

### Step 6 — Start the services

```bash
docker compose up -d voting-app
docker compose restart opencloud
```

### Step 7 — Verify

Same as [Method A, Step 6](#step-6--verify).

---

## Optional Configuration

The defaults work for most deployments. Adjust these only if needed.

### Environment variables (set in `.env`)

| Variable | Default | What it does |
|:---------|:--------|:-------------|
| `OC_DOMAIN` | `cloud.opencloud.test` | Your OpenCloud domain. The sidecar uses this to validate login tokens. |
| `LOG_LEVEL` | `info` | Log detail: `debug`, `info`, `warn`, or `error` |
| `VOTING_DB_URL` | _(empty)_ | Optional PostgreSQL connection string. If set, the sidecar uses PostgreSQL instead of the built-in SQLite database. Format: `postgres://user:pass@host/db?sslmode=disable` |

### Database

By default, voting data is stored in a **SQLite** file at `/data/feature-voting.sqlite` inside the container. This file lives in the `voting-data` Docker volume and persists across container restarts and upgrades.

No database setup is required. The sidecar creates the database automatically on first start.

---

## Upgrading

When a new version is released:

```bash
# 1. Download the new frontend assets (re-run Step 2)
VERSION=$(curl -fsSL https://api.github.com/repos/Performant-Labs/opencloud-voting/releases/latest \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['tag_name'])")

curl -fsSL \
  "https://github.com/Performant-Labs/opencloud-voting/releases/download/$VERSION/feature-voting-web-${VERSION}.zip" \
  -o feature-voting-web.zip
unzip -q -o feature-voting-web.zip -d config/opencloud/apps/feature-voting
rm feature-voting-web.zip

# 2. Pull the new sidecar image
docker compose pull voting-app

# 3. Restart
docker compose up -d voting-app
docker compose restart opencloud
```

The database schema is migrated automatically on startup — no manual steps needed.

---

## Uninstalling

```bash
# Stop and remove the voting sidecar
docker compose stop voting-app
docker compose rm -f voting-app

# Remove the web extension
rm -rf config/opencloud/apps/feature-voting/

# Remove the proxy route:
# Edit config/opencloud/proxy.yaml and delete the /api/voting/ lines

# For Method A: remove the compose file and its reference
rm -rf feature-voting/
# Then edit .env and remove :feature-voting/opencloud.yml from COMPOSE_FILE

# For Method B: remove the override file
rm -f docker-compose.override.yml

# Restart OpenCloud to apply changes
docker compose restart opencloud
```

To also **delete all voting data** (irreversible):
```bash
docker volume rm $(docker volume ls -q | grep voting-data)
```

---

## One-Liner Install (Method B only)

This script automates Steps 1–2 of Method B (downloads the compose override and deploys the frontend). You still need to complete Steps 3–6 manually afterward. Review the script before running it.

```bash
cd /path/to/your/opencloud-compose

OC_DOMAIN=cloud.example.com \
  curl -fsSL \
    https://raw.githubusercontent.com/Performant-Labs/opencloud-voting/main/install/install.sh \
  | bash
```

---

## Troubleshooting

### "Feature Voting" doesn't appear in the app switcher

1. Check that the frontend files are in the right place:
   ```bash
   ls config/opencloud/apps/feature-voting/manifest.json
   ```
   If you see `config/opencloud/apps/feature-voting/dist/manifest.json` instead (inside a `dist/` subfolder), the zip was unpacked with an extra layer. Move the files up:
   ```bash
   mv config/opencloud/apps/feature-voting/dist/* config/opencloud/apps/feature-voting/
   rmdir config/opencloud/apps/feature-voting/dist
   ```
2. Restart OpenCloud:
   ```bash
   docker compose restart opencloud
   ```

### Voting API returns 404 or the OpenCloud HTML page

The proxy route is not being picked up. Check:

1. The file `config/opencloud/proxy.yaml` exists and contains the `/api/voting/` route
2. The compose file mounts `proxy.yaml` into the container. The `opencloud.yml` and `docker-compose.override.yml` from the release do this automatically. If you're using a custom setup, add this to your opencloud service:
   ```yaml
   services:
     opencloud:
       environment:
         PROXY_ADDITIONAL_POLICIES_CONFIG_FILE_LOCATION: /etc/opencloud/proxy.yaml
       volumes:
         - ./config/opencloud/proxy.yaml:/etc/opencloud/proxy.yaml
   ```
3. Restart OpenCloud after any proxy.yaml changes:
   ```bash
   docker compose restart opencloud
   ```

### Voting API returns 401 (Unauthorized)

The sidecar couldn't validate your login token. Check that `OC_DOMAIN` in `.env` matches your actual OpenCloud domain:
```bash
grep OC_DOMAIN .env
```

### Container keeps restarting

Check the logs:
```bash
docker compose logs --tail=50 voting-app
```

Common causes:
- The `voting-data` volume doesn't exist (check `docker volume ls`)
- The `opencloud-net` network doesn't exist (check `docker network ls`)
- For Method B: `COMPOSE_PROJECT_NAME` is missing or wrong in `.env`

### "volume not found" error (Method B only)

The override file uses `COMPOSE_PROJECT_NAME` to find the existing Docker network and volume. See [Step 5 in Method B](#step-5--find-your-compose-project-name) to set it correctly.

---

## How It Works

```
┌───────────────────────────────────────────────────┐
│  Your Browser                                     │
│  OpenCloud Web UI → Feature Voting extension      │
└───────────────────│───────────────────────────────┘
                    │ (clicks / votes / comments)
                    ▼
┌───────────────────────────────────────────────────┐
│  OpenCloud Proxy                                  │
│  Routes /api/voting/* → voting-app:8080           │
│  (validates your login token before forwarding)   │
└───────────────────│───────────────────────────────┘
                    ▼
┌───────────────────────────────────────────────────┐
│  Voting Sidecar (voting-app container)            │
│  Stores features, votes, and comments in SQLite   │
└───────────────────────────────────────────────────┘
```

For the full technical architecture, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
