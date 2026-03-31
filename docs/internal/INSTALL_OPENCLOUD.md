# Installing OpenCloud (Local Development)

These instructions set up a local OpenCloud instance for development and testing. This is a **prerequisite** before installing the Feature Voting extension.

> [!NOTE]
> This guide is for **local development only**. For production deployments, see the [official OpenCloud documentation](https://docs.opencloud.eu/docs/admin/getting-started/container/docker-compose/docker-compose-base).

---

## Prerequisites

| Requirement | How to check |
|:------------|:-------------|
| Docker + Docker Compose v2 | `docker compose version` → should show `v2.x` or later |
| `curl` installed | `curl --version` |
| `git` installed | `git --version` |
| `mkcert` installed | `mkcert --version` — install with `brew install mkcert` (macOS) |

---

## Step 1 — Clone the OpenCloud Compose repository

```bash
git clone https://github.com/opencloud-eu/opencloud-compose.git ~/Sites/opencloud
```

---

## Step 2 — Create your environment file

```bash
cp ~/Sites/opencloud/.env.example ~/Sites/opencloud/.env
```

---

## Step 3 — Configure the environment

Open `~/Sites/opencloud/.env` in a text editor and make **three** changes:

### 3a. Set the admin password

Find the `INITIAL_ADMIN_PASSWORD` line and set it:

```dotenv
INITIAL_ADMIN_PASSWORD=admin
```

> [!IMPORTANT]
> This password is only applied on the **first startup**. Changing it in `.env` later has no effect. Use `admin` for local dev.

### 3b. Enable the Traefik reverse proxy

Find the `COMPOSE_FILE` line — it will be **commented out** by default:

```dotenv
#COMPOSE_FILE=docker-compose.yml:traefik/opencloud.yml
```

**Remove the `#`** to uncomment it:

```dotenv
COMPOSE_FILE=docker-compose.yml:traefik/opencloud.yml
```

> [!WARNING]
> If you skip this step, only the OpenCloud container will start — without Traefik, you won't be able to access the web UI via HTTPS.

### 3c. Use local certificates (not Let's Encrypt)

Find the `TRAEFIK_SERVICES_TLS_CONFIG` line. By default, the **Let's Encrypt** line is active:

```dotenv
TRAEFIK_SERVICES_TLS_CONFIG="tls.certresolver=letsencrypt"
#TRAEFIK_SERVICES_TLS_CONFIG="tls=true"
```

**Swap them** — comment out Let's Encrypt and uncomment the local cert line:

```dotenv
#TRAEFIK_SERVICES_TLS_CONFIG="tls.certresolver=letsencrypt"
TRAEFIK_SERVICES_TLS_CONFIG="tls=true"
```

> [!WARNING]
> If you leave the Let's Encrypt line active, Traefik will ignore your local mkcert certificates and serve its own default self-signed cert instead. The browser will show certificate warnings.

Save and close the file.

---

## Step 4 — Add the local domain to your hosts file

```bash
sudo sh -c 'echo "127.0.0.1 cloud.opencloud.test" >> /etc/hosts'
```

Verify it was added:

```bash
grep opencloud /etc/hosts
```

You should see `127.0.0.1 cloud.opencloud.test`.

> [!TIP]
> If the entry already exists from a previous setup, skip this step — don't add it twice.

---

## Step 5 — Generate SSL certificates with mkcert

### 5a. Install the local CA

```bash
mkcert -install
```

This adds the mkcert root CA to your system trust store so your browser trusts the certificates.

### 5b. Generate the certificate

```bash
mkdir -p ~/Sites/opencloud/certs
cd ~/Sites/opencloud/certs && mkcert cloud.opencloud.test "*.opencloud.test"
```

Then rename the files for clarity:

```bash
cd ~/Sites/opencloud/certs && mv "cloud.opencloud.test+1.pem" server.crt && mv "cloud.opencloud.test+1-key.pem" server.key
```

> [!IMPORTANT]
> The certs must be in `~/Sites/opencloud/certs/` (the repo root `certs/` directory), **not** in `config/traefik/certs/`. The Traefik Docker volume mount points `./certs` → `/certs` inside the container.

### 5c. Create the Traefik dynamic TLS configuration

```bash
mkdir -p ~/Sites/opencloud/config/traefik/dynamic
cat > ~/Sites/opencloud/config/traefik/dynamic/certs.yml << 'EOF'
tls:
  stores:
    default:
      defaultCertificate:
        certFile: /certs/server.crt
        keyFile: /certs/server.key
EOF
```

> [!WARNING]
> Traefik v3 requires `stores` to be a **map** (as shown above), not a YAML list. Using `- default:` (with a dash) will cause Traefik to **silently ignore** the certificate and fall back to its default self-signed cert.

---

## Step 6 — Start OpenCloud

```bash
cd ~/Sites/opencloud && docker compose up -d
```

Wait for the images to pull (first time may take a few minutes), then verify:

```bash
cd ~/Sites/opencloud && docker compose ps
```

You should see **both** `opencloud` and `traefik` containers with status **"Up"**.

---

## Step 7 — Verify

### 7a. Verify the certificate

```bash
echo | openssl s_client -connect cloud.opencloud.test:443 -servername cloud.opencloud.test 2>/dev/null | openssl x509 -noout -issuer -subject
```

You should see `mkcert` in the output:
```
issuer=O = mkcert development CA, ...
subject=O = mkcert development certificate, ...
```

If you see `CN = TRAEFIK DEFAULT CERT` instead, check that `TRAEFIK_SERVICES_TLS_CONFIG="tls=true"` is set in `.env` (see Step 3c) and that certs are in the `certs/` directory (see Step 5b).

### 7b. Verify in your browser

1. Open your browser and navigate to: **https://cloud.opencloud.test**
2. You should see a **green padlock** 🔒 (no certificate warning)
3. Log in with:
   - **Username:** `admin`
   - **Password:** `admin` (or whatever you set in `INITIAL_ADMIN_PASSWORD`)
4. You should see the OpenCloud dashboard with your files.

---

## What's Next?

OpenCloud is now running. To install the **Feature Voting** extension, follow the instructions in [INSTALLATION.md](../../INSTALLATION.md).

---

## Troubleshooting

### Only the `opencloud` container starts (no `traefik`)

Check that `COMPOSE_FILE` is uncommented in `.env`:

```bash
grep COMPOSE_FILE ~/Sites/opencloud/.env
```

The line must **not** start with `#`.

### Traefik serves "TRAEFIK DEFAULT CERT" instead of mkcert

This means the file provider isn't loading your certificates. Check all three of these:

1. **`.env` has the right TLS config** — must be `tls=true`, not `tls.certresolver=letsencrypt`:
   ```bash
   grep TRAEFIK_SERVICES_TLS_CONFIG ~/Sites/opencloud/.env
   ```
2. **Certs are in the right directory** — must be in `~/Sites/opencloud/certs/`, not `config/traefik/certs/`:
   ```bash
   ls ~/Sites/opencloud/certs/server.crt ~/Sites/opencloud/certs/server.key
   ```
3. **Dynamic config exists and uses correct YAML format** (map, not list):
   ```bash
   cat ~/Sites/opencloud/config/traefik/dynamic/certs.yml
   ```

After fixing, restart Traefik:
```bash
cd ~/Sites/opencloud && docker compose up -d --force-recreate traefik
```

### Cannot reach `https://cloud.opencloud.test`

- Verify the hosts file entry: `grep opencloud /etc/hosts`
- Verify containers are running: `docker compose ps`
- Check logs: `docker compose logs -f`

### Container keeps restarting

Check that `INITIAL_ADMIN_PASSWORD` is set in `.env`:

```bash
grep INITIAL_ADMIN_PASSWORD ~/Sites/opencloud/.env
```

If it's empty or missing, OpenCloud won't start properly.

### Want to start over?

```bash
cd ~/Sites/opencloud
docker compose down -v
# Edit .env as needed, then:
docker compose up -d
```

> [!CAUTION]
> The `-v` flag removes all Docker volumes, deleting all OpenCloud data. Only use this for a fresh start.
