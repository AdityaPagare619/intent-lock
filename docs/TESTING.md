# How Intent Lock was tested

We did not grade our own homework. The host brain in production is Alexa+ —
a probabilistic LLM we do not control — so we tested the kernel against hosts
that behave **worse**: three Gemini personas (*careful*, *careless*, *sloppy*)
extracting structure from 55 everyday utterances, mistakes and all.

## The hostile-host matrix

- **165 runs** (55 utterances × 3 personas). In 32 of the 165, the host's own
  extraction was wrong — sloppy hints, missing tags, invented structure.
- First honest score: the guarantee held in **77.64%** of completed runs.
  Not good enough — so we published every failure internally and fixed them
  one by one.
- **Zero missed vetoes.** In all 165 runs, a banned row never once played.
- **Zero smuggled pins.** Every pin that tried to sneak a banned or absent
  recording past the gate was refused.

## The acceptance gate (final, on the shipped tree)

One gate, five sections, all must pass:

| Section | Result |
|---|---|
| Kernel verification suite (10 cases: hero lock, es-US veto, sabotage hint, clause-bounded veto, trap gate, pin discipline, gibberish refusal, commerce spec-lies, grocery guard, Taste Lock rules) | **10 / 10 PASS** |
| Replay of the 36 wrong-locks from the hostile-host matrix | **36 FIXED / 0 still-wrong / 0 changed** |
| Guarantee survival, after surgery | **100.0%** (same computation as the 77.64% baseline) |
| Saboteur battery (10 attacks: resurrected vetoes, smuggled pins, malformed arguments, rule forgery) | **10 / 10 PASS** |
| The five demo beats through the real host path | **5 / 5 PASS** |
| Rig left pristine (no test rules or state left behind) | **PASS** |

Final gate run: 2026-10-23 (run 7, ~02:17 IST), against the exact tree in this repository. The run before it (run 6, same night) FAILED on two findings, both fixed and re-gated in run 7: a replay case where run-together ASR garble ("playsaiyaaranottheremix") hid the user's own "not the remix" veto from the parser — the kernel now carries a fused-negation rescue that recovers vetoes fused inside a single garbled token — and a saboteur-checker isolation flaw (the kernel had behaved correctly; the checker counted a pre-existing legitimate rule as a violation and now diffs snapshots). The protocol-negotiation fix below is also included. One acceptance note, in the open: the B2 rule beat accepts the LoFi Mix by recording (title + lead artist + either catalog's verified pressing: iTunes 1620148631 or Deezer 1724669457, ISRC-checked), because two live catalogs legitimately carry the same recording under different ids.

## Calibration receipt

The gate's thresholds — floor **0.60**, tie margin **0.04**, EXACT_LOCK
**+0.10** (floor 0.70) — were selected against the hostile-host matrix,
and are unchanged since that selection:

- The matrix: **165 planned runs** (55 utterances × 3 personas),
  **161 completed** (165 − 1 extraction error − 3 kernel errors).
- On that matrix, the pre-fix system false-locked **36** runs —
  guarantee survival **77.64%** (125 of 161 completed runs safe).
- After the fixes, all **36** wrong-locks were replayed:
  **36 FIXED / 0 still-wrong** — a false-lock rate of **0%** on the
  replay — confirmed again at gate run 7 (2026-10-23) over the
  shipped tree.

**Gate run 8 (2026-10-23)** — run over the renamed PROOF tree (the
one-name purge: the server directory is now `services/intent-lock-server`
and the server introduces itself as `intent-lock-server`), with the two
PROOF kernel upgrades in the tree: W3 unit-aware normalization in the
spec-contradiction checker and W4 the veto subject-exemption. All
sections PASS: suite **10/10** · replay **36/36** · saboteur **10/10** ·
beats **5/5** · pristine start. Live seals from the same run: the
natural-order allergy ask ("smooth almond butter, no peanut at all")
now **locks** the almond butter (`openfoodfacts:5060132281796`) instead
of refusing — the W4 fix working in the open; and the W3 unit battery
reproduced the shipped commerce conviction reasons byte-identically,
so the published proof strips remain exact transcripts.

## Interop

The server was also exercised by a third-party MCP client (the official MCP
Inspector): initialize, tools/list, and a full tie → pin → re-verify flow
against the live kernel — 12/12 protocol checks against MCP spec 2025-11-25. Protocol negotiation follows the spec: a client proposing a different well-formed version receives a counter-offer of 2025-11-25, not a dead end (verified live against older and newer proposals).

## Known limitations (printed, not hidden)

- A free-form "no added sugar" grocery ask can end in an honest `no_lock`:
  the grocery domain's text grounding tops out below the never-guess floor.
  The kernel refuses rather than guesses — that is the product working as
  designed, and the refusal is the honest outcome.
- One ASR-garbled film-song ask locks a cover rendition whose own title
  carries the film anchor, over the original that carries it in its album
  name. The card shows the artist it locked, in the open.
- Preview-audio playback depends on the host browser's decode path; the lock
  itself never does.
