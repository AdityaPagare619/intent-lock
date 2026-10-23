# FRICTION LOG — FINAL (paste-ready for the Devpost form)

**What this is:** the complete friction log — **24 real entries** — in the exact field structure the official rules specify for the friction-log bonus: one Devpost entry per block below, fields in Devpost's order: *Task attempted · Steps taken · Expected vs. actual · Severity · Workaround · Actionable suggestion*. Entries 1–16 (FL-01…FL-16) come from the team's dated build log; Entries 17–23 (FL-17…FL-23) are the Intent Lock build addendum of 2026-10-21; Entry 24 (FL-24) is clarified in this final pass from the locked spec (`docs/12_INTENT_LOCK_SPEC.md`) and the code that implements it (`server.py`, host-clock block) — it documents a design discovery, not a crash, and is labeled as such.

## The three platform discoveries (read these first)

1. **FL-17 — MCP Apps CSP is deny-by-default and fails *silently*.** Undeclared artwork/audio domains produce no error anywhere; the Trust Card simply renders broken. Found by audit, not by crash. (Entry 17)
2. **FL-18 — MCP sampling is deprecated (SEP-2577, spec revision 2026-07-28).** We had designed the tie-break on it. The replacement is architectural: the deterministic server returns `tie_choice`; the host re-calls with a `pin`, and the server re-verifies the pin before anything locks. (Entry 18)
3. **FL-24 — Host-clock isolation via `_meta.host_time`.** A rule like "after 10 PM" belongs to the user's clock, not the server's. Host time arrives per-request as `_meta.host_time`, is validated before any rule fires, and the server never silently trusts its own clock — server-local time is a labeled fallback only. (Entry 24)

