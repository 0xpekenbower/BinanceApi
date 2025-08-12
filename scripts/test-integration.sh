#!/usr/bin/env zsh
set -euo pipefail

PORT="${PORT:-8080}"
BASE="http://127.0.0.1:${PORT}"
CONTAINER_NAME="${CONTAINER_NAME:-}" # optional

echo "[integration] Ensuring dependencies installed (npm ci if node_modules missing)"
if [ ! -d node_modules ]; then
  npm ci --omit=dev >/dev/null 2>&1 || npm ci >/dev/null 2>&1 || true
fi

echo "[integration] Running unit health tests"
UNIT_STATUS=0
if command -v node >/dev/null 2>&1; then
  node ./scripts/test.js || UNIT_STATUS=$? || true
else
  echo "[integration] 'node' not found on host PATH; attempting Docker-based test run" >&2
  if command -v docker >/dev/null 2>&1; then
    NODE_IMAGE="${NODE_IMAGE:-node:24.5.0-alpine}"
    echo "[integration] Pulling ${NODE_IMAGE} (if needed) and running tests inside container" >&2
    docker run --rm -v "$(dirname "$PWD")":/workspace -w /workspace "${NODE_IMAGE}" \
      sh -c "npm ci >/dev/null 2>&1 || npm ci; node scripts/test.js" || UNIT_STATUS=$?
  else
    echo "[integration] Docker also not available; skipping unit tests (will mark as failure)" >&2
    UNIT_STATUS=127
  fi
fi
UNIT_STATUS=${UNIT_STATUS:-0}

echo "[integration] Waiting for readiness (PORT=${PORT})..."
for i in {1..30}; do
  if curl -fsS "${BASE}/health/ready" >/dev/null 2>&1; then
    echo "[integration] Ready"
    break
  fi
  sleep 1
  if [[ $i -eq 30 ]]; then
    echo "[integration] Timeout waiting for readiness" >&2
    EXIT_CODE=1
    break
  fi
done

if curl -fsS "${BASE}/health/live" | grep -q 'alive'; then :; else echo 'Live endpoint failed'; EXIT_CODE=1; fi
if curl -fsS "${BASE}/health/ready" | grep -q 'ready'; then :; else echo 'Ready endpoint failed'; EXIT_CODE=1; fi

EXIT_CODE=${EXIT_CODE:-0}
if [ "$UNIT_STATUS" -ne 0 ]; then
  echo "[integration] Unit tests failed"; EXIT_CODE=1; fi

echo "[integration] Cleaning up..." >&2
if [ -n "$CONTAINER_NAME" ]; then
  docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
fi
rm -rf node_modules || true

if [ $EXIT_CODE -eq 0 ]; then
  echo "[integration] All checks passed"; exit 0
else
  echo "[integration] Failing with code $EXIT_CODE" >&2; exit $EXIT_CODE
fi
