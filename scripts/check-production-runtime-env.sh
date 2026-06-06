#!/usr/bin/env bash
set -euo pipefail

HOST="${1:-cloud119}"
SERVICE="${SERVICE:-the-defier-backend}"

ssh "$HOST" "SERVICE='$SERVICE' bash -s" <<'REMOTE'
set -euo pipefail

SERVICE="${SERVICE:-the-defier-backend}"

if ! systemctl is-active --quiet "$SERVICE"; then
  echo "[prod-env] FAIL: $SERVICE is not active" >&2
  exit 1
fi

PID="$(systemctl show "$SERVICE" -p MainPID --value)"
if [ -z "$PID" ] || [ "$PID" = "0" ]; then
  echo "[prod-env] FAIL: $SERVICE has no running MainPID" >&2
  exit 1
fi

ENV_LINES="$(tr '\0' '\n' <"/proc/${PID}/environ")"

get_env() {
  local key="$1"
  printf '%s\n' "$ENV_LINES" | awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }'
}

get_env_length() {
  local key="$1"
  printf '%s\n' "$ENV_LINES" | awk -v key="$key" '
    index($0, key "=") == 1 {
      print length($0) - length(key) - 1
      found = 1
      exit
    }
    END {
      if (!found) print 0
    }
  '
}

fail() {
  echo "[prod-env] FAIL: $1" >&2
  exit 1
}

NODE_ENV_VALUE="$(get_env NODE_ENV)"
if [ "$NODE_ENV_VALUE" != "production" ]; then
  fail "NODE_ENV must be production"
fi
echo "[prod-env] NODE_ENV=production"

JWT_SECRET_LENGTH="$(get_env_length JWT_SECRET)"
if [ "$JWT_SECRET_LENGTH" -lt 32 ]; then
  fail "JWT_SECRET must be configured with at least 32 characters"
fi
echo "[prod-env] JWT_SECRET length >= 32"

HMAC_SECRET_LENGTH="$(get_env_length DEFIER_HMAC_SECRET)"
if [ "$HMAC_SECRET_LENGTH" -lt 32 ]; then
  fail "DEFIER_HMAC_SECRET must be configured with at least 32 characters"
fi
echo "[prod-env] DEFIER_HMAC_SECRET length >= 32"

INTEGRITY_REQUIRED_VALUE="$(get_env DEFIER_INTEGRITY_REQUIRED)"
case "$(printf '%s' "$INTEGRITY_REQUIRED_VALUE" | tr '[:upper:]' '[:lower:]')" in
  1|true|yes|on)
    echo "[prod-env] DEFIER_INTEGRITY_REQUIRED enabled"
    ;;
  *)
    fail "DEFIER_INTEGRITY_REQUIRED must be enabled"
    ;;
esac

echo "[prod-env] Runtime environment checks passed for $SERVICE."
REMOTE
