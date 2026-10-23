# 12 — Intent Lock: The Locked Spec

*Status: LOCKED — founder GO given 2026-10-21, with three surgical
refinements folded in (Hinglish + accent on stage in Beat 1; host-extracted
structure in the schema; F-01 defined honestly). This spec supersedes the
four-tool story of `docs/11_NEURO_SYMBOLIC_REARCHITECTURE_SPEC.md`. The v2
branch code is substrate; this document is the product.*

*Aligned to **v1.1** on 2026-10-21 (JUDGMENT + SYNTHESIS + the founder's
architectural correction): the tie is settled by a re-verified host pin,
never by a model inside the server; the constraint grammar is the
Universal Sub-Local Operator Grammar (`sublocal_grammar.json`); the tool
takes a `domain` and runs commerce and grocery through the same pipeline;
kill channels include `spec_contradiction` and `rule_override`; EXACT_LOCK
raises the floor; thin pools refuse. Where a name in this document and a
name in the code differ, **the code wins** (`artwork_url`, `preview_url`).*

## The superpower

One tool. One name. **Intent Lock.**

The user speaks like a human — messy, mixed-language, half-remembered.
The engine locks the exact item. The screen shows the proof.

The category is the **Universal Deterministic Action Firewall** — a
Software 3.0 neuro-symbolic kernel: the host brain proposes
(probabilistic), this server proves (deterministic). The MCP App view is
called the **Trust Card**. "Intent Lock" is the hero name. Nothing else
gets a name.

## The one tool: `intent_lock`

### Inputs

| Field | Type | Required | Meaning |
|---|---|---|---|
| `utterance` | string | yes | The raw ASR transcript. Phonetic scoring runs on this, never on a cleaned-up version. |
| `domain` | string | no | `"music"` (default) \| `"commerce"` \| `"grocery"`. Selects the catalog adapter; the pipeline is identical for all three. |
| `extracted_title_hint` | string | no | What the host brain thinks the title is. A hint only — the server verifies it. |
| `include_tags` | string array | no | Structure the host brain extracted: `["film", "original", "slow"]`. Advisory — host tags can never resurrect a hard trap. |
| `exclude_tags` | string array | no | Structure the host brain extracted: `["remix", "live", "karaoke"]`. Advisory; the server's own vetoes (below) outrank it. |
| `rule` | object | no | `{ after_time: "22:00", version: "lofi", artist: "...", dsp: { preset: "…" } }` — a voice rule (Taste Lock) to write with this call. |
| `pin` | object | no | `{ source, track_id }` (+ optional `pin_reason`) — the host settling a `tie_choice`. The server re-verifies the pin against the fresh pool and every ban before it can lock. |
| `reject` | object | no | `{ source, track_id }` — one symmetric "not this one": a subtraction-only re-run plus a persisted negative entry. |
| `candidate_hints[]` | string array (≤4) | no | Memory-trial hints, grounded through the same pipeline. **Server-side only; the stage UI is PARKED by founder triage order.** |
| `party[]` | array | no | Per-speaker constraints. **PARKED by founder triage order — no build, no stage time until the Wave 4 gate passes.** |

Host time arrives per-request as **`_meta.host_time`** — never as a caller
argument. A rule fires against the host's clock, not a clock the caller
claims. Server-local time is a labeled fallback only.

The split is the whole architecture in one schema:

- **The host brain parses language.** Alexa+ in production. Gemini 3 Flash
  in the simulator. It turns a sentence into structure.
- **The server verifies.** Phonetic math and catalog data decide what is
  true. The host's structure is input, never verdict. The server contains
  **no model** — an earlier in-server tie-break model was deleted on
  principle: a second LLM judging the first is correlated risk, not a
  boundary.
- **The raw words outrank the extraction.** Operators compiled from the
  user's own utterance (Stage A) are server law: they stand even when
  the host's advisory extraction omits or contradicts them.

### Output — `structuredContent`

- `status` — `locked` | `tie_choice` | `no_lock`
- `heard` — the raw transcript, exactly as it arrived
- `rescued` — the canonical title the phonetics recovered
- `locked` — `{ title, artist, version, year, artwork_url, preview_url, source, track_id }`
- `tied[]` — on `tie_choice`, both named survivors with track IDs (the
  card renders ties from `tied[]`, never from `locked`)
- `eliminated` — max 4 rows: `{ title, artist, version, source, reason,
  score, phonetic_pct, kill_channel }`. The reason is a plain sentence:
  *"Remix — you said not the remix."*
- `operators[]` — the compiled operators for this call:
  `{ op, locale, token, target }` — e.g. the card pill
  `✕ REMIX — HARD VETO [hi-IN: "nahi" → OP_VETO]`
- `vetoes[]` — the hard vetoes fired from the raw words, with the marker
  token and its locale
- `grounding` — `{ ref_text, said_ipa, locked_ipa, phonetic_pct, vpps_pct,
  lock_score, floor }` — every value measured by the pipeline run that
  displays it; fields hide when absent, never estimated
- `constraints_echo` — the two-tone grammar for the card: solid pills =
  server-enforced, hollow pills = brain-parsed
