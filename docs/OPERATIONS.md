# Operations

This guide covers the local four-service stack, its container paths,
health checks, configuration, and the failures an operator is most
likely to meet. The root [README](../README.md) is the quickstart;
platform-specific setup lives in [INSTALL_MACOS.md](INSTALL_MACOS.md)
and [INSTALL_WINDOWS.md](INSTALL_WINDOWS.md).

## Service map

The services are separate processes and communicate over HTTP.

| Port | Service | Directory | Role |
| --- | --- | --- | --- |
| 3000 | Alexa+ simulator | `apps/alexa-plus-simulator/` | Next.js stage, Trust Card UI, wire inspector, and browser API routes |
| 4000 | Alexa agent orchestrator | `services/alexa-agent-orchestrator/` | Host-side extraction and routing; a real MCP client to the server |
| 8080 | Intent Lock MCP server | `services/intent-lock-server/` | The deterministic MCP 2025-11-25 server and `intent_lock` tool |
| 9000 | Chaos and provider mock | `services/chaos-and-provider-mock/` | Provider stand-in and fault-injection harness |

The normal request chain is browser → simulator `:3000` →
orchestrator `:4000` → MCP server `:8080`. The simulator can fall back
to `:8080` when its configured orchestrator upstream is unreachable.
The chaos service is an independently operated test harness.

## Start and stop

### POSIX shell

The front door installs dependencies, builds the pieces that need a
build, starts the stack, and waits for all four services:

```bash
./scripts/bootstrap.sh
make demo
```

To separate setup from startup:

```bash
./scripts/bootstrap.sh
./scripts/demo-up.sh
```

`demo-up.sh` is idempotent: it starts only services that are not
already answering. Stop the no-Docker stack with:

```bash
./scripts/demo-down.sh
# or
make stop
```

POSIX logs are written under `logs/` as `demo-<port>.log`.

### Windows PowerShell

Use the native equivalents:

```powershell
.\scripts\bootstrap.ps1
.\scripts\demo-up.ps1
.\scripts\demo-down.ps1
```

The PowerShell launcher writes `logs\demo-<port>.log` and
`logs\demo-<port>.err.log`. It waits for all four health probes before
reporting success.

### Port variables

The PowerShell launchers and the POSIX stop script read these
variables:

| Variable | Default |
| --- | --- |
| `INTENT_LOCK_SIM_PORT` | `3000` |
| `INTENT_LOCK_ORCH_PORT` | `4000` |
| `INTENT_LOCK_MCP_PORT` | `8080` |
| `INTENT_LOCK_CHAOS_PORT` | `9000` |

The POSIX `demo-up.sh` starts the four default ports shown in the
service map. When services are started manually on different ports,
also set the corresponding service URL variables below so callers
point at the new listeners.

## Health checks

The project exposes `/health` on the three backend services. There is
no separate `/healthz` route in this tree. The simulator is checked at
its root page and exposes an application-level brain probe.

| Check | Expected response |
| --- | --- |
| `GET http://127.0.0.1:8080/health` | JSON with `status: "ok"`, `server: "intent-lock-server"`, `version: "0.1.0"`, `protocol: "2025-11-25"`, and a Boolean `chaos_mode` |
| `GET http://127.0.0.1:4000/health` | JSON with `status: "ok"`, the orchestrator service and version, a `brain` description, `protocol: "2025-11-25"`, `mcp_server_url`, an `mcp` object with `reachable` and, when available, `protocol`, plus the active cost/credential route |
| `GET http://127.0.0.1:9000/health` | JSON with `status: "ok"`, `service: "chaos-and-provider-mock"`, `version: "0.1.0"`, the active `mode`, `catalog_tracks: 30`, and `protocol: "http-json"` |
| `GET http://127.0.0.1:3000/` | The simulator page with a successful HTTP response |
| `GET http://127.0.0.1:3000/api/brain` | A JSON wrapper with `ok: true` and the orchestrator health body under `health`; use `health.mcp.reachable` to distinguish an orchestrator failure from an MCP-server failure |

Quick POSIX check:

```bash
curl -fsS http://127.0.0.1:8080/health
curl -fsS http://127.0.0.1:4000/health
curl -fsS http://127.0.0.1:9000/health
curl -fsS http://127.0.0.1:3000/ >/dev/null
```

A process merely holding a TCP port is not proof that the intended
service is healthy. Confirm the service identity in the `/health`
body before debugging application behavior.

## Configuration

Configuration is supplied through the environment. Start from
[.env.example](../.env.example); do not put a real key in that file or
commit one.

### Host-brain extraction

| Variable | Meaning |
| --- | --- |
| `GEMINI_API_KEY` | Optional. When present in the environment, the orchestrator's extraction helper calls Gemini directly. When absent, extraction uses the deterministic local floor and the UI labels that fallback. |
| `GEMINI_MODEL` | Optional primary-model override. |
| `GEMINI_EXTRACT_TIMEOUT_S` | Optional per-attempt timeout; the example default is 20 seconds. |
| `GEMINI_EXTRACT_BUDGET_S` | Optional whole-ladder budget; the example default is 55 seconds. |

