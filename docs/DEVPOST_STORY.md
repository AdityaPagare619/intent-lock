# Intent Lock — Devpost Story (narrative source for the submission packet)

> Every number below is either measured in this repo or cited to a public
> source. Do not add numbers that aren't. The architecture of record is the
> Intent Lock Blueprint v1.2; the locked product spec is
> `docs/12_INTENT_LOCK_SPEC.md`.

---

## Title

**Intent Lock** (OmniBeat-MCP)

## Tagline

The Universal Deterministic Action Firewall for Alexa+ — **Borrow the Brain, Own the Guarantee.** Your accent, your version, your word, proven by a zero-LLM MCP kernel before anything plays, ships, or gets ordered.

---

## Inspiration

In May 2023, Amazon announced that customers had purchased **more than 500 million Alexa-enabled devices** worldwide (Amazon devices event, May 2023, reported by Voicebot.ai). Music is what those devices are for: survey after survey finds playing music is the most common smart-speaker activity, reported by **75–86% of owners** (VentureBeat/Digital Trends; Quantilope; VoxBooster 2026).

## Borrow the Brain, Own the Guarantee

For most of a decade, voice assistants were rigid command-and-control trees: fixed phrases in, fixed actions out. Alexa+ changed that — a frontier conversational LLM (Early Access 2025, broadly available in 2026) that understands human nuance brilliantly. What no conversational brain changes is what waits at the edge: the moment a brilliant understanding touches a noisy, adversarial third-party keyword catalog, the catalog answers with remixes, karaoke cuts, spec-lying knockoff cables and sponsored substitutes — and a keyword catalog carries no concept of the user's negation at all: a spoken *nahi* (hi-IN) or *sin* (es-US) means nothing to a keyword search. That edge is the **Unverified Action Boundary**, and it is the only place Intent Lock stands: it verifies at that boundary — including the user's own negations, compiled from their raw words.

None of that is a failure of understanding. The research on recognition is clear that the world's speakers are diverse — a Washington Post / Globalme study found **~30% more inaccuracies for non-native speakers** than for native ones, and a peer-reviewed acoustic study (AcousticScope, Springer 2025) measured recognition accuracy at **84.9% for White speakers vs 75.2% for Indian speakers and 70.4% for Black speakers** — which is exactly why the layer *after* recognition has to be deterministic rather than hopeful: a probabilistic model proposes an action; the action fires against an adversarial catalog; and, until now, nothing deterministic checked the proposal against the user's actual words before it executed. In 2021, engineers filled that gap with brittle regex. In 2024, they filled it with more LLM and prayed. In 2026, the layer is open — MCP — so we built the thing that belongs there: a deterministic proof kernel. Alexa+ gave voice AI a brilliant conversational brain; Intent Lock gives that brain a deterministic catalog guarantee so it never has to guess.

**Scope, stated plainly:** Intent Lock stands only at that catalog action boundary. Natural language understanding, multi-turn dialogue, OAuth 2.1 account linking, wake-word barge-in, and device sessions are Alexa+'s — borrowed, respected, and explicitly out of scope. We rebuilt none of them.

## What it does

Intent Lock is a self-hosted MCP server (protocol **2025-11-25**, Streamable HTTP) exposing one tool, `intent_lock`, and one MCP App, the **Trust Card**. The host brain (Alexa+ in production; Gemini 3 Flash in our simulator, labeled as borrowed) parses the messy sentence into advisory structure. The server — **100% deterministic, zero LLMs inside** — verifies before anything executes, in five stages:

