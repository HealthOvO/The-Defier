#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PORT="${PORT:-4173}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT}}"
OUTPUT_ROOT="${OUTPUT_ROOT:-output/release-browser-audits-local}"
LOG_FILE="${LOG_FILE:-/tmp/the-defier-vite-preview-${PORT}.log}"

echo "[local-release-gate] Running local pre-deploy checks only; this does not deploy or verify https://080305.xyz."

npm run build:pages
npm run test:frontend:budget -- dist
npm run test:node

npx vite preview --host 127.0.0.1 --port "$PORT" --strictPort --outDir .site >"$LOG_FILE" 2>&1 &
SERVER_PID="$!"

cleanup() {
  if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

for _ in $(seq 1 60); do
  if curl -fsS "$BASE_URL/" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    cat "$LOG_FILE" >&2 || true
    exit 1
  fi
  sleep 0.25
done

curl -fsS "$BASE_URL/" >/dev/null
npm run test:browser:release -- "$BASE_URL" "$OUTPUT_ROOT"
