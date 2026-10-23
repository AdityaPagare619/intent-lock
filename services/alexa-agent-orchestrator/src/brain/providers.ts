/**
 * Layer A (doc 11) + Wave 2: providers for the host Brain.
 *
 * THE GEMINI PATH (default) is an EXTRACTION provider, not a decider:
 * Gemini 3 Flash parses the utterance into the Doc-12 extraction shape
 * through scripts/gemini_extract.py. The helper reaches the model one
 * of two ways: if GEMINI_API_KEY is set in the environment, it calls
 * the Gemini API directly with that key (header only — the key is
 * never printed, logged, or written to a file); otherwise it uses the
 * vaulted `custom.gemini` connector's dynamic-credential surrogate
 * route (the dev machine). With neither available the helper reports
 * no-key and the deterministic floor below serves the turn. The
 * helper's output is sanitized in Node before it may reach a tool.
 *
 * The older DECISION providers (Groq / OpenRouter / Ollama) stay from
 * the Layer-A experiment: they are not defaults, and the demo path does
 * not consult them. Every provider fails soft: null on ANY failure —
 * the deterministic floor in router.ts (localExtract) always answers,
 * so a model can never make a turn fail, only fail to improve it.
 *
 * Model ladder (ordered by measured evidence, 2026-10-21 probe through
 * the helper's own call path): gemini-3-flash-preview →
 * gemini-3.1-flash-lite → gemini-3.5-flash-lite → gemini-2.5-flash,
 * each with a 20 s attempt timeout, one bounded retry on retryable
 * failures, and a 55 s overall budget inside the Brain's extraction
 * deadline. GEMINI_MODEL overrides the primary. gemini-2.5-flash-lite
 * is a different id — retired on this account (404) — and appears
 * nowhere. The helper reports the serving model on stderr; the
 * extractor below captures it so the health string and the turn's
 * brain label name the model that actually served.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Domain, Extraction, sanitizeExtraction } from "../router.js";

export interface ToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface DecideInput {
  utterance: string;
  locale_hint?: string;
  tools: ToolInfo[];
  context: { last_action?: string; pending_elicitation?: boolean };
}

export type Decision =
  | { action: "tool_call"; tool: string; arguments: Record<string, unknown> }
  | { action: "speak"; text: string; entities: string[] };

export interface LlmProvider {
  id: string;
  model: string;
  available(): boolean;
  decide(input: DecideInput, deadlineMs: number): Promise<Decision | null>;
}

/** Wave 2: an extraction provider parses utterances into the Doc-12
 * shape. extract() returns null on ANY failure — the floor answers.
 * The optional domain (Lane F) only re-reads the SAME shape for
 * commerce/grocery turns; it never changes the shape. */
export interface ExtractionProvider {
  id: string;
  model: string;
  available(): boolean;
  extract(utterance: string, deadlineMs: number, domain?: Domain): Promise<Extraction | null>;
}

export interface ProviderSet {
  extractors: ExtractionProvider[];
  deciders: LlmProvider[];
}

// ---------------------------------------------------------------------------
// The Doc-12 extraction prompt (canonical text — the Python helper
// carries the working copy; keep the two in step).
// ---------------------------------------------------------------------------