- **Stage A — Operator Compiler.** The raw utterance is compiled against `sublocal_grammar.json`: code-switched tokens across hi-IN, ta-IN, es-US and en-GLOBAL become four universal symbolic operators — **HARD_VETO (≠)**, **CANONICAL_ORIGIN (t₀)**, **EXACT_LOCK (≡)**, **CONTEXT_ANCHOR (@)**. "Not the remix," "remix *nahi*," "*sin* remix," "remix *vendam*" are the same law in four dialects — and because the veto is compiled from the user's own raw words, it survives to the catalog boundary intact, where a keyword search alone would never have understood it.
- **Stage B — Temporal Entity Memory Injection.** Voice rules (**Taste Locks**) — spoken once, mid-conversation — are evaluated against the host's clock before fetching. A fired rule expands the search with its version, so the supply exists before elimination runs. Rules bind exact recordings, and a binding is learned only from a verified win.
- **Stage C — Supply Harvester + Variant Expander.** Catalog search answers *spellings*, not sounds — so the server first generates deterministic spelling variants of the heard words, then races the live catalogs (iTunes ∥ MusicBrainz ∥ Deezer) under one deadline, unioned with an audited snapshot pack. YouTube Suggest rides along as a spelling oracle only — it corrects what the heard words probably were; it never supplies a row. Commerce and grocery run on audited catalog packs through the same Universal Candidate Tensor. A pool thinner than eight non-vault rows refuses outright: supply is evidence, and thin evidence means no lock.
- **Stage D — Articulatory Entity Grounding.** The context anchor arbitrates the entity family first — the word "film" outranks phonetic closeness to a stranger's song — then PanPhon articulatory features (70%) and consonant skeleton (30%) score the survivors. On the hero request, heard "Sayaraa" grounds to "Saiyaara": PanPhon **66**, skeleton **100**, lock score **76** against the never-guess floor of **60**.
- **Stage E — Transparent Elimination & MRTR Pin Gate.** Traps die on named kill channels — on the music path, `veto`, `trap` (karaoke cuts, compilation swaps and wrong-film namesakes are all convicted on it) and `rule_override`; on the commerce and grocery path, `spec_contradiction`, `swap` and `requirement` — each with a plain reason and its source catalog on the card. Three outcomes only: `locked`; `tie_choice`, where both named survivors are shown and the host settles it by re-calling with a `pin` the server re-verifies (a pin can never smuggle in a banned row); or `no_lock`, an honest refusal. Ask for gibberish and you get nothing — the engine would rather refuse than guess.

One schema, three domains: the demo's coda locks a song, a 2 m Thunderbolt cable (a listing whose title claims 40 Gbps while its own spec table proves 480 Mbps dies as `spec_contradiction`), and an unsweetened oat-milk reorder (the sponsored almond swap dies the same way) — three real `tools/call` requests through the identical pipeline.

## How we built it

