/**
 * @omnibeat/polyglot-phonetic-judo v2 — VPPS engine.
 *
 * Thesis: "Alexa heard you. She just spelled it wrong."
 *
 * v2 replaces the Double-Metaphone/Jaro-Winkler stack with the VPPS
 * (Vowel-Preserving Phonetic Skeleton) pipeline:
 *
 *   1. FRAME PEEL — multilingual regex strips wake words, code-switched
 *      verbs (play/chalao/bajaao/pon), provider suffixes, trailing fillers;
 *      detects explicit live/remix intent.
 *   2. VPPS ENCODE — ASR homophone clusters reverse English-dictionary
 *      split hallucinations ("Lolly Pop La Gelu" → "lollipop lagelu");
 *      digraphs normalize (th→t, v/w→b…); VOWELS ARE PRESERVED — in
 *      Hindi/Bhojpuri/Spanish the vowel cadence carries the word.
 *   3. ARTICULATORY DISTANCE — substitution cost by vocal-tract group
 *      (labial b↔v = 0.18, vowel↔vowel = 0.25, unrelated = 1.0).
 *   4. STUDIO PURE GUARD — deterministic ranker; upsell traps −150,
 *      unrequested live/karaoke/remix penalized; SEP-1330 elicitation
 *      when two studio originals land within 15 points.
 *   5. ZERO-COST ARBITRATION — YouTube Suggest as planetary typo
 *      corrector ($0, keyless). Exported for the server lane; the
 *      stdio sidecar path stays fully offline (D-07).
 *
 * Zero dependencies. Zero ML. Zero cost. Deterministic.
 *
 * D-07 wire contract (UNCHANGED): resolvePhoneticTrack(mangled, localeHint,
 * {catalog, topN}) → RankedTrack[] with {id,title,artist,version,…,score,trace}.
 * score is a ranking signal ≈ purity/100 in [0, ~1.5] — same scale the
 * previous engine documented, so E2's relative phonetic gate is unaffected.
 * phoneticSimilarity + purityScore ride along additively for the E2 lane.
 */

// ---------------------------------------------------------------------------
// Types (doc OSS contract)
// ---------------------------------------------------------------------------

export type SupportedLocaleHint =
  | "en-IN"
  | "hi-IN"
  | "bho-IN"
  | "es-US"
  | "es-ES"
  | "ko-KR"
  | "ja-JP"
  | "en-SCT"
  | "en-NG"
  | "en-US"
  | "global-auto";

export interface PeeledCommandFrame {
  rawUtterance: string;
  isolatedPayload: string;
  detectedProvider: "spotify" | "apple_music" | "amazon_music" | "youtube_music" | "default";
  explicitlyRequestedLive: boolean;
  explicitlyRequestedRemix: boolean;
}

export interface CatalogCandidate {
  trackId: string;
  title: string;
  artist: string;
  album?: string;
  previewUrl?: string;
  isUpsellAdTrap?: boolean;
  popularity?: number; // 0 to 100
}

export interface ScoredCandidate extends CatalogCandidate {
  vppsSkeleton: string;
  phoneticSimilarity: number;
  purityScore: number;
  flags: {
    isStudioOriginal: boolean;
    penalizedLive: boolean;
    penalizedKaraokeOrTribute: boolean;
    penalizedUnrequestedRemix: boolean;
    blockedUpsellTrap: boolean;
  };
}

export interface JudoResolutionResult {
  frame: PeeledCommandFrame;
  queryVppsSkeleton: string;
  decision: "AUTO_PLAY_STUDIO_MASTER" | "SEP_1330_CHORUS_HOOK_ELICITATION" | "NO_VALID_STUDIO_CANDIDATE";
  confidenceMargin: number;
  winner: ScoredCandidate | null;
  elicitationShortlist: ScoredCandidate[];
  eliminatedTraps: ScoredCandidate[];
  executionTimeMs: number;
}

// ---------------------------------------------------------------------------
// Types (D-07 sidecar contract — kept byte-identical for server.py)
// ---------------------------------------------------------------------------

export type TrackVersion =
  | "studio"
  | "live"
  | "karaoke"
  | "tribute"
  | "remix"
  | "lofi"
  | "acoustic"
  | "unplugged";

