#!/usr/bin/env bash
# run_e2e_tests.sh
set -e

echo "🚀 Running Pre-Flight Checks for Feature Voting E2E Tests..."

# 0. Zombie Process Cleanup
echo "🧹 Cleaning up any dangling Playwright browsers..."
pkill -f "playwright" || true

# 1. Dependency Check
if ! command -v pnpm &> /dev/null; then
    echo "❌ Error: 'pnpm' command could not be found. Please install pnpm."
    exit 1
fi

if ! command -v npx &> /dev/null; then
    echo "❌ Error: 'npx' command could not be found. Please install Node/npm."
    exit 1
fi

echo "✅ Dependencies (pnpm, npx) installed."

# 2. Container/Stack Check
echo "🔍 Checking if deep OpenCloud API stack is running..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -k --connect-timeout 5 https://cloud.opencloud.test/graph/v1.0/drives || echo "FAILED")

if [ "$HTTP_STATUS" != "401" ]; then
    echo "❌ Error: Cannot connect to OpenCloud Graph API."
    echo "Expected HTTP 401, got $HTTP_STATUS. Playwright cannot execute without the proxy AND backend running."
    echo "Please run: cd ~/Sites/pl-opencloud-server && ./occtl start"
    exit 1
fi
echo "✅ https://cloud.opencloud.test API backend is online (HTTP $HTTP_STATUS)."

echo "🔍 Checking if Feature Voting App frontend is reachable..."
# E2e testing interacts with the proxy, we check if the proxy serves the index.html or gives a valid response for feature voting
WEB_HTTP_STATUS=$(curl -s -L -o /dev/null -w "%{http_code}" -k --connect-timeout 5 https://cloud.opencloud.test/feature-voting/board || echo "FAILED")

if [ "$WEB_HTTP_STATUS" = "404" ] || [ "$WEB_HTTP_STATUS" = "FAILED" ]; then
    echo "❌ Error: Feature Voting App not reachable (HTTP $WEB_HTTP_STATUS at https://cloud.opencloud.test/feature-voting/board)."
    echo "Did you build and deploy the Vue code points to the proxy first?"
    echo "Run: pnpm build && cp -r dist/* ../../pl-opencloud-server/config/opencloud/apps/feature-voting/"
    exit 1
fi
echo "✅ Feature Voting UI proxy looks responsive (HTTP $WEB_HTTP_STATUS)."

# 3. Execution
echo "🎉 All pre-flight checks passed! Starting Playwright Tests..."
echo "--------------------------------------------------------"

# Assume script is run from inside web folder
cd "$(dirname "$0")/.."
pnpm test:e2e
