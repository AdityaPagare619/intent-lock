# Intent Lock MCP server (:8080)

The deliverable: a self-hosted **MCP server (spec 2025-11-25, Streamable
HTTP)** that verifies a voice request against real catalog rows before
anything plays. **100% deterministic — no model runs inside this server,
and it needs no API key.** The product story lives in the
[root README](../../README.md); the locked contract is
[`docs/12_INTENT_LOCK_SPEC.md`](../../docs/12_INTENT_LOCK_SPEC.md).

## The hero tool: `intent_lock`

One call takes a messy, code-switched request and returns exactly one of
three outcomes: `locked` (one exact recording, with the proof),
`tie_choice` (two named survivors — never a coin flip), or `no_lock`
(an honest refusal). Every eliminated catalog row comes back with the
named channel that killed it (`veto`, `spec_contradiction`, `wrong_film`,
`compilation_swap`, `rule_override`), so the receipt — the Trust Card —
shows the trap that almost happened.

**Inputs** (only `utterance` is required):

| Field | What it is |
|---|---|
| `utterance` | The raw transcript, exactly as heard. The server re-reads it itself: a negation in the user's own words (*nahi*, *sin*, *not*…) is a hard veto the host cannot remove. |
| `extracted_title_hint` | The host brain's advisory title guess — always verified against the catalogs server-side. |
| `include_tags` / `exclude_tags` | Advisory preferences / hard vetoes from the host extraction. |
| `rule` | `{after_time, version, artist?, dsp?}` — a standing voice rule ("after 10 PM, Saiyaara means the lofi version"), evaluated against the host clock (`_meta.host_time`) before fetching. |
| `pin` / `reject` | `{source, track_id}` — the host's pick between `tie_choice` survivors (re-verified against every ban before it can lock) / a veto of one exact track. |
| `candidate_hints`, `party` | Memory-style title hints grounded through the same pipeline; per-speaker constraints whose bans union. |
| `domain` | `music` (default) · `commerce` · `grocery` — the same pipeline over audited catalog packs for the other two. |

**Output:** `structuredContent` with `status`, `heard`, `locked`
(`{title, artist, version, year, source, track_id, score, preview_url,
artwork_url}` on a lock), `eliminated[]` (each row with its kill channel
and plain reason), `tied[]` on a tie, plus grounding and telemetry
blocks — every number measured by the run that produced it.

## Legacy tools (fallback substrate, not the Intent Lock story)

Four tools from the pre-Intent-Lock build remain registered. The demo
never calls them; they are kept as working substrate, labeled as such:

- `resolve_and_play` — phonetic resolve + studio-purity guard, with elicitation on true collisions.
- `fastpath_interrupt` — barge-in / yield handling.
- `verify_ledger_or_relink` — truth-ledger audit of a user challenge; `-32042` URL elicitation for an expired token.
- `sync_multiroom_and_bunker` — session init / multi-room telemetry / offline-bunker manifest.

## Structure

| Path | What |
|---|---|
| `src/server.py` | The server: single `/mcp` endpoint (POST/GET/DELETE) + `/health`, hand-rolled JSON-RPC, session store, the `intent_lock` pipeline. |
| `src/engines/` | The deterministic kernel: `intent_lock` (operators, rules), `phonetic_judo` + `phonetic_ipa` (articulatory grounding), `reconstructor`, `fastpath_yap`, `studio_pure_guard`, `truth_ledger`, `edgesync_bunker`. |
| `src/catalog_snapshot.json`, `src/catalog_pack_commerce.json`, `src/catalog_pack_grocery.json` | Audited supply: the offline snapshot behind the live-catalog race, and the commerce/grocery packs (each row carries provenance). |
| `src/sublocal_grammar.json` | The sub-local operator grammar (hi-IN / ta-IN / es-US / en-GLOBAL) as data — a new dialect is JSON, not code. |
| `db/ledger.sqlite` | Local truth-ledger database. Runtime state: git-ignored, created on first run. |
| `requirements.txt` | Pinned Python dependencies. |

## Run it standalone (MCP-only, no other services)

Needs Python 3.10+.

```bash
pip install -r requirements.txt
python src/server.py --host 127.0.0.1 --port 8080
# health: curl http://127.0.0.1:8080/health
```

`--chaos` enables the deterministic fault-injection mode honored via
the `X-Chaos-Fault` header.

## Verify it with no UI

From the repo root, with the server running:

```bash
python3 scripts/smoke_test.py                 # or: … http://127.0.0.1:8080/mcp
```

The smoke test performs `initialize` → `tools/list` (asserts
`intent_lock` is registered) → one hero `intent_lock` call, and prints
`SMOKE PASS` with the locked track id, or `SMOKE FAIL` with the reason.

Or point any MCP client at it — copy-paste client configuration:

```json
{
  "mcpServers": {
    "intent-lock": {
      "url": "http://127.0.0.1:8080/mcp"
    }
  }
}
```

## Design notes

- Hand-rolled JSON-RPC, not the MCP SDK — the wire invariants are easier
  to *prove* line-by-line in FastAPI than behind SDK magic. The
  on-the-record argument is in
  `archive/build-record/roundtable/arjun.md`.
- Origin gate: missing `Origin` (curl, non-browser) is allowed — it
  can't be a DNS-rebinding attack; a *mismatched* `Origin` gets HTTP 403.
- SSE events carry monotonic `<session>_<seq>` ids; the ring buffer
  holds the last 256 per session — replay is bounded, memory can't grow.
- Pre-master tool names (`resolve_phonetic_track`, `abort_active_yap`,
  `sync_offline_vibe_cache`) are accepted as aliases with a
  `_meta.deprecated_alias` notice.
- The demo-grade OAuth stand-in (`src/auth_demo.py`, `AUTH_MODE=demo`,
  default off) exists only so the local rig can show a re-link
  elicitation; it is not a claim about account linking — that is the
  host platform's job.
