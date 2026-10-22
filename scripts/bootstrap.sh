#!/bin/bash
# OmniBeat-MCP bootstrap — zero-settings law.
# One script takes a fresh shell from nothing to "ready to run the demo":
#   ./scripts/bootstrap.sh && make demo
# Idempotent: safe to run twice, ten times, on a cron loop. Never prompts.
set -u
# Repo root = this script's parent dir. NEVER hardcode an absolute path:
# a fresh clone must work wherever it lands (judge laptop, Codespace, CI).
OB="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="$HOME/.cache/omnibeat-mcp/venv"
PASS=0; FAIL=0

ok()   { echo "  [ok] $1"; PASS=$((PASS+1)); }
warn() { echo "  [!!] $1"; FAIL=$((FAIL+1)); }
soft() { echo "  [!!] $1 (optional — not blocking readiness)"; }

echo "== OmniBeat-MCP bootstrap =="

# --- 0. Preflight (J-01/B4, from J-03's Windows/macOS verdict): tools the
# quickstart needs but nothing installs for you. Detection + the exact human
# fix, never a silent or cryptic failure. On stock WSL2 Ubuntu, python3-venv
# and make are NOT installed by default.
APT_HINT="sudo apt install -y"
[ -f /etc/debian_version ] || APT_HINT="install via your OS package manager:"
command -v python3 >/dev/null 2>&1 && ok "python3 present" \
  || warn "python3 not found — $APT_HINT python3"
if python3 -c "import ensurepip" >/dev/null 2>&1; then
  ok "python3 venv support (ensurepip)"
else
  warn "python3-venv missing — 'python3 -m venv' will fail. Fix: $APT_HINT python3-venv"
fi
command -v make >/dev/null 2>&1 && ok "make present" \
  || warn "make not found — the quickstart's 'make demo' step needs it. Fix: $APT_HINT make"
command -v curl >/dev/null 2>&1 && ok "curl present" \
  || warn "curl not found — service health checks need it. Fix: $APT_HINT curl"
command -v jq >/dev/null 2>&1 && ok "jq present" \
  || soft "jq not found — needed only for 'make verify' (the wire proof). Fix: $APT_HINT jq"

# --- 1. Python venv (ephemeral /tmp venvs are banned; this one is durable) ---
if [ ! -x "$VENV/bin/python" ]; then
  echo "-- creating venv at $VENV"
  python3 -m venv "$VENV" || { echo "FATAL: python3 -m venv failed"; exit 1; }
fi
"$VENV/bin/python" -c "import sys; assert sys.version_info >= (3,10)" \
  && ok "venv python $( "$VENV/bin/python" -c 'import sys; print(".".join(map(str,sys.version_info[:3])))' )" \
  || warn "venv python < 3.10 (may still work, untested)"

for svc in omnibeat-mcp-server chaos-and-provider-mock; do
  req="$OB/services/$svc/requirements.txt"
  if [ -f "$req" ]; then
    # pip output goes to a log and its tail is SHOWN on failure (J-01) —
    # previously it went to /dev/null while the fastapi check below told
    # the user to "check pip output above". There was no output above.
    mkdir -p "$OB/logs"
    if "$VENV/bin/pip" install -q -r "$req" >"$OB/logs/pip-$svc.log" 2>&1; then
      ok "$svc requirements installed"
    else
      warn "$svc pip install failed — last lines of logs/pip-$svc.log:"
      tail -n 4 "$OB/logs/pip-$svc.log" | sed 's/^/      /'
    fi
  else
    # Never skip silently (J-01): a missing requirements file means the
    # tree is incomplete — say so and let readiness go red.
    warn "$svc requirements.txt NOT FOUND at $req — tree incomplete?"
  fi
done
"$VENV/bin/python" -c "import fastapi, uvicorn; print(fastapi.__version__)" >/dev/null 2>&1 \
  && ok "fastapi+uvicorn importable in venv" \
  || warn "fastapi/uvicorn NOT importable — check pip output above"

