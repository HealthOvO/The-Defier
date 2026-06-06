#!/usr/bin/env bash
set -euo pipefail

HOST="${HOST:-cloud119}"
BASE_URL="${BASE_URL:-https://080305.xyz}"
WEB_ROOT="${WEB_ROOT:-/www/wwwroot}"
BACKEND_DIR="${BACKEND_DIR:-/www/server/the-defier-backend}"
BACKUP_DIR="${BACKUP_DIR:-/www/backup/the-defier}"
SERVICE="${SERVICE:-the-defier-backend}"
OUTPUT_ROOT="${OUTPUT_ROOT:-output/release-browser-audits-prod}"

if [ "${CONFIRM_PROD_DEPLOY:-}" != "1" ]; then
  cat >&2 <<EOF
[prod-deploy] Refusing to deploy without CONFIRM_PROD_DEPLOY=1.
[prod-deploy] This script writes to $HOST:$WEB_ROOT and $HOST:$BACKEND_DIR, creates remote backups, and restarts $SERVICE.
[prod-deploy] Example:
  CONFIRM_PROD_DEPLOY=1 CONFIRM_PROD=1 npm run deploy:prod
EOF
  exit 2
fi

if [ "${CONFIRM_PROD:-}" != "1" ]; then
  cat >&2 <<EOF
[prod-deploy] Refusing to run production API smoke without CONFIRM_PROD=1.
[prod-deploy] The API smoke creates smoke_* users and writes save/global/ghost test data to $BASE_URL.
EOF
  exit 2
fi

echo "[prod-deploy] Running local release gate before production sync."
npm run test:release:local

echo "[prod-deploy] Creating remote backups on $HOST."
ssh "$HOST" "BACKUP_DIR='$BACKUP_DIR' WEB_ROOT='$WEB_ROOT' BACKEND_DIR='$BACKEND_DIR' bash -s" <<'REMOTE'
set -euo pipefail
mkdir -p "$BACKUP_DIR"
stamp="$(date +%Y%m%d_%H%M%S)"
tar -C "$(dirname "$WEB_ROOT")" -czf "$BACKUP_DIR/wwwroot_${stamp}.tar.gz" "$(basename "$WEB_ROOT")"
tar --exclude="node_modules" --exclude="db/*.sqlite" --exclude="db/*.sqlite-*" --exclude="backend.log" \
  -C "$(dirname "$BACKEND_DIR")" -czf "$BACKUP_DIR/backend_${stamp}.tar.gz" "$(basename "$BACKEND_DIR")"
echo "[prod-deploy] Frontend backup: $BACKUP_DIR/wwwroot_${stamp}.tar.gz"
echo "[prod-deploy] Backend backup: $BACKUP_DIR/backend_${stamp}.tar.gz"
REMOTE

echo "[prod-deploy] Syncing frontend artifact to $HOST:$WEB_ROOT/."
rsync -az .site/ "$HOST:$WEB_ROOT/"

echo "[prod-deploy] Syncing backend code to $HOST:$BACKEND_DIR/."
rsync -az --delete \
  --exclude='node_modules/' \
  --exclude='db/*.sqlite' \
  --exclude='db/*.sqlite-*' \
  --exclude='backend.log' \
  server/ "$HOST:$BACKEND_DIR/"

echo "[prod-deploy] Restarting $SERVICE and checking nginx syntax."
ssh "$HOST" "SERVICE='$SERVICE' bash -s" <<'REMOTE'
set -euo pipefail
systemctl restart "$SERVICE"
systemctl is-active "$SERVICE"
nginx -t
REMOTE

echo "[prod-deploy] Running production read-only checks."
npm run test:prod:read -- "$HOST" "$BASE_URL"

echo "[prod-deploy] Running production runtime environment checks."
npm run test:prod:env -- "$HOST"

echo "[prod-deploy] Running production API smoke."
CONFIRM_PROD=1 npm run test:prod:api -- "$BASE_URL"

echo "[prod-deploy] Running browser release audit against production domain."
BASE_URL="$BASE_URL" npm run test:browser:release -- "$BASE_URL" "$OUTPUT_ROOT"

echo "[prod-deploy] Production deployment and verification passed for $BASE_URL."