export interface TrackCandidate {
  id: string;
  title: string;
  artist: string;
  version: TrackVersion;
  /** e.g. "Live at Patna", "Karaoke Version" — trap-token source for purity */
  versionNote?: string;
  year?: number;
  localeTags: string[];
  popularity: number;
  providers: string[];
  isrc?: string;
  durationSec?: number;
  /** chaos-mode: this entry carries an upsell payload (F-01 trap) */
  upsellRisk: boolean;
  /** true for every entry of the bundled 30-track chaos catalog */
  mock: boolean;
}

export interface MorphTrace {
  /** what the user (allegedly) said */
  said: string;
  /** catalog token it aligned to */
  heardAs: string;
  /** vppsSimilarity at that alignment, 0–1 */
  sim: number;
}

export interface RankedTrack extends TrackCandidate {
  /** ranking signal ≈ purityScore/100, [0, ~1.5]. Same scale as v1. */
  score: number;
  /** raw VPPS phonetic similarity, [0, 1] */
  baseScore: number;
  /** full deterministic purity score (doc formula) */
  purityScore: number;
  /** raw phonetic similarity, [0, 1] (E2 lane input) */
  phoneticSimilarity: number;
  localeBoost: boolean;
  trace: MorphTrace[];
}

export interface ResolveOptions {
  catalog?: TrackCandidate[];
  topN?: number;
}

// ---------------------------------------------------------------------------
// 1. MULTILINGUAL SYNTACTIC COMMAND FRAME PEELER
// ---------------------------------------------------------------------------

const WAKE_WORD_PREFIX =
  /^(?:hey\s+alexa|oye\s+alexa|ok\s+alexa|alexa|echo|computer|suno\s+alexa)\s*[,:]?\s*/i;

const ACTION_VERB_PREFIX =
  /^(?:please\s+|can\s+you\s+|plz\s+|zara\s+|por\s+favor\s+)?(?:play\s+the\s+song|play\s+song|play\s+track|play\s+some|play|put\s+on|listen\s+to|spin|start\s+playing|pon\s+la\s+cancion|ponme|pon|reproduce|chalao|bajaao|baja\s+do|chala\s+do|lagao|laga\s+do|sunao)\s+/i;

const PROVIDER_SUFFIX =
  /\s+(?:on|via|in|from|using|par|pe|mein|en|por)\s+(?<provider>spotify|apple\s*music|amazon\s*music(?:\s+unlimited)?|youtube\s*music|jiosaavn|gaana|wynk)(?:\s+please|\s+fast|\s+now)?$/i;

const TRAILING_FILLER_SUFFIX =
  /\s+(?:song\s+chalao|gaana\s+chalao|baja\s+do|chala\s+do|wala\s+song|wala\s+gaana|original\s+song|song|track|gaana|cancion|fast|now|please)$/i;

const LIVE_INTENT_REGEX = /\b(live|unplugged|concert|mtv\s+unplugged|acoustic\s+session|tour\s+version)\b/i;
const REMIX_INTENT_REGEX = /\b(remix|lofi|lo-fi|slowed|reverb|mashup|dj|club\s+mix)\b/i;

export function peelMultilingualCommandFrame(rawUtterance: string): PeeledCommandFrame {
  let working = rawUtterance.trim();
  const explicitlyRequestedLive = LIVE_INTENT_REGEX.test(working);
  const explicitlyRequestedRemix = REMIX_INTENT_REGEX.test(working);

  working = working.replace(WAKE_WORD_PREFIX, "").trim();

  let detectedProvider: PeeledCommandFrame["detectedProvider"] = "default";
  const provMatch = working.match(PROVIDER_SUFFIX);
  if (provMatch && provMatch.groups?.provider) {
    const rawProv = provMatch.groups.provider.toLowerCase().replace(/\s+/g, "_");
    if (rawProv.startsWith("spotify")) detectedProvider = "spotify";
    else if (rawProv.startsWith("apple")) detectedProvider = "apple_music";
    else if (rawProv.startsWith("amazon")) detectedProvider = "amazon_music";
    else if (rawProv.startsWith("youtube")) detectedProvider = "youtube_music";
    working = working.slice(0, provMatch.index).trim();
  }

  working = working.replace(ACTION_VERB_PREFIX, "").trim();
  working = working.replace(TRAILING_FILLER_SUFFIX, "").trim();

  return {
    rawUtterance,
    isolatedPayload: working || rawUtterance.trim(),
    detectedProvider,
    explicitlyRequestedLive,
    explicitlyRequestedRemix,
  };
}

