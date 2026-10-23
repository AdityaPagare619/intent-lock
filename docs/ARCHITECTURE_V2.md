> **SUPERSEDED — the canonical architecture is docs/12_INTENT_LOCK_SPEC.md and docs/architecture-main.png. This file is kept as design history.**

# Architecture v2 — Final Architecture & Engineering Blueprint (retired)

> **⚠ SUPERSEDED — historical design document (2026-10-19).** This blueprint describes the retired four-tool v1 story (Graceful Yield, ledger, multiroom). The product that ships is **Intent Lock**: see `README.md` and the locked spec `docs/12_INTENT_LOCK_SPEC.md`. Kept in the tree as an honest build record, not as judge-facing product documentation.
### The Yap Patrol · Amazon "Build, Ship, Shape" · Alexa+ Track
*Audit-grade redesign. Author: Petu (principal). Date: 2026-10-19.*

**One-line verdict:** Keep the 4 services, the 10 problems, the 4-tool contract, and Graceful Yield. Rebuild the *insides* to the engineering standard in Aditya's shared docs — adopt what they prove, adapt what they overclaim, and fix what they get wrong. The docs are the audit bar, not a copy-paste template.

**Non-negotiables (founder law):** 10 problems stay · 4-service topology stays (D-08) · tool contract stays (D-04) · no EARSHOT fallback (D-05 vacated) · Graceful Yield overrules the docs' "guillotine" language wherever it appears · ₹0 forever · **zero-settings: the user installs the MCP and touches nothing else.**

---

## 1. HLD — Service topology (what exists, rebuilt professionally)

```
┌─────────────────────────────────────────────────────────────────────┐
│ LAYER 1 · :3000  alexa-plus-simulator  (Next.js 15 / React 19)      │
│  The stage. Simulates the Alexa+ device. Everything judges see.     │
│  Sub-layers:                                                        │
│   1a. Persona & Chaos Switchboard  (4 personas, 4 fault toggles)     │
│   1b. Voice Front-end  (mic VAD → banter/barge-in classifier)       │
│   1c. Studio Deck  (phonetic morph card, vinyl standoff, ledger,    │
│       multiroom, bunker, wire inspector)                             │
│   1d. /api/mcp proxy  → PRIMARY :4000, FALLBACK :8080 (D-08)         │
│   1e. Edge DSP workers  (banter/barge gate, chorus extractor,        │
│       PID phase-lock, IndexedDB bunker) — NEW from audit             │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTP (real)
┌──────────────────────────────▼──────────────────────────────────────┐
│ LAYER 2 · :4000  alexa-agent-orchestrator  (Node 20+, zero deps)     │
│  The brain. Real MCP 2025-11-25 client + intent router.              │
│  Sub-layers:                                                        │
│   2a. MCP client  (handshake → session → tools/call → SSE parse,    │
│       re-init on 400/404, Last-Event-ID replay)                     │
│   2b. Two-tier router — Tier 0: deterministic reflex grammar        │
│       (<5ms, compiled patterns) · Tier 1: agentic path (ledger-      │
│       enforced).  [ADAPTED: docs' ONNX tier deferred — §4]           │
│   2c. Latency profiler  (stamps edge_fastpath_ms on every turn)      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ MCP Streamable HTTP (real wire)
┌──────────────────────────────▼──────────────────────────────────────┐
│ LAYER 3 · :8080  omnibeat-mcp-server  (Python/FastAPI)  ★ deliverable│
│  The firewall. 4 tools, 2 resources, 5 engines.                     │
│  Sub-layers:                                                        │
│   3a. Wire layer  (CORS gate, session mint, SSE streaming,          │
│       elicitation, -32042, Last-Event-ID replay log)                │
│   3b. Engine orchestrator  (tool → engine pipeline, stage text)     │
│   3c. E1 Phonetic Judo  (sidecar v2: VPPS + YouTube Suggest)         │
│   3d. E2 StudioPureGuard  (purity + dynamic hooks)                  │
│   3e. E3 Graceful Yield  (barge-in shapes)                          │
│   3f. E4 TruthLedger  (hash-chained SQLite WAL)                     │
│   3g. E5 EdgeSync  (sync/bunker manifests, PID telemetry)           │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTPS (keyless, zero-cost)
┌──────────────────────────────▼──────────────────────────────────────┐
│ LAYER 4 · :9000  chaos-and-provider-mock  +  $0 OPEN MEDIA TRIAD     │
│  The lab + the planet. Chaos faults for demos; real keyless APIs     │
│  for production resolution.                                         │
│   4a. Chaos injector  (X-Chaos-Fault, --chaos armed only)            │
│   4b. YouTube Suggest arbitrator  (keyless typo planet) — NEW       │
│   4c. iTunes Search hydrator  (keyless 30s previews) — NEW          │
│   4d. MusicBrainz canonicalizer  (ISRC ontology) — NEW              │
└─────────────────────────────────────────────────────────────────────┘
```

