# alexa-agent-orchestrator — the host brain's home (:4000)

A standalone Node.js/TypeScript service: the Alexa+ **host** as its own
process. It borrows the brain and owns none of the guarantee — every
turn arrives as HTTP, and the one tool call that matters leaves as a
real MCP 2025-11-25 JSON-RPC frame to the Intent Lock server on :8080.
Nothing is imported from the server; everything is a network call.
Product story: [root README](../../README.md).

## How a turn works

1. **Extraction (borrowed brain, advisory only).** For play turns,
   Gemini parses the raw utterance into a small advisory structure —
   title hint, include/exclude tags, an optional voice rule — via
   `scripts/gemini_extract.py`. The model ladder is fixed:
   `gemini-3-flash-preview`, fallback `gemini-3.1-flash-lite`.
2. **Verification (the guarantee).** The extraction is sanitized and
   sent in ONE `intent_lock` call. The server re-reads the raw words
   itself and verifies everything against real catalog rows.
3. **Floor (always answers).** If extraction fails, times out, or no
   credential is available, the deterministic local floor
   (`localExtract` in `src/router.ts`) produces the extraction instead.
   A turn never fails because a model did; the response's
   `extraction_source` says honestly which brain answered
   (`gemini` or `local-floor`), and the simulator's BrainStatus shows it.

### Where the Gemini credential comes from

First match wins, both handled inside `scripts/gemini_extract.py`:

- **`GEMINI_API_KEY` set in the environment** → the helper calls the
  Gemini API directly with that key (request header only — the key is
  never printed, logged, or written to a file). See the repo-root
  `.env.example`.
- **No env key** → the vaulted `custom.gemini` connector's
  dynamic-credential surrogate route (the development machine's path).
- **Neither** → the helper reports no-key and the local floor serves.
  The demo still boots and locks, with BrainStatus showing the fallback.

The MCP server itself needs no key and calls no model — ever.

## Endpoints

| Method | Path | What |
|---|---|---|
| GET | `/health` | Liveness + :8080 reachability probe + which brain/credential route is active |
| POST | `/turn` | One orchestrated turn → `{path, brain, response_text, chunks, mcp, timings, extraction_source, …}` |
| POST/GET/DELETE | `/mcp` | Transparent passthrough to the MCP server (for the simulator's wire inspector) |

Turn request: `{utterance, locale_hint?, session_id?, host_time?,
domain?, pending_id?, input_responses?, pin?, reject?, chaos_fault?}`
(or the `X-Chaos-Fault` header). `host_time` is the host device clock
(`HH:MM`), forwarded to `intent_lock` as `_meta.host_time` — standing
voice rules are judged against the host's clock, never the server's.

Reflex turns (stop / barge / resume), challenges, and elicitation
follow-ups never wait for a model — they go straight to the router.
Legacy decision providers (Groq / OpenRouter / Ollama, from an earlier
experiment) remain behind flags for legacy turns only; they are not
defaults and the demo path does not consult them.
`BRAIN_PROVIDER=local` serves the deterministic floor alone.

## Run

Normal path is the repo front door (`make demo` from the repo root).
Standalone:

```bash
npm install && npm run build
MCP_SERVER_URL=http://127.0.0.1:8080/mcp PORT=4000 npm start
curl -s localhost:4000/health | jq .
curl -s -X POST localhost:4000/turn -H 'Content-Type: application/json' \
  -d '{"utterance":"play Saiyaara, the original film version, not the remix"}' | jq .
```

Needs Node 20+. The MCP server (:8080) must be up for tool calls; the
floor still answers turns without it, labeled as such.

## What is simulated vs real

- **Real:** the MCP 2025-11-25 client (initialize → session →
  tools/call → SSE, elicitation follow-ups, Last-Event-ID replay), the
  Gemini extraction, the deterministic floor, the `/mcp` passthrough
  frames, the latency stamps.
- **Borrowed, labeled:** Gemini stands in for Alexa+'s native brain —
  on screen (BrainStatus) and in the payload (`extraction_source`).