export const EXTRACTION_SYSTEM = [
  "You are the language-understanding layer of a music voice assistant",
  "(the host brain). You do NOT choose the song and you never invent",
  "catalog data. You parse the user's raw utterance — often messy,",
  "mixed Hindi-English (Hinglish), with speech-recognition errors —",
  "into a small JSON structure. A deterministic server verifies",
  "everything against real catalogs; your output is advisory only.",
  "Return ONLY this JSON object:",
  "{",
  '  "extracted_title_hint": "<best guess at the song title, clean, or empty string>",',
  '  "include_tags": ["<version/style words the user WANTS: original, film, studio, slow, lofi, acoustic, unplugged, live, remix, remaster>"],',
  '  "exclude_tags": ["<versions the user BANS — including bans via Hindi negation \'nahi\', \'nahin\', \'mat\' (e.g. \'remix nahi\' bans remix)>"],',
  '  "rule": null OR {"after_time": "HH:MM", "version": "<version words>", "artist": "<optional artist>"},',
  '  "candidate_hints": ["<up to 4 plausible real song titles — ONLY when the request is descriptive or memory-style with no clear title (\'that song where...\'), otherwise empty>"]',
  "}",
  "Rules: include_tags and exclude_tags hold at most 8 short lowercase",
  "words each. 'rule' is non-null ONLY when the user states a standing",
  "rule with a time ('after 10 PM, Saiyaara means the lofi version') —",
  "convert the time to 24-hour HH:MM. If the user clearly names a",
  "title, candidate_hints is empty. No commentary, no code fences.",
].join("\n");

/** Domain notes (Lane F): appended to the extraction prompt for
 * non-music turns so the SAME Gemini extraction produces the entity
 * hint + include/exclude tags for a product or grocery item. The
 * Python helper carries the working copy; keep the two in step. */
export const EXTRACTION_DOMAIN_NOTES: Record<"commerce" | "grocery", string> = {
  commerce:
    "Domain note: this turn is a COMMERCE (product) request, not music. " +
    "Read 'extracted_title_hint' as the product or item name the user wants " +
    "(e.g. 'Thunderbolt 40Gbps cable 2m'). include_tags hold attribute or " +
    "spec words the user WANTS (e.g. thunderbolt, 40gbps, 2m, usb-c); " +
    "exclude_tags hold attributes the user BANS — a ban can be phrased " +
    "'not', 'no', 'without', or 'sin' before the attribute (e.g. 'not the " +
    "USB 2.0 knockoff' bans usb 2.0). candidate_hints stays empty unless " +
    "the request is descriptive with no clear item name. The 'rule' shape " +
    "is unchanged.",
  grocery:
    "Domain note: this turn is a GROCERY (food) request, not music. " +
    "Read 'extracted_title_hint' as the grocery item name the user wants " +
    "(e.g. 'oat milk'). include_tags hold attribute words the user WANTS " +
    "(e.g. oat, unsweetened); exclude_tags hold ingredients or items the " +
    "user BANS — a ban can be phrased 'not', 'no', 'without', or 'sin' " +
    "before the word (e.g. 'no almond' bans almond). candidate_hints " +
    "stays empty unless the request is descriptive with no clear item " +
    "name. The 'rule' shape is unchanged.",
};

// ---------------------------------------------------------------------------
// Gemini via the helper script (env-key route, else vault route)
// ---------------------------------------------------------------------------

const HELPER_PATH = fileURLToPath(
  new URL("../../scripts/gemini_extract.py", import.meta.url)
);
const CONNECTOR_BIN = "/opt/muse/skills/custom-connector-setup/bin";

export class GeminiHelperExtractor implements ExtractionProvider {
  id = "gemini";
  private configuredModel = process.env.GEMINI_MODEL ?? "gemini-3-flash-preview";
  private servedModel: string | null = null;

  /** The model that actually served the most recent successful
   * extraction (reported by the helper on stderr); before the first
   * success, the configured primary. */
  get model(): string {
    return this.servedModel ?? this.configuredModel;
  }

  available(): boolean {
    // The helper itself probes the credential route per call and fails
    // soft; availability here is just "the script is on disk".
    return existsSync(HELPER_PATH);
  }

