/**
 * TOOL-CALL TERMINAL (Round 2, D4/D5) — Alexa, caught in the act.
 *
 * A Mac-style window on the stage that renders the two REAL data paths
 * the stage owns, as readable lines, in arrival order:
 *
 *  (a) the MCP wire — sim.frames from lib/mcp.ts. Every frame that
 *      crossed /api/mcp (initialize, tools/call, progress, results,
 *      warnings), its body parsed into an args/result summary. The full
 *      JSON of every frame lives one scroll away in the wire inspector.
 *  (b) the /turn exchange — the stage provider's term lines: the
 *      request printed at fire time (utterance/host clock are known
 *      client-side), the brain's proposal and the kernel's answer
 *      printed on arrival, values ONLY from the response (status,
 *      winner id, lock score, eliminations, measured per-hop timings,
 *      which brain actually served).
 *
 * Honesty rules: no line exists before its event happened; consecutive
 * identical housekeeping frames (resources/list|read polls) collapse
 * into one line with a ×N count, disclosed in the footer; the caret
 * shows only while a call is genuinely in flight.
 */
"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import type { WireFrame } from "../lib/mcp";
import { useSim } from "../lib/sim-context";
import type { IntentLockPayload } from "../lib/turn";
import { useStage, type TermLine } from "./IntentLockStage";

/* ------------------------------------------------------------------ */

interface ViewLine {
  key: string;
  ts: number;
  sig: string;
  count: number;
  node: ReactNode;
}

const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${d.toLocaleTimeString("en-GB")}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

