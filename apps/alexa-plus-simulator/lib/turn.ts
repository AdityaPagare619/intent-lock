/**
 * The /turn client + the Intent Lock payload contract (Wave 3).
 *
 * One turn = one POST /api/turn → :4000 orchestrator → ONE intent_lock
 * call on :8080. The response's `payload` is the tool's
 * structuredContent, rendered by the Trust Card exactly as it arrives:
 * every number on the card comes from this object — nothing is
 * hardcoded, estimated, or back-filled. Absent fields hide.
 *
 * Pin / reject follow-ups ride the same endpoint: the body carries
 * { utterance, pin } or { utterance, reject } and the host brain
 * re-calls intent_lock; the server re-verifies the pick against the
 * fresh pool and every ban before locking (JUDGMENT Part 3).
 */

/* ------------------------------------------------------------------ */
/* Payload types — the fields the server actually emits (verified live */
/* against :8080 on 2026-10-21). All optional but `status`: the card   */
/* renders what is present and hides what is not.                      */
/* ------------------------------------------------------------------ */

export interface LockRow {
  title: string;
  artist?: string;
  version?: string;
  year?: number;
  source?: string;
  source_name?: string;
  track_id?: string;
  sources?: string[];
  score?: number;
  phonetic_pct?: number;
  artwork_url?: string;
  preview_url?: string;
  provenance?: { origin?: string; fetched_at?: string; audit?: string } | null;
  /** commerce/grocery rows (server adapter lanes) may carry spec data */
  attributes?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ElimRow extends LockRow {
  reason?: string;
  kill_channel?: string;
}

export interface Grounding {
  ref_text?: string;
  said_ipa?: string;
  locked_ipa?: string;
  /** PanPhon articulatory-feature match, 0–100 */
  phonetic_pct?: number | null;
  /** VPPS consonant-skeleton match, 0–100 */
  vpps_pct?: number | null;
  /** 0–1 lock score (winner) */
  lock_score?: number | null;
  /** 0–1 never-guess floor */
  floor?: number | null;
  transcription?: string;
}

/** Server-enforced operator from the Universal Sub-Local Grammar
 * (founder correction, 21 Oct). Landing server-side in parallel — the
 * card renders these when present and degrades to `vetoes[]` when not. */
export interface OperatorPill {
  op: string; // e.g. "HARD_VETO" / "CONTEXT_ANCHOR"
  code?: string; // e.g. "OP_VETO" / "OP_ANCHOR" — the pill's arrow tail
  locale?: string; // e.g. "hi-IN"
  token?: string; // e.g. "nahi"
  target?: string; // e.g. "REMIX" — may be empty; the token headlines then
}

export interface IntentLockPayload {
  status: "locked" | "tie_choice" | "no_lock" | string;
  heard?: string;
  rescued?: string | null;
  locked?: LockRow | null;
  tied?: LockRow[];
  eliminated?: ElimRow[];
  grounding?: Grounding | null;
  vetoes?: string[];
  operators?: OperatorPill[] | null;
  constraints_echo?: {
    include_tags?: string[];
    exclude_tags?: string[];
    vetoes?: string[];
  } | null;
  rule_active?: string | null;
  tie_break?: { by?: string; chose?: string; why?: string } | null;
  telemetry?: {
    server_total_ms?: number;
    time_source?: string;
    pool?: number;
    sources?: Record<string, { status?: string; rows?: number; ms?: number }>;
    [key: string]: unknown;
  } | null;
  domain?: string;
  [key: string]: unknown;
}

export interface TurnResponse {
  path?: string;
  brain?: string;
  response_text?: string;
  chunks?: string[];
  payload?: IntentLockPayload | null;
  extraction?: {
    extracted_title_hint?: string;
    include_tags?: string[];
    exclude_tags?: string[];
    rule?: unknown;
    [key: string]: unknown;
  } | null;
  extraction_source?: string;
  domain?: string;
  mcp?: { tool?: string | null; session_id?: string | null };
  timings?: { total_ms?: number; mcp_ms?: number; routing_ms?: number };
  error?: string;
}

export interface TurnArgs {
  utterance: string;
  /** Host device clock "HH:MM" — rules fire against it (server has no clock). */
  host_time?: string;
  pin?: { source: string; track_id: string };
  reject?: { source: string; track_id: string };
  /** Domain adapter selector (music | commerce | grocery) — forwarded untouched. */
  domain?: string;
  /** Armed chaos fault name (sim FaultId wire name), e.g. "isp_blackout". */
  chaos_fault?: string | null;
}

export async function fireTurn(args: TurnArgs): Promise<TurnResponse> {
  const res = await fetch("/api/turn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      utterance: args.utterance,
      ...(args.host_time ? { host_time: args.host_time } : {}),
      ...(args.pin ? { pin: args.pin } : {}),
      ...(args.reject ? { reject: args.reject } : {}),
      ...(args.domain ? { domain: args.domain } : {}),
      ...(args.chaos_fault ? { chaos_fault: args.chaos_fault } : {}),
    }),
  });
  const data = (await res.json().catch(() => null)) as TurnResponse | null;
  if (!res.ok) {
    return {
      error:
        data?.error ??
        `turn failed — HTTP ${res.status} from the orchestrator hop`,
      payload: null,
    };
  }
  return data ?? { error: "turn returned an unreadable body", payload: null };
}

/** iTunes serves artwork at the size named in the URL path (…/100x100bb.jpg).
 *  Ask the same CDN path for 600x600. Non-iTunes-shaped URLs pass through. */
export function artwork600(url: string): string {
  return url.replace(/\/\d+x\d+bb\./, "/600x600bb.");
}

/** Human label for a row's provenance badge — three honest values only:
 *  live, vault copy + date, demo data. Anything unrecognized shows its
 *  raw source name rather than a borrowed badge. */
export function provenanceLabel(row: LockRow): string | null {
  const origin = row.provenance?.origin;
  if (origin === "vault_prefetch") {
    return row.provenance?.fetched_at
      ? `vault copy · ${row.provenance.fetched_at}`
      : "vault copy";
  }
  if (origin === "live_fetch" || row.source === "itunes" || row.source === "musicbrainz") {
    return "live";
  }
  if (origin) return origin.replace(/_/g, " ");
  return row.source_name ?? row.source ?? null;
}