// ---------------------------------------------------------------------------
// 2. VOWEL-PRESERVING PHONETIC SKELETON (VPPS)
// ---------------------------------------------------------------------------

const ASR_HOMOPHONE_CLUSTERS: Array<[RegExp, string]> = [
  // Bhojpuri / Hindi / Regional Indian ASR split hallucinations
  [/\blolly\s*pop\b/gi, "lollipop"],
  [/\bla\s*gelu\b|\blage\s*lu\b|\blag\s*elu\b/gi, "lagelu"],
  [/\broger\s*g\b|\braja\s*g\b|\bbraja\s*ji\b/gi, "rajaji"],
  [/\bring\s*kia\b|\brink\s*ya\b/gi, "rinkiya"],
  [/\bkay\s*papa\b|\bk\s*papa\b/gi, "kepapa"],
  [/\bcome\s*area\b|\bcomma\s*riya\b/gi, "kamariya"],
  [/\bpat\s*lee\b|\bput\s*li\b/gi, "patli"],
  [/\bcase\s*area\b|\bkay\s*sariya\b/gi, "kesariya"],
  [/\bstomach\s*shallow\b|\bchamak\s*chalo\b/gi, "chammakchallo"],
  [/\bcal\s*ho\s*na\s*ho\b|\bcall\s*hoe\s*na\s*hoe\b/gi, "kalho na ho"],
  [/\bup\s*na\s*banana\s*lay\b|\bapna\s*banana\s*le\b/gi, "apnabanale"],
  [/\btwo\s*neck\b/gi, "tunak"],
  [/\bmoo\s*jay\b|\bmujh\s*ay\b/gi, "mujhe"],
  [/\byaad\s*anna\b|\byad\s*ana\b/gi, "yaadaana"],

  // Spanglish / LATAM ASR split hallucinations
  [/\bthis\s*pa\s*seat\s*oh\b|\bdes\s*pa\s*cito\b/gi, "despacito"],
  [/\bbuy\s*la\s*cone\s*me\s*go\b/gi, "bailaconmigo"],
  [/\btea\s*tea\b|\btiti\b/gi, "titi"],
  [/\bmay\s*pray\s*goon\s*toe\b|\bme\s*pregunto\b/gi, "mepregunto"],
  [/\bdes\s*pues\b/gi, "despues"],

  // Korean (K-Pop) & Japanese (J-Pop) ASR hallucinations
  [/\bgung\s*num\b|\bgang\s*numb\b/gi, "gangnam"],
  [/\bboy\s*with\s*love\b/gi, "boywithluv"],
  [/\bgoo\s*ren\s*gay\b/gi, "gurenge"],

  // Global English accents (Afrobeats / Scottish / Caribbean)
  [/\bcome\s*down\s*rema\b/gi, "calmdownrema"],
  [/\bas\s*sense\b/gi, "essence"],
  [/\bwhiz\s*kid\b/gi, "wizkid"],
  [/\block\s*low\s*mond\b/gi, "lochlomond"],
];

const DIGRAPH_NORMALIZATIONS: Array<[RegExp, string]> = [
  [/chh/g, "c"],
  [/sh|ch/g, "c"],
  [/ph/g, "f"],
  [/bh/g, "b"],
  [/dh/g, "d"],
  [/gh/g, "g"],
  [/kh|ck|q/g, "k"],
  [/th/g, "t"],
  [/dg|dj|z/g, "j"],
  [/v|w/g, "b"], // labial convergence across Indic & Spanish phonetics
  [/ee|ea|ie|ey|yi/g, "i"],
  [/oo|ou|ow|uu/g, "u"],
  [/aa|ah|aw|er|ar/g, "a"],
  [/ai|ay|ae|eh/g, "e"],
  [/oh|oa/g, "o"],
  [/y/g, "i"],
];