The MCP server itself needs no API key and runs no model.

### Service wiring

| Variable | Used by | Meaning |
| --- | --- | --- |
| `MCP_SERVER_URL` | Orchestrator | MCP endpoint, normally `http://127.0.0.1:8080/mcp` locally |
| `MCP_UPSTREAM` | Simulator | Primary `/mcp` upstream, normally the orchestrator at `:4000` |
| `MCP_FALLBACK` | Simulator | Fallback `/mcp` upstream, normally the MCP server at `:8080` |
| `BRAIN_HEALTH_URL` | Simulator | Optional override for the orchestrator health URL used by `/api/brain` |
| `PORT` | Orchestrator | Listening port; the service default is 4000. The all-in-one container's supervisor also passes the platform `PORT` to the simulator start command. |

### Fault injection and local state

`CHAOS_MODE` has service-specific vocabularies; do not interchange
them.

- In the POSIX demo launcher, `CHAOS=1 ./scripts/demo-up.sh` starts
  the MCP server with `--chaos` and starts the chaos mock with
  `CHAOS_MODE=chaos_injection`. Arming affects services started by
  that run; stop an already-running unarmed service first.
- In Docker Compose, `MCP_CHAOS_MODE=1` is mapped to the MCP server's
  `CHAOS_MODE=1`; the chaos mock uses `CHAOS_MODE=live_hybrid` or
  `CHAOS_MODE=chaos_injection`.
- `SQLITE_LEDGER_PATH` selects the MCP server's ledger database.
  Compose sets it to `/data/ledger.sqlite` on the named volume; the
  local server uses its service-local database default.
- `AUTH_MODE=demo` enables the server's demo-only OAuth stand-in. It
  is off by default and is not needed for the normal stack.

## Clean-demo rule

Before starting a clean demo, confirm that this runtime file is
absent:

```text
services/intent-lock-server/src/intent_rules.json
```

POSIX check:

```bash
test ! -e services/intent-lock-server/src/intent_rules.json
```

The MCP server loads standing rules from that path. If the file is
present, stop the stack, remove the runtime file, and start again;
otherwise rules from an earlier session can affect the new demo.

## Docker Compose path

`docker-compose.yml` defines the same four services, their ports,
health checks, and startup dependencies. The orchestrator waits for a
healthy MCP server; the simulator waits for a healthy orchestrator.

```bash
make config       # validate the Compose model without starting it
make dev          # build and run in the foreground
make demo-compose # build, start detached, and wait for health
make logs         # follow all service logs
make down         # stop and keep the ledger volume
make clean        # stop and delete the ledger volume
```

Direct equivalents use `docker compose` from the repository root.

## Troubleshooting

| Symptom | Likely cause | Action |
| --- | --- | --- |
| `:8080` is not ready immediately after `demo-up` starts it | The MCP server can take about 20 seconds to boot | Wait, then repeat `curl -fsS http://127.0.0.1:8080/health`; inspect `logs/demo-8080.log` if it still fails |
| A launcher says a port is up, but the application is wrong | Another process owns the port; a response alone does not identify the service | Read the `/health` body, stop the owner or use the documented port overrides, then restart |
| `demo-down.sh` cannot stop a port | `fuser` is unavailable, or the listener belongs to another process | Install `psmisc` for `fuser`, or stop the identified listener manually; on Windows use `demo-down.ps1` |
| Orchestrator health is `ok`, but turns cannot reach the tool | Its nested `mcp.reachable` value is false | Check `:8080/health` and `MCP_SERVER_URL`; restart the MCP server before restarting the whole stack |
| Simulator loads, but the wire view stays dark | Orchestrator or MCP server is down, or the simulator's upstream points elsewhere | Check `:3000/api/brain`, `MCP_UPSTREAM`, `MCP_FALLBACK`, and both backend health routes |
| Turns work, but the UI names the local floor | No `GEMINI_API_KEY` reached the orchestrator process | This is the supported keyless mode. To use Gemini, export the key in the same shell, stop the stack, and start it again |
| Fault headers have no effect | The relevant service was not started in armed mode | Stop the stack and start it with `CHAOS=1` on POSIX, or use the Compose chaos settings above |
| Standing rules fire in a supposedly clean demo | `services/intent-lock-server/src/intent_rules.json` exists | Follow the clean-demo rule above |
| Bootstrap reports a missing phonetic or orchestrator build | A fresh clone has no generated `dist/` output | Rerun the platform bootstrap; it builds `packages/polyglot-phonetic-judo` and `services/alexa-agent-orchestrator` |
| Python or Node is rejected during bootstrap | The project requires Python 3.10+ and Node 20+ | Install a supported runtime, open a fresh shell, and rerun bootstrap |
| Compose services never become healthy | A container failed its own `/health` probe | Run `docker compose ps`, inspect `docker compose logs`, and compare the failing service with the health table above |
