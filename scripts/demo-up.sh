#!/bin/bash
# OmniBeat-MCP demo rig: idempotent launcher. Starts any of the 4 services
# that isn't already listening. Safe to run on a loop (cron keep-alive).
# Repo root = this script's parent dir (works from any clone location).
OB="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
V="$HOME/.cache/omnibeat-mcp/venv/bin/python"
mkdir -p "$OB/logs"

up() { curl -s -m 3 -o /dev/null "http://127.0.0.1:$1$2" 2>/dev/null; }

# CHAOS GATE (L4, 2026-10-22): by default this launcher starts the rig
# exactly as it always has — fault injection NOT armed anywhere.
# To arm the outage act, set CHAOS=1 in the environment:
#     CHAOS=1 bash scripts/demo-up.sh
# When armed: :8080 starts with --chaos (server.py then honors the
# X-Chaos-Fault header, e.g. isp_blackout via /turn's chaos_fault field)
# and :9000 starts with CHAOS_MODE=chaos_injection. CHAOS unset — or any
# other value — yields the standard unarmed rig, byte-for-byte.
# Note: arming only affects services this run actually starts; if a port
# is already up unarmed, kill it first (fuser -k <port>/tcp) and re-run.
CHAOS_8080=()
CHAOS_9000=()
if [ "${CHAOS:-}" = "1" ]; then
  CHAOS_8080=(--chaos)
  CHAOS_9000=(env CHAOS_MODE=chaos_injection)
  echo "CHAOS=1: arming fault injection (:8080 --chaos, :9000 chaos_injection)"
fi

if ! up 8080 /docs 2>/dev/null && ! curl -s -m 3 -o /dev/null http://127.0.0.1:8080/mcp 2>/dev/null; then
  cd "$OB/services/omnibeat-mcp-server"
  # No env config: server.py derives CORS from the request Origin (zero-settings).
  nohup $V src/server.py --host 127.0.0.1 --port 8080 "${CHAOS_8080[@]}" >"$OB/logs/demo-8080.log" 2>&1 &
  echo "started :8080"
fi

if ! curl -s -m 3 -o /dev/null http://127.0.0.1:9000/health 2>/dev/null; then
  cd "$OB/services/chaos-and-provider-mock"
  "${CHAOS_9000[@]}" nohup $V src/app.py --host 127.0.0.1 --port 9000 >"$OB/logs/demo-9000.log" 2>&1 &
  echo "started :9000"
fi

if ! curl -s -m 3 -o /dev/null http://127.0.0.1:4000/health 2>/dev/null; then
  cd "$OB/services/alexa-agent-orchestrator"
  MCP_SERVER_URL=http://127.0.0.1:8080/mcp \
    nohup node dist/server.js >"$OB/logs/demo-4000.log" 2>&1 &
  echo "started :4000"
fi

if ! curl -s -m 3 -o /dev/null http://127.0.0.1:3000/ 2>/dev/null; then
  cd "$OB/apps/alexa-plus-simulator"
  nohup npm run dev -- -p 3000 -H 0.0.0.0 >"$OB/logs/demo-3000.log" 2>&1 &
  echo "started :3000"
fi
echo "demo-up done"
