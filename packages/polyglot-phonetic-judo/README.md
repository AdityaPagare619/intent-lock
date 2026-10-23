# polyglot-phonetic-judo

> "Alexa heard you. She just spelled it wrong."

A deterministic, zero-dependency phonetic pipeline that turns mangled
speech-to-text transcripts into canonical track titles. Built for the
**Intent Lock** — Alexa+ track entry (Amazon "Build, Ship, Shape" hackathon),
shipped as a standalone package for the **Open Source mini-challenge**.

**What it does:** `"Lolly Pop La Gelu"` → **Lollipop Lagelu — Pawan Singh**.
`"Roger G"` → **Raja Ji**. `"Alexa pon Gasolina"` → **Gasolina**.
Hinglish, Bhojpuri, Spanglish, Portuguese and K-pop romanization aware.

**What it is NOT:** it is not a speech recognizer, not a music API, and not
machine learning. It takes an *already-transcribed* (possibly mangled) string
and ranks candidates from a catalog you provide. No network, no keys, no cost.

## Install

```bash
npm install polyglot-phonetic-judo
```

Zero runtime dependencies. Node ≥ 18.

## Quick start

```ts
import { resolvePhoneticTrack } from "polyglot-phonetic-judo";
import { CHAOS_CATALOG_30 } from "polyglot-phonetic-judo/catalog";

const [best] = resolvePhoneticTrack("Lolly Pop La Gelu", "IN-BR", {
  catalog: CHAOS_CATALOG_30,
  topN: 5,
});
console.log(best.title, "-", best.artist); // Lollipop Lagelu - Pawan Singh
console.log(best.trace);
// [
//   { said: "lolly", heardAs: "lollipop", sim: 0.86 },
//   { said: "pop",   heardAs: "lollipop", sim: 0.792 },
//   { said: "la",    heardAs: "lagelu",   sim: 0.822 },
//   { said: "gelu",  heardAs: "lagelu",   sim: 0.889 }
// ]
```

With your own catalog:

```ts
import { resolvePhoneticTrack, type TrackCandidate } from "polyglot-phonetic-judo";

const catalog: TrackCandidate[] = [
  {
    id: "1", title: "Despacito", artist: "Luis Fonsi",
    version: "studio", localeTags: ["ES-PR"], popularity: 98,
    providers: ["youtube"], upsellRisk: false, mock: false,
  },
];

const ranked = resolvePhoneticTrack("this pasito", "ES-PR", { catalog, topN: 3 });
// → Despacito, with per-token morph trace for your UI
```

## How it works (the VPPS pipeline — v2)

1. **Frame peeler** — `peelMultilingualCommandFrame()` strips the command
   wrapper with multilingual regexes: wake words (`alexa`, `oye alexa`,
   `suno alexa`), code-switched verbs (`play`, `chalao`, `bajaao`, `pon`,
   `reproduce`, …), provider suffixes (`on Spotify`, `via JioSaavn`,
   `pe Gaana`) and trailing fillers (`song chalao`). It also detects
   explicit **live / remix intent** (`"play Kesariya live concert version"`),
   which overrides the default studio preference downstream.
2. **VPPS encoder** — `toVppsSkeleton()` reverses English-dictionary
   split-hallucinations via ~30 ASR homophone clusters (`lolly pop`→`lollipop`,
   `roger g`→`rajaji`, `stomach shallow`→`chammakchallo`,
   `this pa seat oh`→`despacito`), normalizes digraphs (`th→t`, `v/w→b`,
   `aa→a`, …), and **preserves vowels** — in Hindi/Bhojpuri/Spanish the
   vowel cadence carries the word (this is the key upgrade over
   Soundex/Double-Metaphone, which delete them).
3. **Articulatory distance** — `articulatoryDistance()` weights substitutions
   by vocal-tract group: labial `b↔v` costs **0.18**, vowel↔vowel **0.25**,
   unrelated phonemes **1.0**. Insertions/deletions cost 0.7.
   `vppsSimilarity()` = best of title-only vs title+artist, with exact and
   substring-containment short-circuits.
4. **StudioPureGuard ranker** — `rankStudioCandidates()` scores
   `100·sim + popularity·0.15 + 35·studio −65·live −80·karaoke −40·remix
   −150·upsell`, blocks upsell ad traps, and triggers **SEP-1330 chorus-hook
   elicitation** when two studio originals land within a 15-point margin.
5. **Zero-cost arbitration** — `arbitrateWithZeroCostYoutubeSuggest()` uses
   YouTube's keyless autocomplete as a planetary typo corrector ($0, keyless, graceful offline fallback,
   graceful offline fallback). Used by the server lane; the stdio sidecar
   path stays fully offline.