**What changed vs v1:** Layer 3's E1/E2 gain the zero-cost triad (4b–4d); Layer 1 gains the edge-DSP worker suite (1e); Layer 2's router is formalized as a two-tier FSG + agentic design. Nothing else moves — the topology judges saw in the demo is the topology that ships.

---

## 2. LLD — Per-engine decisions (adopt / adapt / drop, with reasons)

### E1 · Phonetic Judo — ADOPT the docs' VPPS stack (biggest upgrade)
**Today:** Double-Metaphone-style skeleton + 30-track hardcoded catalog. Dies on any unscripted song — exactly what the docs' gap analysis predicts, and exactly what a judge will try.

**v2 pipeline (4 stages):**
1. **Frame peeler** — multilingual regex (wake words: alexa/oye alexa/suno alexa; verbs: play/chalao/bajaao/pon; providers: spotify/jiosaavn/gaana/wynk; trailing fillers: "song chalao"). Detects explicit live/remix intent (kills the "user asked for live but got studio" bug class).
2. **VPPS encoder** — ASR homophone clusters (lolly pop→lollipop, roger g→rajaji, stomach shallow→chammakchallo, this pa seat oh→despacito…) + digraph normalization, **vowels preserved** (the docs are right: Metaphone deletes vowels; in Hindi/Bhojpuri vowels carry the word).
3. **Articulatory edit distance** — substitution cost by vocal-tract group (labial b↔v = 0.18, not 1.0). This is the 100x insight: it models *why* accents confuse ASR instead of string-matching the confusion.
4. **Zero-cost arbitration (NEW, verified live 2026-10-19):** `suggestqueries.google.com/complete/search?client=youtube&q=<payload>+song` — I tested it: "lolly pop la gelu song" → top hit "lollipop lagelu song". Planetary typo correction, $0, keyless (measured ~1–1.8s on a real connection per D-16; the local VPPS path is offline, ~0.3ms). **Fallback chain:** Suggest → local VPPS vs catalog → raw payload. Never hard-fail.

**Catalog hydration (NEW):** iTunes Search API (verified live: real trackName/trackId/previewUrl for "Lollipop Lagelu"). 30s AAC previews = real audio = real dynamic hooks (§E2). MusicBrainz for canonical ISRCs. The 30-track mock becomes the **offline fallback**, not the primary.

### E2 · StudioPureGuard — ADOPT regex-token purity + dynamic hooks
**Today:** kind-based weights (+40/−55/−65/−35/−100). Correct spirit, but `kind` is catalog metadata — a judge's iTunes result has no `kind` field.

