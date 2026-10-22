# SUBMISSION PACKET — Intent Lock (paste-ready)

**Hackathon:** Build, Ship, Shape: Amazon Developer Hackathon — **Alexa+ Track** + **Open Source Mini Challenge**
**Deadline (verified on the live rules page, §1):** Friday, **October 23, 2026, 12:00 pm Pacific Time** (= Oct 24, 00:30 IST). No changes are possible after the period ends — submit complete, submit once.
**Rules source:** https://amazonappdev2026.devpost.com/ and https://amazonappdev2026.devpost.com/rules (re-verified live 2026-10-20 by Judge J-09).

## How to use this packet (≈30 minutes, founder)

1. **Video first — see §5.** The Intent Lock demo is being **re-shot** on the new stage; the old 2:57 cut shows the retired pre-Intent-Lock UI and must **not** be submitted. Upload the new cut per `VIDEO_UPLOAD_CHECKLIST.md` → paste the YouTube URL into §5 below and into the Devpost form.
2. Apply `REPO_SETTINGS.md` (description + topics + homepage) — 3 minutes.
3. Paste every field below into the Devpost "Enter a Submission" form, in order.
4. Paste the 24 friction entries from `FRICTION_LOG_FINAL.md` into the friction-log section (worth up to a **10% judging bonus**, assessed at Stage 1). Start with the three platform discoveries: FL-17 (MCP Apps CSP silent failure), FL-18 (SEP-2577 sampling deprecation), FL-24 (host-clock isolation via `_meta.host_time`).
5. Send the GitHub invites per `JUDGE_INVITES.md` **in the same sitting** — invites expire after 7 days if unaccepted, and judging runs Nov 9–20, so the packet includes re-send checkpoints.
6. Click Submit before **Oct 23, 12:00 pm PT**. Then verify the submission shows "Submitted" (not "Draft").

> **Story note:** §3 below is the Intent Lock narrative from `docs/DEVPOST_STORY.md`, swapped in verbatim — the two files must never diverge. The retired v1 story (yield / ledger / multiroom) survives nowhere in this packet.
>
> **Dependency note (install fix):** §13's testing instructions describe the quickstart (`./scripts/bootstrap.sh && make demo`) of the public repo `AdityaPagare619/intent-lock` (branch `main`). One fresh-clone run of that repo must pass **before** this form is submitted — Petu confirms at package time; do not submit against a broken quickstart.

---

## 1. Project name

```
Intent Lock (OmniBeat-MCP)
```

## 2. Tagline / elevator pitch

```
The Universal Deterministic Action Firewall for Alexa+ — Borrow the Brain, Own the Guarantee. Your accent, your version, your word, proven by a zero-LLM MCP kernel before anything plays, ships, or gets ordered. One schema. Every catalog.
```

## 3. Description (the story)

> Paste from "Inspiration" onward into the Devpost description field. This is `docs/DEVPOST_STORY.md` verbatim.

## Inspiration

In May 2023, Amazon announced that customers had purchased **more than 500 million Alexa-enabled devices** worldwide (Amazon devices event, May 2023, reported by Voicebot.ai). Music is what those devices are for: survey after survey finds playing music is the most common smart-speaker activity, reported by **75–86% of owners** (VentureBeat/Digital Trends; Quantilope; VoxBooster 2026).

## Borrow the Brain, Own the Guarantee

For most of a decade, voice assistants were rigid command-and-control trees: fixed phrases in, fixed actions out. Alexa+ changed that — a frontier conversational LLM (Early Access 2025, broadly available in 2026) that understands human nuance brilliantly. What no conversational brain changes is what waits at the edge: the moment a brilliant understanding touches a noisy, adversarial third-party keyword catalog, the catalog answers with remixes, karaoke cuts, spec-lying knockoff cables and sponsored substitutes — and a keyword catalog carries no concept of the user's negation at all: a spoken *nahi* (hi-IN) or *sin* (es-US) means nothing to a keyword search. That edge is the **Unverified Action Boundary**, and it is the only place Intent Lock stands: it verifies at that boundary — including the user's own negations, compiled from their raw words.