- `telemetry` — `{ server_ms, fetch_ms, decide_ms, per-source status,
  pool counts, time_source }` — measured, or the field is absent
- `tie_break` — `{ by: "host", chose, why }` or `null` — `why` is the
  brain's stated reason, labeled as commentary, never as server proof
- `rule_active` — one plain sentence or `null`:
  *"After 10 PM, Saiyaara means the lofi version."*

The result carries `_meta.ui.resourceUri` pointing at the Trust Card.
The card renders human words and the measured numbers, in the fixed
hierarchy: **Lock Score (floor + margin) → Consonant Skeleton →
Articulatory Features**. The deck declares its CSP explicitly
(`resourceDomains` + `connectDomains`) — MCP Apps CSP is deny-by-default
and fails silently.

## The pipeline — five stages (A–E)

1. **Stage A — Operator Compiler.** `frame_peel` reads
   `sublocal_grammar.json`: code-switched tokens across locales (hi-IN,
   ta-IN, es-US, en-GLOBAL) compile into four universal operators —
   **HARD_VETO (≠)** (negation bound ≤3 tokens from a variant noun;
   non-removable by the host), **CANONICAL_ORIGIN (t₀)** (earliest
   verified year + canonical creator), **EXACT_LOCK (≡)** (exclusivity;
   raises the never-guess floor by **+0.10** for the call and bans
   variant substitution), **CONTEXT_ANCHOR (@)** (domain/family tokens;
   arbitrates the entity family before phonetic distance). A new dialect
   is lines of JSON — zero code.

   **Stage A, stated formally.** Every ask *u* compiles to a constraint
   set:

   > C(u) = MUST(p₁…pₙ) ∧ ¬VETO(q₁…qₘ) ∧ ANCHOR(a) ∧ TEMPORAL(t_host)

   MUST — the positive demands a survivor must satisfy (EXACT_LOCK `≡` /
   OP_EXACT exclusivity; CANONICAL_ORIGIN `t₀` / OP_ORIGIN). ¬VETO — the
   banned variants (HARD_VETO `≠` / OP_VETO, compiled from the raw
   transcript). ANCHOR — the entity family fixed before phonetics speak
   (CONTEXT_ANCHOR `@` / OP_ANCHOR). TEMPORAL — Stage B's standing rules
   evaluated against `_meta.host_time`. The shape is LLM-Modulo: the
   host brain proposes extractions and candidates, but the kernel
   compiles the raw transcript itself — a host extraction can add
   candidates, and it can never remove a veto the transcript carries
   (saboteur S2 and S7 attack exactly this, and fail).
2. **Stage B — Temporal Entity Memory Injection.** Stored Taste Lock
   rules are evaluated against `_meta.host_time` **before** fetching. A
   fired rule expands the search variants with its version
   (`<title> <rule.version>`), so the rule's supply exists before
   elimination begins.