**v2:** score from the **track text itself** (trackName + collectionName):
- LIVE_TOKENS `\b(live|concert|unplugged|tour|stadium|session|mtv|bbc)\b` → −65 (unless user explicitly said "live" — intent detection from E1)
- FAKE_TOKENS `\b(karaoke|tribute|in the style of|instrumental|8-bit|ringtone|cover)\b` → −80
- REMIX_TOKENS → −40 (unless explicitly requested)
- Upsell trap → −150 + firewall block + telemetry badge
- `P = 100·vpps_sim + 15·popularity01 + 35·studio − penalties` (docs' formula; popularity scaled so phonetics dominates — fixes our FL-14 class permanently, no special-case needed)

**Dynamic chorus hooks (NEW, replaces fixed WAVs):** decode the 30s iTunes preview in-browser, slide a 3.0s window, score each frame `RMS × (0.65 + 0.35·spectralFluxProxy)`, pick the max between t=2.5s and t=25s. No more hardcoded timestamps, no more synthetic motifs. (Docs' Document 6 algorithm, adopted verbatim — it's correct DSP.)

**Elicitation rule (kept, formalized):** confidence margin = P1 − P2. Zone A (≥15): play. Zone B (<15, both studio): SEP-1330 hooks, ask. Zone C (no candidates / offline): bunker.

### E3 · Yield — ADAPT: keep Graceful Yield, adopt the acoustic gate
**Docs say "guillotine". Founder says no.** The mechanism is adopted, the framing is overruled:
- **Adopt:** the `AcousticBanterAndBargeInGate` DSP — SNR + ZCR-variance + pitch-variance at 60fps, 5-frame sustain (~250ms) before barge-in fires, banter shield on high pitch variance. This is strictly better than our current RMS+pitch heuristic (we had the right idea; they have the math).
- **Keep:** Graceful Yield shapes (SOFT_YIELD/HARD_BARGE), ≤15-word clamp, resume offer. The docs' "3-word clamp" is *ruder* than our design — Aditya's human-like bar wins.
- **Adopt:** Tier-0 formal grammar for reflex intents (<5ms); **defer** the ONNX embedding tier (docs claim 12ms; real cost is a 30–90MB model download — wrong tradeoff for a zero-settings demo; documented as Phase 2).

### E4 · TruthLedger — ADOPT hash chain (we're 80% there)
**Today:** SQLite WAL, actor types, SNR>12dB gate, ghost rollback, −32042. **Gap:** no hash chain — our rows are append-only but not tamper-evident.
**v2:** add `prev_hash`/`entry_hash` (SHA-256 over prev_hash|ts|actor|snr|new_state), genesis `0×64`. Verification walks the chain. This is the difference between "a log" and "a proof" — judges pull repos; the chain survives that.
**Keep:** our −32042 flow (already matches the docs' SEP-1036).

### E5 · EdgeSync — ADOPT PID, keep bunker, add replay interface
**Today:** DelayNode drift measurement + IndexedDB bunker (works, demo-proven).
**v2:** replace the snap-to-lock with the docs' **PID controller** (Kp=0.0008, Ki=0.00004, Kd=0.0002, ±1.5% rate clamp, 0.5ms deadband) — smooth glide instead of jumps, zero clicks. Adopt the **CRDT mutation queue interface** (queue offline commands → replay via Last-Event-ID on reconnect); keep our implementation simple.

---

## 3. The 3-gate funnel (the unifying principle — NEW)

Every request now flows through the same funnel. This replaces our ad-hoc per-engine thresholds:

```
GATE 1 · PHYSICAL (edge, before text exists)
  mic SNR + VAD + pitch variance → SILENCE / BANTER_SHIELD / BARGE_IN
  "Is a human actually talking to me?"  (kills ghost triggers at the edge)

GATE 2 · CONFIDENCE (resolver, never guess when unsure)
  margin = P1 − P2
  Zone A (≥15) → play immediately + 150ms chime
  Zone B (<15)  → SEP-1330: 3 dynamic hooks, one-word pick
  Zone C (none/offline) → bunker match by tempo/mood
  "How sure am I?"  (kills wrong-song plays)

GATE 3 · PROVENANCE (state, zero hallucination surface)
  every mutation needs a hash-chained ledger row with SNR>12dB
  no provenance → ghost → rollback + apology (mathematically provable)
  "Did a human cause this?"  (kills gaslighting)
```

## 4. Zero-settings law (the spirit, engineered)

**Law:** the user installs the MCP. Nothing else. Every manual step in v1 is a bug; here are the fixes:

| v1 manual step | v2 fix |
|---|---|
| `ALLOWED_ORIGINS` env var | Derive from the request `Origin` header; localhost always allowed. Zero config. |
| 4 terminals to run | `make demo` → one command (compose when Docker exists; `scripts/demo-up.sh` otherwise) |
| venv path memorization | `scripts/bootstrap.sh` creates/uses the venv automatically |
| Editing `catalog.ts` to add songs | iTunes hydration — any song in the iTunes catalog resolves; beyond the catalog, VPPS + the offline bunker; mock catalog is offline fallback only |
| Dropping WAVs into `public/hooks/` | Dynamic DSP extraction from real 30s previews |
| VAD model download | Already bundled in `public/vad/` (keep) |
| Finding the right tool/utterance | The simulator's persona beats are one click; the wire inspector teaches the protocol |

## 5. Zero-cost data pipeline topology (NEW)

```
utterance
  → E1 frame peel (local, <2ms)
  → Path A: YouTube Suggest arbitrate (keyless, ~1–1.8s measured; D-16) ─┐
  → Path B: local VPPS vs catalog (offline-safe) ────────┤→ canonical query
  → iTunes Search (keyless, ~0.7s measured live): 30s AAC + artwork ───┤→ candidates
  → MusicBrainz (keyless): ISRC canonicalization ────────┘
  → E2 purity + dynamic hooks → play / elicit / bunker
```
**Fallback invariant:** if all three externals fail → local VPPS + mock catalog + bunker. The demo never hard-fails; the judge's laptop with no network still gets a full show. (Docs' 3-entry fallback map is weak — ours keeps the full 30-track catalog as fallback.)

## 6. Wire contract — UNCHANGED (D-04 stands)
4 tools, 2 resources, protocol 2025-11-25. The docs' reference code is a **single-file monolith** — our modular `engines/` + 4-service split is better engineering and stays. (Their `fastpath_slice` = our `fastpath_interrupt`; their payload shapes are compatible.)

## 7. Test matrix — extended to the docs' 10 with SLAs
Our `run_10_global_tests.py` already covers F-01…F-10. v2 adds the docs' quantitative bars: TC-02 frame peel <3ms & Sim_VPPS ≥0.90 · TC-03 arbitration <65ms $0 (bar applies to the local VPPS path; the keyless Suggest path is budgeted at 2.5s per D-16 measured reality) · TC-05 fastpath <50ms · TC-07 barge-in slices at exact word_index · TC-08 zero-dropout crossfade + Last-Event-ID resume · TC-09 PID converges <0.5ms in <1.8s, rate within [0.985, 1.015] · TC-10 −32042 modal. Plus the OSS package's 25 VPPS unit tests (adopted into our suite).

## 8. Red-team: weaknesses found in the shared docs (honest audit)
1. **Their web app is mocked.** `Math.random()` hashes, `setTimeout` latencies, fake wire frames — ours shows the real wire. Adopt their *aesthetic*, never their mock patterns. **This is the biggest doc weakness.**
2. **Latency numbers are uncalibrated** (38ms, 12ms, 5ms) — no measurement harness cited. Ours are measured live.
3. **YouTube Suggest JSONP parsing is brittle** — their regex assumes one shape; needs defensive parsing + the fallback chain (§2).
4. **iTunes previews are signed/expiring** — resolve per session, never cache (we learned this in the wave).
5. **ONNX tier is a heavy dependency** for a zero-settings demo — deferred, documented.
6. **"Guillotine" framing** contradicts the founder's human-like directive — overruled.
7. **Their fallback map has 3 entries** — insufficient; our 30-track catalog stays as fallback.
8. **Single-file server.py** — worse than our modular layout; not adopted.

## 9. Migration plan (code: migrate in place, no rewrites from scratch)
- **Phase A (engines):** E1 sidecar → VPPS + clusters + articulatory distance (port docs' TS into our sidecar; it's already the OSS package shape) + Suggest/iTunes hydration in `server.py` with fallback chain. E2 → text-token purity + dynamic hooks endpoint.
- **Phase B (edge):** `workers/edge_dsp.ts` (banter/barge gate), `workers/chorus_extract.ts` (DSP), PID in `multiroom_clock.ts`, hash chain in `truth_ledger.py`.
- **Phase C (zero-settings):** `bootstrap.sh`, `make demo`, dynamic CORS, tactile reskin tokens.
- **Phase D:** extend test matrix to the 10 TC SLAs; re-shoot demo.

## 10. Operation flow
`make demo` → open `:3000` → pick persona → every beat runs the funnel (Gate 1→2→3) → wire inspector proves it. Test your own song: type it badly (E1 rescues) or say any real song on Earth (iTunes hydrates). No settings, no keys, no config — install the MCP and talk.
