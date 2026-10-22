# CHAOS_CATALOG_30 — the 30 high-collision mock tracks

**HONESTY FIRST:** every entry in this catalog is **MOCK data** (`mock: true` in
the machine-readable `src/catalog.ts`). Real song titles and artists are used as
fixtures so the phonetic pipeline is exercised on authentic phoneme patterns;
artists marked **[MOCK]** are invented for collision variants the real world
doesn't conveniently hand us (4× "Raja Ji", unplugged covers, karaoke traps).
No real audio is ever fetched — chaos mode serves this catalog *instead* of
live APIs so the demo is deterministic and copyright-safe.

Machine-readable source of truth: `src/catalog.ts` (`CHAOS_CATALOG_30`).
This file is the human-readable companion. If they disagree, `catalog.ts` wins.

## Metadata fields (what the MCP server needs downstream)

| Field | Type | Meaning for E2 StudioPureGuard / chaos mode |
|---|---|---|
| `id` | string | stable key (`bb-001`, `rj-003`, `lt-002`…) |
| `title` / `artist` | string | display + phonetic match targets |
| `version` | enum | `studio` `live` `karaoke` `tribute` `remix` `lofi` `acoustic` `unplugged` — feeds the purity formula |
| `versionNote` | string? | "Bhojpuri Original", "Karaoke Version", "Live at Patna" — matched against leftover query words |
| `year` | number? | release year (fixture) |
| `localeTags` | string[] | `IN-BR` `IN-UP` `IN-PB` `UK` `US` `ES` `ES-PR` `ES-CO` `PT-BR` `KR` — the `Mcp-Param-Locale-Hint` prior |
| `popularity` | 0–100 | regional acoustic popularity — **documented judgment, not truth**; pure tiebreak in E1, prior in E2 |
| `providers` | string[] | where chaos mode "streams" from |
| `isrc` | string? | fixture ISRCs (`IN-MOCK-…`) — shape-correct, not real |
| `durationSec` | number? | fixture duration |
| `upsellRisk` | boolean | **chaos payload**: entry carries a fake `PAYWALL_UPSELL` flag so E2's anti-upsell firewall has something to block on camera |
| `mock` | boolean | always `true` in this file |

## The 30 tracks

### Bhojpuri cluster — the flagship collision (UC-1)
| id | Title | Artist | Ver | Year | Locales | Pop | Upsell |
|---|---|---|---|---|---|---|---|
| bb-001 | Lollipop Lagelu | Pawan Singh | studio | 2011 | IN-BR, IN-UP | 96 | — |
| bb-002 | Lollipop Lagelu | Pawan Singh | live — *Live at Patna* | 2015 | IN-BR | 41 | — |
| bb-003 | Lollipop Lagelu | Karaoke Kings | karaoke — *Karaoke Version* | — | IN-BR | 12 | — |

### Western "Lollipop" collisions
| id | Title | Artist | Ver | Year | Locales | Pop | Upsell |
|---|---|---|---|---|---|---|---|
| wx-001 | Lollipop | Mika | studio | 2007 | UK, US | 87 | — |
| wx-002 | Lollipop | Lil Wayne ft. Static Major | studio | 2008 | US | 85 | — |

### "Raja Ji" — 4 versions, one name (UC-2: the same-name standoff)
| id | Title | Artist | Ver | Locales | Pop | Upsell |
|---|---|---|---|---|---|---|
| rj-001 | Raja Ji | **[MOCK]** Anand Mohan — *Bhojpuri Original* | studio | IN-BR, IN-UP | 88 | — |
| rj-002 | Raja Ji | **[MOCK]** DJ Chhotu — *90s Remix* | remix | IN-UP | 52 | — |
| rj-003 | Raja Ji | **[MOCK]** lofi bhojpur — *Lo-Fi Flip* | lofi | IN-BR | 47 | — |
| rj-004 | Raja Ji | **[MOCK]** DJ Bhojpuria — *DJ Bhojpuri Mix* | remix | IN-BR | 39 | **YES** — exclusive, triggers the upsell trap |

### "Tere Bina" — three eras, one phrase
| id | Title | Artist | Ver | Locales | Pop | Upsell |
|---|---|---|---|---|---|---|
| tb-001 | Tere Bina | A.R. Rahman — *Guru 2007* | studio | IN | 90 | — |
| tb-002 | Tere Bina Zindagi Se | Kishore Kumar, Lata Mangeshkar — *Aandhi 1975* | studio | IN | 84 | — |
| tb-003 | Tere Bina | **[MOCK]** Cafe Coverwala — *Unplugged Cover* | unplugged | IN | 33 | — |

