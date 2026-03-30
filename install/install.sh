#!/usr/bin/env bash
# =============================================================================
# Feature Voting for OpenCloud — Install Script
# =============================================================================
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Performant-Labs/opencloud-voting/main/install/install.sh | bash
#
# Or with options:
#   OC_DOMAIN=cloud.mycompany.com OC_APPS_DIR=./config/opencloud/apps bash install.sh
# =============================================================================

set -euo pipefail

REPO="Performant-Labs/opencloud-voting"
OC_APPS_DIR="${OC_APPS_DIR:-./config/opencloud/apps/feature-voting}"
OC_DOMAIN="${OC_DOMAIN:-cloud.opencloud.test}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Feature Voting for OpenCloud — Installer"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Detect latest release
echo "▶ Fetching latest release tag..."
LATEST=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['tag_name'])")
echo "  Latest: $LATEST"

# Download frontend assets
ASSET_URL="https://github.com/$REPO/releases/download/$LATEST/feature-voting-web-${LATEST}.zip"
echo ""
echo "▶ Downloading frontend assets..."
curl -fsSL "$ASSET_URL" -o /tmp/feature-voting-web.zip
echo "  ✓ Downloaded"

# Deploy frontend
echo ""
echo "▶ Deploying frontend to: $OC_APPS_DIR"
mkdir -p "$OC_APPS_DIR"
unzip -q -o /tmp/feature-voting-web.zip -d "$OC_APPS_DIR"
rm /tmp/feature-voting-web.zip
echo "  ✓ Frontend deployed"

# Download compose override
OVERRIDE_URL="https://github.com/$REPO/releases/download/$LATEST/docker-compose.override.yml"
echo ""
echo "▶ Downloading docker-compose.override.yml..."
curl -fsSL "$OVERRIDE_URL" -o ./docker-compose.override.yml
# Inject the OC_DOMAIN
sed -i.bak "s|cloud.opencloud.test|$OC_DOMAIN|g" ./docker-compose.override.yml
rm -f ./docker-compose.override.yml.bak
echo "  ✓ docker-compose.override.yml written (OC_DOMAIN=$OC_DOMAIN)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " ✓ Files downloaded. Complete these steps to finish:"
echo ""
echo "  1. PROXY ROUTE — Edit config/opencloud/proxy.yaml"
echo ""
echo "     If the file already exists, add these lines to the"
echo "     existing routes: list:"
echo ""
echo "       - endpoint: /api/voting/"
echo "         backend: http://voting-app:8080"
echo ""
echo "     If the file does not exist, create it with:"
echo ""
echo "       additional_policies:"
echo "         - name: default"
echo "           routes:"
echo "             - endpoint: /api/voting/"
echo "               backend: http://voting-app:8080"
echo ""
echo "  2. COMPOSE_PROJECT_NAME — Make sure it's set in .env"
echo "     Check: grep COMPOSE_PROJECT_NAME .env"
echo "     If missing, add: COMPOSE_PROJECT_NAME=<your-folder-name>"
echo ""
echo "  3. START THE SIDECAR:"
echo "       docker compose up -d voting-app"
echo ""
echo "  4. RESTART OPENCLOUD:"
echo "       docker compose restart opencloud"
echo ""
echo "  5. VERIFY:"
echo "       Visit https://$OC_DOMAIN/feature-voting/board"
echo ""
echo "  Full instructions: INSTALLATION.md in the opencloud-voting repo"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
