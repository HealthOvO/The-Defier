#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BASE_URL="${1:-${BASE_URL:-http://127.0.0.1:4173}}"
OUTPUT_ROOT="${2:-output/mobile-browser-audits}"

mkdir -p "$OUTPUT_ROOT"

echo "[mobile-checks] Using base URL: $BASE_URL"
echo "[mobile-checks] Writing reports under: $OUTPUT_ROOT"

node tests/browser_mobile_layout_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/mobile"
node tests/browser_reward_meta_mobile_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/reward-mobile"
node tests/browser_pvp_mobile_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/pvp-mobile"
node tests/browser_pvp_mobile_result_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/pvp-mobile-result"
node tests/browser_challenge_mobile_flow_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/challenge-mobile-flow"

echo "[mobile-checks] All mobile browser audits passed."