Deterministic: same input, same catalog → same ranking. Latency is
bounded by the package's own test suite: the 25 unit tests run at
<15ms/query against the 30-track catalog (see Development, below) —
no finer latency figure is claimed, because none has been measured
and recorded.

## API

| Export | Signature | Notes |
|---|---|---|
| `resolvePhoneticTrack` | `(utterance, localeHint?, { catalog, topN }) => RankedTrack[]` | D-07 sidecar entry; `[]` on empty frame |
| `rankStudioCandidates` | `(utterance, candidates: CatalogCandidate[]) => JudoResolutionResult` | deterministic StudioPureGuard ranker |
| `vppsSimilarity` | `(query, title, artist?) => number` | [0, 1] articulatory similarity |
| `toVppsSkeleton` | `(text) => string` | vowel-preserving phonetic skeleton |
| `articulatoryDistance` | `(skelA, skelB) => number` | vocal-tract weighted edit distance |
| `peelMultilingualCommandFrame` | `(utterance) => PeeledCommandFrame` | the command-wrapper stripper + intent |
| `arbitrateWithZeroCostYoutubeSuggest` | `(payload, localeHint?) => Promise<string>` | keyless typo arbitrator |
| `CHAOS_CATALOG_30` | `TrackCandidate[]` | from `polyglot-phonetic-judo/catalog` |

`RankedTrack` extends `TrackCandidate` with `score` (≈ purity/100, the
`[0, 1.5]` ranking signal), `baseScore` + `phoneticSimilarity` (raw VPPS
`[0, 1]`), `purityScore` (full deterministic score), `localeBoost`, and
`trace: MorphTrace[]` (`{ said, heardAs, sim }` per token).

## The chaos catalog

`polyglot-phonetic-judo/catalog` exports `CHAOS_CATALOG_30`: 30 **mock**
tracks engineered for collisions — Bhojpuri "Lollipop Lagelu" vs Western
"Lollipop", 4 versions of "Raja Ji", live-vs-studio pairs, karaoke traps, and
entries flagged `upsellRisk` for chaos-mode testing. Every entry has
`mock: true`. Human-readable companion: `data/chaos_catalog_30.md`.

## Honest labeling

- This package performs **phonetic text matching only**. It does not hear
  audio, call music APIs, or claim a match is "the" correct song — it ranks
  *your* catalog.
- `popularity` values in the mock catalog are documented judgments for
  tie-breaking, not measurements.
- Spoken-letter expansion (`g→ji`) and the romanization maps encode
  *observed* ASR failure patterns from Hinglish/Bhojpuri/Spanglish usage;
  they are heuristics with documented tradeoffs (see `src/index.ts` comments),
  not linguistic claims.

## Development

```bash
npm install
npm test        # 25 unit tests — the Phase-1 exit gate (25/25, <15ms/query)
npm run build   # tsc → dist/
```

## Node sidecar (D-07 — the TS/Python seam)

The Python MCP server cannot import TypeScript, so `sidecar.js` (package root)
exposes `resolvePhoneticTrack` over stdio. The server spawns it **once** at
startup; it is long-lived — never one process per query.

**Protocol** (JSON lines, UTF-8):
- stdin:  `{"mangled": "Lolly Pop La Gelu", "localeHint": "en-IN", "topN": 3}`
- stdout: `{"candidates": [{"title": "Lollipop Lagelu", "artist": "Pawan Singh", "score": 0.89, "trace": […]}]}`
- errors: `{"error": "…"}` — bad input never kills the process.

The sidecar always resolves against the bundled 30-track chaos catalog
(`dist/catalog.js`) — the same catalog the 25 unit tests assert against.
If `node` is absent, the server falls back to its stub scorer with a loud
warning (never silently).

```bash
printf '{"mangled":"Roger G","localeHint":"en-IN","topN":3}\n' | node sidecar.js
```

## Preview URLs & 3s hooks (`src/hooks.ts`)

- `searchPreviews(query, limit)` — 30s previews via Deezer Search API first,
  iTunes Search API as fallback. Both free, no OAuth, no key (₹0 law).
  Deezer preview URLs are **signed and expiring** — resolve live per session,
  never cache.
- `hookSlice(previewUrl, startSec=12, endSec=15)` — returns the preview URL
  with a `#t=start,end` media fragment + explicit offsets. The browser seeks;
  no server-side audio slicing (MP3 byte offsets are unreliable without CBR —
  documented in the module).

## License

MIT — see `LICENSE`.