  extract(utterance: string, deadlineMs: number, domain?: Domain): Promise<Extraction | null> {
    return new Promise((resolve) => {
      let child;
      try {
        child = spawn("python3", [HELPER_PATH], {
          env: {
            ...process.env,
            PYTHONPATH: process.env.PYTHONPATH
              ? `${CONNECTOR_BIN}:${process.env.PYTHONPATH}`
              : CONNECTOR_BIN,
          },
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch {
        resolve(null);
        return;
      }
      let out = "";
      let err = "";
      let settled = false;
      const done = (v: Extraction | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(v);
      };
      const timer = setTimeout(() => {
        try { child.kill("SIGKILL"); } catch { /* already gone */ }
        done(null);
      }, Math.max(250, deadlineMs));
      child.stdout.on("data", (d: Buffer) => {
        out += d.toString("utf8");
        if (out.length > 65536) {
          try { child.kill("SIGKILL"); } catch { /* ignore */ }
          done(null);
        }
      });
      child.stderr.on("data", (d: Buffer) => {
        // Diagnostics stay in the helper; the one line we consume is
        // its served-model marker, so the brain label can name the
        // model that actually served (never any credential material —
        // the helper prints model + route only).
        err += d.toString("utf8");
        if (err.length > 8192) err = err.slice(-8192);
      });
      child.on("error", () => done(null));
      child.on("close", (code) => {
        if (code !== 0) return done(null);
        const served = /served model=(\S+)/.exec(err);
        if (served) this.servedModel = served[1];
        try {
          done(sanitizeExtraction(JSON.parse(out)));
        } catch {
          done(null);
        }
      });
      child.stdin.on("error", () => { /* close handler settles */ });
      child.stdin.end(JSON.stringify({
        utterance,
        model: this.configuredModel,
        ...(domain ? { domain } : {}),
      }));
    });
  }
}

// ---------------------------------------------------------------------------
// Legacy decision providers (Layer-A experiment — kept, NOT defaults)
// ---------------------------------------------------------------------------

const DECISION_SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["tool_call", "speak"] },
    tool: { type: ["string", "null"] },
    arguments: { type: ["object", "null"], additionalProperties: true },
    text: { type: ["string", "null"] },
    entities: { type: "array", items: { type: "string" } },
  },
  required: ["action", "tool", "arguments", "text", "entities"],
  additionalProperties: false,
} as const;

const DECISION_SYSTEM = [
  "You are the reasoning layer of Intent Lock, a music voice-assistant host.",
  "Decide ONE next step for the user's turn: call exactly one tool",
  "(action=tool_call) or speak (action=speak). Output ONLY the JSON",
  "decision object — no prose, no code fences.",
  "Rules: never invent song titles, artists, or facts. For speak, list in",
  "entities every factual name you mention (they are verified against the",
  "conversation; unverifiable claims are discarded). For music requests",
  "use tool_call resolve_and_play and put semantic constraints in",
  "arguments.constraints: desired_version (any|studio|live|unplugged|",
  "acoustic|remix|remaster), artist_hint, era_hint (e.g. '1990s'),",
  "mood_hint. Keep arguments minimal: the user's own words stay the",
  "payload; you extract intent, you do not rewrite the request.",
].join(" ");

function userPrompt(input: DecideInput): string {
  const tools = input.tools
    .map((t) => {
      const params = t.inputSchema?.properties
        ? Object.keys(t.inputSchema.properties as Record<string, unknown>).join(", ")
        : "";
      return `- ${t.name}(${params}) — ${t.description ?? ""}`;
    })
    .join("\n");
  return [
    `Tools:\n${tools || "(none)"}`,
    `Context: last_action=${input.context.last_action ?? "none"}, ` +
      `pending_elicitation=${!!input.context.pending_elicitation}, ` +
      `locale=${input.locale_hint ?? "en-IN"}`,
    `User said: ${input.utterance}`,
  ].join("\n\n");
}

export function parseDecision(text: unknown): Decision | null {
  if (typeof text !== "string" || !text.trim()) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (obj.action === "tool_call" && typeof obj.tool === "string") {
    const args =
      obj.arguments && typeof obj.arguments === "object"
        ? (obj.arguments as Record<string, unknown>)
        : {};
    return { action: "tool_call", tool: obj.tool, arguments: args };
  }
  if (obj.action === "speak" && typeof obj.text === "string") {
    const entities = Array.isArray(obj.entities)
      ? obj.entities.filter((e): e is string => typeof e === "string")
      : [];
    return { action: "speak", text: obj.text, entities };
  }
  return null;
}

