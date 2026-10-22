/**
 * CHAOS_CATALOG_30 — the 30 high-collision mock tracks.
 *
 * HONESTY: every entry is MOCK data (mock: true). Real titles/artists are used
 * as fixtures so the phonetic pipeline is exercised on authentic phoneme
 * patterns; "MOCK" artists are invented for the collision variants the real
 * world doesn't conveniently provide (4× "Raja Ji", unplugged covers).
 * The MCP server's chaos mode serves this catalog INSTEAD of live APIs so the
 * demo is deterministic and copyright-safe (no real audio is ever fetched).
 *
 * Structure mirrors what E2 (StudioPureGuard) needs downstream:
 * version kind, locale tags, popularity, providers, upsellRisk.
 */
import type { TrackCandidate } from "./index.js";

export const CHAOS_CATALOG_30: TrackCandidate[] = [
  // ——— Bhojpuri cluster: the flagship collision ———
  { id: "bb-001", title: "Lollipop Lagelu", artist: "Pawan Singh", version: "studio", year: 2011,
    localeTags: ["IN-BR", "IN-UP"], popularity: 96, providers: ["youtube", "deezer", "itunes"],
    isrc: "IN-MOCK-11-00001", durationSec: 231, upsellRisk: false, mock: true },
  { id: "bb-002", title: "Lollipop Lagelu", artist: "Pawan Singh", version: "live", versionNote: "Live at Patna",
    year: 2015, localeTags: ["IN-BR"], popularity: 41, providers: ["youtube"],
    durationSec: 268, upsellRisk: false, mock: true },
  { id: "bb-003", title: "Lollipop Lagelu", artist: "Karaoke Kings", version: "karaoke", versionNote: "Karaoke Version",
    localeTags: ["IN-BR"], popularity: 12, providers: ["youtube"],
    durationSec: 231, upsellRisk: false, mock: true }, // karaoke trap: right words, no Pawan

  // ——— Western "Lollipop" collisions ———
  { id: "wx-001", title: "Lollipop", artist: "Mika", version: "studio", year: 2007,
    localeTags: ["UK", "US"], popularity: 87, providers: ["youtube", "deezer", "itunes"],
    durationSec: 178, upsellRisk: false, mock: true },
  { id: "wx-002", title: "Lollipop", artist: "Lil Wayne ft. Static Major", version: "studio", year: 2008,
    localeTags: ["US"], popularity: 85, providers: ["youtube", "deezer"],
    durationSec: 295, upsellRisk: false, mock: true },

  // ——— "Raja Ji": 4 versions, one name (the same-name standoff, UC-2) ———
  { id: "rj-001", title: "Raja Ji", artist: "Anand Mohan", version: "studio", versionNote: "Bhojpuri Original",
    year: 2013, localeTags: ["IN-BR", "IN-UP"], popularity: 88, providers: ["youtube", "deezer"],
    durationSec: 214, upsellRisk: false, mock: true },
  { id: "rj-002", title: "Raja Ji", artist: "DJ Chhotu", version: "remix", versionNote: "90s Remix",
    localeTags: ["IN-UP"], popularity: 52, providers: ["youtube"],
    durationSec: 247, upsellRisk: false, mock: true },
  { id: "rj-003", title: "Raja Ji", artist: "lofi bhojpur", version: "lofi", versionNote: "Lo-Fi Flip",
    localeTags: ["IN-BR"], popularity: 47, providers: ["youtube", "deezer"],
    durationSec: 189, upsellRisk: false, mock: true },
  { id: "rj-004", title: "Raja Ji", artist: "DJ Bhojpuria", version: "remix", versionNote: "DJ Bhojpuri Mix",
    localeTags: ["IN-BR"], popularity: 39, providers: ["amazon music"],
    durationSec: 262, upsellRisk: true, mock: true }, // upsell payload: exclusive → F-01 trap

  // ——— "Tere Bina": three eras, one phrase ———
  { id: "tb-001", title: "Tere Bina", artist: "A.R. Rahman", version: "studio", versionNote: "Guru 2007",
    year: 2007, localeTags: ["IN"], popularity: 90, providers: ["youtube", "deezer", "itunes"],
    durationSec: 312, upsellRisk: false, mock: true },
  { id: "tb-002", title: "Tere Bina Zindagi Se", artist: "Kishore Kumar, Lata Mangeshkar", version: "studio",
    versionNote: "Aandhi 1975", year: 1975, localeTags: ["IN"], popularity: 84,
    providers: ["youtube", "deezer"], durationSec: 341, upsellRisk: false, mock: true },
  { id: "tb-003", title: "Tere Bina", artist: "Cafe Coverwala", version: "unplugged", versionNote: "Unplugged Cover",
    localeTags: ["IN"], popularity: 33, providers: ["youtube"],
    durationSec: 276, upsellRisk: false, mock: true },

  // ——— Punjabi cluster ———
  { id: "pb-001", title: "Kala Chashma", artist: "Amar Arshi", version: "studio", year: 1990,
    localeTags: ["IN-PB"], popularity: 78, providers: ["youtube", "deezer"],
    durationSec: 302, upsellRisk: false, mock: true },
  { id: "pb-002", title: "Kala Chashma", artist: "Badshah, Neha Kakkar, Amar Arshi", version: "studio",
    versionNote: "Baar Baar Dekho 2016", year: 2016, localeTags: ["IN"], popularity: 93,
    providers: ["youtube", "deezer", "itunes"], durationSec: 226, upsellRisk: false, mock: true },
  { id: "pb-003", title: "Mundian To Bach Ke", artist: "Panjabi MC", version: "studio", year: 2002,
    localeTags: ["IN-PB", "UK"], popularity: 89, providers: ["youtube", "deezer", "itunes"],
    durationSec: 258, upsellRisk: false, mock: true },
  { id: "pb-004", title: "Mundian To Bach Ke", artist: "Panjabi MC", version: "live", versionNote: "Live Birmingham",
    localeTags: ["UK"], popularity: 28, providers: ["youtube"],
    durationSec: 301, upsellRisk: false, mock: true },
  { id: "pb-005", title: "Tunak Tunak Tun", artist: "Daler Mehndi", version: "studio", year: 1998,
    localeTags: ["IN-PB"], popularity: 91, providers: ["youtube", "deezer"],
    durationSec: 355, upsellRisk: false, mock: true },

  // ——— Hindi film cluster ———
  { id: "hf-001", title: "Chaiyya Chaiyya", artist: "A.R. Rahman", version: "studio", versionNote: "Dil Se 1998",
    year: 1998, localeTags: ["IN"], popularity: 89, providers: ["youtube", "deezer", "itunes"],
    durationSec: 402, upsellRisk: false, mock: true },
  { id: "hf-002", title: "Jai Ho", artist: "A.R. Rahman", version: "studio", versionNote: "Slumdog Millionaire 2008",
    year: 2008, localeTags: ["IN"], popularity: 94, providers: ["youtube", "deezer", "itunes"],
    durationSec: 322, upsellRisk: false, mock: true },
  { id: "hf-003", title: "Mujhe Tum Yaad Aana", artist: "Arijit Vibe", version: "studio",
    localeTags: ["IN"], popularity: 61, providers: ["youtube", "deezer"],
    durationSec: 289, upsellRisk: false, mock: true }, // code-switch fixture (UC-1 family)

  // ——— Latin / Spanglish cluster ———
  { id: "lt-001", title: "Despacito", artist: "Luis Fonsi ft. Daddy Yankee", version: "studio", year: 2017,
    localeTags: ["ES-PR"], popularity: 98, providers: ["youtube", "deezer", "itunes"],
    durationSec: 282, upsellRisk: false, mock: true },
  { id: "lt-002", title: "Despacito", artist: "Karaoke Kings", version: "karaoke", versionNote: "Karaoke Version",
    localeTags: ["ES"], popularity: 11, providers: ["amazon music"],
    durationSec: 282, upsellRisk: true, mock: true }, // karaoke trap + upsell payload
  { id: "lt-003", title: "Danza Kuduro", artist: "Don Omar ft. Lucenzo", version: "studio", year: 2010,
    localeTags: ["ES"], popularity: 90, providers: ["youtube", "deezer", "itunes"],
    durationSec: 202, upsellRisk: false, mock: true },
  { id: "lt-004", title: "Gasolina", artist: "Daddy Yankee", version: "studio", year: 2004,
    localeTags: ["ES-PR"], popularity: 88, providers: ["youtube", "deezer"],
    durationSec: 192, upsellRisk: false, mock: true },
  { id: "lt-005", title: "Bailando", artist: "Enrique Iglesias", version: "studio", year: 2014,
    localeTags: ["ES"], popularity: 86, providers: ["youtube", "deezer", "itunes"],
    durationSec: 264, upsellRisk: false, mock: true },
  { id: "lt-006", title: "Waka Waka (Esto es África)", artist: "Shakira", version: "studio", year: 2010,
    localeTags: ["ES-CO"], popularity: 92, providers: ["youtube", "deezer", "itunes"],
    durationSec: 211, upsellRisk: false, mock: true },
  { id: "lt-007", title: "Ai Se Eu Te Pego", artist: "Michel Teló", version: "studio", year: 2011,
    localeTags: ["PT-BR"], popularity: 85, providers: ["youtube", "deezer"],
    durationSec: 163, upsellRisk: false, mock: true },
  { id: "lt-008", title: "Taki Taki", artist: "DJ Snake ft. Selena Gomez, Ozuna, Cardi B", version: "studio",
    year: 2018, localeTags: ["ES", "US"], popularity: 89, providers: ["youtube", "deezer", "itunes"],
    durationSec: 232, upsellRisk: false, mock: true },

  // ——— K-pop cluster ———
  { id: "kp-001", title: "Gangnam Style", artist: "PSY", version: "studio", year: 2012,
    localeTags: ["KR"], popularity: 96, providers: ["youtube", "deezer", "itunes"],
    durationSec: 219, upsellRisk: false, mock: true },
  { id: "kp-002", title: "Dynamite", artist: "BTS", version: "studio", year: 2020,
    localeTags: ["KR"], popularity: 95, providers: ["youtube", "deezer", "itunes"],
    durationSec: 199, upsellRisk: false, mock: true },
];
