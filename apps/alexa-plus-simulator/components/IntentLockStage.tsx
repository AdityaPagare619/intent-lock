/**
 * INTENT LOCK STAGE (Wave 3) — the controls + state around the Trust
 * Card. Everything here fires REAL turns:
 *
 *  - Break My Lock chips + the any-query box POST /api/turn → :4000
 *    brain → intent_lock on :8080. Chips render their TRUE outcomes.
 *  - The clock is a SCRUBBER ("Same Words, Two Clocks"): the stage
 *    clock is the host clock the server judges rules against
 *    (host_time rides every turn; the server owns no clock). Crossing
 *    22:00 on a scrub commit refires the SAME last utterance at the
 *    new time — the rule fires by itself or it doesn't; the card is
 *    the proof either way.
 *  - The outage toggle is the existing ChaosSwitchboard "Kill ISP
 *    Wi-Fi": its wire fault (isp_blackout) rides every turn body as
 *    chaos_fault, and the server short-circuits to its audited vault.
 *  - Coda "One Schema, Three Locks" fires three REAL domain turns.
 *    Music is the live domain. Commerce/grocery render their real
 *    payload only when the orchestrator acknowledges the domain;
 *    until that lane lands they show the honest pending state with
 *    the engine's actual answer quoted. NO fixtures. NO pattern_preview.
 */
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSim } from "../lib/sim-context";
import { findRelink, mcpCallTool } from "../lib/mcp";
import {
  fireTurn,
  type IntentLockPayload,
  type LockRow,
  type TurnResponse,
} from "../lib/turn";
import { HookPlayer } from "../workers/hook_player";
import TrustCard, { type TrustCardActions } from "./TrustCard";

/* ------------------------------------------------------------------ */

/** The orb's turn lifecycle (Round 2) — set ONLY by fire()'s real
 * progress and the response's own payload.status. Never timer-acted
 * beyond returning to idle: the single in-flight state covers brain +
 * kernel because that split is not client-observable mid-call; the
 * terminal shows the split from the response's measured timings. */
export type TurnPhase = "idle" | "inflight" | "locked" | "tie" | "refused" | "error";

/** One readable terminal line for a /turn exchange. Request lines are
 * written at fire time (values known client-side); brain/answer lines
 * are written on arrival with values ONLY from the response. */
export interface TermLine {
  id: number;
  ts: number;
  kind: "call" | "brain" | "answer" | "error";
  utterance?: string;
  hostTime?: string;
  domain?: string;
  pinId?: string;
  rejectId?: string;
  source?: string;
  brainName?: string;
  hint?: string;
  include?: string[];
  exclude?: string[];
  rule?: boolean;
  status?: string;
  title?: string;
  trackId?: string;
  lockScore?: number | null;
  elimCount?: number;
  tiedCount?: number;
  kernelMs?: number;
  totalMs?: number;
  message?: string;
}

interface StageState {
  clockMin: number;
  clock: string;
  payload: IntentLockPayload | null;
  lastUtterance: string;
  busy: boolean;
  error: string | null;
  brainTags?: { include?: string[]; exclude?: string[] };
  fire: (utterance: string, opts?: { domain?: string }) => Promise<TurnResponse | null>;
  scrubTo: (min: number, commit: boolean) => void;
  actions: TrustCardActions;
  player: HookPlayer;
  palette: string[] | null;
  setPalette: (c: string[] | null) => void;
  /** Round 2: real turn lifecycle for the orb, the terminal's /turn
   * lines, and the last extraction turn's brain truth for the chip. */
  turnPhase: TurnPhase;
  termLines: TermLine[];
  lastBrain: { source?: string; brain?: string } | null;
  noteTurnStart: (utterance: string, opts?: { domain?: string; pinId?: string; rejectId?: string }) => void;
  noteTurnEnd: (resp: TurnResponse) => void;
}

const Ctx = createContext<StageState | null>(null);
export function useStage(): StageState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStage outside IntentLockProvider");
  return v;
}

const fmtClock = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const RULE_BOUNDARY_MIN = 22 * 60; // 22:00 — the demo rule's after_time