# --- 2. Node toolchain ---
if command -v node >/dev/null 2>&1; then
  NODEV=$(node -p 'process.versions.node')
  [ "${NODEV%%.*}" -ge 20 ] && ok "node $NODEV (>=20)" || warn "node $NODEV < 20 (orchestrator needs >=20)"
else
  warn "node not found — install Node 20+ (https://nodejs.org), then rerun"
fi
command -v npm >/dev/null 2>&1 && ok "npm $(npm --version)" || warn "npm not found"
command -v npx >/dev/null 2>&1 && ok "npx present" || warn "npx not found"

# --- 2.5. Phonetic package (E1 sidecar) — dist/ is gitignored, so a fresh
# clone has NO compiled sidecar: server.py would boot with E1 silently
# degraded to the stub scorer. Build it here so the quickstart is whole.
PKG="$OB/packages/polyglot-phonetic-judo"
if [ ! -f "$PKG/dist/index.js" ]; then
  echo "-- building polyglot-phonetic-judo (tsc; first run only)"
  mkdir -p "$OB/logs"
  if ( cd "$PKG" && npm install --no-audit --no-fund >"$OB/logs/npm-phonetic.log" 2>&1 && npm run build >>"$OB/logs/npm-phonetic.log" 2>&1 ); then
    ok "phonetic package built (dist/index.js)"
  else
    warn "phonetic package build failed — E1 sidecar will run DEGRADED (stub scorer); last lines of logs/npm-phonetic.log:"
    tail -n 4 "$OB/logs/npm-phonetic.log" | sed 's/^/      /'
  fi
else
  ok "phonetic package dist present"
fi
[ -f "$PKG/sidecar.js" ] && ok "E1 sidecar.js present" || warn "sidecar.js missing from package"

# --- 3. Orchestrator (:4000) — needs node_modules + tsc build ---
ORCH="$OB/services/alexa-agent-orchestrator"
if [ ! -d "$ORCH/node_modules" ]; then
  echo "-- npm ci in orchestrator (first run only)"
  mkdir -p "$OB/logs"
  if ( cd "$ORCH" && npm ci --no-audit --no-fund >"$OB/logs/npm-orchestrator.log" 2>&1 ); then
    ok "orchestrator deps installed"
  else
    warn "orchestrator npm ci failed — last lines of logs/npm-orchestrator.log:"
    tail -n 4 "$OB/logs/npm-orchestrator.log" | sed 's/^/      /'
  fi
else
  ok "orchestrator node_modules present"
fi
if [ ! -f "$ORCH/dist/server.js" ]; then
  echo "-- building orchestrator (tsc)"
  ( cd "$ORCH" && ./node_modules/.bin/tsc -p tsconfig.json ) \
    && ok "orchestrator built (dist/server.js)" \
    || warn "orchestrator tsc build failed"
else
  ok "orchestrator dist/server.js present"
fi

# --- 4. Simulator (:3000) — needs node_modules ---
SIM="$OB/apps/alexa-plus-simulator"
if [ ! -d "$SIM/node_modules" ]; then
  echo "-- npm ci in simulator (first run only; this one is big)"
  mkdir -p "$OB/logs"
  if ( cd "$SIM" && npm ci --no-audit --no-fund >"$OB/logs/npm-simulator.log" 2>&1 ); then
    ok "simulator deps installed"
  else
    warn "simulator npm ci failed — last lines of logs/npm-simulator.log:"
    tail -n 4 "$OB/logs/npm-simulator.log" | sed 's/^/      /'
  fi
else
  ok "simulator node_modules present"
fi
[ -x "$SIM/node_modules/.bin/next" ] \
  && ok "next.js binary present" \
  || warn "next binary missing — simulator deps incomplete"

# --- 5. Readiness checklist ---
echo ""
echo "== readiness =="
echo "  passed: $PASS   failed: $FAIL"
if [ "$FAIL" -eq 0 ]; then
  echo "  READY — setup complete; the demo launches with:  make demo"
  echo "  then open http://localhost:3000"
else
  echo "  NOT READY — fix the [!!] lines above, then rerun (safe to repeat)."
  exit 1
fi