Four real services, real HTTP at every hop: a Next.js Alexa+ simulator (:3000, the stage), a Node agent orchestrator (:4000 — the borrowed brain's host and a real MCP 2025-11-25 client), the Intent Lock MCP server (:8080, Python/FastAPI — the deliverable), and a chaos/provider mock (:9000). The outage act is armed, not asserted: launch the stack with `CHAOS=1` (scripts/demo-up.sh) and the mock fault-injects an ISP blackout on the wire — the kernel then locks from its audited offline snapshot or honestly refuses, which is how the act is reproduced.

The music data plane costs nothing: YouTube Suggest (keyless) shows what a mangled phrase means to the planet — a spelling oracle, never a catalog — iTunes Search (keyless) hydrates real candidates with real 30-second previews, MusicBrainz (keyless) canonicalizes, and Deezer (keyless) races as a fourth source. Deezer joined late and earned its place by measurement, not by pitch: from our box it answers in about a second, and it deepens exactly the classes where the other catalogs run thin (Saiyaara lofi variants: 27 Deezer rows against iTunes' 8). That is Stage C working as designed — the race is an adapter slot, and any catalog with a real, documented API can join it.

YouTube itself cannot join that race, and we say so plainly: YouTube offers no public catalog API for audio. The routes that pretend otherwise — scraping search pages, streaming through third-party proxy instances — circumvent YouTube's Terms of Service and ride infrastructure that churns daily, while judging runs for two weeks (Nov 9–20), long after any demo-day luck expires. We evaluated them and deferred them past the hackathon. Suggest stays our oracle; the guarantee never depends on a stream we have neither the right nor the reliability to promise. Commerce and grocery supply is audited catalog packs built at development time — grocery rows pulled from the OpenFoodFacts public API, commerce rows from published manufacturer and retailer specifications — every row carrying provenance (`audited_catalog_pack`). We claim no live shopping API at runtime; the claim is that the same engine locks all three domains.

The phonetic core ships separately as an open-source package, **[polyglot-phonetic-judo](https://github.com/AdityaPagare619/polyglot-phonetic-judo)** (public, MIT) — our ecosystem contribution: articulatory grounding any assistant, any MCP host, any catalog can use without us.

## Challenges we ran into

The friction log (19 entries, written as we hit the walls) is the honest version. The ones that shaped the product:

- **MCP Apps CSP fails silently.** MCP Apps content security policy is deny-by-default: undeclared artwork and audio domains don't error — the Trust Card just renders broken. We found it by audit, not by crash, and the deck now declares `resourceDomains` + `connectDomains` explicitly. This is exactly the class of finding the friction-log bonus exists for.
- **MCP sampling is a dying foundation.** We designed the tie-break around MCP sampling, then found it deprecated (SEP-2577, spec revision 2026-07-28). The fix is architectural, not a patch: the server returns an honest `tie_choice`, and the host settles it by re-calling with a `pin` the server re-verifies (FL-18).
- **A deterministic server must never trust its own clock.** A Taste Lock like "after 10 PM" is about the *user's* evening, not the server's timezone. So host time arrives per-request as `_meta.host_time`, is validated before any rule fires, and server-local time is only a labeled fallback — the server never silently substitutes its own clock (FL-24).
- **Catalogs answer spellings, not sounds.** iTunes has no row for "Sayaraa" — the song exists only under its canonical spelling, and our sandbox's egress made supply erratic enough to change outcomes between runs. A guarantee engine cannot assume supply; it must treat supply as evidence. Hence the variant expander, per-source deadlines, the snapshot union, and the thin-pool refusal.
- **The evidence can be lost upstream.** Upstream autocorrect rewrites accented speech before tools see it (FL-02) — which is why the server scores the *raw* utterance, never a cleaned-up version, and why the host's extraction is advisory only.
- **Ranking stages protect quality, or popularity eats them.** An early ranking pass let a locale bonus outvote a wide quality gap and play the karaoke version while the UI said "studio original" (FL-13). The pipeline now runs in strict stages — anchor, grounding, elimination, decide — and no stage may overrule an earlier one's evidence.

## Accomplishments that we're proud of

- **Verified on the metal, not reported.** Beat 1 locks the 2012 Film Original of Saiyaara (iTunes 673948365) on the raw heard form "Sayaraa," repeatedly, live — with the remix vetoed by the user's own "nahi… not the remix" even when the host's extraction omits the exclusion. Beat 3 is deterministic: at host time 22:05 the stored Taste Lock fires and the official LoFi Mix (iTunes 1620148631) locks — and the rule learned its exact-recording binding from that verified win.
- **A real wire, not a mock.** Handshake → session → tools/call → App, all live, all reproducible from the repo. Intent Lock's evidence is live, not inherited: the demo beats are verified end-to-end against live catalogs, the wire smoke passes from a fresh clone, and an intent_lock wire suite (`scripts/verify_intent_lock.py`) runs the hero, veto, sabotage, pin, domain and rule cases against a live server. The regression suite for the legacy tool surface the server still carries holds at **47 PASS / 2 SKIP / 0 FAIL** — labeled as legacy coverage, never cited as Intent Lock's.
- **Attacked by our own hosts, and the score is published.** We pointed three Gemini host personas — careful, careless, and sloppy — at the kernel with 55 messy utterances: 161 runs in which the host, not a script, chose the words. Before the surgery wave that followed, the guarantee survived **77.6%** of runs. The failures are instructive, not hidden: the safety machinery never broke — zero missed vetoes, zero smuggled pins, zero trap resurrections in any run — every failure was a *crowning* choice among legitimate rows (which of two real recordings heads a bare-name ask), never a breached ban. We fixed the crowning layer and replayed the identical attacks; the post-surgery figure stands in the submission packet's testing instructions, next to the suite it belongs to.
- **Zero LLMs in the guarantee box.** We deleted an in-server model tie-break on principle — a second model judging the first is correlated risk, not a boundary — and replaced it with duplicate-merge, an honest `tie_choice` state, and a re-verified host pin.
- **Honest labeling as a feature**: the README carries a "Simulated vs real (no weasel words)" section, every Trust Card number is emitted by the pipeline run that displays it (fields hide when absent; nothing is estimated), and the friction log names our own bugs before anyone else can.

## What we learned

- **Ground the entity, don't fix the transcript.** The accent problem looks like an ASR problem, but the recoverable failures live downstream — in naming, ranking, and guessing. A deterministic layer that grounds the brain's entity in real catalog rows rescues requests the recognizer already heard.
- **Abstention is a designed state.** A `no_lock` refusal and a named `tie_choice` are not failures of the demo; they are the product. An engine that can say "the evidence is thin" is the only kind you can trust with an order button.
- **Measure or it didn't happen.** Every number in this story — 66, 100, 76 against a floor of 60 — was measured on the production module against live catalogs. The flattering numbers we were handed early on (including a "98% phonetic match") did not survive measurement, and they are not in this story.

## Known limitations — stated before you find them

- **A host that renames the song beats us.** If the transcript turns "say yaara" into the name of a different real song ("Yaara"), the kernel verifies the wrong song — correctly. The guarantee binds to what was said; a sufficiently wrong transcript is outside it.
- **Glued transcripts can hide a negation.** Speech-to-text that arrives as one fused string ("playsaiyaaranottheremix") buries the "not" inside a single token, where veto binding cannot reach it. The kernel assumes tokenized transcripts.
- **A strong stranger can still beat a mangled reference.** When the heard words are heavily garbled, the kernel refuses marginal matches — but a phonetically adjacent stranger with a genuinely strong score can clear even the raised bar.
- **Under total catalog failure, supply is luck.** If providers fail together, outcomes ride whichever rows survive. The guarantees hold — nothing vetoed, no trap, nothing below the floor ever locks — but which legitimate recording heads a bare-name ask can vary with the surviving pool.
- **Descriptive asks lean on the host's interpretation.** "That sad song from the spy movie" names no title; the kernel verifies the host's interpretation at the standard floor. Its reference discipline is built for named requests.
- **Commerce and grocery phonetics run on the fallback engine** — a local skeleton matcher, labeled as such in every payload. Music gets the full articulatory engine.
- **Rules cannot be created by pointing backwards.** A Taste Lock persists only when the request itself states the time and the version in words. "Yes — always like that," referring to an earlier turn, creates nothing: the server cannot see that conversation, and it will not persist a rule it cannot ground in the words in front of it.

## What's next

- **More locales, as data.** The operator grammar is configuration: the next dialect is a reviewed JSON diff, not a code change. Community grammar PRs are the growth path.
- **More domain adapters.** Smart-home actions, travel, food delivery — any catalog with adversarial rows and a spec table to audit against its titles.
- **The real prize**: the Unverified Action Boundary exists in every voice stack shipping today. Probabilistic proposal, deterministic proof is the 2026 pattern — and the MCP layer is where it ships.

**One schema. Every catalog. Borrow the Brain, Own the Guarantee.**

## Built with

Model Context Protocol (2025-11-25, Streamable HTTP) · Python / FastAPI · Node.js / TypeScript · Next.js 15 / React 19 · Gemini 3 Flash (host brain in the simulator — borrowed, labeled) · PanPhon articulatory phonetics via polyglot-phonetic-judo (our OSS package, MIT) · YouTube Suggest API (keyless, spelling oracle) · iTunes Search API (keyless) · MusicBrainz (keyless) · Deezer API (keyless) · OpenFoodFacts (build-time catalog pull) · Web Audio API (hook-first playback, presentation DSP)

---

*Team THE YAP PATROL — Intent Lock (OmniBeat-MCP), Amazon "Build, Ship, Shape" Developer Hackathon, Alexa+ Track.*
