# Decision Log — disagreements on record, per the Chai Rule
Team THE YAP PATROL · OmniBeat-MCP · owner: Ria "CHAOS"

> Silent disagreement is banned. Every locked decision names its deciders and its
> rationale. Revisiting a LOCKED decision needs new evidence, not new opinions.

---

### D-01 — 2-service fold (2026-10-19, Petu + full team roundtable) · **LOCKED**
**Decision:** 4 services → 2. Orchestrator (`:4000`) folds into the simulator's
Next.js API routes; chaos mock (`:9000`) folds into `--chaos` mode inside the
MCP server. There is no `:4000` and no `:9000` in `docker-compose.yml`.
**Rationale:** a ~200-line router does not earn a network hop; one fewer
container is one fewer 3 AM failure mode. The MCP client still talks real HTTP
to `:8080` — the wire stays honest.
**Red-team:** `archive/build-record/roundtable/ria.md` — Ria tried to kill it. Verdict: **HOLD** with
3 conditions (pure router modules, `/api/health` on `:3000`, storyboard drops
the "orchestrator dead" beat).

### D-02 — ₹0 law: Bedrock/Polly cut (2026-10-19, Petu + team) · **LOCKED**
**Decision:** the blueprint's Bedrock (Claude/Nova) + Polly path is CUT. The
agentic path is a local deterministic template+rules router, honestly labeled
"local fallback brain".
**Rationale:** the only paid components in the blueprint; they violate Aditya's
₹0 law. Tradeoff, stated on the record: we drop the AWS Builder mini-challenge
by default.
**Dissent (Meera, noted):** worried the "Design" score loses shine without a
real voice brain. Counter: the Graceful Yield *is* the design story, and it runs
on the local router. Disagree-and-commit: Meera builds it like it was her idea.

### D-03 — Graceful Yield replaces the Yap Guillotine (2026-10-19, Aditya's brief via Petu) · **LOCKED**
**Decision:** no hard abort, no 3-word clamp. Three yield states — SOFT YIELD
(duck, pause at word boundary, 1.2s listen, acknowledge, compress, offer
resume), BANTER SHIELD (group chatter → quiet pill + soft earcon), HARD BARGE
(explicit "Alexa stop" only). Responses in ≤12s chunks with 400ms listening gaps.
**Rationale:** Aditya's explicit brief — humans don't get unplugged mid-sentence;
GPT/Gemini-style voice feels real because it yields, acknowledges, repairs.
The *mechanism* (VAD, word-index slicing, stream cancel) is kept; the
*personality* changes from executioner to conversation partner.

### D-04 — One tool contract, master names win (2026-10-19, team) · **LOCKED**
**Decision:** `omnibeat_resolve_and_play`, `omnibeat_fastpath_interrupt`,
`omnibeat_verify_ledger_or_relink`, `omnibeat_sync_multiroom_and_bunker` +
resources `omnibeat://session/audit-ledger`, `omnibeat://network/multiroom-telemetry`.
Pre-blueprint names survive only as commented aliases.
**Rationale:** the pre-blueprint filename carries the authority rule; the master
blueprint's names are the contract. Drift D1 resolved, no further renames
without a new decision entry.

### D-05 — Kill condition: Phase-2 exit test by Oct 20 18:00 IST (2026-10-19, Petu) · **LOCKED**
**Decision:** if `scripts/verify_mcp_wire.sh` is not all-green by **Oct 20
18:00 IST**, we stop OmniBeat-MCP and revert to the EARSHOT submission.
**Rationale:** no sunk-cost fallacies. EARSHOT is parked, not deleted; the
fallback is real, so the deadline is safe.
**Enforcer:** Ria. She will pull the plug herself if she has to, and she will
not feel bad about it.

### D-06 — Chaos-injection wire contract (2026-10-19, Petu — principal call, closes Meera B-02) · **LOCKED**
**Decision:** no new tool. The ChaosSwitchboard toggles send per-request intent via the `X-Chaos-Fault` HTTP header (`upsell_trap | ghost_action | token_expired | isp_blackout`); the Next.js `/api/mcp` proxy forwards it untouched (already does); the MCP server honors it **only when running with `--chaos`** — without the flag the header is ignored and logged.
**Rationale:** keeps the 4-tool contract pure (judges see exactly 4 tools); per-request faults beat a global server restart mid-demo; the `--chaos` arming flag preserves the redesign's "chaos as a mode" and prevents accidental fault injection during judging.
**For Arjun:** read `X-Chaos-Fault` in server.py when `CHAOS_MODE=1`. For Meera: toggles already set local sim state — add the header to the proxied call.
**E2E receipt (2026-10-19 ~02:33 IST, Petu):** `:8080/health` → ok/2025-11-25; real `initialize` through `:3000/api/mcp` → JSON-RPC 2025-11-25 + `Mcp-Session-Id` header survived the proxy. Green-chip path confirmed; Meera B-01 closed.

### D-07 — TS/Python seam for E1 phonetics (2026-10-19, Petu — principal call, closes Kabir FLAG-1) · **LOCKED**
**Decision:** Kabir's proposal adopted — tiny Node sidecar over stdio (JSON in/out, ~25 lines), spawned once by `server.py` at startup; the TypeScript `resolvePhoneticTrack` remains the single implementation (the 25 tests are its contract). If `node` is absent, the server falls back to Arjun's stub scorer and logs a loud warning — never silently.
**Rationale:** one tested implementation beats two drifting copies; stdio sidecar keeps the MCP server's hot path dependency-free of Node IPC frameworks; fallback keeps the demo alive on a bare box.
**Owner:** Arjun wires the sidecar in Phase 2 (server.py startup/shutdown); Kabir owns the sidecar script (lives in packages/polyglot-phonetic-judo/).