function versionWord(version?: string): string {
  const v = (version ?? "").toLowerCase();
  if (/lo\s?-?fi/.test(v)) return "lofi";
  if (/remix/.test(v)) return "remix";
  if (/live/.test(v)) return "live";
  if (/acoustic/.test(v)) return "acoustic";
  if (/karaoke/.test(v)) return "karaoke";
  return "original";
}

export function IntentLockProvider({ children }: { children: ReactNode }) {
  const sim = useSim();
  const [clockMin, setClockMin] = useState(21 * 60 + 58); // 21:58 — Beat 1's filmed clock
  const [payload, setPayload] = useState<IntentLockPayload | null>(null);
  const [lastUtterance, setLastUtterance] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brainTags, setBrainTags] = useState<StageState["brainTags"]>(undefined);
  const [palette, setPalette] = useState<string[] | null>(null);
  const playerRef = useRef<HookPlayer | null>(null);
  if (!playerRef.current) playerRef.current = new HookPlayer();
  const committedClockRef = useRef(clockMin);
  const busyRef = useRef(false);
  const [turnPhase, setTurnPhase] = useState<TurnPhase>("idle");
  const [termLines, setTermLines] = useState<TermLine[]>([]);
  const [lastBrain, setLastBrain] = useState<StageState["lastBrain"]>(null);
  const termIdRef = useRef(0);
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clock = fmtClock(clockMin);

  const pushTerm = useCallback((line: Omit<TermLine, "id" | "ts">) => {
    termIdRef.current += 1;
    const full: TermLine = { ...line, id: termIdRef.current, ts: Date.now() };
    setTermLines((prev) => [...prev.slice(-79), full]);
  }, []);

  const noteTurnStart = useCallback(
    (utterance: string, opts?: { domain?: string; pinId?: string; rejectId?: string }) => {
      pushTerm({
        kind: "call",
        utterance,
        hostTime: fmtClock(committedClockRef.current),
        domain: opts?.domain,
        pinId: opts?.pinId,
        rejectId: opts?.rejectId,
      });
    },
    [pushTerm]
  );

  const noteTurnEnd = useCallback(
    (resp: TurnResponse) => {
      // The per-turn brain truth: only extraction turns move the chip —
      // a template answer never asked the brain anything, so it must not
      // move the chip either.
      if (resp.extraction) {
        setLastBrain({ source: resp.extraction_source, brain: resp.brain });
        pushTerm({
          kind: "brain",
          source: resp.extraction_source,
          brainName: resp.brain,
          hint: resp.extraction.extracted_title_hint,
          include: resp.extraction.include_tags,
          exclude: resp.extraction.exclude_tags,
          rule: !!resp.extraction.rule,
        });
      }
      if (resp.payload) {
        const p = resp.payload;
        pushTerm({
          kind: "answer",
          status: p.status,
          title: p.locked?.title ?? p.rescued ?? undefined,
          trackId: p.locked?.track_id,
          lockScore: p.grounding?.lock_score ?? null,
          elimCount: (p.eliminated ?? []).length,
          tiedCount: (p.tied ?? []).length,
          // D7: the response's routing_ms is the router's whole span,
          // not a brain measure — the terminal prints only numbers
          // that measure what they claim: the kernel's own server
          // total (payload telemetry) and the whole turn's total.
          kernelMs: p.telemetry?.server_total_ms,
          totalMs: resp.timings?.total_ms,
        });
      } else {
        pushTerm({ kind: "error", message: resp.error ?? "turn returned no payload" });
      }
    },
    [pushTerm]
  );

  const applyResponse = useCallback(
    (resp: TurnResponse, utterance: string) => {
      noteTurnEnd(resp);
      if (resp.response_text) sim.pushTranscript(resp.response_text, "ALEXA");
      if (resp.payload) {
        setPayload(resp.payload);
        setBrainTags(
          resp.extraction
            ? { include: resp.extraction.include_tags, exclude: resp.extraction.exclude_tags }
            : undefined
        );
        const lk = resp.payload.locked;
        sim.pushLedger(
          `intent_lock → ${resp.payload.status}${lk ? ` · ${lk.title} (${lk.version ?? ""})` : ""}`,
          "LIVE"
        );
      } else if (resp.error) {
        setError(resp.error);
        sim.pushLedger(`intent_lock → FAILED: ${resp.error}`, "LIVE");
      }
      void utterance;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const fire = useCallback(
    async (utterance: string, opts?: { domain?: string; pin?: { source: string; track_id: string }; reject?: { source: string; track_id: string } }): Promise<TurnResponse | null> => {
      if (busyRef.current || !utterance.trim()) return null;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
      setTurnPhase("inflight");
      noteTurnStart(utterance, {
        domain: opts?.domain,
        pinId: opts?.pin?.track_id,
        rejectId: opts?.reject?.track_id,
      });
      playerRef.current?.ensureCtx(); // inside the click's gesture chain
      sim.setOrb("listening");
      sim.pushTranscript(utterance, "SIM-ASR");
      try {
        const resp = await fireTurn({
          utterance,
          host_time: fmtClock(committedClockRef.current),
          domain: opts?.domain,
          pin: opts?.pin,
          reject: opts?.reject,
          chaos_fault: sim.activeChaosFault,
        });
        if (!opts?.pin && !opts?.reject) setLastUtterance(utterance);
        applyResponse(resp, utterance);
        // The orb's verdict state IS the response's own status — the
        // phase then returns to idle on a plain timer (the only timed
        // transition, and it claims no activity).
        const st = resp.payload?.status;
        setTurnPhase(
          resp.payload
            ? st === "locked"
              ? "locked"
              : st === "tie_choice"
                ? "tie"
                : st === "no_lock"
                  ? "refused"
                  : "idle"
            : "error"
        );
        phaseTimerRef.current = setTimeout(() => setTurnPhase("idle"), 3000);
        return resp;
      } catch (e) {
        setError((e as Error).message);
        pushTerm({ kind: "error", message: (e as Error).message });
        setTurnPhase("error");
        phaseTimerRef.current = setTimeout(() => setTurnPhase("idle"), 3000);
        return null;
      } finally {
        sim.setOrb("idle");
        busyRef.current = false;
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applyResponse, sim.activeChaosFault]
  );

  /** Scrub: display follows the drag; on commit, crossing the 22:00
   *  boundary refires the same words at the new host time. */
  const scrubTo = useCallback(
    (min: number, commit: boolean) => {
      setClockMin(min);
      if (!commit) return;
      const prev = committedClockRef.current;
      committedClockRef.current = min;
      const crossed =
        (prev < RULE_BOUNDARY_MIN && min >= RULE_BOUNDARY_MIN) ||
        (prev >= RULE_BOUNDARY_MIN && min < RULE_BOUNDARY_MIN);
      if (crossed && lastUtterance && !busyRef.current) {
        void fire(lastUtterance);
      }
    },
    [fire, lastUtterance]
  );

  const actions: TrustCardActions = useMemo(
    () => ({
      busy,
      pin: (row: LockRow) => {
        if (!row.source || !row.track_id || !lastUtterance) return;
        void fire(lastUtterance, { pin: { source: row.source, track_id: row.track_id } });
      },
      reject: (row: LockRow) => {
        if (!row.source || !row.track_id || !lastUtterance) return;
        void fire(lastUtterance, { reject: { source: row.source, track_id: row.track_id } });
      },
      tasteLock: (row: LockRow) => {
        void (async () => {
          if (busyRef.current) return;
          busyRef.current = true;
          setBusy(true);
          try {
            const sid = await sim.ensureSession();
            if (!sid) {
              setError("no live MCP session — the Taste Lock write was not sent");
              return;
            }
            // A real tools/call: the rule is a tool argument (Doc 12).
            // The server writes it bound to this title family; the
            // exact-recording binding is learned by the server when
            // the rule's version next wins a verified fire.
            const res = await mcpCallTool(
              sim.pushFrame,
              sid,
              "intent_lock",
              {
                utterance: lastUtterance,
                extracted_title_hint: row.title,
                rule: {
                  after_time: fmtClock(committedClockRef.current),
                  version: versionWord(row.version),
                  artist: row.artist ?? "",
                },
              },
              sim.activeChaosFault
            );
            const rl = findRelink(res.payloads);
            if (rl) {
              sim.setRelink(rl);
              return;
            }
            const sc = res.payloads
              .map(
                (p) =>
                  (p as { result?: { structuredContent?: IntentLockPayload } })?.result
                    ?.structuredContent
              )
              .find((s) => s && typeof s === "object");
            if (sc) {
              setPayload(sc);
              sim.pushLedger(`intent_lock (taste lock write) → ${sc.status}`, "LIVE");
              if (sc.rule_active) sim.pushTranscript(sc.rule_active, "ALEXA");
            } else {
              setError("the Taste Lock write returned no payload — check the wire below");
            }
          } finally {
            busyRef.current = false;
            setBusy(false);
          }
        })();
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, fire, lastUtterance, sim.activeChaosFault]
  );

  const value: StageState = {
    clockMin,
    clock,
    payload,
    lastUtterance,
    busy,
    error,
    brainTags,
    fire: (u, opts) => fire(u, opts),
    scrubTo,
    actions,
    player: playerRef.current,
    palette,
    setPalette,
    turnPhase,
    termLines,
    lastBrain,
    noteTurnStart,
    noteTurnEnd,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ------------------------------------------------------------------ */
/* The stage surface: Room Glow wrapper + the Trust Card.              */
/* ------------------------------------------------------------------ */

export function TrustCardPanel() {
  const st = useStage();
  const glow = st.palette;
  return (
    <div className="relative px-4 pb-4">
      {/* ROOM GLOW — palette sampled from the locked row's real
          artwork; absent when the artwork can't be sampled. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-all duration-700"
        style={
          glow
            ? {
                background: `radial-gradient(60% 90% at 18% 40%, ${glow[0]}40 0%, transparent 60%), radial-gradient(55% 85% at 85% 60%, ${(glow[1] ?? glow[0])}33 0%, transparent 62%)`,
              }
            : undefined
        }
      />
      <div className="relative">
        {st.busy && (
          <div className="mb-2 px-1">
            <div className="flex items-center gap-2 text-[11.5px] text-cyan-soft">
              verifying on the wire — brain proposes, server decides…
            </div>
            <div aria-hidden className="mt-2 h-[2px] w-full overflow-hidden rounded-full bg-alexa/15">
              <div
                className="animate-verify-sweep h-[2px] w-[30%] bg-alexa"
                style={{ transformOrigin: "left" }}
              />
            </div>
          </div>
        )}
        {st.error && (
          <div className="mb-2 rounded-lg border border-coral/40 bg-coral/10 px-3 py-2 text-[12px] text-coral">
            {st.error} — nothing was rendered to fill the gap.
          </div>
        )}
        {st.payload ? (
          <TrustCard
            payload={st.payload}
            brainTags={st.brainTags}
            actions={st.actions}
            player={st.player}
            onPalette={st.setPalette}
          />
        ) : (
          <div className="stage-card p-5 text-[13px] leading-snug text-stage-ink-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-stage-ink-3">
              Trust Card · intent_lock
            </span>
            <p className="mt-2 text-[13.5px] leading-relaxed">
              The card renders the server&apos;s real answer — heard words, grounded entity, the locks and
              the eliminations — the moment a turn fires. Break a chip in the engine room, or ask anything
              in the box. Nothing here is pre-baked.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Engine-room controls: clock scrubber · chips · any-query · coda.    */
/* ------------------------------------------------------------------ */

const CHIPS: Array<{
  id: string;
  label: string;
  sub: string;
  utterance: string;
  domain?: string;
}> = [
  {
    id: "hero",
    label: "Beat 1 · Hinglish hero",
    sub: "“Sayaraa” · film · original · not the remix",
    utterance:
      "Alexa, play that 'Sayaraa' waala slow film song — woh original movie version, not the remix",
  },
  {
    id: "rule",
    label: "Beat 2 · voice rule",
    sub: "lofi instead + “after 10 PM, Saiyaara means this lofi version”",
    utterance:
      "Alexa, give me the lofi version instead — and after 10 PM, Saiyaara means this lofi version",
  },
  {
    id: "lolly",
    label: "Bhojpuri phonetics",
    sub: "Lolly Pop La Gelu — live race, any song",
    utterance: "Play Lolly Pop La Gelu original studio track",
  },
  {
    id: "despacito",
    label: "Spanglish · sin Bieber",
    sub: "Despacito, el clásico — sin Justin Bieber remix",
    utterance: "Play Despacito original — el clásico de Luis Fonsi, sin Justin Bieber remix",
  },
  {
    id: "cable",
    label: "Commerce · spec-lie trap",
    sub: "2m Thunderbolt 40Gbps — not the USB 2.0 knockoff",
    utterance: "Order a 2m Thunderbolt 40Gbps cable — not the USB 2.0 knockoff",
    domain: "commerce",
  },
  {
    id: "gibberish",
    label: "Gibberish · honest refusal",
    sub: "zxqkwjklm — the floor refuses, no crowned stranger",
    utterance: "Play zxqkwjklm acoustic remix",
  },
];

function ClockScrubber() {
  const st = useStage();
  const crossed = st.clockMin >= RULE_BOUNDARY_MIN;
  return (
    <div className="panel rounded-2xl p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-brand" />
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-faint">
          Same words, two clocks · host clock
        </span>
        <span className="ml-auto flex items-center gap-2">
          <span className="font-mono text-[20px] font-bold leading-none tabular-nums text-ink">{st.clock}</span>
          <span className={`rounded-full border px-2 py-0.5 font-mono text-[9.5px] tabular-nums ${crossed ? "border-brand/60 text-brand" : "border-hairline text-faint"}`}>
            {crossed ? "rule window: AFTER 22:00" : "rule window: before 22:00"}
          </span>
        </span>
      </div>
      <div className="relative mt-2">
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 block h-3.5 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand"
          style={{ left: "71.6%" }}
        />
        <input
          type="range"
          min={17 * 60}
          max={23 * 60 + 59}
          step={1}
          value={st.clockMin}
          onChange={(e) => st.scrubTo(Number(e.target.value), false)}
          onPointerUp={(e) => st.scrubTo(Number((e.target as HTMLInputElement).value), true)}
          onKeyUp={(e) => st.scrubTo(Number((e.target as HTMLInputElement).value), true)}
          className="scrub-range relative block w-full"
          aria-label="Device clock scrubber"
        />
      </div>
      <div className="relative mt-1 h-4 font-mono text-[9.5px] tabular-nums leading-none text-faint">
        <span className="absolute left-0 top-0">17:00</span>
        <span
          className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-brand/90"
          style={{ left: "71.6%" }}
        >
          ▲ 22:00
        </span>
        <span className="absolute right-0 top-0">23:59</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="inline-flex shrink-0 overflow-hidden rounded-lg border border-hairline" role="group" aria-label="Quick-set clock">
          <button
            onClick={() => st.scrubTo(21 * 60 + 58, true)}
            aria-pressed={!crossed}
            className={`px-2.5 py-1 text-[11px] tabular-nums transition-[background-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] ${!crossed ? "bg-brand/20 font-semibold text-ink" : "text-mute hover:bg-white/[0.04] hover:text-ink"}`}
          >
            set 21:58
          </button>
          <button
            onClick={() => st.scrubTo(22 * 60 + 5, true)}
            aria-pressed={crossed}
            className={`border-l border-hairline px-2.5 py-1 text-[11px] tabular-nums transition-[background-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] ${crossed ? "bg-brand/20 font-semibold text-ink" : "text-mute hover:bg-white/[0.04] hover:text-ink"}`}
          >
            set 22:05
          </button>
        </div>
        <span className="min-w-0 flex-1 text-[11px] leading-snug text-faint">
          Scrub across 22:00 and the SAME last utterance refires at the new host time — the server judges
          the stored rule against this clock, never its own.
        </span>
      </div>
    </div>
  );
}

function BreakMyLock() {
  const st = useStage();
  const [outcomes, setOutcomes] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");

  // Record each chip's TRUE outcome from the response it produced.
  const fireChip = async (chip: (typeof CHIPS)[number]) => {
    const resp = await st.fire(chip.utterance, chip.domain ? { domain: chip.domain } : undefined);
    const p = resp?.payload;
    if (!p) {
      setOutcomes((o) => ({ ...o, [chip.id]: `turn failed · ${resp?.error ?? "no payload"}` }));
      return;
    }
    setOutcomes((o) => ({
      ...o,
      [chip.id]:
        p.status === "locked"
          ? `locked · ${p.locked?.title ?? p.rescued ?? ""}`
          : p.status === "tie_choice"
            ? `tie · ${(p.tied ?? []).length} named`
            : "no lock · refused honestly",
    }));
  };

  return (
    <div className="panel rounded-2xl p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-brand" />
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-faint">
          Break My Lock · live any-query proof
        </span>
        <span className="ml-auto text-right text-[11px] text-faint">
          every chip fires a real /turn — the outcome printed is the one the server returned
        </span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {CHIPS.map((chip) => (
          <button
            key={chip.id}
            disabled={st.busy}
            onClick={() => void fireChip(chip)}
            className="rounded-xl border border-hairline bg-panel-2/60 px-3 py-2 text-left transition-[transform,border-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-px hover:border-brand/60 disabled:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0"
          >
            <span className="block text-[12.5px] font-semibold text-ink">{chip.label}</span>
            <span className="block truncate text-[10.5px] text-faint">{chip.sub}</span>
            {outcomes[chip.id] && (
              <span className="mt-1 flex items-center gap-1.5 font-mono text-[10px] tabular-nums text-sage">
                <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-sage" />
                <span>→ {outcomes[chip.id]}</span>
              </span>
            )}
          </button>
        ))}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!query.trim()) return;
          await st.fire(query.trim());
          setQuery("");
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask anything — any song, any spelling, any dialect…"
          className="min-w-0 flex-1 rounded-lg border border-hairline bg-black/30 px-3 py-2 text-[13px] text-ink transition-[border-color,box-shadow] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/35"
          aria-label="Any-query box"
        />
        <button
          type="submit"
          disabled={st.busy || !query.trim()}
          className="shrink-0 rounded-lg border border-brand/60 bg-brand/15 px-3.5 py-2 text-[12.5px] font-bold text-ink transition-[background-color,border-color,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-brand hover:bg-brand/25 active:translate-y-px active:bg-brand/30 disabled:translate-y-0 disabled:opacity-50"
        >
          {st.busy ? "verifying…" : "Lock it →"}
        </button>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Coda — One Schema, Three Locks. Three REAL domain turns.            */
/* ------------------------------------------------------------------ */

type CodaState =
  | { kind: "idle" }
  | { kind: "firing" }
  | { kind: "done"; resp: TurnResponse }
  | { kind: "error"; message: string };

const CODA: Array<{ domain: string; label: string; utterance: string }> = [
  {
    domain: "music",
    label: "Music",
    utterance: "Play Saiyaara — the original film version, not the remix",
  },
  {
    domain: "commerce",
    label: "Commerce",
    utterance: "Order a 2m Thunderbolt 40Gbps cable — not the USB 2.0 knockoff",
  },
  {
    domain: "grocery",
    label: "Grocery",
    utterance: "Reorder the oat milk I locked — never almond, no sponsored swaps",
  },
];

function domainAcknowledged(domain: string, resp: TurnResponse): boolean {
  // The ONLY honest acknowledgment is the payload's own domain stamp:
  // the orchestrator echoes the requested domain at the top level even
  // when the answer came from the music pipeline (measured live:
  // commerce echoed "commerce" over a music no_lock). Music is the
  // engine's native domain — its payloads predate the stamp.
  if (resp.payload?.domain === domain) return true;
  if (domain === "music" && resp.payload && resp.payload.domain == null) return true;
  return false;
}

function CodaCard({ def }: { def: (typeof CODA)[number] }) {
  const sim = useSim();
  const stage = useStage();
  const [state, setState] = useState<CodaState>({ kind: "idle" });

  const run = async () => {
    setState({ kind: "firing" });
    // Round 2 (D5): coda calls are stage tool calls too — they log to
    // the terminal through the same path fire() uses, no silent lane.
    stage.noteTurnStart(def.utterance, { domain: def.domain });
    try {
      const resp = await fireTurn({
        utterance: def.utterance,
        domain: def.domain,
        chaos_fault: sim.activeChaosFault,
      });
      stage.noteTurnEnd(resp);
      setState({ kind: "done", resp });
    } catch (e) {
      stage.noteTurnEnd({ error: (e as Error).message, payload: null });
      setState({ kind: "error", message: (e as Error).message });
    }
  };

  return (
    <div className="rounded-xl border border-hairline bg-panel-2/60 p-3">
      <div className="flex items-center gap-2">
        <span className="text-[12.5px] font-bold text-ink">{def.label}</span>
        <span className="rounded border border-hairline bg-white/[0.06] px-1.5 py-0.5 font-mono text-[9.5px] tabular-nums uppercase text-faint">
          domain: {def.domain}
        </span>
        <button
          onClick={run}
          disabled={state.kind === "firing"}
          className="ml-auto rounded-lg border border-brand/50 bg-brand/10 px-2.5 py-1 text-[11px] font-semibold text-ink transition-[background-color,border-color,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-brand/70 hover:bg-brand/20 active:translate-y-px active:bg-brand/25 disabled:translate-y-0 disabled:opacity-50"
        >
          {state.kind === "firing" ? "firing…" : "fire →"}
        </button>
      </div>
      <div className="mt-1.5 text-[11px] italic leading-snug text-faint">“{def.utterance}”</div>
      {state.kind === "done" && domainAcknowledged(def.domain, state.resp) && state.resp.payload && (
        <div className="mt-2 rounded-lg border border-sage/30 bg-sage/[0.06] px-2.5 py-2 text-[12px] leading-snug text-ink">
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-sage" />
            <span className="shrink-0 font-mono text-[10px] tabular-nums uppercase text-sage">{state.resp.payload.status}</span>
            {state.resp.payload.locked && (
              <span>
                · {state.resp.payload.locked.title}
                {state.resp.payload.locked.artist ? ` — ${state.resp.payload.locked.artist}` : ""}
              </span>
            )}
          </span>
          {(state.resp.payload.eliminated ?? []).length > 0 && (
            <div className="mt-1 text-[11px] text-mute">
              {(state.resp.payload.eliminated ?? []).length} eliminated:{" "}
              {(state.resp.payload.eliminated ?? [])
                .slice(0, 2)
                .map((r) => r.reason)
                .filter(Boolean)
                .join(" · ")}
            </div>
          )}
        </div>
      )}
      {state.kind === "done" && !domainAcknowledged(def.domain, state.resp) && (
        <div className="mt-2 rounded-lg border border-brand/30 bg-brand/[0.05] px-2.5 py-2 text-[11.5px] leading-snug text-mute">
          <span className="font-semibold text-brand">Domain adapter pending.</span> The call above was really
          fired, but the answer did not come back stamped from the{" "}
          <span className="font-mono">{def.domain}</span> adapter — so this card shows no lock rather than
          dress another pipeline&apos;s answer in this domain&apos;s clothes.
          {state.resp.response_text && (
            <span className="mt-0.5 block text-faint">Engine answered: “{state.resp.response_text}”</span>
          )}
        </div>
      )}
      {state.kind === "error" && (
        <div className="mt-2 flex items-start gap-1.5 text-[11.5px] leading-snug text-coral">
          <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-coral" />
          <span>turn failed: {state.message}</span>
        </div>
      )}
    </div>
  );
}

function Coda() {
  return (
    <div className="panel rounded-2xl p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-brand" />
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-faint">
          Coda · One Schema, Three Locks
        </span>
        <span className="ml-auto text-right text-[11px] text-faint">
          three real tools/call turns over the same schema — no fixtures, no pattern preview
        </span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-3">
        {CODA.map((def) => (
          <CodaCard key={def.domain} def={def} />
        ))}
      </div>
    </div>
  );
}

export function IntentLockControls() {
  return (
    <div className="flex flex-col gap-3">
      <ClockScrubber />
      <BreakMyLock />
      <Coda />
    </div>
  );
}