export function toVppsSkeleton(rawText: string): string {
  if (!rawText) return "";
  let s = rawText
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics (é -> e, ó -> o)
    .toLowerCase()
    .trim();

  // Remove parenthetical metadata like "(Official Video)" or "[From 'Brahmastra']".
  // HONEST FIX (v2 audit): the doc's regex was `/|[[^]]*]/g` — the empty
  // alternative matches at EVERY position and reduces the whole string to
  // spaces, zeroing every skeleton. Parens must be stripped explicitly.
  s = s.replace(/\([^)]*\)|\[[^\]]*\]/g, " ");

  for (const [pattern, replacement] of ASR_HOMOPHONE_CLUSTERS) {
    s = s.replace(pattern, replacement);
  }

  for (const [pattern, replacement] of DIGRAPH_NORMALIZATIONS) {
    s = s.replace(pattern, replacement);
  }

  s = s.replace(/[^a-z0-9]/g, "");
  s = s.replace(/(.)\1+/g, "$1"); // collapse duplicate phonemes

  return s;
}

// ---------------------------------------------------------------------------
// 3. ARTICULATORY VOCAL-TRACT WEIGHTED EDIT DISTANCE
// ---------------------------------------------------------------------------

const ARTICULATORY_GROUPS: Record<string, number> = {
  b: 1, p: 1, f: 1, m: 1,          // labials
  d: 2, t: 2, n: 2, l: 2, r: 2,    // coronals / dentals / liquids
  j: 3, s: 3, c: 3,                // palatals / sibilants
  k: 4, g: 4,                      // velars
  a: 5, e: 5, i: 5, o: 5, u: 5,    // cardinal vowel nuclei
};

function phonemeSubstitutionCost(a: string, b: string): number {
  if (a === b) return 0.0;
  const gA = ARTICULATORY_GROUPS[a];
  const gB = ARTICULATORY_GROUPS[b];
  if (gA && gB && gA === gB) {
    return gA === 5 ? 0.25 : 0.18;
  }
  return 1.0;
}

export function articulatoryDistance(skelA: string, skelB: string): number {
  const m = skelA.length;
  const n = skelB.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i * 0.7;
  for (let j = 0; j <= n; j++) dp[0][j] = j * 0.7;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const subCost = phonemeSubstitutionCost(skelA[i - 1], skelB[j - 1]);
      dp[i][j] = Math.min(
        dp[i - 1][j] + 0.7,
        dp[i][j - 1] + 0.7,
        dp[i - 1][j - 1] + subCost,
      );
    }
  }
  return dp[m][n];
}

export function vppsSimilarity(
  queryText: string,
  candidateTitle: string,
  candidateArtist = "",
): number {
  const qSkel = toVppsSkeleton(queryText);
  const titleSkel = toVppsSkeleton(candidateTitle);
  const combinedSkel = toVppsSkeleton(`${candidateTitle} ${candidateArtist}`);

  if (!qSkel || !titleSkel) return 0.0;
  if (qSkel === titleSkel || qSkel === combinedSkel) return 1.0;

  if (
    (titleSkel.length >= 4 && qSkel.includes(titleSkel)) ||
    (qSkel.length >= 4 && titleSkel.includes(qSkel)) ||
    (qSkel.length >= 5 && combinedSkel.includes(qSkel))
  ) {
    const ratio = Math.min(qSkel.length, titleSkel.length) / Math.max(qSkel.length, titleSkel.length);
    return Number(Math.min(0.98, 0.88 + 0.1 * ratio).toFixed(4));
  }

  const distTitle = articulatoryDistance(qSkel, titleSkel);
  const simTitle = Math.max(0, 1.0 - distTitle / Math.max(qSkel.length, titleSkel.length));

  const distCombined = articulatoryDistance(qSkel, combinedSkel);
  const simCombined = Math.max(0, 1.0 - distCombined / Math.max(qSkel.length, combinedSkel.length));

  return Number(Math.max(simTitle, simCombined).toFixed(4));
}

// ---------------------------------------------------------------------------
// 4. STUDIO PURE GUARD — deterministic ranker
// ---------------------------------------------------------------------------

const LIVE_TRAP_TOKENS = /\b(live|concert|unplugged|tour|stadium|session|bbc|mtv\s+live)\b/i;
const KARAOKE_TRAP_TOKENS =
  /\b(karaoke|tribute|originally\s+performed\s+by|in\s+the\s+style\s+of|instrumental\s+version|8-bit|ringtone|cover\s+version)\b/i;
