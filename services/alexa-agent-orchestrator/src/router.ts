/**
 * Intent router — the "Alexa+ brain" (Wave 2: host brain for Intent Lock).
 *
 * DEMO PATH (default): the host brain parses language into structure and
 * the deterministic MCP server verifies it. Play turns run the Doc-12
 * extraction contract (Gemini via the Brain, or this file's deterministic
 * floor) into ONE tool — intent_lock — whose structuredContent is the
 * turn payload (the Trust Card). STOP / BARGE / CHALLENGE / SYNC turns in
 * demo mode make NO legacy tool calls: challenges answer from the last
 * intent_lock payload this session already holds; the rest answer
 * locally. Nothing in the demo path touches the four legacy tools.
 *
 * LEGACY PATH (req.legacy === true or ORCHESTRATOR_LEGACY=1): the
 * d0062ec cascade, unchanged — dual-path regex router over the four
 * legacy tools, Truth-Ledger challenge rule enforced, Graceful Yield.
 * Kept behind the flag, not deleted.
 */

import { McpClient, ToolCallResult } from "./mcpClient.js";

export type RoutePath = "fast" | "agentic";

export interface PendingElicitation {
  tool: string;
  args: Record<string, unknown>;
  elicitation: unknown;
  createdAt: number;
}

/** Host-resolved tie pick (JUDGMENT Part 3): the brain picks between two
 * named survivors on the card; the server re-verifies before locking. */
export interface PinArg {
  source: string;
  track_id: string;
  [key: string]: unknown;
}

/** Symmetric veto (SYNTHESIS): "not this one" — subtraction-only. */
export interface RejectArg {
  source: string;
  track_id: string;
  [key: string]: unknown;
}

/** Catalog domain a turn runs against (Lane F plumbing). One engine,
 * three catalogs; "music" is the default and the fallback. */
export type Domain = "music" | "commerce" | "grocery";

export const DOMAINS: readonly Domain[] = ["music", "commerce", "grocery"];

/** Resolve a client-sent domain. Absent/blank is the plain default —
 * NOT a fallback. A present-but-unknown value falls back to "music"
 * and says so (fellBack), so the /turn metadata reports it honestly. */
export function resolveDomain(raw: unknown): {
  domain: Domain;
  requested: string | null;
  fellBack: boolean;
} {
  if (typeof raw !== "string" || !raw.trim()) {
    return { domain: "music", requested: null, fellBack: false };
  }
  const requested = raw.trim();
  const norm = requested.toLowerCase();
  if ((DOMAINS as readonly string[]).includes(norm)) {
    return { domain: norm as Domain, requested, fellBack: false };
  }
  return { domain: "music", requested, fellBack: true };
}

export interface TurnRequest {
  utterance: string;
  locale_hint?: string;
  session_id?: string;
  pending_id?: string;
  input_responses?: Record<string, unknown>;
  chaos_fault?: string;
  constraints?: Constraints;
  /** Catalog domain for this turn ("music" | "commerce" | "grocery",
   * default "music"; unknown values fall back — see resolveDomain).
   * Forwarded into the intent_lock arguments on play/order turns. */
  domain?: string;
  /** Host device clock "HH:MM" (W2-4) — forwarded to intent_lock as
   * request _meta. The server never reads its own clock for rules. */
  host_time?: string;
  /** Follow-up tie pick / veto from the stage — forwarded untouched. */
  pin?: PinArg;
  reject?: RejectArg;
  /** Escape hatch to the d0062ec cascade (non-demo use only). */
  legacy?: boolean;
}

export interface TurnResponse {
  path: RoutePath;
  brain: string;
  response_text: string;
  chunks: string[];
  barge_state?: "SOFT_DUCK" | "BANTER_SHIELD" | "HARD_BARGE" | null;
  needs_input?: boolean;
  pending_id?: string;
  elicitation?: unknown;
  /** The intent_lock structuredContent — THE turn payload (Trust Card). */
  payload?: Record<string, unknown> | null;
  /** Domain the lock call ran under (Lane F). domain_fell_back is set
   * only when the client asked for an unknown domain and "music"
   * served instead; domain_requested echoes what the client sent. */
  domain?: Domain;
  domain_requested?: string;
  domain_fell_back?: boolean;
  /** The extraction that produced the play call (demo path). */
  extraction?: Extraction;
  extraction_source?: "gemini" | "local-floor";
  mcp: {
    tool: string | null;
    frames: unknown[];
    streamed: boolean;
    session_id: string | null;
  };
  timings: {
    routing_ms: number;
    mcp_ms: number;
    total_ms: number;
    edge_fastpath_ms: number;
  };
  error?: string;
}

const WAKE = /^(hey\s+)?alexa[,\s]*/i;
const PLAY = /^(play|put on|chalao|baja|sunao|ponme?|toca)\b/i;
const STOP = /\b(stop|pause|ruk\s?ja|chup|quiet|shut\s?up)\b/i;
const RESUME = /\b(resume|continue|phir se|aage)\b/i;
const CHALLENGE = /\b(why did you|did i ask|maine (nahi|kab) kaha|tumne kyun)\b/i;
const BargeIn =
  /\b(stop yapping|be quiet|just tell me|chhota jawab|short (version|answer)|no+ (stop|wait)|arrey bas)\b/i;
const SYNC = /\b(sync|everywhere|all rooms|saare rooms?)\b/i;

/** Layer C (doc 11): semantic constraints a host may extract from a turn.
 * The server honors every field or reports it in-band as ignored. */
