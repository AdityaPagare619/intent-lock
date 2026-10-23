#!/bin/bash
# Intent Lock demo stopper for the no-Docker path: kills whatever
# listens on the four demo ports. Guarded and idempotent — a port with
# no listener is a no-op, and the script exits 0 either way. (The
# compose path has its own stop: `make down`.)
set -u

if ! command -v fuser >/dev/null 2>&1; then
  echo "demo-down: 'fuser' not found (package: psmisc) — stop the four"
  echo "demo processes listening on :3000 :4000 :8080 :9000 manually."
  exit 1
fi

for port in "${INTENT_LOCK_SIM_PORT:-3000}" "${INTENT_LOCK_ORCH_PORT:-4000}" \
            "${INTENT_LOCK_MCP_PORT:-8080}" "${INTENT_LOCK_CHAOS_PORT:-9000}"; do
  if fuser "$port/tcp" >/dev/null 2>&1; then
    fuser -k "$port/tcp" >/dev/null 2>&1 && echo "stopped :$port" \
      || echo "could not stop :$port"
  else
    echo ":$port not running"
  fi
done
echo "demo-down done"