interface OpenAiCfg {
  url: string;
  model: string;
  apiKey?: string;
  strictSchema: boolean;
}

async function openAiDecide(
  cfg: OpenAiCfg,
  input: DecideInput,
  deadlineMs: number
): Promise<Decision | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.max(200, deadlineMs));
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
    const res = await fetch(cfg.url, {
      method: "POST",
      headers,
      signal: ctrl.signal,
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        messages: [
          { role: "system", content: DECISION_SYSTEM },
          { role: "user", content: userPrompt(input) },
        ],
        response_format: cfg.strictSchema
          ? {
              type: "json_schema",
              json_schema: { name: "decision", strict: true, schema: DECISION_SCHEMA },
            }
          : { type: "json_object" },
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    return parseDecision(data.choices?.[0]?.message?.content);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export class GroqProvider implements LlmProvider {
  id = "groq";
  model = process.env.GROQ_MODEL ?? "openai/gpt-oss-20b";
  available(): boolean {
    return !!process.env.GROQ_API_KEY;
  }
  decide(input: DecideInput, deadlineMs: number): Promise<Decision | null> {
    return openAiDecide(
      {
        url: "https://api.groq.com/openai/v1/chat/completions",
        model: this.model,
        apiKey: process.env.GROQ_API_KEY,
        // Strict constrained decoding exists only on the gpt-oss class
        // (doc 10 §5.3); Llama models get JSON mode + our validation.
        strictSchema: this.model.includes("gpt-oss"),
      },
      input,
      deadlineMs
    );
  }
}

export class OpenRouterProvider implements LlmProvider {
  id = "openrouter";
  model =
    process.env.OPENROUTER_MODEL ?? "meta-llama/llama-3.3-70b-instruct:free";
  available(): boolean {
    return !!process.env.OPENROUTER_API_KEY;
  }
  decide(input: DecideInput, deadlineMs: number): Promise<Decision | null> {
    return openAiDecide(
      {
        url: "https://openrouter.ai/api/v1/chat/completions",
        model: this.model,
        apiKey: process.env.OPENROUTER_API_KEY,
        strictSchema: false,
      },
      input,
      deadlineMs
    );
  }
}

export class OllamaProvider implements LlmProvider {
  id = "ollama";
  model = process.env.OLLAMA_MODEL ?? "llama3.1:8b";
  private base = (process.env.OLLAMA_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
  available(): boolean {
    // Probed inside decide(); a refused connection fails fast to null.
    return true;
  }
  decide(input: DecideInput, deadlineMs: number): Promise<Decision | null> {
    return openAiDecide(
      {
        url: `${this.base}/v1/chat/completions`,
        model: this.model,
        strictSchema: false,
      },
      input,
      deadlineMs
    );
  }
}

/** BRAIN_PROVIDER="gemini" (default) — the Gemini-helper extraction
 * path. "groq,openrouter,ollama" build the legacy deciders (kept, not
 * defaults). "local" / unknown names: no model at all — the
 * deterministic floor in router.ts is the whole brain. */
export function buildProviders(spec: string): ProviderSet {
  const out: ProviderSet = { extractors: [], deciders: [] };
  for (const name of spec.split(",").map((s) => s.trim().toLowerCase())) {
    if (name === "gemini") out.extractors.push(new GeminiHelperExtractor());
    else if (name === "groq") out.deciders.push(new GroqProvider());
    else if (name === "openrouter") out.deciders.push(new OpenRouterProvider());
    else if (name === "ollama") out.deciders.push(new OllamaProvider());
    // "local" / unknown names: nothing — the router floor serves.
  }
  return out;
}