export interface Constraints {
  desired_version?: "any" | "studio" | "live" | "unplugged" | "acoustic" | "remix" | "remaster";
  artist_hint?: string;
  era_hint?: string;
  mood_hint?: string;
}

/** Doc-12 extraction: the host brain's parse of one utterance. Advisory
 * only — the server verifies every field against real catalogs. */
export interface ExtractionRule {
  after_time: string; // "HH:MM", 24h
  version: string;
  artist?: string;
  dsp?: { preset: string };
}

export interface Extraction {
  extracted_title_hint: string;
  include_tags: string[];
  exclude_tags: string[];
  rule: ExtractionRule | null;
  candidate_hints: string[];
}

/** Layer A (doc 11) + Wave 2: a Brain decision re-dispatched through
 * this router. "play_lock" carries a finished extraction (the demo
 * path); the rest are the legacy forced intents. */
export interface ForcedIntent {
  intent: "play" | "challenge" | "sync" | "play_lock";
  constraints?: Constraints;
  extraction?: Extraction;
  extraction_source?: "gemini" | "local-floor";
}

/** Reflex patterns the Brain must never delay (exported for its guard). */
export const REFLEX = { STOP, BARGE: BargeIn, RESUME };

const PLAY_ANYWHERE =
  /\b(give me|switch to|change (it|that) to|play karo|lagao|baja do)\b/i;

/** True when the wake-stripped utterance is a play request — either it
 * opens with a play verb, or it is a mid-conversation swap/follow-up
 * ("actually, give me the lofi version instead"). */
export function isPlayUtterance(clean: string): boolean {
  const c = clean.trim().toLowerCase();
  return PLAY.test(c) || PLAY_ANYWHERE.test(c);
}

const ORDER = /^(order|buy|purchase|reorder|get me|add)\b/i;

/** True for an order/request utterance ("order a 2m Thunderbolt
 * cable"). Consulted ONLY when the turn's domain is not music, so
 * commerce/grocery asks reach intent_lock as lock turns; music
 * routing never sees this pattern and is unchanged. */
export function isOrderUtterance(clean: string): boolean {
  const c = clean.trim();
  return ORDER.test(c) || PLAY_ANYWHERE.test(c.toLowerCase());
}

const _VERSION_WORDS: Array<[RegExp, NonNullable<Constraints["desired_version"]>]> = [
  [/\bunplugged\b/i, "unplugged"],
  [/\bacoustic\b/i, "acoustic"],
  [/\b(live|concert|stadium)\b/i, "live"],
  [/\b(remix|remixed|dj|mashup)\b/i, "remix"],
  [/\bremaster(?:ed)?\b/i, "remaster"],
  [/\b(studio|album version)\b/i, "studio"],
];

/** The local floor's constraint extractor: keyword-grade, honest about it.
 * The Brain's LLM extractor supersedes it whenever a provider is live. */
export function localExtractConstraints(text: string): Constraints {
  const c: Constraints = {};
  for (const [re, v] of _VERSION_WORDS) {
    if (re.test(text)) { c.desired_version = v; break; }
  }
  const era = text.match(/\b((?:19|20)\d{2}s|'\d{2}s)\b/i);
  if (era) c.era_hint = era[1];
  return c;
}

function mergeConstraints(
  clean: string,
  fromReq?: Constraints,
  fromForced?: Constraints
): Constraints {
  return { ...localExtractConstraints(clean), ...(fromReq ?? {}), ...(fromForced ?? {}) };
}

/** Strip a leading wake word ("Alexa, …") — exported for the Brain,
 * which classifies the same cleaned text the router routes on. */
export function stripWake(u: string): string {
  return u.replace(WAKE, "").trim();
}

/** True for ledger-style challenges ("why did you…?") — checked before
 * play detection so "why did you give me the remix" never locks. */
export function isChallengeUtterance(clean: string): boolean {
  return CHALLENGE.test(clean);
}

/** Split into <=12s spoken chunks (~30 words) with listening gaps (D-03). */
export function chunkify(text: string, maxWords = 28): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(" "));
  }
  return chunks.length ? chunks : [text];
}

// ---------------------------------------------------------------------------
// Doc-12 extraction: sanitize (any source) + the deterministic floor
// ---------------------------------------------------------------------------

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function sanitizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t !== "string") continue;
    const v = t.trim().toLowerCase().slice(0, 24);
    if (v && !out.includes(v)) out.push(v);
    if (out.length >= 8) break;
  }
  return out;
}

function sanitizeRule(raw: unknown): ExtractionRule | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const after = typeof r.after_time === "string" ? r.after_time.trim() : "";
  const version = typeof r.version === "string" ? r.version.trim().slice(0, 40) : "";
  if (!TIME_RE.test(after) || !version) return null;
  const rule: ExtractionRule = { after_time: after, version };
  if (typeof r.artist === "string" && r.artist.trim()) {
    rule.artist = r.artist.trim().slice(0, 80);
  }
  const dsp = r.dsp as Record<string, unknown> | undefined;
  if (dsp && typeof dsp === "object" && typeof dsp.preset === "string" && dsp.preset.trim()) {
    rule.dsp = { preset: dsp.preset.trim().slice(0, 24) };
  }
  return rule;
}

/** RULE GROUNDING (Council C2, F7 — the belt; the MCP server's own
 * guard is the braces and refuses regardless): a rule may ride to
 * the tool only when the user's own utterance states its time AND
 * its version word. A hallucinated {after_time: "00:00",
 * version: "remix"} is well-formed — shape is not evidence. */
