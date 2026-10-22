# alexa-plus-simulator — the stage (:3000)

The Next.js Alexa+ experience that hosts the demo: the voice shell, the
**Trust Card** (the MCP App receipt that shows Intent Lock's proof —
lock verdict, eliminations, live tool calls), the live wire inspector,
and the chaos switchboard. Product story: [root README](../../README.md).

## What's real vs what's simulated (no weasel words)

- **REAL:** every hop behind the stage. The browser talks to this app's
  own routes — `/api/turn` and `/api/mcp` — which proxy over real HTTP
  to the orchestrator on :4000, which calls the Intent Lock MCP server
  on :8080 as a real MCP 2025-11-25 client. The wire inspector renders
  only actual HTTP frames — never synthetic ones. BrainStatus shows
  honestly which brain answered (Gemini or the local floor).
- **SIMULATED (labeled in the UI):** the Alexa+ voice shell itself (it
  stands in for an Echo), the browser mic standing in for far-field
  audio, and ASR transcript lines tagged `SIM-ASR`.

## Run

Normal path is the repo front door (`make demo` from the repo root —
it starts all four services). Standalone:

```bash
npm install
npm run dev        # :3000
```

The orchestrator (:4000) and MCP server (:8080) must be up for turns
and the wire inspector to light up. Overrides, if you run the pieces
on other ports: `MCP_UPSTREAM` (default `http://127.0.0.1:4000/mcp`),
`MCP_FALLBACK` (default `http://127.0.0.1:8080/mcp`, used automatically
when :4000 is unreachable).

## Pointers

- Operational details for the full stack live in
  [docs/OPERATIONS.md](../../docs/OPERATIONS.md), and the project
  documentation map is [docs/INDEX.md](../../docs/INDEX.md).
- Voice-activity assets under `public/vad/` are real runtime files the
  stage loads locally — the demo's mic path works offline.