**Ordering:** Devpost's rules state the log is assessed by Amazon's internal review team during **Stage 1** downselection, which recommends a bonus of **up to 10%** applied to the Stage 2 score. Entries are therefore ordered **platform/spec-facing first** (the feedback Amazon's teams can act on), then engineering lessons. Original IDs (FL-xx) are preserved so every entry traces to the repo's own history. Nothing was invented, inflated, or dropped: all 24 entries are here, including the ones that embarrass us.

**Paste method:** create one friction-log entry per block; if the form offers a single text box instead, paste the blocks in order, separated by the horizontal rules.

---

### Entry 1 — FL-02

- **Task attempted:** Recover "Lolly Pop La Gelu" from a mangled ASR transcript (phonetic resolution engine).
- **Steps taken:** Fed the raw transcript through Double Metaphone + Indic transliteration + YouTube autocomplete as spellchecker.
- **Expected vs. actual:** Expected the speech layer to pass phonetics through. **Actual:** upstream autocorrect rewrites the query ("Lolly Pop La Gelu" → "lollipop logically") *before* our tool ever sees it — the exact information needed for rescue is destroyed first.
- **Severity:** Critical
- **Workaround:** Reverse-engineer intent via phonetic skeleton + web-scale spellcheck arbitration — the entire reason our phonetic engine exists.
- **Actionable suggestion:** Offer an optional `raw_phonetic_ipa` field or N-best transcript array in the MCP context for ASR-originated calls, so tools can see what the mic actually heard.

### Entry 2 — FL-01

- **Task attempted:** Cancel text-to-speech mid-word via MCP stream cancellation (barge-in).
- **Steps taken:** Wired the interrupt tool to the MCP session's cancellation signal and measured where the playback cursor lands.
- **Expected vs. actual:** Expected the TTS playback word-offset to travel with the cancel. **Actual:** compute halts, but the TTS buffer keeps its own cursor — the offset never crosses the wire.
- **Severity:** High
- **Workaround:** Pair the server-side interrupt with browser-side word-boundary timestamps (Web Speech `boundary` events): the *browser* owns the cursor, the *server* owns the intent.
- **Actionable suggestion:** Standardize playback-cursor metadata (e.g. `x-mcp-playback-cursor`) on MCP cancellation notifications so any client/server pair can resume mid-word.

### Entry 3 — FL-04

- **Task attempted:** Browser `fetch()` to the MCP server carrying the `Mcp-Session-Id` header.
- **Steps taken:** Called the Streamable HTTP endpoint from the web simulator with custom `Mcp-Session-Id` + `MCP-Protocol-Version` headers, per spec.
- **Expected vs. actual:** Expected headers visible to the server. **Actual:** the browser hides custom response headers cross-origin unless explicitly exposed — the session was silently lost and every subsequent call failed as sessionless.
- **Severity:** Medium
- **Workaround:** Explicit `Access-Control-Expose-Headers: Mcp-Session-Id, MCP-Protocol-Version` on the server, plus a strict Origin allowlist (baked into our compose setup).
- **Actionable suggestion:** Document the expose-headers requirement in the MCP/Alexa+ web quickstart — every browser-based MCP client will hit this silently.

### Entry 4 — FL-03

- **Task attempted:** Survive a Spotify OAuth 401 mid-voice-turn with a graceful re-link.
- **Steps taken:** Caught the 401 in the ledger/relink tool and attempted graceful continuation of the voice turn.
- **Expected vs. actual:** Expected the turn to degrade gracefully with a re-link path. **Actual:** skill-link death drops the voice turn silently — the user just hears nothing.
- **Severity:** Medium
- **Workaround:** Emit JSON-RPC error `-32042` with a URL elicitation, rendering a one-tap re-link modal in the client instead of silent death.
- **Actionable suggestion:** Render URL elicitations natively on Echo Show / Fire TV (e.g. as a QR code) so account re-linking never requires leaving the device for a phone.

### Entry 5 — FL-11

- **Task attempted:** Debug an MCP server that returned HTTP 400 on every `tools/call`.
- **Steps taken:** Inspected our probe client; it converted response headers with `dict(resp.headers)` and looked up `Mcp-Session-Id`.
- **Expected vs. actual:** Expected the session-id lookup to work. **Actual:** `dict()` on headers is case-sensitive and the server sends lowercase `mcp-session-id` — the lookup returned `None`, every call went out sessionless → 400. The server was fine; the probe was broken. 20 minutes lost.
- **Severity:** Low
- **Workaround:** Use the HTTP message object directly (its `.get()` is case-insensitive); our test client does this now.
- **Actionable suggestion:** MCP client guidance should call out header-case normalization at the boundary — a spec-conformant server can still look broken to a naive client.

### Entry 6 — FL-05

- **Task attempted:** Launch the MCP server via `uvicorn src.server:app` for an independent verification.
- **Steps taken:** Ran the service-root package import path instead of the Dockerfile's script path.
- **Expected vs. actual:** Expected both launch modes to work. **Actual:** `ModuleNotFoundError: No module named 'session_store'` — the code relies on its own directory being on `sys.path`, which only happens in `python src/server.py` mode.
- **Severity:** Medium
- **Workaround:** The Dockerfile pins the one working launch (`python src/server.py`); the verify script documents the single true invocation.
- **Actionable suggestion:** For sample/reference MCP servers, prefer package-relative imports or a `src/__main__.py` so `python -m` and uvicorn-direct both work — launch-mode bugs are silent until judging day.

### Entry 7 — FL-13

- **Task attempted:** Trust the purity ranking on a title collision ("Play Raja Ji", `en-IN`).
- **Steps taken:** Ran the collision through the new two-stage guard and watched the verdict.
- **Expected vs. actual:** Expected the studio original to win. **Actual (first implementation):** a global locale boost (+0.15) outranked a 139-point purity gap — the karaoke version won, the ambiguity check never fired, and the UI text cheerfully lied: "studio original, no guess needed."
- **Severity:** High
- **Workaround:** Rebuilt ranking as two stages: a phonetic-relevance gate first (purity only ranks genuinely relevant candidates), then the collision rule — karaoke/bootleg junk (purity ≤ 0) can never reach the elicitation cards.
- **Actionable suggestion:** In any ranked media resolution, never let a small relevance bonus dominate a large quality gap — rank in stages, and run the quality-protecting stage first.

### Entry 8 — FL-14

- **Task attempted:** Resolve "Play Mujhe Tum Yaad Aana via Spotify" through the full phonetic → hydration stack.
- **Steps taken:** Ran the end-to-end flow; the phonetic sidecar returned the exact catalog title at score 1.006, with "Tunak Tunak Tun" second at 0.989.
- **Expected vs. actual:** Expected the exact title to play. **Actual:** the purity guard played "Tunak Tunak Tun" — 0.989 sits within the 5% phonetic relevance gate, so popularity outvoted an exact title match.
- **Severity:** High
- **Workaround:** **Fixed:** an exact-title short-circuit (Stage 0) — when the user's tokens contain the top candidate's title verbatim, the purity contest is restricted to same-title versions; the collision rule still elicits among true versions. Verified live: the exact title plays, genuine collisions still ask.
- **Actionable suggestion:** An exact title hit (phonetic score ≥ 1.0) should short-circuit quality re-ranking — popularity must never overrule the user saying the actual title.

### Entry 9 — FL-15

- **Task attempted:** Select the "Noida" persona on the live demo rig.
- **Steps taken:** Clicked "Noida" in the running simulator.
- **Expected vs. actual:** Expected the demo beat to load. **Actual:** the whole page crashed to a framework error overlay — "change in the order of Hooks called": a conditional early return sat between `useState` and `useEffect` calls. Production builds never catch this (runtime-only), and headless HTTP tests never render the component.
- **Severity:** High
- **Workaround:** **Fixed:** moved the persona gate below every hook call, with a comment explaining why; scanned all components for the same pattern (this was the only one); verified the beats load with no overlay.
- **Actionable suggestion:** No conditional return may sit above a hook call — ever — and every UI lane needs at least one real browser render pass, not just HTTP-level tests.

### Entry 10 — FL-16

- **Task attempted:** Play the three elicitation chorus hooks on a version standoff.
- **Steps taken:** Opened the elicitation cards and attempted playback of each hook.
- **Expected vs. actual:** Expected real hook audio per card (the audio files verified HTTP 200). **Actual:** all three cards showed "hook unavailable" — a cross-component contract break: the server emits track IDs (`rj-001`) but the audio file stems are semantic (`raja-ji-studio`); the 1:1 ID→URL mapping 404'd on every card.
- **Severity:** Medium
- **Workaround:** **Fixed:** resolve hook URLs semantically (title + kind first, a small alias table for title variants, raw ID-stem last); the player tries each candidate URL in order until one plays. Verified: all semantic URLs return 200 and hooks play on the live rig.
- **Actionable suggestion:** When two components own the two ends of a URL contract, the mapping must be semantic (title + kind), not positional (ID) — IDs are allowed to change; meanings aren't.

### Entry 11 — FL-09

- **Task attempted:** Call a TypeScript phonetic package from a Python MCP server (single source of truth for scoring).
- **Steps taken:** Evaluated the seam when the two implementations met: duplicate the scorer in Python and let them drift, shell out per call, or find something smarter.
- **Expected vs. actual:** Expected one obvious seam. **Actual:** none existed — the decision had never been made before the two lanes were built against each other.
- **Severity:** High
- **Workaround:** Decision-logged: a tiny Node stdio sidecar, spawned once at server startup; the TypeScript implementation stays the single source of truth; loud fallback if Node is missing.
- **Actionable suggestion:** Decide cross-language seams *before* parallel workstreams close — a decision-log entry is cheaper than the 3 AM argument.

### Entry 12 — FL-10

- **Task attempted:** Wire chaos/fault toggles into the MCP server.
- **Steps taken:** Asked "tool call vs header vs flag?" after the server lane had already closed.
- **Expected vs. actual:** Expected the wire contract for fault injection to be decided with the tool contract. **Actual:** the header design (`X-Chaos-Fault`, honored only when the server is armed with `--chaos`) was decided *after* the server shipped — the next wave had to retrofit it.
- **Severity:** Medium
- **Workaround:** Decision recorded; the following wave implemented per-request fault headers (`upsell_trap`, `ghost_action`, `token_expired`, `isp_blackout`) in the rewrite.
- **Actionable suggestion:** No wire-affecting decision after a component closes without its owner's sign-off — or budget the retrofit explicitly.

### Entry 13 — FL-06

- **Task attempted:** Run the documented phonetic test command (`pnpm test`, per the plan).
- **Steps taken:** Typed the documented command on the build machine.
- **Expected vs. actual:** Expected `pnpm` to be present. **Actual:** `pnpm` is not installed anywhere on the box — only npm.
- **Severity:** Low
- **Workaround:** Ran `npm test` (25/25 pass); flagged so no script assumes `pnpm`.
- **Actionable suggestion:** Pin the package manager in the repo (`packageManager` field / corepack) and assert it in the dev entrypoint — "works on my machine" starts here.

### Entry 14 — FL-07

- **Task attempted:** Keep the MCP server port stable while four parallel workstreams and verification iterated against it.
- **Steps taken:** Polled the health endpoint across the build; consumer proxies logged honest 502s during restarts.
- **Expected vs. actual:** Expected the dev server to stay up while others built around it. **Actual:** overlapping test restarts and process-kill churn made the port flap — every consumer saw phantom failures that looked like product bugs.
- **Severity:** High
- **Workaround:** Consumers return an honest 502 + "no session" UI state instead of fake data; the chaos suite spawns its own armed fixture instead of sharing the dev port.
- **Actionable suggestion:** One owner per port, always; the dev entrypoint should print the owning workstream in its banner so a stray process-kill is a conscious act, not a reflex.

### Entry 15 — FL-08

- **Task attempted:** Boot the multi-service repo from its `docker-compose.yml`.
- **Steps taken:** Ran `docker compose config` against the delivered paths.
- **Expected vs. actual:** Expected the MCP service directory to exist under the repo root. **Actual:** one workstream had built it one level *above* the root — every build context in the compose file pointed at nothing.
- **Severity:** Medium
- **Workaround:** Moved the tree into place and merged the coordination notes; compose re-validated.
- **Actionable suggestion:** In multi-workstream repos, a single root owner publishes the skeleton tree first, and CI fails the build if a service lands outside it.

### Entry 16 — FL-12

- **Task attempted:** Revert the service topology from 2 services back to 4, mid-build.
- **Steps taken:** Rewrote the compose file, restored the orchestrator and chaos services, reopened two workstreams, and re-pointed the README's run guide.
- **Expected vs. actual:** Expected topology to be settled before workstreams open. **Actual:** a founder-level reversal hours before the deadline, while parallel work was mid-flight on the old topology.
- **Severity:** High
- **Workaround:** The revert was recorded in the decision log with its reasoning; the test suite never assumed a service count (it probes the wire, not the topology), so verification survived the change.
- **Actionable suggestion:** Topology is a founder decision: get it signed *before* parallel work launches, and put the signature and date in the decision log.

---

*Source: the team's working build log, entries FL-01…FL-16, written during the build (Oct 18–20, 2026); Entries 17–23 added during the Intent Lock build (2026-10-21); Entry 24 (FL-24, host-clock isolation) clarified in the final pass from `docs/12_INTENT_LOCK_SPEC.md` and `server.py` — a documented design discovery, not an invented incident. This final version only re-orders, de-duplicates meta-commentary, and maps each entry onto Devpost's six required fields — no entry was softened, dropped, or invented. Prepared 2026-10-20; final pass 2026-10-21.*


---

## Addendum — Intent Lock build (2026-10-21)

### Entry 17 — FL-17

- **Task attempted:** Render catalog artwork and preview audio inside the MCP App (Trust Card).
- **Steps taken:** Built the card, loaded it in a spec-conformant host, watched artwork and audio fail with no console error, then read the MCP Apps CSP rules.
- **Expected vs. actual:** Expected CSP to fail loudly. **Actual:** MCP Apps CSP is deny-by-default — without explicit `resourceDomains` AND `connectDomains` in `_meta.ui.csp`, media fails *silently*.
- **Severity:** Medium
- **Workaround:** Declared both domain lists on the deck; verified media loads.
- **Actionable suggestion:** The spec should require hosts to surface CSP-blocked resources in a debug channel; silent media failure cost hours.

### Entry 18 — FL-18

- **Task attempted:** Decide the tie-breaking mechanism for the 2025-11-25 target spec.
- **Steps taken:** Researched MCP Sampling as the in-server tie-breaker against primary sources before building on it.
- **Expected vs. actual:** Expected sampling to be a stable foundation. **Actual:** Sampling is deprecated (SEP-2577, spec revision 2026-07-28) — building on it would have dated the entry on arrival.
- **Severity:** Medium
- **Workaround:** MRTR-shaped pin flow (SEP-2322): the deterministic server returns `tie_choice`; the host re-calls with a verified pin. Two ordinary tool calls, no deprecated surface.
- **Actionable suggestion:** Deprecation notices should be surfaced in the spec's tool-authoring guides, not only in the changelog — authoring against a dying primitive is an easy trap.

### Entry 19 — FL-19

- **Task attempted:** Fetch a spelling-mangled title ("Sayaraa") from spelling-based catalog APIs.
- **Steps taken:** Raced iTunes/MusicBrainz/YouTube Suggest with the heard form, inspected the returned pools, and measured similarity of the said form against the canonical title with PanPhon.
- **Expected vs. actual:** Expected the catalogs to fuzzy-match a one-glide misspelling. **Actual:** they are spelling-based — "Sayaraa" returns a Sahara-only pool; the correct song is absent, not merely misranked. Phonetic distance (0.66) is far from string distance, so string-similar hints mislead twice.
- **Severity:** High
- **Workaround:** Deterministic respelling variants (glide insert/delete, y↔j, v↔w, doubled-vowel collapse) race alongside the heard form; an audited snapshot unions into every race; below the honesty floor the offline vault unions in too.
- **Actionable suggestion:** Catalog search APIs should offer a phonetic/sounds-like match mode; every voice integration currently re-implements it badly.

### Entry 20 — FL-20

- **Task attempted:** Prove a hosted LLM's extraction could not resurrect a server-banned version.
- **Steps taken:** Audited the elimination loop and found the karaoke-class exception keyed on the *host's* include_tags; reproduced a lock of "Kesariya (Official Instrumental)" when the host named the trap's class.
- **Expected vs. actual:** Expected server vetoes to be absolute. **Actual:** a probabilistic hint could reopen a hard trap — the Unverified Action Boundary existed inside our own engine.
- **Severity:** High
- **Workaround:** The exception now comes only from the user's own words in the raw utterance, and never when the class is vetoed. Verified offline with a stubbed pool: the instrumental dies as a trap even when the host begs for its class.
- **Actionable suggestion:** Any host-supplied field that can weaken a server-side safety verdict should be treated as a vulnerability class in MCP server reviews.

### Entry 21 — FL-21

- **Task attempted:** Keep per-turn latency acceptable with a Gemini-powered host brain that also speaks (TTS).
- **Steps taken:** Timed extraction arrivals, isolated the TTS path, and found the pinned preview TTS model charging a ~25 s cold inline cost on *every* turn, text-only turns included, until the 30 s client budget died and a local floor silently took over.
- **Expected vs. actual:** Expected TTS cost only on spoken turns. **Actual:** a model pin plus eager warm-up turned a voice feature into an extraction outage, and the fallback hid it.
- **Severity:** Medium
- **Workaround:** TTS moved to the lite model with an explicit warm window; extraction source is reported per turn so a fallback can never masquerade as the brain.
- **Actionable suggestion:** Silent fallbacks should be loud in telemetry by default; a demo that cannot tell which brain answered cannot be trusted.

### Entry 22 — FL-22

- **Task attempted:** Restart demo services during integration.
- **Steps taken:** Hand-started the orchestrator; watched the supervisor reap it within a minute and respawn its own canonical command; a stale simulator build kept serving an old deck in parallel.
- **Expected vs. actual:** Expected a started process to stay started. **Actual:** the supervisor owns the lifecycle — hand-started instances are reaped, and "the server is up" can mean an old build.
- **Severity:** Medium
- **Workaround:** All restarts go through the project's `demo-up.sh` (the supervisor's own commands); liveness is verified by content (a current-code endpoint), never by port alone.
- **Actionable suggestion:** Dev-stack supervisors should print their canonical start commands and detect foreign instances on their ports.


