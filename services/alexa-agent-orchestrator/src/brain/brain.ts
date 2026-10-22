/**
 * Layer A (doc 11) + Wave 2: the Brain — the host's reasoning layer
 * above the deterministic IntentRouter.
 *
 * DEMO PATH (default): the Brain is an EXTRACTION brain. Play turns are
 * parsed by Gemini 3 Flash (via the vault-routed helper in providers.ts)
 * into the Doc-12 extraction shape, sanitized, and re-dispatched to the
 * router's play_lock branch — ONE call to intent_lock, whose
 * structuredContent is the turn payload. If the helper fails or exceeds
 * its deadline (60 s, reconciled with the helper's 55 s budget), the router's deterministic floor (localExtract)
 * produces the extraction instead and the turn is labeled
 * extraction_source: "local-floor". A turn NEVER blocks on the brain.
 * Reflex turns (stop / barge / resume), challenges, and elicitation
 * follow-ups never wait for a model — they go straight to the router.
 *
 * LEGACY PATH (legacy turns only, and only when decision providers are
 * configured): the original speculative cascade — local router and LLM
 * decision start together; the LLM only proposes (tool intent +
 * constraints, or a tether-checked spoken reply). Preserved verbatim
 * for the flag-gated d0062ec behavior.
 */

import { McpClient } from "../mcpClient.js";
import {
  Constraints,
  Domain,
  Extraction,
  IntentRouter,
  REFLEX,
  TurnRequest,
  TurnResponse,
  chunkify,
  isChallengeUtterance,
  isOrderUtterance,
  isPlayUtterance,
  localExtract,
  resolveDomain,
  sanitizePinReject,
  stripWake,
} from "../router.js";
import {
  Decision,
  ExtractionProvider,
  LlmProvider,
  ProviderSet,
  ToolInfo,
} from "./providers.js";

const DESIRED_VERSIONS = new Set([
  "any", "studio", "live", "unplugged", "acoustic", "remix", "remaster",
]);

export function sanitizeConstraints(raw: unknown): Constraints {
  const out: Constraints = {};
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  if (typeof r.desired_version === "string" &&
      DESIRED_VERSIONS.has(r.desired_version.toLowerCase())) {
    out.desired_version = r.desired_version.toLowerCase() as Constraints["desired_version"];
  }
  const caps: Array<[keyof Constraints, number]> = [
    ["artist_hint", 80], ["era_hint", 20], ["mood_hint", 40],
  ];
  for (const [field, cap] of caps) {
    const v = r[field];
    if (typeof v === "string" && v.trim()) {
      out[field] = v.trim().slice(0, cap) as never;
    }
  }
  return out;
}

const TOOL_TO_INTENT: Record<string, "play" | "challenge" | "sync"> = {
  omnibeat_resolve_and_play: "play",
  omnibeat_verify_ledger_or_relink: "challenge",
  omnibeat_sync_multiroom_and_bunker: "sync",
  // omnibeat_fastpath_interrupt is deliberately absent: interrupts are
  // reflexes, never LLM decisions.
};

/** Extraction budget: past this the deterministic floor answers.
 * Must exceed the helper's own overall budget (GEMINI_EXTRACT_BUDGET_S,
 * default 55 s): the old 6 s default killed the helper mid-flight on
 * any night the provider answered slower than ~3 s per model, and
 * every such turn silently fell to the floor. */
const EXTRACT_DEADLINE_MS = Number(process.env.BRAIN_EXTRACT_DEADLINE_MS ?? 60000);

export class Brain {
  private toolsCache: ToolInfo[] | null = null;
  private lastSc = new Map<string, Record<string, unknown>>();
  private deadlineMs: number;
  private extractors: ExtractionProvider[];
  private deciders: LlmProvider[];

  constructor(
    private router: IntentRouter,
    private mcp: McpClient,
    providers: ProviderSet
  ) {
    this.deadlineMs = Number(process.env.BRAIN_DEADLINE_MS ?? 4000);
    this.extractors = providers.extractors;
    this.deciders = providers.deciders;
  }

  describe(): string {
    const parts: string[] = [];
    const ex = this.extractors.filter((p) => p.available());
    if (ex.length) {
      parts.push(...ex.map((p) => `extract:${p.id}:${p.model}+local-floor`));
    }
    const dec = this.deciders.filter((p) => p.available());
    if (dec.length) parts.push(...dec.map((p) => `${p.id}:${p.model}`));
    return parts.length ? parts.join(" | ") : "local-floor";
  }

  private sessionKey(req: TurnRequest): string {
    return req.session_id ?? "default";
  }

  private resultSc(resp: TurnResponse): Record<string, unknown> | null {
    for (let i = resp.mcp.frames.length - 1; i >= 0; i--) {
      const frame = resp.mcp.frames[i] as { data?: unknown } | null;
      const d = (frame?.data ?? null) as Record<string, unknown> | null;
      const result = (d?.result ?? d) as Record<string, unknown> | null;
      const sc = result?.structuredContent as Record<string, unknown> | undefined;
      if (sc) return sc;
    }
    return null;
  }

  /** Local path produced no tool effect (fallback/greeting templates). */
  private isIndecisive(resp: TurnResponse): boolean {
    return resp.mcp.tool === null && !resp.error && !resp.barge_state;
  }