### D-05 — VACATED (2026-10-19 ~02:54 IST, Aditya's direct order) · **DEAD**
**Decision:** the EARSHOT fallback is CANCELLED. Aditya: "Nope no earshot, don't make such calls by your own." There is no revert path — we build OmniBeat-MCP, period. Petu does not make fallback calls autonomously.
**Rationale:** his call, his risk. The 11:00 IST deadline is the only gate now.

### D-08 — Multi-service topology RESTORED (2026-10-19 ~02:54 IST, Aditya's direct order) · **LOCKED**
**Decision:** the 2-service fold is REVERTED. Four separate servers, exactly per the blueprint docs: `:3000` alexa-plus-simulator, `:4000` alexa-agent-orchestrator (local deterministic router + real MCP client over HTTP; NO Bedrock/Polly — the Rs.0 law stands), `:8080` omnibeat-mcp-server, `:9000` chaos-and-provider-mock (dual-mode proxy + 30-track catalog + audio hooks).
**Rationale:** Aditya: "there should be multiple services... so that true testing and demos" — genuine process separation is the demo honesty story. Ria's red-team flip condition anticipated exactly this.
**Consequences:** Meera's `/api/mcp` proxy repoints to `:4000` (orchestrator) once healthy — the full chain browser to :4000 to :8080 stays real HTTP at every hop. D-06 (X-Chaos-Fault) and D-07 (Node sidecar) unchanged. No doc details dropped: all 5 engines implemented per spec, mDNS bridge included as specified.

### D-05 — Kill condition: Phase-2 exit test by Oct 20 18:00 IST · **VACATED 2026-10-19 ~02:54 IST (Aditya)**
**Original decision:** revert to EARSHOT if the wire test wasn't green by Oct 20 18:00 IST.
**Vacated by:** Aditya's direct order — "no EARSHOT, don't make such calls on your own." There is no fallback; OmniBeat-MCP or nothing. Petu makes no autonomous fallback calls. The entry stays visible so nobody acts on the old condition.

### D-08 — Multi-service topology restored (2026-10-19 ~02:54 IST, Aditya) · **LOCKED**
**Decision:** the 2-service fold is REVERTED. Four separate servers per the blueprint: `:3000` alexa-plus-simulator, `:4000` alexa-agent-orchestrator (local deterministic router — Bedrock/Polly stay cut, ₹0 law intact), `:8080` omnibeat-mcp-server, `:9000` chaos-and-provider-mock. Reason: true per-service testing and demos; "don't leave any kind of details from the provided docs."
**Consequences:** `docker-compose.yml` rewritten for 4 services; `:4000` and `:9000` lanes (re)opened under the 8-agent wave; D-06 (`X-Chaos-Fault`) still valid as the per-request fault contract against the `:8080` chaos-armed server until `:9000` lands, then the mock owns fault injection.
**Deadline moved:** complete project by **11:00 IST Oct 19** (was Oct 23). Petu is main lead in Aditya's absence.

### D-15 — VPPS phonetic stack adopted (2026-10-19, Petu — principal call) · **LOCKED**
**Decision:** replace the Double-Metaphone-style scorer with VPPS (vowel-preserving skeletons + ASR homophone clusters + articulatory weighted edit distance) in the Node sidecar; D-07 stdio protocol unchanged.
**Rationale:** Metaphone deletes vowels; in Hindi/Bhojpuri the vowels carry the word. Articulatory costs model *why* accents confuse ASR. 25/25 ported unit tests green. Audit also caught and fixed 4 bugs in the shared docs' own reference code (paren-strip regex, overstated thresholds).
**Consequences:** `packages/polyglot-phonetic-judo/src/index.ts` rewritten; `phonetic_similarity`/`purity_score_v2` ride the D-07 wire additively.

### D-16 — Zero-cost triad: YouTube Suggest + iTunes + MusicBrainz (2026-10-19, Petu — principal call) · **LOCKED**
**Decision:** E1 arbitrates via keyless YouTube Suggest, E2 hydrates via keyless iTunes Search (fresh 30s previews per session, never cached), MusicBrainz best-effort ISRC; 30-track mock catalog becomes the offline fallback. Stdlib only — zero new deps.
**Rationale:** verified live 2026-10-19 ("lolly pop la gelu" → "lollipop lagelu" top hit; real trackIds + previewUrls). Honest calibration: docs claimed ~35ms Suggest latency; measured 1.1–1.8s through this egress — timeouts set to measured reality (1.5s Suggest, 3.0s global budget).
**Consequences:** `server.py` gains the hydration layer with the never-hard-fail fallback chain (`OMNIBEAT_FORCE_OFFLINE=1` forces offline); duplicate trackIds deduped.