### Punjabi cluster
| id | Title | Artist | Ver | Locales | Pop | Upsell |
|---|---|---|---|---|---|---|
| pb-001 | Kala Chashma | Amar Arshi | studio (1990) | IN-PB | 78 | — |
| pb-002 | Kala Chashma | Badshah, Neha Kakkar, Amar Arshi — *Baar Baar Dekho 2016* | studio | IN | 93 | — |
| pb-003 | Mundian To Bach Ke | Panjabi MC | studio (2002) | IN-PB, UK | 89 | — |
| pb-004 | Mundian To Bach Ke | Panjabi MC — *Live Birmingham* | live | UK | 28 | — |
| pb-005 | Tunak Tunak Tun | Daler Mehndi | studio (1998) | IN-PB | 91 | — |

### Hindi film cluster
| id | Title | Artist | Ver | Locales | Pop | Upsell |
|---|---|---|---|---|---|---|
| hf-001 | Chaiyya Chaiyya | A.R. Rahman — *Dil Se 1998* | studio | IN | 89 | — |
| hf-002 | Jai Ho | A.R. Rahman — *Slumdog Millionaire 2008* | studio | IN | 94 | — |
| hf-003 | Mujhe Tum Yaad Aana | **[MOCK]** Arijit Vibe | studio | IN | 61 | — |

### Latin / Spanglish cluster
| id | Title | Artist | Ver | Locales | Pop | Upsell |
|---|---|---|---|---|---|---|
| lt-001 | Despacito | Luis Fonsi ft. Daddy Yankee | studio (2017) | ES-PR | 98 | — |
| lt-002 | Despacito | Karaoke Kings — *Karaoke Version* | karaoke | ES | 11 | **YES** — karaoke trap + upsell payload |
| lt-003 | Danza Kuduro | Don Omar ft. Lucenzo | studio (2010) | ES | 90 | — |
| lt-004 | Gasolina | Daddy Yankee | studio (2004) | ES-PR | 88 | — |
| lt-005 | Bailando | Enrique Iglesias | studio (2014) | ES | 86 | — |
| lt-006 | Waka Waka (Esto es África) | Shakira | studio (2010) | ES-CO | 92 | — |
| lt-007 | Ai Se Eu Te Pego | Michel Teló | studio (2011) | PT-BR | 85 | — |
| lt-008 | Taki Taki | DJ Snake ft. Selena Gomez, Ozuna, Cardi B | studio (2018) | ES, US | 89 | — |

### K-pop cluster
| id | Title | Artist | Ver | Locales | Pop | Upsell |
|---|---|---|---|---|---|---|
| kp-001 | Gangnam Style | PSY | studio (2012) | KR | 96 | — |
| kp-002 | Dynamite | BTS | studio (2020) | KR | 95 | — |

## Collision map (what each cluster is FOR)

- **bb-001 vs wx-001/wx-002** — cross-language title collision; the `IN-BR` locale hint is the tiebreak (demo beat, UC-1).
- **rj-001…rj-004** — the 4-way same-name standoff (UC-2); E2 must *elicit*, not guess.
- **tb-001/tb-002/tb-003** — era collision; popularity orders, version words disambiguate.
- **pb-001 vs pb-002** — original vs remake; the "which Kala Chashma" question.
- **bb-001/bb-002, pb-003/pb-004** — live-vs-studio pairs for the purity formula.
- **bb-003, lt-002** — karaoke traps: right words, wrong music.
- **rj-004, lt-002** — upsell payloads: `upsellRisk: true` lets chaos mode fire F-01 on demand.

## For Arjun (MCP server) — how to consume

```ts
import { CHAOS_CATALOG_30 } from "polyglot-phonetic-judo/catalog";
import { resolvePhoneticTrack } from "polyglot-phonetic-judo";

// E1: resolve the mangled utterance against the chaos catalog
const ranked = resolvePhoneticTrack("Lolly Pop La Gelu", "IN-BR", {
  catalog: CHAOS_CATALOG_30, topN: 5,
});
// ranked[0] → { title: "Lollipop Lagelu", artist: "Pawan Singh", score: 1.19…,
//                version: "studio", upsellRisk: false, trace: […] }
// Feed ranked into E2's purity formula; if top scores cluster within the
// ambiguity band, fire InputRequiredResult with the 3s hooks.
```

`resolvePhoneticTrack` returns `[]` for an empty frame — never throw on empty input.
Scores are ranking signals in `[0, 1.5]`, not probabilities; `>1` means the
locale prior and/or version confirmation fired. `trace` (per-token
said→heardAs alignments) is what the simulator's phonetic-morph card animates.