### Entry 23 — FL-23

- **Task attempted:** Bind spoken negations to the version they ban ("not the remix", "remix nahi").
- **Steps taken:** A flat ±3-token window around each negation marker; chip verification then read the payload's veto list on "Kesariya slowed lofi, not the dance mix".
- **Expected vs. actual:** Expected the dance mix to be banned. **Actual:** the window crossed the comma and vetoed the *wanted* lofi — the span "lofi not" is in the payload as proof of the misread.
- **Severity:** Medium
- **Workaround:** Clause-bounded binding: a marker binds only inside its own punctuation-delimited clause. All true patterns (English marker-first, Hinglish noun-first, Spanglish "sin") verified 8/8 after the change.
- **Actionable suggestion:** ASR transcripts carry clause punctuation inconsistently across providers; negation-scope features in voice stacks should be specified against clause structure, not raw token distance.

### Entry 24 — FL-24

- **Task attempted:** Evaluate spoken time rules ("after 10 PM, Saiyaara means the lofi version") against the correct clock in a deterministic MCP server.
- **Steps taken:** Read the rule-evaluation path against the locked spec (`docs/12_INTENT_LOCK_SPEC.md`: host time arrives per-request as `_meta.host_time` — never as a caller argument) and the implementation (`server.py`: per-request `_meta` is extracted into the call context; the host time is validated against an `HH:MM` pattern before any rule fires; the result records which clock source was used).
- **Expected vs. actual:** Expected a server to be able to use its own clock. **Actual:** server-local time is the *wrong* clock for a user's rule — the server may sit in another timezone, and a caller-supplied time *argument* would be unverifiable input a host could spoof. Either shortcut silently breaks the promise the rule makes.
- **Severity:** Medium
- **Workaround:** Host-clock isolation, as built: time travels only as per-request `_meta.host_time` from the host; the server validates its shape, evaluates rules against it, labels the time source on the result, and treats server-local time as a labeled fallback only — never as a silent substitute.
- **Actionable suggestion:** Standardize a per-request host-context channel in MCP (host clock, locale, device class) as documented `_meta` keys, so every rule-aware tool does not have to invent this convention privately. (This is feature request #2 in the submission packet's product feedback.)