function ruleGroundedInUtterance(rule: ExtractionRule, utterance: string): boolean {
  const text = (utterance ?? "").toLowerCase();
  const [hhS, mmS] = rule.after_time.split(":");
  const hh = Number(hhS);
  const mm = Number(mmS);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return false;
  const target = hh * 60 + mm;
  let timeOk = false;
  for (const m of text.matchAll(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g)) {
    if (Number(m[1]) * 60 + Number(m[2]) === target) timeOk = true;
  }
  if (!timeOk) {
    for (const m of text.matchAll(/\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/g)) {
      let h = Number(m[1]) % 12;
      if (m[3] === "pm") h += 12;
      if (h * 60 + Number(m[2] ?? 0) === target) timeOk = true;
    }
  }
  if (!timeOk && mm === 0) {
    for (const m of text.matchAll(/\bafter\s+(\d{1,2})\b/g)) {
      if (Number(m[1]) % 24 === hh) timeOk = true;
    }
  }
  if (!timeOk) return false;
  const version = rule.version.toLowerCase().trim();
  const words = new Set(text.replace(/lo[\s-]fi/g, "lofi").match(/[a-z']+/g) ?? []);
  const syns = new Set<string>([
    version,
    version.replace(/-/g, ""),
    version.replace(/\s/g, ""),
  ]);
  for (const t of version.split(/[^a-z]+/)) if (t) syns.add(t);
  if (version.includes("lofi") || version.includes("lo-fi")) syns.add("lofi");
  if (version.includes("remix")) syns.add("remix");
  if (version.includes("original")) syns.add("original");
  if (version.includes("acoustic")) syns.add("acoustic");
  if (version.includes("live")) syns.add("live");
  if (version.includes("remaster")) {
    syns.add("remaster");
    syns.add("remastered");
  }
  for (const s of syns) if (s && words.has(s)) return true;
  return false;
}

/** Validate ANY extraction (Gemini helper output included) down to the
 * exact Doc-12 shape before it may reach the tool. */
export function sanitizeExtraction(raw: unknown): Extraction {
  const empty: Extraction = {
    extracted_title_hint: "",
    include_tags: [],
    exclude_tags: [],
    rule: null,
    candidate_hints: [],
  };
  if (!raw || typeof raw !== "object") return empty;
  const r = raw as Record<string, unknown>;
  const hints: string[] = [];
  if (Array.isArray(r.candidate_hints)) {
    for (const h of r.candidate_hints) {
      if (typeof h === "string" && h.trim()) hints.push(h.trim().slice(0, 120));
      if (hints.length >= 4) break;
    }
  }
  return {
    extracted_title_hint:
      typeof r.extracted_title_hint === "string"
        ? r.extracted_title_hint.trim().slice(0, 120)
        : "",
    include_tags: sanitizeTags(r.include_tags),
    exclude_tags: sanitizeTags(r.exclude_tags),
    rule: sanitizeRule(r.rule),
    candidate_hints: hints,
  };
}

/** Minimal shape check for stage-supplied pin/reject; the object itself
 * is forwarded untouched (extras like pin_reason ride along). */
export function sanitizePinReject(raw: unknown): PinArg | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const tid = r.track_id;
  if (typeof r.source !== "string" || !r.source.trim()) return undefined;
  if (typeof tid !== "string" && typeof tid !== "number") return undefined;
  return { ...r, source: r.source.trim(), track_id: String(tid) } as PinArg;
}

// The floor's vocabulary mirrors the server's TAG_TO_LABELS plus style
// words the server passes through harmlessly (e.g. "slow").
const _TAG_WORDS: Record<string, string> = {
  remix: "remix", live: "live", karaoke: "karaoke", acoustic: "acoustic",
  unplugged: "unplugged", lofi: "lofi", "lo-fi": "lofi",
  remaster: "remaster", remastered: "remaster", original: "original",
  film: "film", movie: "film", studio: "studio", slow: "slow",
  compilation: "compilation",
};
const _BANNABLE = new Set(["remix", "live", "karaoke", "acoustic", "unplugged"]);
const _NEGATIONS = new Set(["nahi", "nahin", "mat", "not", "no", "never", "dont", "don't"]);
const _HINT_FILLERS = new Set([
  "that", "the", "a", "an", "song", "songs", "gaana", "wala", "waala",
  "waali", "woh", "wo", "please", "give", "me", "play", "playing",
  "version", "versions", "actually", "instead", "just", "some", "this",
  "it", "chalao", "bajaao", "baja", "sunao", "put", "on", "means",
  "after", "and", "with", "for", "from", "purana",
]);

function _tokens(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)?/g) ?? [];
}

/** The deterministic floor: frame-peel-grade extraction with no model.
 * Emits hint + tags + rule from the utterance's own words; candidate
 * hints are ALWAYS empty here — the floor never invents a title. */
