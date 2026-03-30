#!/usr/bin/env bash
# =============================================================================
# Phase 1000: Load Test Suite
# =============================================================================
# Phase 1010 — Provision: creates a feature to vote on and gets admin token
# Phase 1020 — Threshold: 500 concurrent requests, 0% error, P95 < 500ms
# Phase 1030 — Degradation: 5000 spike, measure WAL elasticity (0 lock errors)
# Phase 1040 — Teardown: deletes the load test feature
# =============================================================================

set -euo pipefail

API="https://cloud.opencloud.test/api/voting"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="$SCRIPT_DIR/../docs/load-test-results"
mkdir -p "$RESULTS_DIR"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Phase 1000: Feature Voting Load Test"
echo " $(date)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Phase 1010: Get admin Bearer token ───────────────────────────────────────
echo ""
echo "▶ Phase 1010: Acquiring admin Bearer token..."

TOKEN_FILE="$SCRIPT_DIR/admin-token.txt"
rm -f "$TOKEN_FILE"

# Use the Playwright token-capture spec to get a live Bearer token
(cd "$SCRIPT_DIR/../web" && npx playwright test tests/e2e/get-admin-token.spec.ts --reporter=line 2>&1) || true

if [ ! -f "$TOKEN_FILE" ] || [ ! -s "$TOKEN_FILE" ]; then
  echo "✗ ERROR: Failed to acquire Bearer token (file missing or empty)"
  exit 1
fi

TOKEN=$(cat "$TOKEN_FILE")
echo "  ✓ Token acquired (${#TOKEN} chars)"

# ── Create a dedicated load-test feature ─────────────────────────────────────
FEATURE_TITLE="LoadTest Feature $(date +%s)"
echo "  Creating load-test feature: '$FEATURE_TITLE'..."

CREATE_RESP=$(curl -sk -X POST "$API/features" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"$FEATURE_TITLE\",\"description\":\"Load test target. Safe to delete.\"}")

FEATURE_ID=$(echo "$CREATE_RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")

if [ -z "$FEATURE_ID" ]; then
  echo "✗ ERROR: Could not create load-test feature"
  echo "  Response: $CREATE_RESP"
  exit 1
fi

echo "  ✓ Feature created: $FEATURE_ID"

VOTE_URL="$API/features/$FEATURE_ID/vote"
echo "  Vote endpoint: $VOTE_URL"

# ── Phase 1020: Threshold load test ─────────────────────────────────────────
echo ""
echo "▶ Phase 1020: Threshold load test — 500 requests, 50 concurrent"
echo "  Goal: 0% errors, P95 < 500ms"
echo ""

RESULT_1020="$RESULTS_DIR/1020-threshold-$(date +%Y%m%d-%H%M%S).txt"

hey -n 500 -c 50 -m POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "https://cloud.opencloud.test/api/voting/features/$FEATURE_ID/vote" \
  2>&1 | tee "$RESULT_1020"

echo ""
echo "  Results saved → $RESULT_1020"

# ── Phase 1030: Degradation / spike test ────────────────────────────────────
echo ""
echo "▶ Phase 1030: Degradation spike — 5000 requests, 200 concurrent"
echo "  Goal: latency increases but zero 'database is locked' errors"
echo ""

RESULT_1030="$RESULTS_DIR/1030-spike-$(date +%Y%m%d-%H%M%S).txt"

hey -n 5000 -c 200 -m POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "https://cloud.opencloud.test/api/voting/features/$FEATURE_ID/vote" \
  2>&1 | tee "$RESULT_1030"

echo ""
echo "  Results saved → $RESULT_1030"

# ── Phase 1040: Teardown ────────────────────────────────────────────────────
echo ""
echo "▶ Phase 1040: Teardown — deleting load-test feature..."

DELETE_STATUS=$(curl -sk -o /dev/null -w "%{http_code}" -X DELETE \
  "$API/features/$FEATURE_ID" \
  -H "Authorization: Bearer $TOKEN")

if [ "$DELETE_STATUS" = "200" ] || [ "$DELETE_STATUS" = "204" ]; then
  echo "  ✓ Feature $FEATURE_ID deleted (HTTP $DELETE_STATUS)"
else
  echo "  ⚠ Delete returned HTTP $DELETE_STATUS — may need manual cleanup"
  echo "    Feature ID: $FEATURE_ID"
fi

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Phase 1000 complete. Results in docs/load-test-results/"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
