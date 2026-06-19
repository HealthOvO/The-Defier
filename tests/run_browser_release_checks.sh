#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BASE_URL="${1:-${BASE_URL:-http://127.0.0.1:4173}}"
OUTPUT_ROOT="${2:-output/release-browser-audits}"
AUDIT_FILTER="${AUDIT_FILTER:-${BROWSER_AUDIT_FILTER:-}}"

mkdir -p "$OUTPUT_ROOT"

echo "[release-checks] Using base URL: $BASE_URL"
echo "[release-checks] Writing reports under: $OUTPUT_ROOT"
if [ -n "$AUDIT_FILTER" ]; then
  echo "[release-checks] Audit filter: $AUDIT_FILTER"
fi

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

filter_audit_log() {
  awk '
    /^\[[^]]+\] START / { print; fflush(); next }
    /^\[[^]]+\] END / { print; fflush(); next }
    /^\[run_with_timeout\]/ { print; fflush(); next }
    /"summary":/ { print; fflush(); next }
    /"failed":/ { print; fflush(); next }
    /"consoleErrors":/ { print; fflush(); next }
  '
}

should_run_audit() {
  local name="$1"
  local requested
  local -a requested_audits

  if [ -z "$AUDIT_FILTER" ]; then
    return 0
  fi

  IFS=',' read -r -a requested_audits <<< "$AUDIT_FILTER"
  for requested in "${requested_audits[@]}"; do
    requested="${requested//[[:space:]]/}"
    if [ "$requested" = "$name" ]; then
      return 0
    fi
  done

  return 1
}

run_audit() {
  local name="$1"
  shift
  local start_ts
  local end_ts
  local timeout_seconds
  local kill_after_seconds
  local log_path
  local status

  start_ts="$(date +%s)"
  timeout_seconds="$(audit_timeout_for "$name")"
  kill_after_seconds="$(audit_kill_after_for "$name")"
  log_path="$OUTPUT_ROOT/$name/audit.log"
  mkdir -p "$(dirname "$log_path")"
  echo "[release-checks] START $name"
  echo "[release-checks] LOG $name $log_path"

  set +e
  node tests/run_with_timeout.mjs "$timeout_seconds" "$kill_after_seconds" "$@" 2>&1 \
    | tee "$log_path" \
    | filter_audit_log
  status=${PIPESTATUS[0]}
  set -e

  end_ts="$(date +%s)"
  echo "[release-checks] END $name status=$status duration=$((end_ts - start_ts))s"

  if [ "$status" -eq 124 ]; then
    echo "[release-checks] TIMEOUT $name after ${timeout_seconds}s" >&2
  fi

  if [ "$status" -ne 0 ]; then
    echo "[release-checks] Last log lines for $name:" >&2
    tail -n "${AUDIT_FAILURE_LOG_LINES:-120}" "$log_path" | cut -c "1-${AUDIT_FAILURE_LOG_CHARS:-2000}" >&2
  fi

  return "$status"
}

SELECTED_AUDIT_COUNT=0

run_selected_audit() {
  local name="$1"
  shift

  if should_run_audit "$name"; then
    SELECTED_AUDIT_COUNT=$((SELECTED_AUDIT_COUNT + 1))
    run_audit "$name" "$@"
  else
    echo "[release-checks] SKIP $name"
  fi
}

run_selected_audit core node tests/browser_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/core"
run_selected_audit feature node tests/browser_feature_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/feature"
run_selected_audit automation-boot node tests/browser_automation_boot_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/automation-boot"
run_selected_audit map-overview-risk node tests/browser_map_overview_risk_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/map-overview-risk"
run_selected_audit ui-gallery node tests/browser_ui_gallery_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/ui-gallery"
run_selected_audit frontend-layout node tests/browser_frontend_layout_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/frontend-layout"
run_selected_audit backend-client node tests/browser_backend_client_smoke.mjs "$BASE_URL" "$OUTPUT_ROOT/backend-client"
run_selected_audit auth-ui-cloud node tests/browser_auth_ui_cloud_smoke.mjs "$BASE_URL" "$OUTPUT_ROOT/auth-ui-cloud"
run_selected_audit mobile node tests/browser_mobile_layout_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/mobile"
run_selected_audit reward-mobile node tests/browser_reward_meta_mobile_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/reward-mobile"
run_selected_audit meta node tests/browser_meta_screen_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/meta"
run_selected_audit chapter-flow node tests/browser_chapter_flow_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/chapter-flow"
run_selected_audit run-path node tests/browser_run_path_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/run-path"
run_selected_audit run-path-events node tests/browser_run_path_event_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/run-path-events"
run_selected_audit run-path-reward node tests/browser_run_path_reward_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/run-path-reward"
run_selected_audit dongfu node tests/browser_dongfu_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/dongfu"
run_selected_audit challenge node tests/browser_challenge_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/challenge"
run_selected_audit expedition node tests/browser_expedition_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/expedition"
run_selected_audit events node tests/browser_event_branch_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/events"
run_selected_audit vow-choice node tests/browser_vow_choice_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/vow-choice"
run_selected_audit guide node tests/browser_guide_modal_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/guide"
run_selected_audit inheritance node tests/browser_inheritance_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/inheritance"
run_selected_audit pvp node tests/browser_pvp_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/pvp"
run_selected_audit pvp-live node tests/browser_pvp_live_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/pvp-live"
run_selected_audit pvp-live-real node tests/browser_pvp_live_real_backend_smoke.mjs "$BASE_URL" "$OUTPUT_ROOT/pvp-live-real"
run_selected_audit pvp-live-mobile-real env BROWSER_PVP_LIVE_REAL_VIEWPORT=mobile BROWSER_PVP_LIVE_REAL_REQUIRE_MOBILE=1 node tests/browser_pvp_live_real_backend_smoke.mjs "$BASE_URL" "$OUTPUT_ROOT/pvp-live-mobile-real"
run_selected_audit pvp-mobile node tests/browser_pvp_mobile_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/pvp-mobile"
run_selected_audit pvp-mobile-result node tests/browser_pvp_mobile_result_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/pvp-mobile-result"
run_selected_audit challenge-mobile-flow node tests/browser_challenge_mobile_flow_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/challenge-mobile-flow"

if [ -n "$AUDIT_FILTER" ] && [ "$SELECTED_AUDIT_COUNT" -eq 0 ]; then
  echo "[release-checks] Audit filter did not match any audits: $AUDIT_FILTER" >&2
  exit 2
fi

if [ -z "$AUDIT_FILTER" ]; then
  run_audit summarize node tests/summarize_browser_release_reports.cjs "$OUTPUT_ROOT" "$BASE_URL"
else
  echo "[release-checks] Skipping aggregate summary for filtered run."
fi

echo "[release-checks] All browser release audits passed."
