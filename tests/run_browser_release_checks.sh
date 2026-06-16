#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BASE_URL="${1:-${BASE_URL:-http://127.0.0.1:4173}}"
OUTPUT_ROOT="${2:-output/release-browser-audits}"

mkdir -p "$OUTPUT_ROOT"

echo "[release-checks] Using base URL: $BASE_URL"
echo "[release-checks] Writing reports under: $OUTPUT_ROOT"

AUDIT_TIMEOUT_SECONDS="${AUDIT_TIMEOUT_SECONDS:-420}"
AUDIT_KILL_AFTER_SECONDS="${AUDIT_KILL_AFTER_SECONDS:-15}"
FRONTEND_LAYOUT_AUDIT_TIMEOUT_SECONDS="${FRONTEND_LAYOUT_AUDIT_TIMEOUT_SECONDS:-1800}"
FRONTEND_LAYOUT_AUDIT_KILL_AFTER_SECONDS="${FRONTEND_LAYOUT_AUDIT_KILL_AFTER_SECONDS:-15}"

audit_timeout_for() {
  local name="$1"
  case "$name" in
    frontend-layout)
      printf '%s\n' "$FRONTEND_LAYOUT_AUDIT_TIMEOUT_SECONDS"
      ;;
    *)
      printf '%s\n' "$AUDIT_TIMEOUT_SECONDS"
      ;;
  esac
}

audit_kill_after_for() {
  local name="$1"
  case "$name" in
    frontend-layout)
      printf '%s\n' "$FRONTEND_LAYOUT_AUDIT_KILL_AFTER_SECONDS"
      ;;
    *)
      printf '%s\n' "$AUDIT_KILL_AFTER_SECONDS"
      ;;
  esac
}

run_audit() {
  local name="$1"
  shift
  local start_ts
  local end_ts
  local timeout_seconds
  local kill_after_seconds
  local status

  start_ts="$(date +%s)"
  timeout_seconds="$(audit_timeout_for "$name")"
  kill_after_seconds="$(audit_kill_after_for "$name")"
  echo "[release-checks] START $name"

  set +e
  node tests/run_with_timeout.mjs "$timeout_seconds" "$kill_after_seconds" "$@"
  status=$?
  set -e

  end_ts="$(date +%s)"
  echo "[release-checks] END $name status=$status duration=$((end_ts - start_ts))s"

  if [ "$status" -eq 124 ]; then
    echo "[release-checks] TIMEOUT $name after ${timeout_seconds}s" >&2
  fi

  return "$status"
}

run_audit core node tests/browser_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/core"
run_audit feature node tests/browser_feature_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/feature"
run_audit automation-boot node tests/browser_automation_boot_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/automation-boot"
run_audit map-overview-risk node tests/browser_map_overview_risk_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/map-overview-risk"
run_audit ui-gallery node tests/browser_ui_gallery_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/ui-gallery"
run_audit frontend-layout node tests/browser_frontend_layout_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/frontend-layout"
run_audit backend-client node tests/browser_backend_client_smoke.mjs "$BASE_URL" "$OUTPUT_ROOT/backend-client"
run_audit auth-ui-cloud node tests/browser_auth_ui_cloud_smoke.mjs "$BASE_URL" "$OUTPUT_ROOT/auth-ui-cloud"
run_audit mobile node tests/browser_mobile_layout_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/mobile"
run_audit reward-mobile node tests/browser_reward_meta_mobile_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/reward-mobile"
run_audit meta node tests/browser_meta_screen_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/meta"
run_audit chapter-flow node tests/browser_chapter_flow_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/chapter-flow"
run_audit run-path node tests/browser_run_path_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/run-path"
run_audit run-path-events node tests/browser_run_path_event_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/run-path-events"
run_audit run-path-reward node tests/browser_run_path_reward_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/run-path-reward"
run_audit dongfu node tests/browser_dongfu_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/dongfu"
run_audit challenge node tests/browser_challenge_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/challenge"
run_audit expedition node tests/browser_expedition_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/expedition"
run_audit events node tests/browser_event_branch_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/events"
run_audit vow-choice node tests/browser_vow_choice_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/vow-choice"
run_audit guide node tests/browser_guide_modal_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/guide"
run_audit inheritance node tests/browser_inheritance_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/inheritance"
run_audit pvp node tests/browser_pvp_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/pvp"
run_audit pvp-mobile node tests/browser_pvp_mobile_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/pvp-mobile"
run_audit pvp-mobile-result node tests/browser_pvp_mobile_result_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/pvp-mobile-result"
run_audit challenge-mobile-flow node tests/browser_challenge_mobile_flow_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/challenge-mobile-flow"

run_audit summarize node tests/summarize_browser_release_reports.cjs "$OUTPUT_ROOT" "$BASE_URL"

echo "[release-checks] All browser release audits passed."
