# MCP Protocol Proof — real wire transcripts, no claims

> **Scope note (2026-10-21):** the transcripts below prove the **legacy four-tool wire**, captured 2026-10-19/20. The current hero tool is `intent_lock` — for its live proof, boot the stack (`scripts/demo-up.sh`) and call `intent_lock` from any MCP client (initialize → tools/list → one verified lock); see `docs/12_INTENT_LOCK_SPEC.md` and final results in `docs/TESTING.md`.

Intent Lock · captured 2026-10-19 ~03:40 IST from the live servers
(`services/intent-lock-server`, Python/FastAPI, hand-rolled JSON-RPC).
Every block below is a verbatim transcript. Session ids are real.

> (Correction, 2026-10-23: the verify_mcp_wire.sh script and chaos-suite target named here were never shipped in this repository; the protocol evidence above was produced in the build workspace. The commands a reader can run today are in docs/TESTING.md and docs/OPERATIONS.md.)

> **Auditor's corrections — J-02 (MCP protocol judge), 2026-10-20.**
> Re-verified every act against the live wire. Three corrections:
> 1. Acts 2–3 below are the **offline-vault hydration path** (captured
>    with the local 30-track vault answering). With live network
>    hydration — the normal judging path — the same requests return
>    real-catalog results: Act 2's utterance *elicits* (3 real iTunes
>    candidates) instead of playing the vault track directly, and
>    Act 3's "Raja Ji" may resolve directly when the catalog has one
>    dominant match. Today's live captures are quoted in the act notes.
>    The wire-proof run asserts whichever honest outcome occurs (the
>    re-run script named in the original note was never shipped in
>    this repository — see the 2026-10-23 correction above).
> 2. The original Act 1 note claimed bad origins get `403`. **False**
>    against the current build — see the corrected note under Act 1.
> 3. Act 5's block elides the `event:`/`data:` lines; the replayed
>    frames are the complete original frames (verified 2026-10-20).

---

## Act 1 — Handshake: `initialize` → 2025-11-25 + minted session

```
POST /mcp  HTTP/1.1
Origin: http://localhost:3000
Content-Type: application/json
Accept: application/json, text/event-stream

{"jsonrpc":"2.0","id":1,"method":"initialize","params":{
  "protocolVersion":"2025-11-25",
  "capabilities":{"elicitation":{}},
  "clientInfo":{"name":"alexa-plus-simulator","version":"1.0.0"}}}

HTTP/1.1 200 OK
Mcp-Session-Id: 6aba92e933b1533b6cfea6f86bacd9bd
MCP-Protocol-Version: 2025-11-25
Access-Control-Expose-Headers: Mcp-Session-Id, MCP-Protocol-Version

{"jsonrpc":"2.0","id":1,"result":{
  "protocolVersion":"2025-11-25",
  "capabilities":{"tools":{"listChanged":false},
                  "resources":{"subscribe":false,"listChanged":false},
                  "elicitation":{}},
  "serverInfo":{"name":"omnibeat-mcp-server","version":"0.1.0"}}}
```