  /** The resolve tool ran but honestly refused (no track, no elicitation). */
  private isAbstention(resp: TurnResponse): boolean {
    if (resp.mcp.tool !== "omnibeat_resolve_and_play") return false;
    const sc = this.resultSc(resp);
    if (!sc) return false;
    return sc.input_required !== true && !sc.track && sc.action !== "play";
  }

  private async getTools(): Promise<ToolInfo[]> {
    if (this.toolsCache) return this.toolsCache;
    try {
      this.toolsCache = await this.mcp.listTools();
    } catch {
      this.toolsCache = [];
    }
    return this.toolsCache;
  }

  /** Gemini extraction cascade: first non-null extraction wins. Every
   * failure (helper down, timeout, bad JSON) falls through to null —
   * the caller then uses the deterministic floor. The turn's resolved
   * domain rides along so the same extraction reads commerce/grocery
   * asks as item requests (Lane F); the shape never changes. */
  private async extract(utterance: string, domain: Domain): Promise<Extraction | null> {
    for (const ex of this.extractors) {
      if (!ex.available()) continue;
      const got = await ex.extract(utterance, EXTRACT_DEADLINE_MS, domain).catch(() => null);
      if (got) return got;
    }
    return null;
  }

  private async decide(
    active: LlmProvider[],
    req: TurnRequest
  ): Promise<{ decision: Decision; provider: LlmProvider } | null> {
    const tools = await this.getTools();
    const end = Date.now() + this.deadlineMs;
    for (const provider of active) {
      const remaining = end - Date.now();
      if (remaining < 250) break;
      const decision = await provider.decide(
        {
          utterance: req.utterance,
          locale_hint: req.locale_hint,
          tools,
          context: { pending_elicitation: false },
        },
        remaining
      );
      if (decision) return { decision, provider };
    }
    return null;
  }

  private async applyDecision(
    decision: Decision,
    provider: LlmProvider,
    req: TurnRequest,
    local: TurnResponse
  ): Promise<TurnResponse | null> {
    const winner = `${provider.id}:${provider.model}`;
    if (decision.action === "tool_call") {
      const intent = TOOL_TO_INTENT[decision.tool];
      if (!intent) return null; // unknown or reflex-only tool — refuse
      const constraints = sanitizeConstraints(
        (decision.arguments as Record<string, unknown>)?.constraints
      );
      const out = await this.router.turn(req, { intent, constraints });
      // A second abstention ships the original honest refusal, not a loop.
      if (this.isAbstention(out)) return null;
      out.brain = winner;
      return out;
    }
    // speak: tether check — every named entity must be grounded in the
    // user's own words or the last verified tool result.
    const key = this.sessionKey(req);
    const haystack = (
      req.utterance + " " + JSON.stringify(this.lastSc.get(key) ?? {})
    ).toLowerCase();
    const grounded = decision.entities.every((e) =>
      haystack.includes(e.toLowerCase())
    );
    const text = decision.text.trim();
    if (!grounded || !text || text.length > 400) return null;
    const out: TurnResponse = {
      ...local,
      brain: winner,
      path: "agentic",
      response_text: text,
      chunks: chunkify(text),
    };
    return out;
  }

  async turn(req: TurnRequest): Promise<TurnResponse> {
    // Follow-ups and reflexes are deterministic territory.
    if (req.pending_id) return this.router.turn(req);
    const clean = stripWake((req.utterance ?? "").trim());
    if (REFLEX.STOP.test(clean) || REFLEX.BARGE.test(clean) || REFLEX.RESUME.test(clean)) {
      return this.router.turn(req);
    }
    if (isChallengeUtterance(clean)) return this.router.turn(req);

    const legacyTurn = req.legacy === true || process.env.ORCHESTRATOR_LEGACY === "1";

    // --- Demo path: play turns are extraction turns ---------------------
    // Commerce/grocery order utterances are lock turns too (Lane F);
    // music detection is exactly as before.
    const dom = resolveDomain(req.domain);
    const isPlay =
      !!sanitizePinReject(req.pin) || !!sanitizePinReject(req.reject) ||
      isPlayUtterance(clean) ||
      (dom.domain !== "music" && isOrderUtterance(clean));
    if (isPlay && !legacyTurn) {
      const got = await this.extract(req.utterance ?? "", dom.domain);
      const extraction = got ?? localExtract(clean);
      const out = await this.router.turn(req, {
        intent: "play_lock",
        extraction,
        extraction_source: got ? "gemini" : "local-floor",
      });
      const winner = this.extractors.find((p) => p.available());
      out.brain = got && winner ? `${winner.id}:${winner.model}` : "local-floor";
      const sc = this.resultSc(out);
      if (sc) this.lastSc.set(this.sessionKey(req), sc);
      return out;
    }

    // --- Legacy path: speculative decision cascade (flag-gated) ---------
    const active = this.deciders.filter((p) => p.available());
    if (!active.length) return this.router.turn(req);
    const localPromise = this.router.turn(req);
    const decisionPromise = this.decide(active, req).catch(() => null);
    const local = await localPromise;
    const sc = this.resultSc(local);
    if (sc) this.lastSc.set(this.sessionKey(req), sc);
    if (!this.isIndecisive(local) && !this.isAbstention(local)) return local;
    const got = await decisionPromise;
    if (!got) return local;
    const out = await this.applyDecision(got.decision, got.provider, req, local);
    return out ?? local;
  }
}
