#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-8080}"
BASE="http://127.0.0.1:${PORT}"

echo "[integration] Waiting for readiness..."
for i in {1..30}; do
  if curl -fsS "${BASE}/health/ready" >/dev/null 2>&1; then
    echo "[integration] Ready"
    break
  fi
  sleep 1
  if [[ $i -eq 30 ]]; then
    echo "[integration] Timeout waiting for readiness" >&2
    exit 1
  fi
done

curl -fsS "${BASE}/" | grep -q 'ok' || (echo 'Root endpoint failed' && exit 1)
curl -fsS "${BASE}/health/live" | grep -q 'alive' || (echo 'Live endpoint failed' && exit 1)
curl -fsS "${BASE}/health/ready" | grep -q 'ready' || (echo 'Ready endpoint failed' && exit 1)

echo "[integration] All integration checks passed"
