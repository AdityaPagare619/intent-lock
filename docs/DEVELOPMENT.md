# Development

This is the contributor map for the Intent Lock repository. It shows
where each part lives, how a change should move from design to proof,
and the conventions already present in the tree.

## Repository map

```text
apps/
  alexa-plus-simulator/       Next.js stage on :3000
services/
  omnibeat-mcp-server/        Intent Lock MCP server on :8080
  alexa-agent-orchestrator/   Host-side orchestrator on :4000
  chaos-and-provider-mock/    Provider mock and fault harness on :9000
packages/
  polyglot-phonetic-judo/     Standalone phonetic-grounding package
scripts/                      Bootstrap and demo launchers (.sh and .ps1)
deploy/
  hf-spaces/                  All-in-one Docker image and supervisord config
docs/                         Spec, guides, evidence, and project records
```

### The simulator — `apps/alexa-plus-simulator/`

- `app/` — Next.js pages and API routes. `/api/mcp` and `/api/turn`
  proxy over HTTP; `/api/brain` exposes the orchestrator health probe.
- `components/` — the stage, Trust Card, wire inspector, chaos
  switchboard, and related UI components.
- `lib/` — MCP client/session handling, demo flow, personas, and UI
  state.
- `workers/` — browser-side audio, extraction, and synchronization
  workers.
- `public/` — local hooks and voice-activity assets used by the stage.

### The MCP server — `services/omnibeat-mcp-server/`

This is the product's center.

- `src/server.py` — FastAPI application, the `/mcp` endpoint,
  hand-rolled JSON-RPC handling, sessions, and `/health`.
- `src/engines/intent_lock.py` — the Intent Lock pipeline's kernel.
- `src/engines/phonetic_judo.py` and `src/engines/phonetic_ipa.py` —
  articulatory and phonetic grounding.
- `src/engines/reconstructor.py`, `fastpath_yap.py`,
  `studio_pure_guard.py`, `truth_ledger.py`, and
  `edgesync_bunker.py` — supporting and legacy-substrate engines.
- `src/sublocal_grammar.json` — the operator grammar as data.
- `src/catalog_snapshot.json`, `src/catalog_pack_commerce.json`, and
  `src/catalog_pack_grocery.json` — audited catalog supply.
- `requirements.txt` — the Python service's pinned dependencies.

### The orchestrator — `services/alexa-agent-orchestrator/`

- `src/server.ts` — HTTP server, `/health`, `/turn`, and `/mcp`
  passthrough.
- `src/mcpClient.ts` — the MCP client used to call the server.
- `src/router.ts` — turn routing and the deterministic local floor.
- `src/brain/` — host-brain integration and provider selection.
- `scripts/gemini_extract.py` — the extraction helper used when a
  Gemini credential is available.

The orchestrator imports nothing from the MCP server. Their boundary
is a real MCP-over-HTTP call.

### The chaos mock — `services/chaos-and-provider-mock/`

- `src/app.py` — FastAPI routes, modes, and fault behavior.
- `src/mock_catalog.py` — the 30-track collision catalog.
- `audio_hooks/` — documentation for the synthetic hook assets.

### The phonetic package — `packages/polyglot-phonetic-judo/`

- `src/index.ts` — the ranking and phonetic pipeline.
- `src/catalog.ts` — the package form of the collision catalog.
- `src/hooks.ts` — preview and hook helpers.
- `sidecar.js` — the long-lived Node stdio sidecar used by the Python
  server.
- `test/` — the package test suite.

## How a change flows

### 1. Start with the contract

For behavior or wire changes, begin in
[12_INTENT_LOCK_SPEC.md](12_INTENT_LOCK_SPEC.md) and the affected
service's README. State the intended contract before changing code.
If the change reverses a recorded decision, update
[DECISION_LOG.md](DECISION_LOG.md) as part of the same change.

Keep the architectural boundary intact:

- The host may parse and propose.
- The MCP server verifies against catalog data.
- Raw user words handled by the server outrank advisory extraction.
- No model runs inside the MCP server.

### 2. Put the change in the owning layer

| Kind of change | Owning place |
| --- | --- |
| Tool schema, verdict, elimination, or pin behavior | Spec first, then `services/omnibeat-mcp-server/src/server.py` and `src/engines/intent_lock.py` |
| Operator or locale behavior | `src/sublocal_grammar.json` when the existing operator model is sufficient; kernel code only when the model itself changes |
| Catalog rows or domain packs | The relevant JSON supply file, preserving each row's provenance |
| Host extraction or turn routing | `services/alexa-agent-orchestrator/` |
| Stage or Trust Card presentation | `apps/alexa-plus-simulator/` |
| Provider failure behavior | `services/chaos-and-provider-mock/` and the affected consumer |
| Phonetic ranking shared with the package | `packages/polyglot-phonetic-judo/`, then verify the server's sidecar path |
| Startup, ports, health, or deployment | `scripts/`, `Makefile`, `docker-compose.yml`, `deploy/`, and [OPERATIONS.md](OPERATIONS.md) |

### 3. Verify at the smallest level first

Use the checks that already exist for the touched component:

```bash
# Compose model
make config

# Phonetic package
(cd packages/polyglot-phonetic-judo && npm test && npm run build)

# Orchestrator
(cd services/alexa-agent-orchestrator && npm run build)

# Simulator
(cd apps/alexa-plus-simulator && npm run typecheck && npm run build)
```

For a Python service, install its pinned requirements in the project
environment, start the service by the command in its README, and
record the result of its `/health` route:

```bash
curl -fsS http://127.0.0.1:8080/health
curl -fsS http://127.0.0.1:9000/health
```

### 4. Run the integrated proof

Start the full stack by the method in [OPERATIONS.md](OPERATIONS.md),
then work through the acceptance areas in [TESTING.md](TESTING.md)
that the change touches:

- kernel verification cases;
- replay behavior for previously wrong locks;
- guarantee-survival claims;
- saboteur and malformed-input behavior;
- the demo beats through the real host path;
- a clean rig with no leftover runtime rules or state.

`TESTING.md` is the acceptance contract and the record of the final
gate. If a result changes, update the evidence there rather than
describing a different result in a pull request alone.

### 5. Update the map

A change is not complete until its documentation still describes the
tree:

- Add or rename a document → update [INDEX.md](INDEX.md).
- Change an endpoint, environment variable, or run command → update
  the service README and [OPERATIONS.md](OPERATIONS.md) when operator
  behavior changes.
- Change a public claim → keep the README, spec, and testing evidence
  consistent with one another.

## Conventions in this tree

- **TypeScript is strict.** The simulator, orchestrator, and phonetic
  package all enable strict TypeScript. The browser and package code
  use ES modules; the orchestrator uses NodeNext module resolution.
- **npm is the Node package manager.** Lockfiles are committed, and
  bootstrap uses `npm ci` for the orchestrator and simulator.
- **Python services keep entry points in `src/`.** Their dependencies
  are pinned in each service's `requirements.txt`.
- **Process boundaries stay real.** Cross-service behavior goes over
  HTTP/MCP, not through source imports that would hide the boundary.
- **Configuration is data where the design says so.** Locale and
  operator additions belong in `sublocal_grammar.json`; catalog supply
  belongs in the audited JSON packs.
- **Generated and runtime files are not source.** `node_modules/`,
  `dist/`, `.next/`, logs, SQLite databases, and local environment
  files are ignored. Do not commit them.
- **Comments explain non-obvious contracts.** Existing code records
  decision identifiers and failure lessons where a future reader would
  otherwise repeat them. Preserve that context when replacing code.
