#!/usr/bin/env bash
set -euo pipefail

HOST="${1:-cloud119}"
BASE_URL="${2:-https://080305.xyz}"
SERVICE="${SERVICE:-the-defier-backend}"
REMOTE_WEB_ROOT="${REMOTE_WEB_ROOT:-/www/wwwroot}"
REMOTE_BACKEND_DIR="${REMOTE_BACKEND_DIR:-/www/server/the-defier-backend}"

echo "[prod-read] Checking $BASE_URL on $HOST without writing production data."

ROOT_HEADERS="$(curl -fsSI "$BASE_URL/")"
printf '%s\n' "$ROOT_HEADERS" | awk '
  BEGIN { status = ""; content_length = ""; modified = "" }
  /^HTTP\// { status = $0 }
  /^Content-Length:/ { content_length = $0 }
  /^Last-Modified:/ { modified = $0 }
  END {
    print "[prod-read] " status
    if (content_length != "") print "[prod-read] " content_length
    if (modified != "") print "[prod-read] " modified
  }
'

HEALTH_JSON="$(curl -fsS "$BASE_URL/api/health")"
case "$HEALTH_JSON" in
  *'"status":"ok"'*)
    echo "[prod-read] Public API health ok"
    ;;
  *)
    echo "[prod-read] FAIL: unexpected public API health payload: $HEALTH_JSON" >&2
    exit 1
    ;;
esac

ssh "$HOST" "SERVICE='$SERVICE' REMOTE_WEB_ROOT='$REMOTE_WEB_ROOT' REMOTE_BACKEND_DIR='$REMOTE_BACKEND_DIR' bash -s" <<'REMOTE'
set -euo pipefail

echo "[prod-read] Host: $(hostname)"

if ! systemctl is-active --quiet "$SERVICE"; then
  echo "[prod-read] FAIL: $SERVICE is not active" >&2
  exit 1
fi
echo "[prod-read] Service active: $SERVICE"

NGINX_OUTPUT="$(nginx -t 2>&1)"
printf '%s\n' "$NGINX_OUTPUT" | sed 's/^/[prod-read] /'

LOCAL_HEALTH="$(curl -fsS http://127.0.0.1:9000/api/health)"
case "$LOCAL_HEALTH" in
  *'"status":"ok"'*)
    echo "[prod-read] Local backend health ok"
    ;;
  *)
    echo "[prod-read] FAIL: unexpected local backend health payload: $LOCAL_HEALTH" >&2
    exit 1
    ;;
esac

stat -c '[prod-read] %n|%s|%y' \
  "$REMOTE_WEB_ROOT/index.html" \
  "$REMOTE_BACKEND_DIR/app.js" \
  "$REMOTE_BACKEND_DIR/routes/saves.js"

if grep -R -q global_updated_at "$REMOTE_BACKEND_DIR"; then
  echo "[prod-read] Backend contains global_updated_at migration"
else
  echo "[prod-read] WARN: Backend does not contain global_updated_at migration"
fi

if grep -R -q verifyRequestIntegrity "$REMOTE_BACKEND_DIR"; then
  echo "[prod-read] Backend contains current verifyRequestIntegrity call sites"
else
  echo "[prod-read] WARN: Backend does not contain current verifyRequestIntegrity call sites"
fi
REMOTE

echo "[prod-read] Read-only production checks finished."