### D-17 — Dynamic chorus hooks via edge DSP (2026-10-19, Petu — principal call) · **LOCKED**
**Decision:** replace fixed synthetic-WAV hooks and hardcoded timestamps with `extractDynamicChorusHookWindow` (RMS × spectral-flux sliding 3.0s window over t=2.5s–25s) computed in-browser from real iTunes previews; synthetic WAVs stay as fallback.
**Rationale:** verified on real audio — "Lollipop Lagelu" preview yielded window [10.0s, 13.0s] in 22ms. Fixed a doc arithmetic error (5/60Hz = 83ms, not 250ms) and a hardcoded `vocalPresenceRatio: 0.88` (now computed).
**Consequences:** new `workers/edge_dsp.ts` + `workers/chorus_extract.ts`; SEP-1330 elicitation plays real hooks.

### D-18 — Hash-chained truth ledger (2026-10-19, Petu — principal call) · **LOCKED**
**Decision:** every ledger row carries `prev_hash`/`entry_hash` = SHA-256(prev_hash|ts|actor|snr|new_state), genesis = 64 zeros; `verify_chain()` walks and names the exact breaking row; legacy DBs migrate via ALTER TABLE + deterministic backfill. Appends run under `BEGIN IMMEDIATE` (no forks).
**Rationale:** the difference between "a log" and "a proof" — survives judges reading the code. SNR>12dB gate, actor types, ghost-rollback, −32042 untouched.
**Consequences:** `src/engines/truth_ledger.py` extended additively; migration runs on next `:8080` restart.

### D-19 — PID phase-lock for multiroom sync (2026-10-19, Petu — principal call) · **LOCKED**
**Decision:** replace snap-to-lock with a PID controller driving follower-room rates (clamped ±1.5%, 0.5ms deadband, `setTargetAtTime` slew). Docs' gain *ratios* kept; scale re-derived for our 60Hz delay-actuation plant (docs' literal gains converged ~2x too slow — measured).
**Rationale:** smooth glide, zero clicks; 40ms shock → <0.5ms lock in 1.78s, zero overshoot. Honest physics note: no controller holds <0.5ms against ±3ms continuous wander.
**Consequences:** new `lib/pid_sync.ts`; `workers/multiroom_clock.ts` rewired with unchanged `phaseLock()` signature.