Wrong version: `400` (`-32602 Unsupported protocolVersion`) — verified
live 2026-10-20 for an older (2025-03-26), a newer, and a missing
version alike. The server speaks exactly one version and says so,
instead of negotiating down in a result (a deliberate strictness;
the spec's negotiation flow would return 2025-11-25 in a result).

Bad origin: **not rejected.** By deliberate zero-settings design the
server performs no Origin allow-listing — any `Origin` is accepted and
reflected by the CORS layer, and the 128-bit session id is the access
gate (see `origin_allowed()` in `server.py`). Verified live 2026-10-20:
`Origin: http://evil.example.com` → `200` + minted session. This is a
known trade against the Streamable HTTP spec's Origin-validation
MUST (anti-DNS-rebinding); the demo binds 127.0.0.1, which bounds the
exposure. An earlier draft of this doc claimed `403` — that was wrong.

---

## Act 2 — Phonetic morph over SSE: "Lolly Pop La Gelu"

```
POST /mcp  (Accept: text/event-stream, Mcp-Session-Id: 6aba92e9…,
            MCP-Protocol-Version: 2025-11-25)
{"jsonrpc":"2.0","id":2,"method":"tools/call",
 "params":{"name":"omnibeat_resolve_and_play",
           "arguments":{"raw_utterance":"Alexa play Lolly Pop La Gelu on Spotify",
                        "locale_hint":"en-IN"}}}

HTTP/1.1 200 OK
Content-Type: text/event-stream

id: 6aba92e933b1533b6cfea6f86bacd9bd_1
event: message
data: {"jsonrpc":"2.0","method":"notifications/progress",
       "params":{"progressToken":2,"progress":1,"total":4,
                 "message":"Spawning phonetic judo… (E1 sidecar, Kabir's 25-test pipeline)"}}

id: 6aba92e933b1533b6cfea6f86bacd9bd_2
event: message
data: {"jsonrpc":"2.0","method":"notifications/progress",
       "params":{"progressToken":2,"progress":2,"total":4,
                 "message":"E1 resolved 5 candidate(s); top: 'Lollipop Lagelu' by Pawan Singh (score 0.889)"}}

id: 6aba92e933b1533b6cfea6f86bacd9bd_3
event: message
data: {"jsonrpc":"2.0","method":"notifications/progress",
       "params":{"progressToken":2,"progress":3,"total":4,
                 "message":"Phonetic morph: lolly≈lollipop → pop≈lollipop → la≈lagelu → gelu≈lagelu"}}

id: 6aba92e933b1533b6cfea6f86bacd9bd_4
event: message
data: {"jsonrpc":"2.0","method":"notifications/progress",
       "params":{"progressToken":2,"progress":4,"total":4,
                 "message":"Purity verdict: 'Lollipop Lagelu' by Pawan Singh [studio, P=136.0] — no guess needed"}}

id: 6aba92e933b1533b6cfea6f86bacd9bd_5
event: message
data: {"jsonrpc":"2.0","id":2,"result":{
  "content":[{"type":"text","text":"Playing 'Lollipop Lagelu' by Pawan Singh [studio, purity P=136.0]."}],
  "structuredContent":{"input_required":false,"action":"play",
    "track":{"id":"pb-003","title":"Lollipop Lagelu","artist":"Pawan Singh",
             "kind":"studio","purity_score":136.0},
    "phonetic":{"query":"lolly pop la gelu","skeleton":"…"},
    "disambiguated":false}}}
```

Note the monotonic event ids `<session>_<seq>` — Act 5 replays them.

> **Live-network path (2026-10-20, J-02 re-capture).** The transcript
> above is the offline-vault path. The identical request with live
> hydration streams **7** progress stages (real measured timings, e.g.
> "Planetary spellcheck: 'Lolly Pop La Gelu' → 'lollipop lagelu song'
> (1657.7ms)", "Hydrated 5 real candidate(s) from iTunes (989.0ms)")
> and ends in a true-collision elicitation, not a direct play:
> candidates Deepak Dabangi (P=149.25), Roshni Singh (P=147.0),
> Jakir Ali (P=142.5) — all with real `audio-ssl.itunes.apple.com`
> hook URLs. The follow-up `selection_index: 2` then returns
> `"disambiguated": true` and plays 'Lollipop Lagelu' by Jakir Ali.
> Which path fires depends on network/catalog, never on a coin flip
> inside the server: collision ⇒ elicit, dominant match ⇒ play.

---

## Act 3 — Elicitation: "Play Raja Ji" refuses to guess

```
{"jsonrpc":"2.0","id":3,"method":"tools/call",
 "params":{"name":"omnibeat_resolve_and_play",
           "arguments":{"raw_utterance":"Play Raja Ji"}}}

→ {"jsonrpc":"2.0","id":3,"result":{
    "content":[{"type":"text",
      "text":"I found 3 tracks called 'Raja Ji'. I won't guess — hear the hooks and pick one."}],
    "structuredContent":{
      "input_required":true,
      "elicitation":{"kind":"disambiguation",
        "candidates":[
          {"index":0,"title":"Raja Ji","artist":"Anand Mohan","kind":"studio"},
          {"index":1,"title":"Raja Ji","artist":"DJ Chhotu","kind":"studio"},
          {"index":2,"title":"Raja Ji","artist":"lofi bhojpur","kind":"lofi"}],
        "respond_via":{"tool":"omnibeat_resolve_and_play",
                       "argument":"input_responses.selection_index"}}}}}

{"jsonrpc":"2.0","id":4,"method":"tools/call",
 "params":{"name":"omnibeat_resolve_and_play",
           "arguments":{"raw_utterance":"Play Raja Ji",
                        "input_responses":{"selection_index":1}}}}

→ {"jsonrpc":"2.0","id":4,"result":{
    "structuredContent":{
      "input_required":false,"action":"play",
      "track":{"title":"Raja Ji","artist":"DJ Chhotu","kind":"studio"},
      "disambiguated":true}}}
```

Round-trip integrity:
the picked artist equals the candidate at the chosen index. Per-session
`pending` state — no cross-session clobbering.

> **Live-network caveat (2026-10-20).** The candidates above are the
> offline vault's seeded triple. Against the live catalog, "Raja Ji"
> did **not** elicit on 2026-10-20: hydration returned one dominant
> match and the tool played it directly (observed: 'Raja Ji (feat.
> Gurlez Akhtar)' by Deep Chahal via iTunes; in a later run, 'Raja Ji'
> by Anand Mohan). Elicitation is collision-driven, not
> query-driven — Act 2's utterance is the one that reliably collides
> in the real catalog, and the full round-trip is exercised there
> whenever it fires (the re-run script named in the original note
> was never shipped in this repository — see the 2026-10-23
> correction at the top of this document).

---

## Act 4 — `-32042`: expired token → URL elicitation, never silence

```
{"jsonrpc":"2.0","id":5,"method":"tools/call",
 "params":{"name":"omnibeat_verify_ledger_or_relink",
           "arguments":{"user_challenge":"fix my music",
                        "force_oauth_expired":true}}}

→ {"jsonrpc":"2.0","id":5,
    "error":{"code":-32042,
             "message":"URL elicitation required: provider token expired",
             "data":{"elicitation":"url",
                     "url":"http://localhost:3000/relink?provider=spotify",
                     "provider":"spotify",
                     "reason":"oauth_token_expired",
                     "render":"modal"}}}
```

Same `-32042` fires via the D-06 per-request header
(`X-Chaos-Fault: token_expired`, honored only when `--chaos` is armed) —
both paths asserted in F-10.

> **Origin-aware URL (verified 2026-10-20).** The `url` follows the
> caller's `Origin`: the transcript's `http://localhost:3000/...` is
> the no-Origin default (and the simulator's origin). The same call
> with `Origin: https://judge.local:8443` returned
> `https://judge.local:8443/relink?provider=spotify` — the re-link
> lands on the caller's own surface, never a hard-coded host.
>
> **Spec-shape note.** The `-32042` code itself is the spec's
> `URLElicitationRequiredError` (SEP-1036 / 2025-11-25 elicitation),
> but the spec's error `data` carries an `elicitations` array whose
> entries have `mode: "url"` and an `elicitationId`. the server's `data`
> is a flat, first-party shape (`url`, `provider`, `reason`, `render`)
> that its own clients parse; a stock SDK client expecting the spec
> shape would not. Documented deviation — see the J-02 verdict.

---

## Act 5 — `Last-Event-ID`: the outage replay

```
(After Act 2's stream: ids …_6 …_7 …_8 …_9 …_10)

GET /mcp  HTTP/1.1
Mcp-Session-Id: 6aba92e933b1533b6cfea6f86bacd9bd
Last-Event-ID: 6aba92e933b1533b6cfea6f86bacd9bd_6
Origin: http://localhost:3000

HTTP/1.1 200 OK
Content-Type: text/event-stream

id: 6aba92e933b1533b6cfea6f86bacd9bd_7
id: 6aba92e933b1533b6cfea6f86bacd9bd_8
id: 6aba92e933b1533b6cfea6f86bacd9bd_9
id: 6aba92e933b1533b6cfea6f86bacd9bd_10
```

Replayed exactly the tail after the given id — byte-identical event
frames, zero loss. (F-08 asserts the replayed id list equals the
original tail, element for element.)

> **Elision + re-verification (2026-10-20).** The block above shows
> only the `id:` lines; each replayed frame on the wire is the complete
> original frame (`id:` + `event: message` + full `data:` payload).
> Re-verified live: replay from `<session>_9` returned exactly
> `_10 … _16`, in order, payloads intact. A `Last-Event-ID` the server
> doesn't know returns `200` with an empty replay (just the `: ping`
> comment) — lenient, not an error.

---

## Chaos contract (D-06), also on the wire

With the server armed (`--chaos`), any request may carry:

```
X-Chaos-Fault: upsell_trap | ghost_action | token_expired | isp_blackout
```

Verified live tonight:
- `upsell_trap` on resolve → stage
  `"Upsell firewall: blocked 'Raja Ji' by DJ Bhojpuria (P=-96.0)"`,
  and the trap never reaches the result (F-01).
- `ghost_action` on resolve → `GHOST_EVENT` row in the ledger; the
  challenge then returns `verdict: "ghost_rollback"` + apology (F-04).
- Without `--chaos`, the header is logged and ignored — a judging run
  can never be fault-injected.

(2026-10-20: the default judging instance runs unarmed —
`GET /health` reports `"chaos_mode": false` — so the two bullets above
reproduce only against a `--chaos` instance, exactly as designed.)

---
*Transcripts captured from the running build. (Correction, 2026-10-23: the verify_mcp_wire.sh script and chaos-suite target named here were never shipped in this repository; the protocol evidence above was produced in the build workspace. The commands a reader can run today are in docs/TESTING.md and docs/OPERATIONS.md.) — the chaos engineer*