const REMIX_TRAP_TOKENS = /\b(remix|lofi|lo-fi|slowed|reverb|mashup|sped\s+up|dj\s+mix)\b/i;

function scoreOneCandidate(frame: PeeledCommandFrame, cand: CatalogCandidate): ScoredCandidate {
  const fullMeta = `${cand.title} ${cand.album || ""} ${cand.artist}`;
  const sim = vppsSimilarity(frame.isolatedPayload, cand.title, cand.artist);

  const isLive = LIVE_TRAP_TOKENS.test(fullMeta);
  const isKaraoke = KARAOKE_TRAP_TOKENS.test(fullMeta);
  const isRemix = REMIX_TRAP_TOKENS.test(fullMeta);
  const isUpsell = Boolean(cand.isUpsellAdTrap);

  const penalizedLive = isLive && !frame.explicitlyRequestedLive;
  const penalizedKaraoke = isKaraoke;
  const penalizedRemix = isRemix && !frame.explicitlyRequestedRemix;
  const isStudioOriginal = !isLive && !isKaraoke && !isRemix && !isUpsell;

  const popularityBonus = (cand.popularity ?? 75) * 0.15;

  const purityScore =
    100.0 * sim +
    popularityBonus +
    (isStudioOriginal ? 35.0 : 0.0) +
    (frame.explicitlyRequestedLive && isLive ? 40.0 : 0.0) +
    (frame.explicitlyRequestedRemix && isRemix ? 40.0 : 0.0) -
    (penalizedLive ? 65.0 : 0.0) -
    (penalizedKaraoke ? 80.0 : 0.0) -
    (penalizedRemix ? 40.0 : 0.0) -
    (isUpsell ? 150.0 : 0.0);

  return {
    ...cand,
    vppsSkeleton: toVppsSkeleton(cand.title),
    phoneticSimilarity: sim,
    purityScore: Number(purityScore.toFixed(2)),
    flags: {
      isStudioOriginal,
      penalizedLive,
      penalizedKaraokeOrTribute: penalizedKaraoke,
      penalizedUnrequestedRemix: penalizedRemix,
      blockedUpsellTrap: isUpsell,
    },
  };
}

export function rankStudioCandidates(
  rawUtterance: string,
  candidates: CatalogCandidate[],
): JudoResolutionResult {
  const t0 = performance.now();
  const frame = peelMultilingualCommandFrame(rawUtterance);
  const queryVppsSkeleton = toVppsSkeleton(frame.isolatedPayload);

  const scored: ScoredCandidate[] = candidates.map((cand) => scoreOneCandidate(frame, cand));
  scored.sort((a, b) => b.purityScore - a.purityScore);

  const validStudioCandidates = scored.filter(
    (c) => !c.flags.blockedUpsellTrap && c.purityScore > 50.0,
  );
  const eliminatedTraps = scored.filter(
    (c) =>
      c.flags.blockedUpsellTrap ||
      c.flags.penalizedLive ||
      c.flags.penalizedKaraokeOrTribute ||
      c.flags.penalizedUnrequestedRemix,
  );

  const winner = validStudioCandidates[0] ?? null;
  const runnerUp = validStudioCandidates[1] ?? null;

  const confidenceMargin =
    winner && runnerUp ? Number((winner.purityScore - runnerUp.purityScore).toFixed(2)) : 100.0;

  let decision: JudoResolutionResult["decision"] = "NO_VALID_STUDIO_CANDIDATE";
  let elicitationShortlist: ScoredCandidate[] = [];

  if (winner) {
    if (
      runnerUp &&
      confidenceMargin < 15.0 &&
      winner.flags.isStudioOriginal &&
      runnerUp.flags.isStudioOriginal &&
      winner.trackId !== runnerUp.trackId
    ) {
      decision = "SEP_1330_CHORUS_HOOK_ELICITATION";
      elicitationShortlist = validStudioCandidates.slice(0, 3);
    } else {
      decision = "AUTO_PLAY_STUDIO_MASTER";
    }
  }

  return {
    frame,
    queryVppsSkeleton,
    decision,
    confidenceMargin,
    winner,
    elicitationShortlist,
    eliminatedTraps,
    executionTimeMs: Number((performance.now() - t0).toFixed(3)),
  };
}