### D-20 — Zero-settings law (2026-10-19, Aditya's direct order) · **LOCKED**
**Decision:** the user installs the MCP and touches nothing else. `ALLOWED_ORIGINS` env var is dead (dynamic ASGI CORS middleware, localhost always trusted); `./scripts/bootstrap.sh && make demo` is the entire setup (venv, deps, builds, 4 services, health-wait); 11/11 bootstrap checks.
**Rationale:** Aditya — "user don't need to do any settings just mcp install and rest the alexa or our mcp handles." Every manual step is a bug.
**Consequences:** new `scripts/bootstrap.sh`; `Makefile` `demo`/`verify` targets; one irreducible manual step on bare metal (install Node 20+ / Python 3.10+ — detected and named, can't be automated at ₹0).

### D-21 — Tactile UI tokens (2026-10-19, Petu — principal call) · **LOCKED**
**Decision:** apply the Tactile Studio design system as a token layer (matte obsidian #0F1012, amber #E58E26, sage #10B981, coral #EF4444, JetBrains Mono for data) with every decision citing its ui-skills-lib source + rationale (15 decisions documented); kemiljk critic pass mandatory.
**Rationale:** judges are Alexa/Device people — restraint reads as professional. Tokens only: no logic or data changes.
**Consequences:** `app/globals.css` + theme tokens; all components keep showing real wire data (docs' mocked `Math.random()` hashes/latencies explicitly rejected).

### D-22 — ONNX embedding router DEFERRED (2026-10-19, Petu — principal call) · **DOCUMENTED**
**Decision:** the docs' Tier-1 quantized ONNX MiniLM router is deferred to Phase 2. The two-tier router stays: Tier-0 deterministic reflex grammar (<5ms) + Tier-1 agentic path.
**Rationale:** 30–90MB model download on first run breaks the zero-settings law (D-20); the docs' 12ms claim is uncalibrated. No demo beat changes outcome without it.
**Consequences:** documented upgrade path in ARCHITECTURE_V2.md §9.

## D-23 — serverExternalPackages removed (Petu, 2026-10-19)
`npm run build` failed in Next 15.5.4's static worker (/_document resolution cascade) with `serverExternalPackages: ["@ricky0123/vad-web", "onnxruntime-web"]` set. The v1 comment claimed the wasm bundles crash the prerender worker; measured on this box the externalization itself breaks the worker, while the plain webpack bundle builds clean and `next start` serves 200. The VAD dynamic import (lib/vad.ts:212) only executes in the browser on mic-enable click. Removed + verified: build exit 0, prod serve 200.

## D-24 — elicitation-card dedup, defense in depth (Petu, 2026-10-19)
iTunes intermittently returns the same recording under different trackIds (single vs album listing) → two indistinguishable elicitation cards (caught live by F-02). Fix in two layers: (1) itunes_hydrate dedups on (title, artist) normalized; (2) E2 guard dedups legit contenders BEFORE the elicitation count checks — a deduped-to-one set falls through to direct play instead of eliciting a single card. Rationale: two identical cards are never a valid elicitation, regardless of provider.

## D-25: Red-team P1/P2 remediation (2026-10-19, Petu)
Cold diff review (read-only) of all 7 v2 lanes found no open P0 — the filed
duplicate-trackId P0 was already fixed in-tree. Seven P1s remediated:
(1) unguarded int() on selection_index → safe coerce + JSON-RPC -32603 catch-all
in mcp_post (no path may 500 the wire); (2) raw_utterance capped at 200 chars
at tool entry + sidecar sim op (O(n²) DP bound); (3) dead _roundtrip timeout →
real selectors-based readline deadline; (4) OSS arbitrator regex captured to
the first ']' (dead function in practice) → first-paren/last-paren parse +
walk data[1], parenthetical-only title stripping ("Video Games" survives);
(5) 10–13.5dB band mislabeled SILENCE → VOICE_SUB_THRESHOLD; (6) ledger hash
now covers `action` (chain v2, full recompute migration — action tampering now
detectable); (7) 8s AbortController on preview fetch. Cheap P2s folded in:
post-dedup popularity rank, skip trackId-less iTunes results, consume stale
elicitation, relink URL from caller Origin, FL-14 claim narrowed honestly,
dead _write removed. TC-04's independent hash recomputation updated to the v2
canonical form. Suite: 47 PASS / 2 SKIP / 0 FAIL post-fix.

### D-26 — Judge-panel claims remediation (2026-10-20, J-06 audit, Petu applied)
The 10-judge panel's Impact audit found ARCHITECTURE_V2.md and the package README still printing "~35ms" (Suggest) / "~90ms" (iTunes) — figures D-16 itself had refuted (measured 1.1–1.8s / 732ms). Self-contradiction inside the honesty centerpiece is the highest-severity docs defect class: it discounts every other number we print. All instances replaced with measured wording; "any song on Earth resolves" scoped to the iTunes catalog + VPPS/bunker fallback; TC-03's <65ms bar annotated as local-path-only. README cells C-5/C-6 (F-07 wording, F-04 "tamper-evident proof") land with the J-05 merge. Rule going forward: no latency figure ships without its measurement receipt in the same repo.

### D-27 — Protocol conformance pass (2026-10-20, J-02 audit, Petu merged)
53-probe wire audit vs the 2025-11-25 spec. Fixed: tools/call argument validation (a call missing required raw_utterance previously EXECUTED and played a random track — now -32602; wrong types likewise); unknown/terminated session now 404 per spec (was 400); progress notifications echo the client's _meta.progressToken instead of inventing one; unknown tool -32602 (was -32601); batch bodies -32600 (batching removed 2025-06-18); unsupported MCP-Protocol-Version header 400. verify_mcp_wire.sh was FAILING against the healthy live stack (asserted direct play; live hydration elicits) — repaired, 4 acts green. MCP_PROTOCOL_PROOF.md Acts 2–3 annotated: they were offline-vault captures; today's live captures appended, false Origin-403 claim corrected (origin reflection is deliberate zero-settings design). Open, documented: -32042 payload is a first-party flat shape, not the spec's elicitations[] form — changing it touches the simulator contract; revisit post-submission.

### D-28 — Panel findings accepted as labeled limitations (2026-10-20, J-07/J-08 audits, Petu)
Four real defects are documented, not silently carried: (1) the ledger's `mic_snr_db` is stamped by the server from per-action constants (18.5 play / 21.0 barge-in / 99.0 rollback / 4.2 ghost) — self-attested scenario data, NOT a microphone measurement; the anti-gaslight check that consumes it therefore proves ledger-internal consistency, not acoustics. Remediation post-submission: plumb the client's measured SNR (Web Audio analyser in the simulator) through the tool arguments and record provenance alongside. (2) E5 server telemetry is unfed: `drift_overrides` has no caller, so the multiroom resource reports 0.0ms drift and `tracks_cached` is the constant `BUNKER_TRACKS = 5`, not a count. The real PID runs client-side in the simulator and is correct; the server resource must either consume its reports or be labeled a snapshot stub. (3) Ledger tail-truncation: deleting the NEWEST row still verifies "intact" — the chain has no external head anchor, and `verify_chain()` is not exposed over MCP. Remediation: publish the head hash into the telemetry resource per session and add a verify resource. (4) On a chaos-armed rig, `isp_blackout` is a process-global (`CHAOS_MODE`), so a control call with no fault header also reports blackout; the other three faults are genuinely per-request. On the shipped default (unarmed) all fault headers are inert and /health discloses `chaos_mode:false`. None of these touch the demo's judged flows; all four are named here so no judge discovers an unlabeled one.

### D-29 — "Never guess" made true at the resolver (2026-10-20, J-08 P1/P2, Petu fixed + verified)
J-08 proved on the live stack that empty, whitespace, gibberish, and nonexistent-song utterances all confidently PLAYED a track ("" → Halsey 'Bad at Love'; "zqxjkv blorp wobble" → BTS 'Dynamite'; a made-up song → 'Kala Chashma'). Root causes: `suggest_arbitrate("")` manufactured the query " song" and iTunes hydrated the resulting popular hit; and the offline vault ranked its whole catalog for any string with no confidence floor, so the least-bad guess played. Fixes in server.py: (1) content-free utterances (nothing left after frame-strip but filler tokens) return an in-band refusal — "Tell me a title or a singer… I won't guess" — before any hydration; (2) `suggest_arbitrate` never queries with an empty payload; (3) vault confidence floor `VAULT_CONFIDENCE_FLOOR = 1.25`, calibrated on the shipped catalog (real matches incl. misspellings ≥ 1.40; garbage ≤ 1.12) — below floor, the existing honest "No confident match" path answers; the degraded stub scorer (different scale, already LOUD-labeled) is exempt; (4) vault plays are labeled in the tool result itself: `source: "offline-vault"`, `mock` no longer dropped by the `_play_result` whitelist, and the result text carries "(Offline vault copy — simulated catalog…)". Verified live post-fix: all six attack inputs refuse gracefully; flagship 'Lolly Pop La Gelu' still elicits 3 ways online and plays its exact vault match offline (labeled); clean online play unaffected (mock=False, no label); suite 47 PASS / 2 SKIP / 0 FAIL; wire proof 4 acts green.

### D-30 — The -32042 re-link flow is wired end to end (2026-10-20, J-05 headline, Petu built)
J-05 proved the re-link card did not exist: the server's -32042 was real and wire-proven, and every server-side hop forwarded X-Chaos-Fault (sim proxy route.ts, orchestrator server.ts/router.ts/mcpClient.ts, MCP server ctx) — but the browser never sent the header, never rendered the modal the payload asks for (render:"modal"), and the payload's /relink URL 404'd (no such route). The README F-10 row and the video described a user-facing flow the app couldn't perform. Wiring (all client-side; zero server changes): (1) lib/mcp.ts — mcpRpc/mcpCallTool accept an optional chaosFault and send X-Chaos-Fault; new findRelink() scans payloads for a -32042 URL elicitation. (2) lib/sim-context.tsx — faults map to D-06 wire names (token→token_expired, ghost→ghost_action, upsell→upsell_trap, isp→isp_blackout; first armed wins), exposed as activeChaosFault; relink state lives in context. (3) Every tool call site (resolve, pick, interrupt, demo scripts) passes the armed fault and scans its payloads; a -32042 opens the modal. (4) LedgerCard gains a "⚖ challenge" button calling omnibeat_verify_ledger_or_relink for real — with Expire Token armed it passes the tool's documented force_oauth_expired argument, so the F-10 loop runs on the DEFAULT (unarmed) stack; on a --chaos-armed stack the header path fires it from any call. (5) components/RelinkModal.tsx — plain-language card ("Your Spotify link needs a quick reconnect."), technical detail demoted to a mono footnote per J-05/J-10 copy rules; the target URL keeps the payload's path+query on the origin the user is actually on (the server builds it from its direct caller's origin — the orchestrator). (6) app/relink/page.tsx — the page the URL names now exists: a clearly-labeled SIMULATED provider page (no real account touched, nothing stored); its return link (/?relinked=<provider>) disarms the token toggle and writes the reconnect to the ledger + transcript in SimProvider. Verified: tsc clean; /relink serves 200 with correct content; stage 200; the -32042 payload re-proven live through the real :3000 proxy chain; findRelink unit-tested against the captured real payload (extracts url+provider; ignores normal results and other codes). NOT witnessed: the modal's pixels in a live browser — this box's Chrome refuses loopback origins at the browser level (ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS, the same wall J-10 hit); the founder's click (arm Expire Token → ⚖ challenge) is the closing check and is named as such in the panel report. Also recorded, not changed: `make demo` runs the simulator in Next dev mode (dev badges can show); kept deliberately — dev starts on any judge machine with zero build step, and a prod-build failure mode on unknown hardware is the worse trade for the zero-settings law.

### D-31 — Failure lab, design jury, and the Stage Transformation (2026-10-20, founder-ordered wave; 4 build lanes, Petu merge-verified)
Founder escalation: "what if Suggest doesn't fail but LAGS?" widened into (a) a failure-engineering lab — 6 research lanes (Amazon doctrine + 5 failure families) producing 51 unique failures FM-01…FM-51 (`~/workspace/failure-lab/FAILURE_MATRIX.md`; status at enumeration: COVERED 0 · PARTIAL 14 · OPEN 36 · UNVERIFIED 1) — and (b) a design jury on the demo UI (Visual 3/10, Motion 3/10, Alexa-theme 2.5/10, Comprehension 4/10; audits in `~/workspace/design-wave/`). Founder law added: resolutions must be *designed* (structural mechanisms), never adjustable fixes. Worst findings: FM-01 serial Suggest→iTunes tail-sum (a merely lagging Suggest ≈4.6s; worst legal ≈6.5s exceeded the 6.0s "budget"; per-socket-op timeouts were not deadlines); FM-22 the D-08 proxy fallback threw `Body is unusable` on every POST — the :4000-down failover had never worked on the write path (Petu's earlier claim of it corrected to the founder on record); FM-23 the browser never re-minted a dead session and blamed ":8080 isn't answering"; FM-34 a trickling preview CDN wedged elicitation forever (8s abort covered headers only); FM-36 hook players resolved "played" on safety-timer expiry (silence counted as success); the VAD waveform fabricated motion (sin() clockwork) while real mic levels sat unused; the palette was anti-Alexa (brand amber = Alexa's error color; Alexa Blue #00CAFF absent); storyboard beats silently no-opped without a session (lib/demo.ts), so the default judge path could show zero real frames unwarned. THE TRANSFORMATION (fused design, `~/workspace/design-wave/TRANSFORMATION_DESIGN.md`): two-world page — an Alexa stage above the waterline (Squid Ink + Alexa Blue only; Living Ring presence + true bottom light bar in Alexa grammar; utterance in display type struck through → resolved live; artwork-first candidates from the iTunes artworkUrl the payloads already carried; plain-words copy, no codenames on stage) over an amber engine room (one-line-per-frame terminal, flow ribbon Browser→:4000→:8080 lit by real X-OmniBeat-Upstream metadata, ledger as stamped receipts, chaos bench), a 5-beat story rail named by pains (Mishear → Standoff → Interruption → Receipt → Now Break Her), self-hosted fonts (the Google Fonts link violated the offline law — deleted), hand-authored SVG icons (emoji iconography banned), real responsive breakpoints. DESIGNED SYSTEMS, one per failure family: connection lifecycle (lib/session.ts — single session owner, auto-init on load, heal-on-404/400 with exactly one retry at the transport, honest connection states; beats can no longer silently no-op); streaming wire (incremental SSE reader — frames land as they arrive; 20s client deadline, previously none; replay-on-drop that counts as recovered only if the call's own response id returns); proxy buffer-once (body read once, reused by primary+fallback; kill-test green both directions); deadline media pipeline (one DeadlineToken per candidate covering headers+body+decode; typed slow/dead/decode/cancelled outcomes in plain words; pick UI never waits on audio); verified-effect playback contract ("played" requires the element's playing event + ≥0.35s real playhead progression; every resolve(true)-on-timer path deleted); speculative deadline hydration (Suggest ∥ raw-payload iTunes under one true 6s deadline; per-hop timeouts shrink to remaining budget; _http_get reads in chunks against a monotonic deadline; progress notifications stream at real hop-completion times). ADJUDICATED DEVIATION: the hydration lane implemented the briefed union arbitration, probed it breaking F-02 ("Mujhe Tum Yaad Aana" → a raw-branch near-miss out-scored the correct winner and direct-played the wrong song), and replaced it with canonical primacy (canonical branch arbitrates as before; the raw branch is a hedge supplying candidates only when the canonical branch returns empty/failed). Petu accepted on evidence and re-probed: F-02 plays "Yaad Na Aana" (P=103.01); a known wrong-song regression never ships. MERGE-PHASE FIX (Petu, on-metal): FM-27 — the orchestrator's /mcp passthrough buffered the whole SSE body (`await res.text()` + `res.end(p.body)`) under a comment claiming streams "pass through untouched"; passthrough now returns the raw stream and server.ts pipes it chunk-by-chunk (verified: flagship events through :3000→:4000→:8080 arrive staggered at real hop times 0.04/0.6/0.87/1.04/result vs one clump at 3.32s before). VERIFICATION (merged master, Petu's own hands): tsc clean; production build green; suite 47 PASS / 2 SKIP / 0 FAIL (twice: post-merge and again on the final stack post-FM-27-fix); wire proof 4 acts green (14-event replay; -32042); flagship first-frame ~5.9s → 0.12s direct (0.04s via chain); full-chain probes — elicitation 3-way, pick plays with artwork + mock:false, interrupt returns the full Graceful Yield payload, -32042 through both the proxy chain and direct; stale session → HTTP 404 -32001 (the heal trigger) proven on the merged stack. RESIDUALS, labeled: the new UI's pixels and the in-browser heal are not yet witnessed in a live browser on this box (Chrome loopback block, same wall as D-30) — the founder's click remains the closing check, now covering the transformed stage + restart-heal; the Living Ring is Canvas-2D per the audit's fallback spec (WebGL renderer is a drop-in upgrade behind usePresence); mic level is event-grained (lib/vad.ts exposes no continuous RMS callback); FM-40 (bunker success claims) can reuse the deck's exported PlaybackEvidence but is not yet retrofitted; the submission video shows the pre-transformation UI — re-shoot vs carry is the founder's call, flagged the day the build landed.

## D-32 — Layer A: the Brain above the router (2026-10-21, neuro-symbolic v2)
The orchestrator gains a Brain (src/brain/): pluggable LLM providers (Groq /
Gemini / OpenRouter / Ollama — plain fetch, no SDKs; Bedrock deliberately not
implemented: paid, and an optional provider must never become a dependency).
Speculative execution: local router and LLM decision start together; the
local result ships when decisive; the LLM governs only indecisive turns
(template fallbacks) and tool abstentions, and even then it only proposes —
an intent + extracted constraints re-dispatched through the router's own
branches, or a spoken reply whose entities are tether-checked against the
conversation. Reflexes (stop/barge/resume) and elicitation follow-ups never
wait for an LLM. BRAIN_PROVIDER unset ⇒ behavior is bit-identical to d0062ec.
Audit 1c fixed in the same pass: RESUME used to announce "Picking up where I
left off" and do nothing; it now delivers the interrupted answer text the
yield captured, and says so honestly when nothing was interrupted. The yield
branch also reads structuredContent.short_answer (it previously read a
non-existent root field and always fell back) and passes the real
active_utterance to E3.

## D-33 — Layer C: semantic constraints contract (2026-10-21)
omnibeat_resolve_and_play declares an optional `constraints` object
(desired_version / artist_hint / era_hint / mood_hint). The server
self-validates it (the wire validator is schema-lite): accepted fields are
honored, rejected fields are NAMED in
structuredContent.constraints.ignored — Amazon's "declare only what you
honor", enforced in-band. An explicit desired_version is authoritative for
version intent and supersedes the frame-peel regex intents. artist/era hints
are ranking signals applied before the guard (era uses real iTunes
releaseDate years, added to candidates in this pass); they never filter.
mood_hint is recorded and echoed — it steers reconstruction (Layer B), never
the verdict. The purity guard's math is untouched. No constraints ⇒ no
constraints key in the result (back-compat verified on the wire).

## D-34 — Layer B: universal phonetics + reconstructor, as built (2026-10-21)
B1 (engines/phonetic_ipa.py): PanPhon 21-feature weighted distance as an
INDEPENDENT second phonetic opinion, exercised on the abstention paths only
(vault-floor rejections / empty hydration). Similarity is
1 − dist/max(self-cost) — the naive length normalization was measured and
rejected (PanPhon prices deletions at full feature cost; it scored a true
match at 0.24). Transcription is capability-detected and stage-labeled:
espeak-ng is absent on this box (no apt package), Epitran's eng-Latn table
is broken upstream (KeyError), so Latin text uses a skeleton-IPA mapping
of the VPPS alphabet and Devanagari uses Epitran hin-Deva (verified).
Rescue bar: candidate_similarity ≥ 0.85, title-first. Default ON because it
can only fire where d0062ec refused; OMNIBEAT_B1_RESCUE=0 disables.
B2 (engines/reconstructor.py): env-gated, default OFF (no free key is
configured on the box). Its only power is proposing ≤3 new search queries;
picks are validated against the retrieved set and NEVER resurrect on their
own. Re-hydrated candidates must clear the bridge rule — faithful to the
reconstructed query (≥0.85) AND still related to the user's own sounds
(≥0.60) — the published GER hallucination guard (doc 10 §5.1). Verified
end-to-end against a local stub provider (labeled as such): gibberish
stays refused, a realistic mangling ('kesaria') is rescued, and everything
rescued still faces the untouched purity guard. Deps added to
requirements.txt: panphon, epitran (pure-python data libraries, no
runtime network) — a deliberate, logged exception to stdlib-only.

## D-35 — Layer D: MCP Apps + demo OAuth 2.1, as built (2026-10-21)
Every tool result now carries _meta.ui {resourceUri, invoking, invoked}
(doc 10 §3) at all three result exits (plain, resolve-async, SSE stream).
The Studio Deck ships as a real MCP Apps resource:
ui://omnibeat/studio-deck#<sha256-8 of the bundle> — content-hash
versioning per Amazon's packaging rule, verified: the hash in the URI
equals the served bundle's hash. The simulator gained a true host
(McpAppsHost.tsx): sandboxed iframe, ui/initialize answered with
hostContext, tool results forwarded as ui/notifications/tool-result,
display modes switched via host-context-changed with no reload. The
bespoke deck rendering remains as the no-iframe fallback.
OAuth: AUTH_MODE=demo (default OFF — the shipped demo is untouched)
enables auth_demo.py: PRM (RFC 9728) + AS metadata, Tier-1
client_credentials (mcp:service) and Tier-2 authorization_code + PKCE
S256 (mcp:tools) against a labeled built-in demo IdP. Verified end-to-end
on a spare instance: bare 401 without WWW-Authenticate (Amazon's stated
behavior), tier-1 initializes but cannot call tools, tier-2 can.
Known simplifications, stated: enforcement covers POST /mcp methods
(SSE replay GET stays session-bound, as before); the demo IdP is a
stand-in — a real Alexa+ deployment brings Amazon's authorization
server, and what is proven here is protocol conformance, not production
identity.


## D-36 — The tie ruling: a 100% deterministic server (2026-10-21)

**Decision.** `intent_lock` contains no LLM. A true tie returns `tie_choice` with `tied[]`; the host resolves it by re-calling with a `pin {source, track_id}`, which the server re-verifies against the survivors and every ban — a pin can never smuggle in a banned or eliminated row. MCP Sampling was evaluated and rejected with primary-source receipts (deprecated under SEP-2577, spec 2026-07-28); the pin flow is MRTR-shaped (SEP-2322) using two ordinary tool calls on spec 2025-11-25. `gemini_tiebreak.py` was deleted.

## D-37 — Credential route and the Gemini ladder (2026-10-21)

**Decision.** The host brain (simulator) runs `gemini-3-flash-preview` with `gemini-3.1-flash-lite` as fallback, reached only through the vaulted `custom.gemini` connector. `gemini-2.5-flash-lite` is dead (404, measured) and was removed everywhere. Keys never appear in the repo, logs, or chat. A pasted key in chat was not used; rotation was recommended to the founder.

## D-38 — Universal Sub-Local Operator Grammar (2026-10-21)

**Source:** Founder architectural correction, Directive 2. **Supersedes:** hardcoded Hinglish regexes in `frame_peel` ("Nahi Veto", "purana wala" as lone patterns).

**Decision.** The peel is a table-driven Operator Compiler over `sublocal_grammar.json`: locale tables (hi-IN, ta-IN, es-US, en-GLOBAL) map code-switched tokens to four universal operators — OP_VETO (≠, ≤3-token binding, non-removable by the host), OP_ORIGIN (t₀, earliest verified year + canonical creator), OP_EXACT (≡, floor +0.10 as a typed design parameter), OP_ANCHOR (@, family arbitrated before phonetics). The founder's 30 tokens are stored verbatim; unverified candidates sit in per-locale `candidates[]` with `verify: true` and never load. Locale is detected per matched token; the payload's `operators[]` carries {op, code, locale, token, target} to the Trust Card. Adding a dialect is a JSON edit, zero code.

## D-39 — Domain catalog adapters: the coda runs the real engine (2026-10-21)

**Source:** Founder architectural correction, Directive 1. **Kills:** `pattern_preview` fixtures for the commerce/grocery locks.

**Decision.** `intent_lock` accepts `domain` ("music" | "commerce" | "grocery"). Non-music domains run the same spine — operator grammar, phonetic grounding, transparent elimination, decide — over audited catalog packs (15 commerce rows, 16 grocery rows; provenance `audited_catalog_pack` on every row; grocery identities pulled from OpenFoodFacts at build time). Candidates normalize into one Universal Candidate Tensor. New kill channel `spec_contradiction`: a row whose title claims what its own spec table refutes is convicted with the numbers ("title claims 40 Gbps, spec table proves 480 Mbps"). Domain decide rules: role protection (a word the user uses to ASK — anchors, claimed specs — is never its own veto), role-by-scope (a word inside a negation window is a ban candidate, never a requirement), and grounding against both the host hint and the user's own description, best evidence wins.

## D-40 — Break My Lock: the chip-strip rule (2026-10-21)

**Decision.** The demo carries a five-chip proof strip (hero Hinglish, Lollipop Lagelu, Despacito Spanglish, USB-C commerce, gibberish refusal) plus a free-text any-query box. Every chip must be verified live in Wave 4 or it is cut from the filmed strip — no chip ships on a hope. (Chip outcomes are recorded in the Wave 4 gate table; the Lollipop chip's live supply lacks a studio original and is reported, not hidden.)

## D-41 — Parking of party[] and memory_trials[] (2026-10-21)

**Decision.** Both are built server-side and parked for UI/story. They un-park only after Priority 0 passes Wave 4 at 100%: the 4 video beats, the real 3-domain coda, hook-first/Warmth Shift audio, the clock scrubber, tap-to-pin, and the outage toggle.

## D-42 — Trust Card score hierarchy (2026-10-21)

**Decision.** The card renders proof in a fixed order — Lock Score (with floor and margin) → Consonant Skeleton → Articulatory Features — always from the payload's measured values, never hardcoded, so no judge misreads the 66% phonetic component as the grade. Two-tone pills: solid = server-enforced, hollow = brain-parsed. Component scores never display as the grade.

## D-43 — Unique satisfier: a domain decide rule (2026-10-21)

**Context.** The grocery hero (Alpro Oat No Sugars) survived the full gauntlet as the only row satisfying every stated requirement, yet scored 0.5619 against the 0.60 floor — its name resemblance is real but is not the evidence identity rests on in a descriptive domain (the user said "my usual oat milk", not a product name).

**Decision.** In domain decide, when exactly one candidate survives the full gauntlet (vetoes, spec contradictions, every stated requirement, the sponsored swap) and at least one requirement was stated, it locks on the gauntlet's evidence; the payload records `decide_basis: "unique_satisfier"` and the result text says "the only row that satisfies everything you stated." The phonetic floor still governs whenever two or more survivors compete or no requirement was stated. The floor's purpose is anti-guessing; a unique satisfier is not a guess.

## D-44 — Artist-named canonical (2026-10-21)

**Context.** On the Despacito chip, the (year, score) canonical sort saturated among same-year exact-title rows and crowned a bachata cover (El Vayven del Amor) canonical by pool order; the original-artist tiebreak then demoted Luis Fonsi as a "cover" of the cover. Canonical-by-pool-order is luck wearing a crown.

**Decision.** Under an originality selector, if a reference-pool row's lead artist grounds to a name spoken in the raw utterance (the said-span test applied to artists, threshold 0.85) and the sort's pick does not, the named row is canonical. The user's own words are the evidence; pool order is not.

## D-45 — Said-span reference discipline (2026-10-21)

**Context.** The host's extracted hint was being used as the grounding reference. A sabotage hint ("Saiyaara Remix") dragged the canonical family to the 2025 film and locked a reprise; a fragment-similarity repair then picked "woh original" as the reference span by a 0.005 noise margin.

**Decision.** Grounding is measured against words the user said: the reference is the peel window matched against the hint's CORE — the hint with version nouns and this call's vetoed words stripped. The hint remains fetch supply and is raced alongside the peel (dual race); it is never the scoring reference.


## D-46 — Clause-bounded veto binding (2026-10-21)

**Context.** Lane C's chip verification (run against the pre-grammar stack, reconciled by the principal) showed the peel vetoing the *wanted* version on "Play Kesariya slowed lofi, not the dance mix" — re-measured on the current code: the flat ±3-token binding window crossed the comma and banned lofi (span "lofi not"), while the dance mix got nothing.

**Decision.** Veto binding is clause-bounded: the utterance is segmented on clause punctuation (comma, semicolon, dashes), and a HARD_VETO marker binds a version noun only inside its own clause. True patterns are unaffected — "remix nahi" (same clause, noun-first) and "not the remix" (same clause, marker-first) both still bind; verified 8/8 across English, Hinglish, and Spanglish cases. The dance mix in the Kesariya chip is now the wanted-version machinery's job (it classifies as a remix-class version and the user asked for lofi), not a phantom veto's.