None of that is a failure of understanding. The research on recognition is clear that the world's speakers are diverse — a Washington Post / Globalme study found **~30% more inaccuracies for non-native speakers** than for native ones, and a peer-reviewed acoustic study (AcousticScope, Springer 2025) measured recognition accuracy at **84.9% for White speakers vs 75.2% for Indian speakers and 70.4% for Black speakers** — which is exactly why the layer *after* recognition has to be deterministic rather than hopeful: a probabilistic model proposes an action; the action fires against an adversarial catalog; and, until now, nothing deterministic checked the proposal against the user's actual words before it executed. In 2021, engineers filled that gap with brittle regex. In 2024, they filled it with more LLM and prayed. In 2026, the layer is open — MCP — so we built the thing that belongs there: a deterministic proof kernel. Alexa+ gave voice AI a brilliant conversational brain; Intent Lock gives that brain a deterministic catalog guarantee so it never has to guess.

**Scope, stated plainly:** Intent Lock stands only at that catalog action boundary. Natural language understanding, multi-turn dialogue, OAuth 2.1 account linking, wake-word barge-in, and device sessions are Alexa+'s — borrowed, respected, and explicitly out of scope. We rebuilt none of them.

### What it does

Intent Lock is a self-hosted MCP server (protocol **2025-11-25**, Streamable HTTP) exposing one tool, `intent_lock`, and one MCP App, the **Trust Card**. The host brain (Alexa+ in production; Gemini 3 Flash in our simulator, labeled as borrowed) parses the messy sentence into advisory structure. The server — **100% deterministic, zero LLMs inside** — verifies before anything executes, in five stages:

- **Stage A — Operator Compiler.** The raw utterance is compiled against `sublocal_grammar.json`: code-switched tokens across hi-IN, ta-IN, es-US and en-GLOBAL become four universal symbolic operators — **HARD_VETO (≠)**, **CANONICAL_ORIGIN (t₀)**, **EXACT_LOCK (≡)**, **CONTEXT_ANCHOR (@)**. "Not the remix," "remix *nahi*," "*sin* remix," "remix *vendam*" are the same law in four dialects — and because the veto is compiled from the user's own raw words, it survives to the catalog boundary intact, where a keyword search alone would never have understood it.
- **Stage B — Temporal Entity Memory Injection.** Voice rules (**Taste Locks**) — spoken once, mid-conversation — are evaluated against the host's clock before fetching. A fired rule expands the search with its version, so the supply exists before elimination runs. Rules bind exact recordings, and a binding is learned only from a verified win.
- **Stage C — Supply Harvester + Variant Expander.** Catalog search answers *spellings*, not sounds — so the server first generates deterministic spelling variants of the heard words, then races the live catalogs (iTunes ∥ MusicBrainz ∥ Deezer) under one deadline, unioned with an audited snapshot pack. YouTube Suggest rides along as a spelling oracle only — it corrects what the heard words probably were; it never supplies a row. Commerce and grocery run on audited catalog packs through the same Universal Candidate Tensor. A pool thinner than eight non-vault rows refuses outright: supply is evidence, and thin evidence means no lock.
- **Stage D — Articulatory Entity Grounding.** The context anchor arbitrates the entity family first — the word "film" outranks phonetic closeness to a stranger's song — then PanPhon articulatory features (70%) and consonant skeleton (30%) score the survivors. On the hero request, heard "Sayaraa" grounds to "Saiyaara": PanPhon **66**, skeleton **100**, lock score **76** against the never-guess floor of **60**.
- **Stage E — Transparent Elimination & MRTR Pin Gate.** Traps die on named kill channels — on the music path, `veto`, `trap` (karaoke cuts, compilation swaps and wrong-film namesakes are all convicted on it) and `rule_override`; on the commerce and grocery path, `spec_contradiction`, `swap` and `requirement` — each with a plain reason and its source catalog on the card. Three outcomes only: `locked`; `tie_choice`, where both named survivors are shown and the host settles it by re-calling with a `pin` the server re-verifies (a pin can never smuggle in a banned row); or `no_lock`, an honest refusal. Ask for gibberish and you get nothing — the engine would rather refuse than guess.