// ---------------------------------------------------------------------------
// 5. ZERO-COST PLANETARY TYPO ARBITRATOR (YouTube Suggest, keyless)
// ---------------------------------------------------------------------------

export async function arbitrateWithZeroCostYoutubeSuggest(
  rawPayload: string,
  localeHint: SupportedLocaleHint = "global-auto",
): Promise<string> {
  const suffix =
    localeHint === "en-IN" || localeHint === "hi-IN" || localeHint === "bho-IN"
      ? "song hindi bhojpuri"
      : "song";
  const query = encodeURIComponent(`${rawPayload} ${suffix}`);
  const url = `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${query}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const text = (await resp.text()).trim();
    // P1-4 (red-team): defensive JSONP parse — first '(' to last ')', then
    // walk data[1] (the suggestion list). The old lazy-\[.*?\] regex captured
    // up to the first ']' (unbalanced) so JSON.parse always threw and the
    // function silently never arbitrated. Mirrors _parse_suggest_jsonp.
    let inner = text;
    if (inner.includes("(") && inner.endsWith(")")) {
      inner = inner.slice(inner.indexOf("(") + 1, inner.lastIndexOf(")"));
    }
    const data = JSON.parse(inner);
    const suggList = Array.isArray(data) ? data[1] : undefined;
    if (Array.isArray(suggList) && Array.isArray(suggList[0]) &&
        typeof suggList[0][0] === "string") {
      // P1-4: strip trailing parenthetical qualifiers only — never mangle
      // real title words ("Video Games" must survive; " (Official Video)" goes).
      return suggList[0][0]
        .replace(/\s*\((official|video|lyrics|hd|4k|audio|full[^)]*)\)\s*/gi, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
    }
  } catch {
    // graceful offline deterministic fallback
  }
  return rawPayload;
}

// ---------------------------------------------------------------------------
// 6. D-07 SIDECAR ENTRY — resolvePhoneticTrack (wire contract unchanged)
// ---------------------------------------------------------------------------

/** TrackCandidate → doc CatalogCandidate adapter (versionNote carries trap tokens). */
function toCatalogCandidate(t: TrackCandidate): CatalogCandidate {
  return {
    trackId: t.id,
    title: t.title,
    artist: t.artist,
    album: t.versionNote,
    isUpsellAdTrap: t.upsellRisk,
    popularity: t.popularity,
  };
}

/** Per-query-token morph trace against one candidate title (wire inspector). */
function buildTrace(queryTokens: string[], title: string): MorphTrace[] {
  const titleTokens = title.split(/\s+/).filter(Boolean);
  return queryTokens.map((qt) => {
    let best = 0;
    let bestTok = qt;
    for (const tt of titleTokens) {
      const s = vppsSimilarity(qt, tt);
      if (s > best) {
        best = s;
        bestTok = tt;
      }
    }
    return { said: qt, heardAs: bestTok, sim: Math.round(best * 1000) / 1000 };
  });
}

export function resolvePhoneticTrack(
  mangled: string,
  _localeHint?: string,
  opts: ResolveOptions = {},
): RankedTrack[] {
  const { catalog = [], topN = 5 } = opts;
  const frame = peelMultilingualCommandFrame(mangled);
  if (!frame.isolatedPayload) return [];
  const queryTokens = frame.isolatedPayload.split(/\s+/).filter(Boolean);

  const byId = new Map(catalog.map((t) => [t.id, t]));
  const scored = catalog.map((t) => ({
    track: t,
    scored: scoreOneCandidate(frame, toCatalogCandidate(t)),
  }));
  scored.sort((a, b) => b.scored.purityScore - a.scored.purityScore);

  return scored.slice(0, topN).map(({ track, scored: s }) => {
    const t = byId.get(track.id) ?? track;
    return {
      ...t,
      score: Math.round((s.purityScore / 100) * 10000) / 10000, // ≈[0,1.5], v1 scale
      baseScore: s.phoneticSimilarity,
      purityScore: s.purityScore,
      phoneticSimilarity: s.phoneticSimilarity,
      localeBoost: false,
      trace: buildTrace(queryTokens, t.title),
    };
  });
}