function parseJson(body: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(body) as unknown;
    return v !== null && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const statusCls = (status?: string) =>
  status === "locked"
    ? "text-sage"
    : status === "tie_choice"
      ? "text-cyan-soft"
      : status === "no_lock"
        ? "text-coral"
        : "text-stage-ink";

/** The kernel's answer, one line: status · winner · id · score · toll. */
function PayloadSummary({ p }: { p: IntentLockPayload }) {
  const elim = (p.eliminated ?? []).length;
  const tied = (p.tied ?? []).length;
  const score = p.grounding?.lock_score;
  return (
    <>
      <span className={`font-semibold ${statusCls(p.status)}`}>{p.status}</span>
      {p.locked && (
        <>
          {" · "}
          <span className="font-semibold text-stage-ink">{p.locked.title}</span>{" "}
          <span className="text-stage-ink-3">id {p.locked.track_id ?? "—"}</span>
        </>
      )}
      {!p.locked && p.rescued && (
        <>
          {" · "}
          <span className="font-semibold text-stage-ink">{p.rescued}</span>
        </>
      )}
      {typeof score === "number" && (
        <>
          {" · lock "}
          <span className="text-cyan-soft">{score.toFixed(2)}</span>
        </>
      )}
      {elim > 0 && <span className="text-stage-ink-2"> · {elim} eliminated</span>}
      {tied > 0 && <span className="text-stage-ink-2"> · {tied} tied</span>}
    </>
  );
}

/** Args summary for a tools/call frame, from the frame's real body. */
function argsSummary(args: Record<string, unknown>): ReactNode {
  const parts: ReactNode[] = [];
  const utt = args.utterance;
  if (typeof utt === "string") parts.push(<span key="u" className="text-stage-ink">“{trunc(utt, 62)}”</span>);
  const hint = args.extracted_title_hint;
  if (typeof hint === "string" && hint) parts.push(<span key="h">hint “{trunc(hint, 32)}”</span>);
  const inc = args.include_tags;
  if (Array.isArray(inc) && inc.length) parts.push(<span key="i">+[{inc.join(", ")}]</span>);
  const exc = args.exclude_tags;
  if (Array.isArray(exc) && exc.length) parts.push(<span key="e">-[{exc.join(", ")}]</span>);
  const rule = args.rule as { after_time?: string; version?: string } | undefined;
  if (rule && typeof rule === "object") {
    parts.push(
      <span key="r" className="text-cyan-soft">
        rule: after {rule.after_time ?? "?"} → {rule.version ?? "?"}
      </span>
    );
  }
  const pin = args.pin as { source?: string; track_id?: string } | undefined;
  if (pin && typeof pin === "object") parts.push(<span key="p">pin {pin.source}:{pin.track_id}</span>);
  const reject = args.reject as { source?: string; track_id?: string } | undefined;
  if (reject && typeof reject === "object") parts.push(<span key="j">reject {reject.source}:{reject.track_id}</span>);
  if (!parts.length) {
    const keys = Object.keys(args).slice(0, 3);
    if (keys.length) {
      parts.push(
        <span key="k">
          {keys
            .map((k) => {
              const v = args[k];
              return `${k}=${typeof v === "string" ? trunc(v, 22) : typeof v === "number" || typeof v === "boolean" ? String(v) : "…"}`;
            })
            .join(" · ")}
        </span>
      );
    }
  }
  return parts.length ? <span className="text-stage-ink-2"> {parts.reduce<ReactNode[]>((acc, el, i) => (i === 0 ? [el] : [...acc, " · ", el]), [])}</span> : null;
}

/* ------------------------------------------------------------------ */

function frameToLine(f: WireFrame): ViewLine | null {
  const ts = Date.parse(f.t) || Date.now();
  const time = <span className="mr-2 shrink-0 text-stage-ink-3">{fmtTime(ts)}</span>;
  const ms = typeof f.ms === "number" ? <span className="text-stage-ink-3"> · {f.ms} ms</span> : null;
  const json = parseJson(f.body);

  if (f.dir === "⚠") {
    return {
      key: `f${f.n}`, ts, sig: `warn:${f.label}`, count: 1,
      node: (
        <>
          {time}
          <span className="font-semibold text-coral">⚠ {f.label.replace(/^[→←⚠]\s*/, "")}</span>
        </>
      ),
    };
  }

  if (f.dir === "C→S") {
    const method = (json?.method as string) ?? f.method ?? "";
    if (method === "tools/call") {
      const params = (json?.params ?? {}) as Record<string, unknown>;
      const name = typeof params.name === "string" ? params.name : (f.tool ?? "tool");
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      return {
        key: `f${f.n}`, ts, sig: `call:${name}`, count: 1,
        node: (
          <>
            {time}
            <span className="font-bold text-alexa">→</span>{" "}
            <span className="font-semibold text-stage-ink">tools/call</span>{" "}
            <span className="font-semibold text-cyan-soft">{name}</span>
            {argsSummary(args)}
          </>
        ),
      };
    }
    if (method === "initialize") {
      const ci = (json?.params as { clientInfo?: { name?: string } } | undefined)?.clientInfo;
      return {
        key: `f${f.n}`, ts, sig: "call:initialize", count: 1,
        node: (
          <>
            {time}
            <span className="font-bold text-alexa">→</span>{" "}
            <span className="font-semibold text-stage-ink">initialize</span>{" "}
            <span className="text-stage-ink-2">MCP 2025-11-25{ci?.name ? ` · client ${ci.name}` : ""}</span>
          </>
        ),
      };
    }
    if (method) {
      const params = (json?.params ?? {}) as Record<string, unknown>;
      const uri = typeof params.uri === "string" ? params.uri : null;
      return {
        key: `f${f.n}`, ts, sig: `call:${method}:${uri ?? ""}`, count: 1,
        node: (
          <>
            {time}
            <span className="font-bold text-alexa">→</span>{" "}
            <span className="font-semibold text-stage-ink">{method}</span>
            {uri && <span className="text-stage-ink-2"> {trunc(uri, 44)}</span>}
          </>
        ),
      };
    }
    // Non-JSON outbound (replay marker etc.) — the pusher's own words.
    return {
      key: `f${f.n}`, ts, sig: `call:raw:${f.label}`, count: 1,
      node: (
        <>
          {time}
          <span className="font-bold text-alexa">→</span>{" "}
          <span className="text-stage-ink-2">{f.label.replace(/^→\s*/, "")}</span>
        </>
      ),
    };
  }

  // S→C
  if (json) {
    const jMethod = json.method as string | undefined;
    if (jMethod === "notifications/progress") {
      const p = (json.params ?? {}) as { progress?: number; total?: number; message?: string };
      const msg = p.message ?? (typeof p.progress === "number" ? `step ${p.progress}${typeof p.total === "number" ? `/${p.total}` : ""}` : "");
      return {
        key: `f${f.n}`, ts, sig: `progress:${msg}`, count: 1,
        node: (
          <>
            {time}
            <span className="text-stage-ink-3">··· progress {msg}</span>
            {ms}
          </>
        ),
      };
    }
    const result = json.result as Record<string, unknown> | undefined;
    const sc = result?.structuredContent as IntentLockPayload | undefined;
    if (sc && typeof sc === "object" && typeof sc.status === "string") {
      return {
        key: `f${f.n}`, ts, sig: `result:${f.tool ?? ""}:${sc.status}`, count: 1,
        node: (
          <>
            {time}
            <span className="font-bold text-sage">←</span>{" "}
            {f.tool && <span className="font-semibold text-cyan-soft">{f.tool}</span>}{" "}
            <PayloadSummary p={sc} />
            {ms}
          </>
        ),
      };
    }
    const err = json.error as { code?: number; message?: string } | undefined;
    if (err) {
      return {
        key: `f${f.n}`, ts, sig: `error:${err.code ?? ""}`, count: 1,
        node: (
          <>
            {time}
            <span className="font-bold text-coral">←</span>{" "}
            <span className="font-semibold text-coral">error {err.code ?? ""}</span>
            {err.message && <span className="text-stage-ink-2"> {trunc(err.message, 90)}</span>}
            {ms}
          </>
        ),
      };
    }
    if (result) {
      const proto = typeof result.protocolVersion === "string" ? result.protocolVersion : null;
      const server = (result.serverInfo as { name?: string } | undefined)?.name;
      const content = result.content as Array<{ text?: string }> | undefined;
      const firstText = Array.isArray(content) ? content.find((c) => typeof c?.text === "string")?.text : undefined;
      const resources = result.resources as unknown[] | undefined;
      const tools = result.tools as unknown[] | undefined;
      return {
        key: `f${f.n}`, ts, sig: `result:${f.method ?? ""}:${f.tool ?? ""}`, count: 1,
        node: (
          <>
            {time}
            <span className="font-bold text-sage">←</span>{" "}
            <span className="font-semibold text-stage-ink">result</span>
            {proto && <span className="text-stage-ink-2"> · MCP {proto}{server ? ` · ${server}` : ""}</span>}
            {!proto && Array.isArray(resources) && <span className="text-stage-ink-2"> · {resources.length} resources</span>}
            {!proto && !Array.isArray(resources) && Array.isArray(tools) && <span className="text-stage-ink-2"> · {tools.length} tools</span>}
            {!proto && !Array.isArray(resources) && !Array.isArray(tools) && firstText && <span className="text-stage-ink-2"> · {trunc(firstText, 88)}</span>}
            {ms}
          </>
        ),
      };
    }
  }
  // Plain-text inbound (SSE housekeeping etc.) — label, honestly brief.
  return {
    key: `f${f.n}`, ts, sig: `in:${f.method ?? ""}:${f.tool ?? ""}`, count: 1,
    node: (
      <>
        {time}
        <span className="font-bold text-sage">←</span>{" "}
        <span className="text-stage-ink-2">{f.label.replace(/^←\s*/, "")}</span>
        {ms}
      </>
    ),
  };
}

function termToLine(l: TermLine): ViewLine {
  const time = <span className="mr-2 shrink-0 text-stage-ink-3">{fmtTime(l.ts)}</span>;
  if (l.kind === "call") {
    return {
      key: `t${l.id}`, ts: l.ts, sig: `turn:${l.id}`, count: 1,
      node: (
        <>
          {time}
          <span className="font-bold text-alexa">→</span>{" "}
          <span className="font-semibold text-stage-ink">/turn</span>{" "}
          <span className="text-stage-ink">“{trunc(l.utterance ?? "", 76)}”</span>{" "}
          <span className="text-stage-ink-3">
            host {l.hostTime ?? ""}
            {l.domain && l.domain !== "music" ? ` · domain ${l.domain}` : ""}
            {l.pinId ? ` · pin ${l.pinId}` : ""}
            {l.rejectId ? ` · reject ${l.rejectId}` : ""}
          </span>
        </>
      ),
    };
  }
  if (l.kind === "brain") {
    const gemini = l.source === "gemini";
    return {
      key: `t${l.id}`, ts: l.ts, sig: `turn:${l.id}`, count: 1,
      node: (
        <>
          {time}
          <span className="text-stage-ink-3">brain proposes</span>{" "}
          {l.hint && (
            <>
              <span className="text-cyan-soft">“{trunc(l.hint, 36)}”</span>{" "}
            </>
          )}
          <span className="text-stage-ink-2">
            {(l.include ?? []).map((t) => `+${t}`).join(" ")}
            {(l.include ?? []).length && (l.exclude ?? []).length ? " " : ""}
            {(l.exclude ?? []).map((t) => `−${t}`).join(" ")}
            {l.rule ? " · rule" : ""}
          </span>{" "}
          {gemini ? (
            <span className="text-cyan-soft">via {l.brainName ?? "gemini"}</span>
          ) : (
            <span className="text-coral">via local floor — Gemini didn&apos;t answer</span>
          )}
        </>
      ),
    };
  }
  if (l.kind === "answer") {
    return {
      key: `t${l.id}`, ts: l.ts, sig: `turn:${l.id}`, count: 1,
      node: (
        <>
          {time}
          <span className="font-bold text-sage">←</span>{" "}
          <span className="font-semibold text-cyan-soft">intent_lock</span>{" "}
          <span className={`font-semibold ${statusCls(l.status)}`}>{l.status}</span>
          {l.title && (
            <>
              {" · "}
              <span className="font-semibold text-stage-ink">{l.title}</span>{" "}
              <span className="text-stage-ink-3">id {l.trackId ?? "—"}</span>
            </>
          )}
          {typeof l.lockScore === "number" && (
            <>
              {" · lock "}
              <span className="text-cyan-soft">{l.lockScore.toFixed(2)}</span>
            </>
          )}
          {(l.elimCount ?? 0) > 0 && <span className="text-stage-ink-2"> · {l.elimCount} eliminated</span>}
          {(l.tiedCount ?? 0) > 0 && <span className="text-stage-ink-2"> · {l.tiedCount} tied</span>}
          <span className="text-stage-ink-3">
            {typeof l.kernelMs === "number" ? ` · kernel ${Math.round(l.kernelMs)} ms` : ""}
            {typeof l.totalMs === "number" ? ` · turn ${l.totalMs} ms` : ""}
          </span>
        </>
      ),
    };
  }
  return {
    key: `t${l.id}`, ts: l.ts, sig: `turn:${l.id}`, count: 1,
    node: (
      <>
        {time}
        <span className="font-bold text-coral">←</span>{" "}
        <span className="font-semibold text-coral">turn failed</span>{" "}
        <span className="text-stage-ink-2">{trunc(l.message ?? "", 100)}</span>
      </>
    ),
  };
}

/* ------------------------------------------------------------------ */

export default function ToolCallTerminal() {
  const sim = useSim();
  const stage = useStage();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  const lines = useMemo(() => {
    const raw: ViewLine[] = [];
    for (const f of sim.frames) {
      const l = frameToLine(f);
      if (l) raw.push(l);
    }
    for (const t of stage.termLines) raw.push(termToLine(t));
    raw.sort((a, b) => a.ts - b.ts);
    // Collapse consecutive identical housekeeping (resource polls) —
    // disclosed in the footer; the wire inspector keeps every frame.
    const folded: ViewLine[] = [];
    for (const l of raw) {
      const last = folded[folded.length - 1];
      if (last && last.sig === l.sig && (l.sig.startsWith("call:resources") || l.sig.startsWith("result:resources"))) {
        last.count += 1;
        last.ts = l.ts;
        last.key = l.key;
        last.node = l.node;
      } else {
        folded.push({ ...l });
      }
    }
    return folded.slice(-44);
  }, [sim.frames, stage.termLines]);

  const wireInFlight = sim.frames.length > 0 && sim.frames[sim.frames.length - 1].dir === "C→S";
  const inFlight = stage.turnPhase === "inflight" || wireInFlight;
  const lastKey = lines.length ? lines[lines.length - 1].key : "";

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [lines.length, lastKey, inFlight]);

  const conn = {
    live: { dot: "bg-alexa shadow-[0_0_8px_rgba(0,202,255,0.9)]", text: "session live" },
    connecting: { dot: "bg-stage-ink-3", text: "connecting…" },
    reconnecting: { dot: "bg-stage-ink-3", text: "reconnecting…" },
    down: { dot: "bg-coral", text: "wire down" },
  }[sim.connection];

  return (
    <section
      aria-label="Live tool-call terminal — every line is a real call or frame"
      className="overflow-hidden rounded-2xl border border-stage-line/60 bg-[#08131d]/95 shadow-[0_18px_44px_rgba(0,0,0,0.42)]"
    >
      {/* Mac chrome — desaturated dots are window furniture, not data */}
      <div className="flex h-10 items-center gap-2 border-b border-stage-line/40 bg-white/[0.04] px-3.5">
        <span aria-hidden className="flex gap-1.5">
          <span className="size-3 rounded-full bg-[#c65b54]/80" />
          <span className="size-3 rounded-full bg-[#c7a23f]/80" />
          <span className="size-3 rounded-full bg-[#4fae72]/80" />
        </span>
        <span className="ml-1.5 truncate font-mono text-[11px] tabular-nums text-stage-ink-2">
          alexa — live tool calls · intent_lock
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 font-mono text-[10.5px] tabular-nums text-stage-ink-3">
          <span aria-hidden className={`size-1.5 rounded-full ${conn.dot}`} />
          {conn.text}
        </span>
      </div>

      <div
        ref={scrollRef}
        role="log"
        aria-live="off"
        aria-label="Tool calls as they happen"
        onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 56;
        }}
        className="scroll-stage h-[248px] overflow-y-auto px-3.5 py-2.5 font-mono text-[11.5px] leading-[1.6] tabular-nums"
      >
        {lines.length === 0 && (
          <div className="pt-2 text-stage-ink-3">
            {"// no calls yet — fire a chip in the engine room and watch her work."}
          </div>
        )}
        {lines.map((l) => (
          <div key={l.key} className="flex whitespace-nowrap">
            <span className="min-w-0 truncate">
              {l.node}
              {l.count > 1 && <span className="text-stage-ink-3"> ×{l.count}</span>}
            </span>
          </div>
        ))}
        {inFlight && (
          <div className="flex items-center gap-2 pt-0.5" aria-hidden>
            <span className="animate-term-blink text-alexa">▊</span>
            <span className="text-stage-ink-3">in flight — the answer lands here the moment it arrives</span>
          </div>
        )}
      </div>

      <div className="border-t border-stage-line/40 px-3.5 py-1.5 font-mono text-[10px] tabular-nums text-stage-ink-3">
        readable layer · repeats collapse · every raw frame lives in the wire inspector below
      </div>
    </section>
  );
}