export function localExtract(clean: string): Extraction {
  const lower = clean.toLowerCase();
  const toks = _tokens(clean);

  // Negation vetoes: a bannable version word with a negation token
  // within 3 tokens on either side ("remix nahi", "not the remix").
  const vetoed = new Set<string>();
  toks.forEach((t, i) => {
    if (!_BANNABLE.has(t)) return;
    const window = toks.slice(Math.max(0, i - 3), i + 4);
    if (window.some((w) => _NEGATIONS.has(w))) vetoed.add(t);
  });

  const include: string[] = [];
  const exclude: string[] = [];
  const push = (arr: string[], v: string) => {
    if (!arr.includes(v) && arr.length < 8) arr.push(v);
  };
  for (const t of toks) {
    if (t === "purana") { push(include, "original"); push(include, "film"); continue; }
    const tag = _TAG_WORDS[t];
    if (!tag) continue;
    if (vetoed.has(t)) push(exclude, tag);
    else push(include, tag);
  }
  for (const t of vetoed) push(exclude, _TAG_WORDS[t] ?? t);

  // Standing rule: "after 10 pm … means (the) lofi (version)".
  let rule: ExtractionRule | null = null;
  const after = lower.match(/\bafter\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (after) {
    let hh = parseInt(after[1], 10);
    const mm = after[2] ? parseInt(after[2], 10) : 0;
    if (after[3] === "pm" && hh < 12) hh += 12;
    if (after[3] === "am" && hh === 12) hh = 0;
    const meansAt = lower.indexOf("means");
    const vtext = meansAt >= 0 ? lower.slice(meansAt + 5) : lower;
    const vwords = _tokens(vtext).filter((t) =>
      ["lofi", "lo-fi", "acoustic", "original", "remix", "live",
       "unplugged", "remaster"].includes(t)
    );
    if (vwords.length) {
      rule = {
        after_time: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
        version: [...new Set(vwords)].slice(0, 2).join(" "),
      };
    }
  }

  // Hint: the residue — original-case words that are neither fillers,
  // tag words, negations, nor the rule's time expression.
  const noTime = clean.replace(/\bafter\s+\d{1,2}(?::\d{2})?\s*(am|pm)?\b/i, " ");
  const words = noTime.match(/[A-Za-z0-9]+(?:-[A-Za-z0-9]+)?/g) ?? [];
  const kept: string[] = [];
  for (const w of words) {
    const lw = w.toLowerCase();
    if (_HINT_FILLERS.has(lw) || _TAG_WORDS[lw] || _NEGATIONS.has(lw)) continue;
    kept.push(w);
  }
  return {
    extracted_title_hint: kept.join(" ").slice(0, 120),
    include_tags: include,
    exclude_tags: exclude,
    rule,
    candidate_hints: [],
  };
}

// ---------------------------------------------------------------------------

export class IntentRouter {
  private pending = new Map<string, PendingElicitation>();
  private lastYield = new Map<string, { at: number; text: string }>();
  private lastLock = new Map<string, Record<string, unknown>>();
  private lastSpokenText = "";

  constructor(private mcp: McpClient) {}

  private isElicitation(result: unknown): result is { elicitation: unknown } {
    if (!result || typeof result !== "object") return false;
    const r = result as Record<string, unknown>;
    if (r.input_required === true) return true;
    const sc = r.structuredContent as Record<string, unknown> | undefined;
    return !!sc && sc.input_required === true;
  }

  private getElicitation(result: unknown): unknown {
    const r = result as Record<string, unknown>;
    if (r.input_required === true) return r.elicitation;
    const sc = r.structuredContent as Record<string, unknown> | undefined;
    return sc?.elicitation;
  }

  private base(t0: number, path: RoutePath): TurnResponse {
    return {
      path,
      brain: "local-router",
      response_text: "",
      chunks: [],
      barge_state: null,
      payload: null,
      mcp: { tool: null, frames: [], streamed: false, session_id: null },
      timings: { routing_ms: 0, mcp_ms: 0, total_ms: 0, edge_fastpath_ms: 0 },
    };
  }

  private finish(resp: TurnResponse, t0: number, routingMs: number, mcpMs: number): TurnResponse {
    resp.timings.routing_ms = routingMs;
    resp.timings.mcp_ms = mcpMs;
    resp.timings.total_ms = Date.now() - t0;
    // edge_fastpath_ms: the number the UI shows as "the speedup" — time from
    // turn receipt to orchestrated answer.
    resp.timings.edge_fastpath_ms = resp.timings.total_ms;
    resp.chunks = chunkify(resp.response_text);
    if (resp.response_text) this.lastSpokenText = resp.response_text;
    return resp;
  }

  private async tool(
    name: string,
    args: Record<string, unknown>,
    chaosFault?: string,
    meta?: Record<string, unknown>
  ): Promise<ToolCallResult> {
    return this.mcp.callTool(name, args, { chaosFault, meta });
  }

  private isLegacy(req: TurnRequest): boolean {
    return req.legacy === true || process.env.ORCHESTRATOR_LEGACY === "1";
  }

  async turn(req: TurnRequest, forced?: ForcedIntent): Promise<TurnResponse> {
    if (this.isLegacy(req)) return this.turnLegacy(req, forced);
    return this.turnDemo(req, forced);
  }

  // =======================================================================
  // DEMO PATH — Intent Lock only (Wave 2)
  // =======================================================================

  private async turnDemo(req: TurnRequest, forced?: ForcedIntent): Promise<TurnResponse> {
    const t0 = Date.now();
    const r0 = Date.now();
    const utterance = (req.utterance ?? "").trim();
    const clean = stripWake(utterance);
    const lower = clean.toLowerCase();
    const chaos = req.chaos_fault;

    // Brain-forced lock turn: extraction already done above us.
    if (forced?.intent === "play_lock" && forced.extraction) {
      return this.playLockBranch(req, chaos, t0, r0, forced.extraction,
        forced.extraction_source ?? "local-floor");
    }
    // A legacy forced intent arriving on the demo path is re-homed:
    // challenge/sync answer locally; play falls to the floor + lock.
    if (forced?.intent === "challenge") return this.demoChallenge(req, t0, r0);
    if (forced?.intent === "sync") return this.demoSync(req, t0, r0);

    // Elicitation follow-up (only legacy turns ever register one, but a
    // session may straddle the flag — honor it the same way).
    if (req.pending_id && req.input_responses) {
      return this.pendingFollowUp(req, chaos, t0, r0);
    }

    // CHALLENGE before STOP (L-07: "why did you pause…" is a challenge).
    if (CHALLENGE.test(lower)) {
      return this.demoChallenge(req, t0, r0);
    }

    // PLAY — including tie follow-ups: a pin/reject in the body IS a
    // play turn even when the words are just "the second one". On
    // commerce/grocery turns an order utterance is a lock turn too.
    const pin = sanitizePinReject(req.pin);
    const reject = sanitizePinReject(req.reject);
    const dom = resolveDomain(req.domain);
    if (pin || reject || isPlayUtterance(clean) ||
        (dom.domain !== "music" && isOrderUtterance(clean))) {
      const extraction = localExtract(clean);
      return this.playLockBranch(req, chaos, t0, r0, extraction, "local-floor");
    }

    // STOP — local only. No tool owns the demo's stop.
    if (STOP.test(lower) && !BargeIn.test(lower)) {
      const resp = this.base(t0, "fast");
      resp.barge_state = "HARD_BARGE";
      this.lastYield.delete(req.session_id ?? "default");
      resp.response_text = "Stopped. What next?";
      return this.finish(resp, t0, Date.now() - r0, 0);
    }

    // BARGE-IN — local compression of what we last said; no tool call.
    if (BargeIn.test(lower)) {
      const resp = this.base(t0, "agentic");
      resp.barge_state = "SOFT_DUCK";
      const last = this.lastSpokenText;
      this.lastYield.set(req.session_id ?? "default", { at: Date.now(), text: last });
      const first = last.split(/(?<=[.!?])\s+/)[0] ?? "";
      resp.response_text = first
        ? `Got it — short version: ${first} Want me to continue?`
        : "Got it — keeping it short. Want me to continue?";
      return this.finish(resp, t0, Date.now() - r0, 0);
    }

    if (RESUME.test(lower)) {
      return this.resumeBranch(req, t0, r0);
    }

    // SYNC — parked feature; answered honestly, no tool call (F-09).
    if (SYNC.test(lower)) {
      return this.demoSync(req, t0, r0);
    }

    // Local templates (honest, labeled).
    const resp = this.base(t0, "agentic");
    if (/\b(hi|hello|namaste|hey)\b/i.test(lower) && lower.length < 20) {
      resp.response_text =
        "Hey! Ask me to play something — even mangle the title. Intent Lock will ground it against the real catalogs, or honestly refuse.";
    } else if (/\b(thank|shukriya|dhanyavad)\b/i.test(lower)) {
      resp.response_text = "Anytime. I'm here, listening.";
    } else {
      resp.response_text =
        "I'm the host brain for Intent Lock — I parse your words, the server verifies them. Try 'play that Sayaraa waala slow film song, not the remix'.";
    }
    return this.finish(resp, t0, Date.now() - r0, 0);
  }

  /** PLAY branch, demo path: one tool — intent_lock. The extraction is
   * advisory; pin/reject pass through untouched; host_time rides as
   * request _meta. The tool's structuredContent IS the turn payload. */
  private async playLockBranch(
    req: TurnRequest,
    chaos: string | undefined,
    t0: number,
    r0: number,
    extraction: Extraction,
    source: "gemini" | "local-floor"
  ): Promise<TurnResponse> {
    const resp = this.base(t0, "fast");
    resp.extraction = extraction;
    resp.extraction_source = source;

    const args: Record<string, unknown> = {
      utterance: (req.utterance ?? "").trim(),
      include_tags: extraction.include_tags,
      exclude_tags: extraction.exclude_tags,
    };
    if (extraction.extracted_title_hint) {
      args.extracted_title_hint = extraction.extracted_title_hint;
    }
    // F7: forward a rule only when the user's own words ground it —
    // an ungrounded extraction never reaches the tool from here.
    if (extraction.rule && ruleGroundedInUtterance(extraction.rule, req.utterance ?? "")) {
      args.rule = extraction.rule;
    }
    if (extraction.candidate_hints.length) {
      args.candidate_hints = extraction.candidate_hints;
    }
    const pin = sanitizePinReject(req.pin);
    if (pin) args.pin = pin;
    const reject = sanitizePinReject(req.reject);
    if (reject) args.reject = reject;

    // Domain plumbing (Lane F): the resolved domain rides into the
    // tool arguments on every lock turn; the response metadata names
    // the domain actually served and flags an unknown-domain fallback.
    const dom = resolveDomain(req.domain);
    args.domain = dom.domain;
    resp.domain = dom.domain;
    if (dom.requested !== null) resp.domain_requested = dom.requested;
    if (dom.fellBack) resp.domain_fell_back = true;

    const meta: Record<string, unknown> | undefined =
      req.host_time && TIME_RE.test(req.host_time.trim())
        ? { host_time: req.host_time.trim() }
        : undefined;

    const call = await this.tool("intent_lock", args, chaos, meta);
    resp.mcp = {
      tool: "intent_lock",
      frames: call.frames,
      streamed: call.streamed,
      session_id: call.sessionId || null,
    };
    if (!call.ok) {
      resp.error = call.error;
      resp.response_text = "I couldn't reach the lock server — say it once more?";
      return this.finish(resp, t0, Date.now() - r0, call.mcpMs);
    }
    const r = (call.result ?? {}) as Record<string, unknown>;
    const sc = (r.structuredContent ?? {}) as Record<string, unknown>;
    // PASSTHROUGH CONTRACT (Lane F audit): the payload is the server's
    // structuredContent WHOLE — assigned, never rebuilt through an
    // allowlist — so fields the server adds later (operators[], and
    // anything after) reach the client untouched.
    resp.payload = sc;
    this.lastLock.set(req.session_id ?? "default", sc);

    // The server speaks for itself (locked / tie / honest refusal) —
    // relay its sentence verbatim (L-09); fall back by status only when
    // the result carried no text at all.
    const contentText = (
      Array.isArray(r.content) ? (r.content[0] as Record<string, unknown> | undefined) : undefined
    )?.text as string | undefined;
    if (contentText) {
      resp.response_text = contentText;
    } else if (sc.status === "tie_choice") {
      resp.response_text = "Two versions tie too closely to call — both are on the Trust Card. Say which one, or tap it.";
    } else if (sc.status === "locked") {
      const locked = (sc.locked ?? {}) as Record<string, unknown>;
      resp.response_text = `Locked in — ${String(locked.title ?? "your song")}${locked.artist ? ` by ${String(locked.artist)}` : ""}.`;
    } else {
      resp.response_text = "No confident match in any real catalog — I won't guess. Name a title or a singer?";
    }
    return this.finish(resp, t0, Date.now() - r0, call.mcpMs);
  }

  /** CHALLENGE, demo path: answered from the last intent_lock payload
   * this session already holds — the Trust Card data, never a ledger
   * call. No payload yet → point at the card. */
  private demoChallenge(req: TurnRequest, t0: number, r0: number): TurnResponse {
    const resp = this.base(t0, "agentic");
    const sc = this.lastLock.get(req.session_id ?? "default");
    if (!sc) {
      resp.response_text =
        "Nothing is locked yet in this session — ask me to play something, and the Trust Card will show every decision I made.";
      return this.finish(resp, t0, Date.now() - r0, 0);
    }
    const locked = (sc.locked ?? null) as Record<string, unknown> | null;
    const eliminated = Array.isArray(sc.eliminated)
      ? (sc.eliminated as Array<Record<string, unknown>>)
      : [];
    const parts: string[] = [];
    if (sc.heard) parts.push(`You said: "${String(sc.heard)}".`);
    if (sc.status === "locked" && locked) {
      parts.push(
        `I locked "${String(locked.title ?? "")}"${locked.artist ? ` by ${String(locked.artist)}` : ""}` +
        `${locked.version ? ` — the ${String(locked.version)} version` : ""}.`
      );
    } else if (sc.status === "tie_choice") {
      parts.push("Two versions tied, so I locked nothing and showed both on the card.");
    } else {
      parts.push("Nothing in the catalogs matched confidently, so I refused rather than guess.");
    }
    if (eliminated.length) {
      const reasons = eliminated
        .slice(0, 2)
        .map((e) => String(e.reason ?? e.title ?? ""))
        .filter(Boolean);
      parts.push(
        `I rejected ${eliminated.length} other${eliminated.length === 1 ? "" : "s"}${reasons.length ? `: ${reasons.join("; ")}` : ""}.`
      );
    }
    if (sc.rule_active) parts.push(String(sc.rule_active));
    parts.push("It's all on the Trust Card.");
    resp.response_text = parts.join(" ");
    return this.finish(resp, t0, Date.now() - r0, 0);
  }

  /** SYNC, demo path: F-09 is parked — say so, call nothing. */
  private demoSync(req: TurnRequest, t0: number, r0: number): TurnResponse {
    void req;
    const resp = this.base(t0, "fast");
    resp.response_text =
      "Multi-room sync is parked in this build — Intent Lock is the path I'm running. Ask me to play something and I'll lock the exact version.";
    return this.finish(resp, t0, Date.now() - r0, 0);
  }

  /** RESUME — shared by both paths; it was already local-only (it
   * delivers the interrupted text itself, never merely claims to). */
  private resumeBranch(req: TurnRequest, t0: number, r0: number): TurnResponse {
    const resp = this.base(t0, "fast");
    const key = req.session_id ?? "default";
    const y = this.lastYield.get(key);
    if (y && Date.now() - y.at < 10 * 60 * 1000 && y.text) {
      this.lastYield.delete(key);
      resp.response_text = y.text;
      const out = this.finish(resp, t0, Date.now() - r0, 0);
      this.lastSpokenText = y.text;
      return out;
    }
    resp.response_text =
      "Nothing was interrupted, so there's nothing to resume — ask me to play something.";
    const saved = this.lastSpokenText;
    const out = this.finish(resp, t0, Date.now() - r0, 0);
    this.lastSpokenText = saved;
    return out;
  }

  /** Elicitation follow-up — shared plumbing (only legacy resolve turns
   * ever register a pending pick, but the round-trip is identical). */
  private async pendingFollowUp(
    req: TurnRequest,
    chaos: string | undefined,
    t0: number,
    r0: number
  ): Promise<TurnResponse> {
    const p = this.pending.get(req.pending_id!);
    const resp = this.base(t0, "fast");
    if (!p) {
      resp.error = "pending elicitation expired — ask again";
      resp.response_text = "I lost track of which songs those were — say the title again?";
      return this.finish(resp, t0, Date.now() - r0, 0);
    }
    this.pending.delete(req.pending_id!);
    const call = await this.tool(p.tool, { ...p.args, input_responses: req.input_responses }, chaos);
    resp.mcp = {
      tool: p.tool,
      frames: call.frames,
      streamed: call.streamed,
      session_id: call.sessionId || null,
    };
    if (!call.ok) {
      resp.error = call.error;
      resp.response_text = "Hmm, that pick didn't go through — try again?";
      return this.finish(resp, t0, Date.now() - r0, call.mcpMs);
    }
    resp.response_text = `Playing your pick.`;
    return this.finish(resp, t0, Date.now() - r0, call.mcpMs);
  }

  // =======================================================================
  // LEGACY PATH — the d0062ec cascade, verbatim behavior (flag-gated)
  // =======================================================================

  private async turnLegacy(req: TurnRequest, forced?: ForcedIntent): Promise<TurnResponse> {
    const t0 = Date.now();
    const r0 = Date.now();
    const utterance = (req.utterance ?? "").trim();
    const clean = stripWake(utterance);
    const lower = clean.toLowerCase();
    const chaos = req.chaos_fault;

    // Layer A (doc 11): a Brain above this router may force an intent with
    // extracted constraints. The branches below remain the ONLY code that
    // executes tools — the Brain proposes, this router disposes.
    if (forced?.intent === "play") {
      return this.playBranch(req, clean, chaos, t0, r0,
        mergeConstraints(clean, req.constraints, forced.constraints));
    }
    if (forced?.intent === "challenge") {
      return this.challengeBranch(req, clean, chaos, t0, r0);
    }
    if (forced?.intent === "sync") {
      return this.syncBranch(req, clean, chaos, t0, r0);
    }

    // --- Elicitation follow-up: "the second one!" ---------------------------
    if (req.pending_id && req.input_responses) {
      return this.pendingFollowUp(req, chaos, t0, r0);
    }

    // --- FAST PATH: play ----------------------------------------------------
    if (PLAY.test(lower)) {
      return this.playBranch(req, clean, chaos, t0, r0,
        mergeConstraints(clean, req.constraints, undefined));
    }

    // --- AGENTIC PATH: Truth-Ledger challenge ("why did you…?") -------------
    // NOTE: checked BEFORE the stop patterns — "why did you pause my music"
    // contains "pause" but it is a challenge, not a stop command.
    // The ledger rule is ENFORCED here: we never claim USER_VOICE unless the
    // tool verdict says the ledger confirms it.
    if (CHALLENGE.test(lower)) {
      return this.challengeBranch(req, clean, chaos, t0, r0);
    }

    // --- FAST PATH: hard stop ("Alexa stop") ---------------------------------
    // (after CHALLENGE — see note above)
    if (STOP.test(lower) && !BargeIn.test(lower)) {
      const resp = this.base(t0, "fast");
      resp.barge_state = "HARD_BARGE";
      this.lastYield.delete(req.session_id ?? "default");
      const call = await this.tool(
        "fastpath_interrupt",
        { barge_in_command: "stop", interrupted_at_word_index: -1, mode: "HARD_BARGE" },
        chaos
      );
      resp.mcp = {
        tool: "fastpath_interrupt",
        frames: call.frames,
        streamed: call.streamed,
        session_id: call.sessionId || null,
      };
      resp.response_text = "Stopped. What next?";
      return this.finish(resp, t0, Date.now() - r0, call.mcpMs);
    }

    // --- Graceful Yield: soft barge-in ("stop yapping…") ---------------------
    if (BargeIn.test(lower)) {
      const resp = this.base(t0, "agentic");
      resp.barge_state = "SOFT_DUCK";
      const call = await this.tool(
        "fastpath_interrupt",
        { barge_in_command: clean, interrupted_at_word_index: -1, mode: "SOFT_DUCK", active_utterance: this.lastSpokenText },
        chaos
      );
      resp.mcp = {
        tool: "fastpath_interrupt",
        frames: call.frames,
        streamed: call.streamed,
        session_id: call.sessionId || null,
      };
      const sc = (call.result as Record<string, unknown> | undefined)
        ?.structuredContent as Record<string, unknown> | undefined;
      const compressed = sc?.short_answer as string | undefined;
      // Capture the interrupted text NOW: finish() below will overwrite
      // lastSpokenText with this barge response itself.
      this.lastYield.set(req.session_id ?? "default", {
        at: Date.now(),
        text: this.lastSpokenText,
      });
      resp.response_text = `Got it — ${compressed ?? "short version coming up."} Want me to continue?`;
      return this.finish(resp, t0, Date.now() - r0, call.mcpMs);
    }

    if (RESUME.test(lower)) {
      return this.resumeBranch(req, t0, r0);
    }

    // --- FAST PATH: room sync -----------------------------------------------
    if (SYNC.test(lower)) {
      return this.syncBranch(req, clean, chaos, t0, r0);
    }

    // --- AGENTIC PATH: local templates (honest, labeled) ---------------------
    const resp = this.base(t0, "agentic");
    const routingMs = Date.now() - r0;
    if (/\b(hi|hello|namaste|hey)\b/i.test(lower) && lower.length < 20) {
      resp.response_text =
        "Hey! Ask me to play something — even mangle the title, I'll figure it out. Or interrupt me mid-sentence and watch me duck and listen.";
    } else if (/\b(thank|shukriya|dhanyavad)\b/i.test(lower)) {
      resp.response_text = "Anytime. I'm here, listening.";
    } else {
      resp.response_text =
        "I'm the local router — I handle music, interruptions, and 'why did you do that' challenges. Try 'play Lolly Pop La Gelu' or ask me why I paused something.";
    }
    return this.finish(resp, t0, routingMs, 0);
  }

  /** PLAY branch (legacy) — the d0062ec resolve path, kept behind the
   * legacy flag; unreachable from demo play turns. */
  private async playBranch(
    req: TurnRequest,
    clean: string,
    chaos: string | undefined,
    t0: number,
    r0: number,
    constraints: Constraints
  ): Promise<TurnResponse> {
    const resp = this.base(t0, "fast");
    const toolArgs: Record<string, unknown> = {
      raw_utterance: clean,
      locale_hint: req.locale_hint ?? "en-IN",
      preferred_provider: "spotify",
      allow_live_version:
        constraints.desired_version === "live" ||
        constraints.desired_version === "unplugged" ||
        constraints.desired_version === "acoustic",
    };
    if (Object.keys(constraints).length) toolArgs.constraints = constraints;
    const call = await this.tool("resolve_and_play", toolArgs, chaos);
    resp.mcp = {
      tool: "resolve_and_play",
      frames: call.frames,
      streamed: call.streamed,
      session_id: call.sessionId || null,
    };
    if (!call.ok) {
      resp.error = call.error;
      resp.response_text = "I couldn't reach the music brain — say it once more?";
      return this.finish(resp, t0, Date.now() - r0, call.mcpMs);
    }
    if (this.isElicitation(call.result)) {
      const pid = `elig_${Date.now().toString(36)}`;
      const elicitation = this.getElicitation(call.result) as {
        message?: string;
        candidates?: Array<{ index: number; title: string; artist: string }>;
      } | undefined;
      this.pending.set(pid, {
        tool: "resolve_and_play",
        args: toolArgs,
        elicitation,
        createdAt: Date.now(),
      });
      resp.needs_input = true;
      resp.pending_id = pid;
      resp.elicitation = elicitation;
      const cands = elicitation?.candidates ?? [];
      const listing = cands
        .map((c) => `${c.index}: "${c.title}" by ${c.artist}`)
        .join("; ");
      resp.response_text =
        (elicitation?.message ??
          "A few famous songs share that name — hear a taste of each and pick one.") +
        (listing ? ` Say the number — ${listing}.` : "");
      return this.finish(resp, t0, Date.now() - r0, call.mcpMs);
    }
    const r = (call.result ?? {}) as Record<string, unknown>;
    const sc = (r.structuredContent ?? {}) as Record<string, unknown>;
    const track = (sc.track ?? {}) as Record<string, unknown>;
    const contentText = (
      Array.isArray(r.content) ? (r.content[0] as Record<string, unknown> | undefined) : undefined
    )?.text as string | undefined;
    if (track.title) {
      resp.response_text = `On it — ${track.title as string}${
        track.artist ? ` — ${track.artist as string}` : ""
      }.`;
    } else {
      // Server spoke for itself (e.g. "No confident match…") — relay it.
      resp.response_text = contentText ?? "Done.";
    }
    return this.finish(resp, t0, Date.now() - r0, call.mcpMs);
  }

  /** CHALLENGE branch (legacy) — the Truth-Ledger tool path, verbatim. */
  private async challengeBranch(
    req: TurnRequest,
    clean: string,
    chaos: string | undefined,
    t0: number,
    r0: number
  ): Promise<TurnResponse> {
    const resp = this.base(t0, "agentic");
    const call = await this.tool(
      "verify_ledger_or_relink",
      { user_challenge: clean },
      chaos
    );
    resp.mcp = {
      tool: "verify_ledger_or_relink",
      frames: call.frames,
      streamed: call.streamed,
      session_id: call.sessionId || null,
    };
    const v = (call.result as Record<string, unknown> | undefined) ?? {};
    const verdict = v.verdict as string | undefined;
    if (verdict === "confirmed_user" || v.actor === "USER_VOICE") {
      resp.response_text = `You asked me to — ${String(v.action ?? "that action")} is in my ledger.`;
    } else if (verdict === "ghost_rollback" || v.actor === "GHOST_EVENT" || v.actor === "SYSTEM_AUTO") {
      resp.response_text =
        "That wasn't you — it was an automatic event, and I've rolled it back. Sorry about that.";
    } else if (v.relink_url) {
      resp.response_text = "Your music account needs reconnecting — I've put a one-tap fix on your screen.";
    } else {
      resp.response_text = "I checked my ledger and I can't find a record of that — want me to undo it?";
    }
    return this.finish(resp, t0, Date.now() - r0, call.mcpMs);
  }

  /** SYNC branch (legacy) — the multiroom tool path, verbatim. */
  private async syncBranch(
    req: TurnRequest,
    clean: string,
    chaos: string | undefined,
    t0: number,
    r0: number
  ): Promise<TurnResponse> {
    void clean;
    const resp = this.base(t0, "fast");
    const call = await this.tool("sync_multiroom_and_bunker", { rooms: ["living", "kitchen", "bedroom"] }, chaos);
    resp.mcp = {
      tool: "sync_multiroom_and_bunker",
      frames: call.frames,
      streamed: call.streamed,
      session_id: call.sessionId || null,
    };
    const drift = (call.result as Record<string, unknown> | undefined)?.drift_ms;
    resp.response_text =
      typeof drift === "number"
        ? `All rooms locked — drift ${drift}ms.`
        : "All rooms phase-locked.";
    return this.finish(resp, t0, Date.now() - r0, call.mcpMs);
  }
}
