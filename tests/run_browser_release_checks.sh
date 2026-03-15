#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BASE_URL="${1:-${BASE_URL:-http://127.0.0.1:4173}}"
OUTPUT_ROOT="${2:-output/release-browser-audits}"

mkdir -p "$OUTPUT_ROOT"

echo "[release-checks] Using base URL: $BASE_URL"
echo "[release-checks] Writing reports under: $OUTPUT_ROOT"

node tests/browser_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/core"
node tests/browser_feature_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/feature"
node tests/browser_ui_gallery_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/ui-gallery"
node tests/browser_mobile_layout_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/mobile"
node tests/browser_meta_screen_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/meta"
node tests/browser_chapter_flow_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/chapter-flow"
node tests/browser_dongfu_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/dongfu"
node tests/browser_challenge_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/challenge"
node tests/browser_expedition_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/expedition"
node tests/browser_event_branch_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/events"
node tests/browser_vow_choice_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/vow-choice"
node tests/browser_guide_modal_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/guide"
node tests/browser_inheritance_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/inheritance"
node tests/browser_pvp_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/pvp"
node tests/browser_pvp_mobile_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/pvp-mobile"

echo "[release-checks] All browser release audits passed."
