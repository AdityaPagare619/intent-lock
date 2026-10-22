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

Final gate run: 2026-10-22, against the exact tree in this repository.

## Interop

The server was also exercised by a third-party MCP client (the official MCP
Inspector): initialize, tools/list, and a full tie → pin → re-verify flow
against the live kernel — 12/12 protocol checks against MCP spec 2025-11-25.

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