3. **Stage C — Supply Harvester + Variant Expander.** Deterministic
   spelling variants of the heard words (glide insert/delete, y↔j, v↔w,
   doubled-vowel collapse, word-boundary joins) race the catalogs under
   one shared deadline — music: iTunes ∥ MusicBrainz ∥ Deezer (YouTube
   Suggest rides as a spelling oracle only — it corrects the heard
   words' spelling and never supplies a row);
   commerce/grocery: the domain's audited catalog pack. Every race is
   unioned with the audited snapshot pack on core-title match. All supply
   normalizes into one **Universal Candidate Tensor**:
   `{ id, source, title, creator_or_brand, edition_or_variant, year,
   claimed_tags[], verified_specs{}, provenance }`. Duplicate recordings
   merge before scoring. A pool thinner than **eight non-vault rows**
   refuses (`fail_kind: "thin_pool"`) — supply is evidence, and thin
   evidence means no lock.
4. **Stage D — Articulatory Entity Grounding.** Context anchor first:
   the family containing the anchored context wins before phonetics
   speak. Then PanPhon articulatory features (70%) + consonant skeleton
   (30%) score the survivors against the heard words:

   > S_ground(q, c) = 0.70 · (1 − d_PanPhon(φ(q), φ(c))) + 0.30 · LCS_consonant(q, c)

   This score contains no popularity term — catalog fame cannot raise a
   candidate's grounding.
5. **Stage E — Transparent Elimination & MRTR Pin Gate.** Traps die on
   named kill channels — on the music path **`veto`**, **`trap`**
   (karaoke, compilation-swap and wrong-film convictions all ride this
   one channel) and **`rule_override`** (a fired Taste Lock eliminates
   the otherwise-winning version); on the domain path
   **`spec_contradiction`** (a title claim contradicted by the row's own
   spec table: *"Claims 40 Gbps in its name. Its own spec table says
   480 Mbps."*), **`swap`** and **`requirement`** — each with a plain
   reason and its source. Decide: the top survivor locks only if it clears the
   floor (**0.60**, or 0.70 under EXACT_LOCK). A true tie returns
   `tie_choice`; the host settles it by re-calling with a verified
   `pin` — the MRTR discipline (SEP-2322) as two ordinary tool calls on
   2025-11-25. A pin that names a banned or absent row is refused.
   Nothing clears the floor → `no_lock`, an honest refusal.

   **Stage E, stated formally.** The gate returns a prediction *set*,
   not a forced answer: the survivors at or above the floor and within
   the tie margin (**0.04**) of the top score. Set size 0 → `no_lock`
   (refusal); size 1 → `locked`; size > 1 → `tie_choice`, settled by a
   human pin the server re-verifies before anything acts. This is the
   abstention / set-valued-prediction pattern — the conformal-prediction
   family — with one honesty boundary: **no coverage guarantee is
   claimed**; the thresholds are empirical, calibrated on the
   hostile-host matrix (see `docs/TESTING.md`, *Calibration receipt*).

### F-01, defined honestly

Public APIs have **no sponsored flag**. iTunes does not mark a row
"promoted." So F-01 is defined as what the data can actually prove:

**Unsolicited compilation / ad-tier swap** — a third-party tribute album,
a compilation re-upload, or deluxe re-record bait returned instead of the
canonical release. The engine classifies those rows, eliminates them, and
says why in plain words. No judge can ask where a fake flag came from,
because there is no flag. There is a row, a source, and a reason. The
same discipline holds in the grocery pack: sponsored-swap rows are
modeled in an audited catalog pack and flagged as such in each row's
audit note — never presented as a live retail API's verdict.

## Voice rules — Taste Lock (In-Stream Entity Memory)

A `rule` object in a call writes a deterministic preference. Example:
after 22:00, this title means the lofi version.

Later, a call with a matching title family after that time applies the
rule — evaluated before the fetch (Stage B), binding the **exact
recording** (source + track ID) whenever the catalogs identify one. A
rule records a track binding only from a call that actually locked a row
of the rule's own version; a first verified fire with no binding learns
the winner as the binding. The card shows the rule line and the
`rule_override` eliminations it caused. The user wrote the rule by voice,
in one sentence, inside the same flow as a normal request. No settings
screen exists. None is needed.

## Problem accounting

Intent Lock visibly solves six problems:

- **F-01** — upsell swaps, as defined above
- **F-02** — code-switching: Hinglish, Tanglish and Spanglish compile to
  the same operators
- **F-03** — accent rescue: PanPhon sound-matching, not spelling
- **F-04** — proof: Transparent Elimination shows the work.
  **Not cryptography.** The hash chain is deleted from the architecture
  and the story.
- **F-06** — version traps: remix, karaoke, and the same title from the
  wrong film die on the card, on named channels
- **F-11** — the re-explaining tax: voice rules end the repeat explanation

The rest, honestly:

- **F-05** latency — design discipline. Deadlines govern every source.
  No millisecond number is claimed on stage.
- **F-08** offline snapshot and **F-10** re-link — invisible plumbing.
  Built, working, never pitched.
- **F-09** multi-room sync — parked. Not in this pitch.
- **F-07** yield — cut 100%. Story, UI, simulator. Zero mention.

## The video — 2 minutes, 2 beats + coda

- **0:00–1:00 — Beat 1, the Lock.** One recorded utterance plays into
  both systems: *"Alexa, play that 'Sayaraa' waala slow film song — woh
  original movie version, not the remix."* The ASR transcript shows
  "Sayaraa." The same transcript and timestamp sit under both screens.
  Without a guarantee layer, the catalog's top answer is the remix. Our side locks the 2012 Film Original
  on the first try and plays it from its hook. The Trust Card header
  reads **Heard ➔ Grounded**, then the proof hierarchy — Lock Score 76
  (Floor 60, +16) · Skeleton 100 · PanPhon 66 — then 4 eliminations with
  plain reasons and source badges.
- **1:00–1:35 — Beat 2, the Rule, Then the Proof.** Voice only:
  *"Actually, give me the lofi version instead."* The lock swaps. Same
  breath: *"After 10 PM, Saiyaara means this lofi version."* The card
  shows the Taste Lock. The stage clock is scrubbed past 22:00; the same
  recorded words fire again; the LoFi Mix locks and the card shows one
  line: "Rule applied."
- **1:35–2:00 — Coda, One Schema, Three Locks.** Three real `tools/call`
  locks through the identical pipeline: the song; a 2 m Thunderbolt
  cable whose 40 Gbps title is contradicted by its own 480 Mbps spec
  table (`spec_contradiction`); the unsweetened oat-milk reorder with
  the sponsored almond swap eliminated. Commerce and grocery rows carry
  the `audited_catalog_pack` provenance badge — honest about the supply,
  exact about the engine. Closing line: *"One schema. Every catalog.
  Borrow the Brain, Own the Guarantee."*

## Honest guards

- **Catalog audit first.** We film only songs whose live catalog data
  holds at least 3 real traps. No trap is ever authored by hand.
- **Pre-fetch disclosed.** Hero candidate sets are pre-fetched for
  filming into the audited snapshot pack, provenance on every row. The
  friction log records that choice openly.
- **`tie_choice` stays real.** The server can still answer with two named
  survivors when tracks genuinely tie in real life, and `no_lock` when
  the evidence is thin. Neither is staged as a failure — both are the
  product working as designed.