One schema, three domains: the demo's coda locks a song, a 2 m Thunderbolt cable (a listing whose title claims 40 Gbps while its own spec table proves 480 Mbps dies as `spec_contradiction`), and an unsweetened oat-milk reorder (the sponsored almond swap dies the same way) — three real `tools/call` requests through the identical pipeline.

### How we built it

Four real services, real HTTP at every hop: a Next.js Alexa+ simulator (:3000, the stage), a Node agent orchestrator (:4000 — the borrowed brain's host and a real MCP 2025-11-25 client), the Intent Lock MCP server (:8080, Python/FastAPI — the deliverable), and a chaos/provider mock (:9000). The outage act is armed, not asserted: launch the stack with `CHAOS=1` (scripts/demo-up.sh) and the mock fault-injects an ISP blackout on the wire — the kernel then locks from its audited offline snapshot or honestly refuses, which is how the act is reproduced.

The music data plane costs nothing: YouTube Suggest (keyless) shows what a mangled phrase means to the planet — a spelling oracle, never a catalog — iTunes Search (keyless) hydrates real candidates with real 30-second previews, MusicBrainz (keyless) canonicalizes, and Deezer (keyless) races as a fourth source. Deezer joined late and earned its place by measurement, not by pitch: from our box it answers in about a second, and it deepens exactly the classes where the other catalogs run thin (Saiyaara lofi variants: 27 Deezer rows against iTunes' 8). That is Stage C working as designed — the race is an adapter slot, and any catalog with a real, documented API can join it.

YouTube itself cannot join that race, and we say so plainly: YouTube offers no public catalog API for audio. The routes that pretend otherwise — scraping search pages, streaming through third-party proxy instances — circumvent YouTube's Terms of Service and ride infrastructure that churns daily, while judging runs for two weeks (Nov 9–20), long after any demo-day luck expires. We evaluated them and deferred them past the hackathon. Suggest stays our oracle; the guarantee never depends on a stream we have neither the right nor the reliability to promise. Commerce and grocery supply is audited catalog packs built at development time — grocery rows pulled from the OpenFoodFacts public API, commerce rows from published manufacturer and retailer specifications — every row carrying provenance (`audited_catalog_pack`). We claim no live shopping API at runtime; the claim is that the same engine locks all three domains.

The phonetic core ships separately as an open-source package, **[polyglot-phonetic-judo](https://github.com/AdityaPagare619/polyglot-phonetic-judo)** (public, MIT) — our ecosystem contribution: articulatory grounding any assistant, any MCP host, any catalog can use without us.

### Challenges we ran into

The friction log (24 entries, written as we hit the walls) is the honest version. The ones that shaped the product:

- **MCP Apps CSP fails silently.** MCP Apps content security policy is deny-by-default: undeclared artwork and audio domains don't error — the Trust Card just renders broken. We found it by audit, not by crash, and the deck now declares `resourceDomains` + `connectDomains` explicitly. This is exactly the class of finding the friction-log bonus exists for.
- **MCP sampling is a dying foundation.** We designed the tie-break around MCP sampling, then found it deprecated (SEP-2577, spec revision 2026-07-28). The fix is architectural, not a patch: the server returns an honest `tie_choice`, and the host settles it by re-calling with a `pin` the server re-verifies (FL-18).
- **A deterministic server must never trust its own clock.** A Taste Lock like "after 10 PM" is about the *user's* evening, not the server's timezone. So host time arrives per-request as `_meta.host_time`, is validated before any rule fires, and server-local time is only a labeled fallback — the server never silently substitutes its own clock (FL-24).
- **Catalogs answer spellings, not sounds.** iTunes has no row for "Sayaraa" — the song exists only under its canonical spelling, and our sandbox's egress made supply erratic enough to change outcomes between runs. A guarantee engine cannot assume supply; it must treat supply as evidence. Hence the variant expander, per-source deadlines, the snapshot union, and the thin-pool refusal.
- **The evidence can be lost upstream.** Upstream autocorrect rewrites accented speech before tools see it (FL-02) — which is why the server scores the *raw* utterance, never a cleaned-up version, and why the host's extraction is advisory only.
- **Ranking stages protect quality, or popularity eats them.** An early ranking pass let a locale bonus outvote a wide quality gap and play the karaoke version while the UI said "studio original" (FL-13). The pipeline now runs in strict stages — anchor, grounding, elimination, decide — and no stage may overrule an earlier one's evidence.

### Accomplishments that we're proud of

- **Verified on the metal, not reported.** Beat 1 locks the 2012 Film Original of Saiyaara (iTunes 673948365) on the raw heard form "Sayaraa," repeatedly, live — with the remix vetoed by the user's own "nahi… not the remix" even when the host's extraction omits the exclusion. Beat 3 is deterministic: at host time 22:05 the stored Taste Lock fires and the official LoFi Mix (iTunes 1620148631) locks — and the rule learned its exact-recording binding from that verified win.
- **A real wire, not a mock.** Handshake → session → tools/call → App, all live, all reproducible from the repo. Intent Lock's evidence is live, not inherited: the demo beats are verified end-to-end against live catalogs, the wire smoke passes from a fresh clone, and an intent_lock wire suite (`scripts/verify_intent_lock.py`) runs the hero, veto, sabotage, pin, domain and rule cases against a live server. The regression suite for the legacy tool surface the server still carries holds at **47 PASS / 2 SKIP / 0 FAIL** — labeled as legacy coverage, never cited as Intent Lock's.
- **Attacked by our own hosts, and the score is published.** We pointed three Gemini host personas — careful, careless, and sloppy — at the kernel with 55 messy utterances: 161 runs in which the host, not a script, chose the words. Before the surgery wave that followed, the guarantee survived **77.6%** of runs. The failures are instructive, not hidden: the safety machinery never broke — zero missed vetoes, zero smuggled pins, zero trap resurrections in any run — every failure was a *crowning* choice among legitimate rows (which of two real recordings heads a bare-name ask), never a breached ban. We fixed the crowning layer and replayed the identical attacks; the post-surgery figure stands in the submission packet's testing instructions, next to the suite it belongs to.
- **Zero LLMs in the guarantee box.** We deleted an in-server model tie-break on principle — a second model judging the first is correlated risk, not a boundary — and replaced it with duplicate-merge, an honest `tie_choice` state, and a re-verified host pin.
- **Honest labeling as a feature**: the README carries a "Simulated vs real (no weasel words)" section, every Trust Card number is emitted by the pipeline run that displays it (fields hide when absent; nothing is estimated), and the friction log names our own bugs before anyone else can.

### What we learned

- **Ground the entity, don't fix the transcript.** The accent problem looks like an ASR problem, but the recoverable failures live downstream — in naming, ranking, and guessing. A deterministic layer that grounds the brain's entity in real catalog rows rescues requests the recognizer already heard.
- **Abstention is a designed state.** A `no_lock` refusal and a named `tie_choice` are not failures of the demo; they are the product. An engine that can say "the evidence is thin" is the only kind you can trust with an order button.
- **Measure or it didn't happen.** Every number in this story — 66, 100, 76 against a floor of 60 — was measured on the production module against live catalogs. The flattering numbers we were handed early on (including a "98% phonetic match") did not survive measurement, and they are not in this story.

### Known limitations — stated before you find them

- **A host that renames the song beats us.** If the transcript turns "say yaara" into the name of a different real song ("Yaara"), the kernel verifies the wrong song — correctly. The guarantee binds to what was said; a sufficiently wrong transcript is outside it.
- **Glued transcripts can hide a negation.** Speech-to-text that arrives as one fused string ("playsaiyaaranottheremix") buries the "not" inside a single token, where veto binding cannot reach it. The kernel assumes tokenized transcripts.
- **A strong stranger can still beat a mangled reference.** When the heard words are heavily garbled, the kernel refuses marginal matches — but a phonetically adjacent stranger with a genuinely strong score can clear even the raised bar.
- **Under total catalog failure, supply is luck.** If providers fail together, outcomes ride whichever rows survive. The guarantees hold — nothing vetoed, no trap, nothing below the floor ever locks — but which legitimate recording heads a bare-name ask can vary with the surviving pool.
- **Descriptive asks lean on the host's interpretation.** "That sad song from the spy movie" names no title; the kernel verifies the host's interpretation at the standard floor. Its reference discipline is built for named requests.
- **Commerce and grocery phonetics run on the fallback engine** — a local skeleton matcher, labeled as such in every payload. Music gets the full articulatory engine.
- **Rules cannot be created by pointing backwards.** A Taste Lock persists only when the request itself states the time and the version in words. "Yes — always like that," referring to an earlier turn, creates nothing: the server cannot see that conversation, and it will not persist a rule it cannot ground in the words in front of it.

### What's next

- **More locales, as data.** The operator grammar is configuration: the next dialect is a reviewed JSON diff, not a code change. Community grammar PRs are the growth path.
- **More domain adapters.** Smart-home actions, travel, food delivery — any catalog with adversarial rows and a spec table to audit against its titles.
- **The real prize**: the Unverified Action Boundary exists in every voice stack shipping today. Probabilistic proposal, deterministic proof is the 2026 pattern — and the MCP layer is where it ships.

**One schema. Every catalog. Borrow the Brain, Own the Guarantee.**

## 4. Built with (technologies — paste into "Built with")

```
Model Context Protocol (spec 2025-11-25, Streamable HTTP) · Python · FastAPI · TypeScript · Node.js · Next.js · React · MCP Apps (ui:// Trust Card) · Gemini 3 Flash (host brain in the simulator — borrowed, labeled) · PanPhon articulatory phonetics · polyglot-phonetic-judo (our OSS package) · YouTube Suggest API (keyless, spelling oracle) · iTunes Search API (keyless) · MusicBrainz API (keyless) · Deezer API (keyless) · OpenFoodFacts (build-time catalog pull) · Web Audio API · Docker · GitHub
```

## 5. Links

| Field | Value |
|---|---|
| GitHub repository (required) | `https://github.com/AdityaPagare619/intent-lock` (public, MIT — no invitation needed) |
| Video (required) | **⏳ PENDING FINAL CUT.** The submission film is recorded from the redesigned Story walkthrough (2:50, public, English). Earlier cuts show retired UI and must **not** be submitted. `[PASTE PUBLIC YOUTUBE URL AFTER UPLOAD — see VIDEO_UPLOAD_CHECKLIST.md]` |
| Demo / try-it link (optional) | Leave blank unless the Render option is approved (see gap audit in the J-09 verdict). Judges' sanctioned path is repo + video. |
| Open Source repo | `https://github.com/AdityaPagare619/polyglot-phonetic-judo` (public, MIT) |

## 6. Track & mini challenges (form selections)

- **Primary track:** ✅ **Alexa+**
- **Mini challenges:** ✅ **Open Source** — ❌ **AWS Builder: do NOT select.** Intent Lock uses no AWS services at all (deliberate zero-cost design for the guarantee kernel; the only hosted model anywhere in the stack is the simulator's borrowed Gemini brain). Selecting AWS Builder without an AWS integration would be a false claim and the Product Feedback would contradict it.

Rules check (official rules, Alexa+): *"A working Agent Skill or a self-hosted MCP server, implementing MCP spec version 2025-11-25 (or a later version, once confirmed) over Streamable HTTP"* — Intent Lock takes the MCP door, and additionally ships the simulated Alexa+ web app, whose source is in the same repo. The repo calls the track technology in code: `services/omnibeat-mcp-server/src/server.py` sets `PROTOCOL_VERSION = "2025-11-25"` and serves the session surface, the `intent_lock` tool, and the `ui://` Trust Card App resource (proof: `docs/MCP_PROTOCOL_PROOF.md`).

## 7. Open Source mini challenge — extra required fields

| Field | Value |
|---|---|
| Contribution URL | `https://github.com/AdityaPagare619/polyglot-phonetic-judo` |
| Project repository URL | `https://github.com/AdityaPagare619/polyglot-phonetic-judo` |
| GitHub username | `AdityaPagare619` |
| Description (what / how / why) | A new open-source project created during the hackathon window: a zero-dependency TypeScript library for articulatory entity grounding — vowel-preserving phonetic skeletons, ASR homophone clusters, and feature-weighted phonetic distance ("sayaraa" → "Saiyaara"). It is the phonetic grounding core used by Intent Lock, extracted as a standalone MIT-licensed package with its own test suite (25/25 passing) so any voice or ASR project fighting the accent barrier can use it. It matters because entity grounding for Indic and other non-English speech is underserved by English-first phonetic algorithms like Soundex/Metaphone defaults. |

Rules check (official rules, Open Source): *"Create a new, additional open-source project … during the hackathon window … Required: contribution URL, project repository URL, GitHub username, and a description."* Repo created 2026-10-19 (inside the Aug 31 – Oct 23 window), MIT license detected by GitHub. ✅

## 8. Product feedback (REQUIRED — one answer covering every tool/API/SDK)

**Which developer tools, APIs and SDKs did you use, and for what?**
The MCP specification (2025-11-25) and the docs at modelcontextprotocol.io — we implemented both a self-hosted MCP server (Python/FastAPI) and an MCP client (TypeScript orchestrator) directly against the spec, including Streamable HTTP sessions and an MCP App (a `ui://` resource — the Trust Card — rendered by the host from the tool result). Google's Gemini API powers only the *simulator's* host brain (extraction of advisory structure from the raw utterance); the MCP server itself calls no model. For catalog data we used four keyless public APIs at runtime — iTunes Search, MusicBrainz and Deezer supply catalog rows; YouTube Suggest serves as a spelling oracle only — and one at build time (OpenFoodFacts, for the audited grocery catalog pack). We used no AWS services — a deliberate zero-cost constraint on the guarantee kernel — so this feedback is about the MCP platform itself.

**What worked well?**
The Streamable HTTP transport design. The session model (`initialize` → `Mcp-Session-Id` → notifications → tools/call) was specified precisely enough to implement a conformant server from the text alone, in a language with no official SDK in our stack, and have a separately-written client interoperate on the first day. MCP Apps is the standout primitive for proof-style products: the tool returns structured content, the host renders the card, and the card can call back into the tool (our tap-to-pin and one-tap Taste Lock ride exactly that bridge). `structuredContent` plus a declared UI resource turned "show your work" from a narration problem into a rendering contract.

**What needs work?**
Three gaps, all filed as friction entries with this submission. (1) **MCP Apps CSP fails silently.** The App CSP is deny-by-default, and an undeclared artwork or audio domain produces no error anywhere — the card simply renders broken. A conformance warning (host-side console signal or a lint in the Apps docs) would save every Apps team the same audit we had to run. (2) Tool calls that originate from ASR carry only the final, autocorrected transcript — upstream spell-correction destroys exactly the phonetic information accent-grounding tools need; an optional N-best or raw-phonetic field would fix this (FL-02). (3) There is still no Alexa+-specific MCP guidance — how Alexa+ will discover servers, which App renderings it supports, what per-request host context (clock, locale) it will pass — so Alexa+ builders are guessing the host's surface from the generic spec. We pass host time as per-request `_meta` by convention — and the server is built to never trust its own clock in its place (FL-24); a documented host-context channel would standardize it.

**How was your onboarding experience (zero to hello world)?**
Roughly a day of spec reading before the first successful `initialize` round-trip, most of it spent on transport details (session headers, protocol-version negotiation) rather than on our actual product. The concepts are learnable and the spec is well-organized, but there is no "Alexa+ MCP hello world" — a minimal hosted example repo would have cut onboarding to about an hour.

**Would you build with these devices and services again?**
Yes. MCP is the right open standard for Alexa+ integrations — one server, any host — and the primitives (tools, structured content, App resources, resumable sessions) mapped onto a real consumer problem without fighting us. We would build again, and our feature requests below are written in the hope that the next team's onboarding is measured in hours.

## 9. Feature requests (optional field — increases feedback quality signal)

| # | Request | Why it matters | Priority |
|---|---|---|---|
| 1 | Optional N-best transcript array (or raw phonetic/IPA field) in the context of ASR-originated tool calls | Upstream autocorrect rewrites accented speech before tools see it ("Sayaraa" survives only because we score the raw utterance). Without the raw signal, accent-grounding tools are doing archaeology. This is the difference between voice working for 500M+ accented users or not. (FL-02) | **Critical** |
| 2 | A documented per-request host-context channel (host clock, locale, device class) — e.g. standardized `_meta` keys | Deterministic tools that honor "after 10 PM" rules or locale grammar currently depend on host conventions that don't exist yet. We built the channel ourselves (`_meta.host_time`); standardizing it makes every rule-aware tool interoperable. | **Important** |
| 3 | Host-side diagnostics for MCP Apps CSP denials (console signal or a spec-recommended lint) | Deny-by-default CSP with zero error output means Apps break invisibly on real hosts while working in lenient local ones — the worst failure shape there is. One warning saves every Apps team an audit. | **Important** |
| 4 | Document the `Access-Control-Expose-Headers: Mcp-Session-Id, MCP-Protocol-Version` requirement in the MCP web-client quickstart | Every browser-based MCP client loses its session silently without it; we burned hours on a server that was never broken. One paragraph of docs saves every web team the same afternoon. (FL-04) | **Nice-to-have** |

## 10. Friction log

Paste all 24 entries from **`FRICTION_LOG_FINAL.md`** (same directory) into the friction-log section — one entry per Devpost friction entry, fields in Devpost's exact order: *task attempted · steps taken · expected vs. actual · severity · workaround · actionable suggestion*.

Rules basis (official rules): *"Optional – Friction Log Entries: specific task attempted, steps taken, expected vs. actual result, severity rating, workaround used, and actionable suggestion. Participants who submit friction logs score higher in judging (up to 10% bonus)"* — and the bonus is assessed by Amazon's internal review team during Stage 1 downselection and applied to the Stage 2 score.

## 11. Built during the hackathon window (paste where the form asks about pre-existing work)

```
Intent Lock (OmniBeat-MCP) did not exist before this hackathon. The repository was created on 19 October 2026 — inside the submission window (31 August – 23 October 2026) — and every commit in its history falls within the window. The companion open-source package, polyglot-phonetic-judo, was likewise created on 19 October 2026 for the Open Source mini challenge. No code was carried over from any earlier project.
```

(Verifiable: GitHub repo `createdAt` = 2026-10-19 for both repos; `git log` first commit 2026-10-19.)

## 12. Team / representative

- **Team name:** THE YAP PATROL
- **Representative (submits the form):** Aditya Pagare — Devpost account holder, GitHub `AdityaPagare619`. (Official rules: a Team must appoint one authorized Representative; the Representative submits.)
- **Teammates on the Devpost form:** `[FOUNDER: add teammates' Devpost usernames/emails here if they hold Devpost accounts. If not, the Representative submits for the team as-is — do not invent accounts.]`
- **Eligibility note:** Entrants must be of majority age and not resident in an excluded jurisdiction (rules §3: Brazil, Quebec, Russia, Crimea, Cuba, Iran, North Korea, OFAC-sanctioned regions). India is not excluded. ✅

## 13. Testing instructions (paste into the form's testing/access field)

```
Judges: the repository is public — no invitation or account is needed. Clone https://github.com/AdityaPagare619/intent-lock and follow the README quickstart; the interactive walkthrough is a static page (docs/index.html in the repo, opens with no setup, runs offline).

Fastest path (~3 minutes):
1. Watch the demo video (2:00) — everything in it is real MCP wire traffic produced by this code.
2. Clone the repo, then run:  ./scripts/bootstrap.sh && make demo
   The only prerequisites are Node 20+ and Python 3.10+. The MCP server needs no API keys and no config; the simulator's host brain uses a Gemini key from the environment when one is present, and a labeled deterministic extraction floor takes over when none is — the demo boots and locks either way, and the on-screen BrainStatus says which brain answered.
3. Open http://localhost:3000 and say or type: "Alexa, play that 'Sayaraa' waala slow film song — woh original movie version, not the remix"
   Watch the Trust Card: Heard ➔ Grounded, the eliminations, the lock. Then set the stage clock past 22:00 and ask for Saiyaara again — the Taste Lock fires.
4. Run:  make verify  — replays the 4-act MCP wire proof (initialize → tools/list → tools/call → App) against your local stack. Those four acts exercise the legacy tool surface; Intent Lock's own wire cases are the suite below.
Hostile-host baseline (measured before the kernel surgery wave): three Gemini host personas (careful / careless / sloppy) × 55 messy utterances = 161 runs, guarantee survival 77.6% — zero missed vetoes, zero smuggled pins in any run; every failure was a crowning choice among legitimate rows. After surgery, the identical attacks were replayed through the fixed kernel alongside the wire suite below.
Intent Lock verification (final acceptance gate, run 2026-10-22 on this exact tree): kernel suite 10/10 PASS · hostile-host replay 36/36 FIXED (guarantee survival 100.0%, up from 77.64% pre-fix) · saboteur battery 10/10 PASS · five demo beats via the real host path 5/5 PASS. Methodology and full table: docs/TESTING.md.
Legacy tool surface coverage: 47 PASS / 2 SKIP / 0 FAIL at submission — real coverage of the four legacy tools the server still carries; it does not exercise intent_lock, and we don't cite it as if it did.

Notes: live music catalog data uses keyless public APIs (iTunes Search, MusicBrainz, Deezer; YouTube Suggest as a spelling oracle only), so an internet connection gives live results; with no network the server falls back to its audited snapshot pack and the flows still complete, badged as vault copies. Commerce and grocery locks run on audited catalog packs (provenance shown on the card) — by design, not by outage. What is simulated vs real is labeled in the README: the MCP wire, the operator grammar, the phonetic grounding, and the elimination engine are real; the Alexa+ voice shell is the simulation the track invites, and its host brain is Gemini 3 Flash, labeled as borrowed. No login is needed anywhere.
```

Rules basis (official rules, Testing): *"The project must be accessible to judges for evaluation (via code repository and demo video)… Judges are not required to test the Project and may choose to judge based solely on the text description, images, and video."* Repo + video is the sanctioned access path; a public live URL is **not** required.

## 14. Gallery images (optional, recommended — 5 minutes)

Upload to the Devpost gallery, in this order:
1. The Trust Card at the Beat 1 lock — Heard ➔ Grounded, the four eliminations, the 2012 Film Original playing. The product in one frame.
2. The wire-inspector frame from the video — real MCP traffic under the card, proving the wire.
3. Architecture diagram — `docs/architecture-main.png` (and `docs/architecture-pipeline.png`) in the repo.
4. The coda frame — three locks (music · cable · oat milk) on one schema.

## 15. Final pre-submit checklist (founder, in order)

- [ ] **Video re-shot on the Intent Lock stage (2:00 cut)** and uploaded **Public** on YouTube; URL pasted in §5 and the form (`VIDEO_UPLOAD_CHECKLIST.md`). The old 2:57 cut is retired — do not submit it.
- [ ] Repo description + topics + homepage applied (`REPO_SETTINGS.md`).
- [ ] Install fix confirmed on `main` + one fresh-clone `make demo` pass witnessed (coordinator).
- [ ] All fields above pasted; Open Source fields (§7) filled; AWS Builder **not** selected.
- [ ] 24 friction entries pasted from `FRICTION_LOG_FINAL.md`.
- [ ] GitHub invites sent to all 6 usernames + testing access (`JUDGE_INVITES.md`) — same sitting as submission.
- [ ] Form shows track = Alexa+, mini challenge = Open Source.
- [ ] Submit clicked **before Oct 23, 12:00 pm PT**; confirmation state = "Submitted", not "Draft".
- [ ] Calendar: re-send any unaccepted GitHub invites on **Oct 30** and **Nov 6**; confirm all accepted before judging opens **Nov 9**; keep repo access open until judging ends **Nov 20**.

---
*Packet prepared by Judge J-09 (Devpost Compliance), 2026-10-20; story and product sections rewritten to Intent Lock by Lane G, 2026-10-21. Requirements were re-verified against the live Devpost pages on 2026-10-20; quotes are from the official rules. Nothing in this packet invents a capability, a metric, or a team member.*
