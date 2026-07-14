#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ -z "${PORT:-}" ]; then
  PORT="$(node - <<'NODE'
const net = require('node:net');
const server = net.createServer();
server.unref();
server.once('error', error => {
  console.error(error);
  process.exit(1);
});
server.listen(0, '127.0.0.1', () => {
  const port = Number(server.address()?.port || 0);
  server.close(error => {
    if (error || !port) {
      console.error(error || new Error('failed to reserve a local release port'));
      process.exit(1);
    }
    process.stdout.write(String(port));
  });
});
NODE
)"
fi
BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT}}"
OUTPUT_ROOT="${OUTPUT_ROOT:-output/release-browser-audits-local}"
LOG_FILE="${LOG_FILE:-/tmp/the-defier-vite-preview-${PORT}.log}"
LOCAL_RELEASE_RUN_ID="${LOCAL_RELEASE_RUN_ID:-local-release-$(date +%s)-$$}"
PROBE_PATH=".site/.release-probe.txt"

echo "[local-release-gate] Running local pre-deploy checks only; this does not deploy or verify https://080305.xyz."

npm run build:pages
npm run test:frontend:budget -- dist
npm run test:node

printf '%s' "$LOCAL_RELEASE_RUN_ID" >"$PROBE_PATH"

npx vite preview --host 127.0.0.1 --port "$PORT" --strictPort --outDir .site >"$LOG_FILE" 2>&1 &
SERVER_PID="$!"

cleanup() {
  rm -f "$PROBE_PATH"
  if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

PREVIEW_READY=0
for _ in $(seq 1 60); do
  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    cat "$LOG_FILE" >&2 || true
    exit 1
  fi
  if [ "$(curl -fsS "$BASE_URL/.release-probe.txt" 2>/dev/null || true)" = "$LOCAL_RELEASE_RUN_ID" ]; then
    PREVIEW_READY=1
    break
  fi
  sleep 0.25
done

if [ "$PREVIEW_READY" -ne 1 ] || ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
  echo "[local-release-gate] Local preview identity probe failed for $BASE_URL." >&2
  cat "$LOG_FILE" >&2 || true
  exit 1
fi

npm run test:browser:release -- "$BASE_URL" "$OUTPUT_ROOT"
