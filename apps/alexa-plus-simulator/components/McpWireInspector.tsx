/**
 * BOTTOM drawer — McpWireInspector: a real terminal for the wire.
 * Shows ONLY real HTTP frames that crossed /api/mcp — one line per
 * frame (time · direction · method/tool · status · elapsed), click a
 * line to expand its full JSON. Nothing is ever synthesized; the empty
 * state is honest, and the on-screen ring's cap is disclosed.
 *
 * The flow ribbon (Browser → :4000 → :8080) lights from REAL frame
 * metadata — the X-OmniBeat-Upstream header each response carried —
 * so a judge watches which hop actually served each answer, including
 * when the fallback served because the orchestrator was down (FM-22).
 *
 * Connection state comes from the session lifecycle (lib/session.ts):
 * the app handshakes on load; ⚡ forces a fresh one. The states are
 * reported honestly — "down" means our own handshake failed, never a
 * stale session dressed up as a dead server (FM-23).
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { WireFrame } from "../lib/mcp";
import { useSim } from "../lib/sim-context";

function pretty(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

function FrameRow({ f, expanded, onToggle }: { f: WireFrame; expanded: boolean; onToggle: () => void }) {
  // Direction reads at a glance: glyph shape, colour AND chip tint all
  // agree — outbound amber, inbound sage, fault coral — so the channel
  // never depends on colour alone.
  const dirChip =
    f.dir === "C→S" ? "bg-brand/10 text-brand"
    : f.dir === "S→C" ? "bg-sage/10 text-sage"
    : "bg-coral/10 text-coral";
  const glyph = f.dir === "C→S" ? "→" : f.dir === "S→C" ? "←" : "⚠";
  const dirLabel = f.dir === "C→S" ? "outbound" : f.dir === "S→C" ? "inbound" : "error";
  const isError =
    f.dir === "⚠" ||
    (f.status !== undefined && (/^[45]/.test(f.status) || f.status === "timeout" || f.status === "error"));
  // The scannable headline: what happened. Method+tool when the frame
  // carries them; otherwise the pusher's own label, verbatim.
  const headline = f.method
    ? f.tool
      ? `${f.method} ${f.tool}`
      : f.method
    : f.label.replace(/^[→←⚠]\s*/, "");
  const detail = f.method ? f.label.replace(/^[→←⚠]\s*/, "") : null;

  return (
    <div
      // rows land like arrivals (Audit-2 §4.6): 120ms fade-rise on mount,
      // using the house pill-in keyframes; rows are keyed by frame number
      // so only genuinely new rows animate.
      style={{ animation: "pill-in 120ms cubic-bezier(0.22, 1, 0.36, 1) both" }}
      className={`border-b border-hairline/60 ${isError ? "border-l-2 border-l-coral bg-coral/[0.04]" : "border-l-2 border-l-transparent"}`}
    >
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors duration-150 hover:bg-white/[0.045]"
        title={expanded ? "collapse" : "expand the full JSON"}
      >
        <span className="w-8 shrink-0 font-mono text-[11px] tabular-nums text-faint">#{f.n}</span>
        <span className="w-[84px] shrink-0 font-mono text-[11px] tabular-nums text-faint">{f.t.slice(11, 23)}</span>
        <span className={`inline-flex size-5 shrink-0 items-center justify-center rounded-md font-mono text-[12px] font-bold ${dirChip}`}>
          <span aria-hidden="true">{glyph}</span>
          <span className="sr-only">{dirLabel}</span>
        </span>
        <span className="truncate font-mono text-[12px] font-semibold text-ink">{headline}</span>
        {detail && detail !== headline && (
          <span className="truncate font-mono text-[11px] text-faint">{detail}</span>
        )}
        <span className="flex-1" />
        {/* status + timing are fixed-width, right-aligned tabular columns —
            empty slots keep the columns aligned across mixed rows */}
        {f.status ? (
          <span className={`w-20 shrink-0 text-right font-mono text-[11px] tabular-nums ${isError ? "text-coral" : "text-mute"}`}>{f.status}</span>
        ) : (
          <span aria-hidden="true" className="w-20 shrink-0" />
        )}
        {typeof f.ms === "number" ? (
          <span className="w-16 shrink-0 text-right font-mono text-[11px] tabular-nums text-mute">{f.ms} ms</span>
        ) : (
          <span aria-hidden="true" className="w-16 shrink-0" />
        )}
        <span aria-hidden="true" className="w-4 shrink-0 text-center font-mono text-[10px] text-faint">{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && (
        <pre className="scroll-thin mx-3 mb-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-obsidian p-2 font-mono text-[10.5px] leading-relaxed text-mute">
          {pretty(f.body)}
        </pre>
      )}
    </div>
  );
}

/** One ribbon node. Lit = a real frame's metadata says this hop served;
 * dim = not yet / not on the last frame's path. */
function RibbonNode({
  label,
  sub,
  lit,
  bypassed,
  pulse,
  down,
  busyTone,
}: {
  label: string;
  sub: string;
  lit: boolean;
  bypassed?: boolean;
  pulse?: boolean;
  /** session state the parent already computes: our handshake failed */
  down?: boolean;
  /** session state the parent already computes: a handshake is running */
  busyTone?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className={`size-2 shrink-0 rounded-full ${
          bypassed
            ? "bg-graphite"
            : down
              ? "bg-coral"
              : lit
                ? "bg-sage shadow-[0_0_8px_rgba(16,185,129,0.9)]"
                : busyTone
                  ? "bg-brand"
                  : "bg-graphite/60"
        } ${pulse ? "animate-earcon" : ""}`}
      />
      <span className={`font-mono text-[11px] font-semibold ${lit ? "text-ink" : "text-faint"}`}>{label}</span>
      <span className="font-mono text-[10px] text-faint">
        {sub}
        {bypassed ? " · bypassed" : ""}
      </span>
    </div>
  );
}

export default function McpWireInspector() {
  const {
    frames, framesTotal, clearFrames, sessionId, connection, lastEventId, reconnect,
  } = useSim();
  const [copied, setCopied] = useState(false);
  const [expandedN, setExpandedN] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [frames.length]);

  // Flow-ribbon truth, derived only from real frame metadata.
  const lastServed = useMemo(() => {
    for (let i = frames.length - 1; i >= 0; i--) {
      if (frames[i].upstream) return frames[i];
    }
    return null;
  }, [frames]);
  const inFlight = frames.length > 0 && frames[frames.length - 1].dir === "C→S";
  const viaOrchestrator = !!lastServed?.upstream?.includes(":4000");
  const viaFallback = !!lastServed && !viaOrchestrator;

  const busy = connection === "connecting" || connection === "reconnecting";

  const copySid = async () => {
    if (!sessionId) return;
    try {
      await navigator.clipboard.writeText(sessionId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* clipboard unavailable — no drama */ }
  };

  const connectionPill = {
    live: { cls: "border-sage/50 bg-sage/10 text-sage", text: "● session live" },
    connecting: { cls: "border-brand/40 bg-brand/10 text-brand", text: "◌ connecting…" },
    reconnecting: { cls: "border-brand/40 bg-brand/10 text-brand", text: "↻ session expired — reconnecting…" },
    down: { cls: "border-coral/40 bg-coral/10 text-coral", text: "● server unreachable — our handshake failed" },
  }[connection];

  return (
    <footer className="panel z-20 flex h-60 shrink-0 flex-col">
      <div className="flex items-center gap-3 border-b border-hairline px-4 py-2">
        {/* identity group: title at full ink, route summary one step down */}
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="shrink-0 whitespace-nowrap text-[11px] font-extrabold uppercase tracking-[0.18em] text-ink">
            MCP Wire Inspector
          </span>
          <span className="truncate font-mono text-[11px] text-mute">
            POST /api/mcp <span aria-hidden="true" className="text-faint">→</span> :4000 orchestrator <span aria-hidden="true" className="text-faint">→</span> :8080 MCP brain <span aria-hidden="true" className="text-faint">·</span> MCP 2025-11-25 Streamable HTTP
          </span>
        </div>
        <div className="flex-1" />

        {/* status + actions group: one grammar — pills are round, actions
            are rounded-lg, everything sits on the same 32px height */}
        <div className="flex shrink-0 items-center gap-2">
          <span className="whitespace-nowrap font-mono text-[11px] tabular-nums text-faint" title="Every frame below crossed the real wire — nothing is staged">
            frames: {framesTotal} · all real
            {lastEventId ? ` · last event ${lastEventId}` : ""}
          </span>

          <span className={`inline-flex h-8 items-center whitespace-nowrap rounded-full border px-3 font-mono text-[11px] ${connectionPill.cls}`}>
            {connectionPill.text}
          </span>

          {sessionId && (
            <button
              onClick={copySid}
              title="click to copy full session id"
              className="animate-pill-in inline-flex h-8 items-center whitespace-nowrap rounded-full border border-sage/50 bg-sage/10 px-3 font-mono text-[11px] text-sage transition-colors duration-150 hover:bg-sage/20"
            >
              {copied ? "✓ copied" : `Mcp-Session-Id: ${sessionId.slice(0, 8)}…`}
            </button>
          )}

          <button
            onClick={() => void reconnect()}
            disabled={busy}
            className={`inline-flex h-8 items-center whitespace-nowrap rounded-lg border px-3 text-[12px] font-bold transition-colors duration-150 ${
              busy
                ? "cursor-wait border-brand/40 bg-brand/10 text-brand"
                : "border-brand/50 bg-brand/15 text-ink shadow-[0_0_16px_rgba(229,142,38,0.3)] hover:bg-brand/25"
            }`}
          >
            {busy ? (
              <>
                <span className="inline-block animate-spin">⟳</span> handshaking…
              </>
            ) : (
              "⚡ Fire MCP initialize"
            )}
          </button>

          <button
            onClick={clearFrames}
            aria-label="Clear wire frames"
            className="inline-flex h-8 items-center rounded-lg border border-hairline bg-panel-2 px-3 text-[11px] text-faint transition-colors duration-150 hover:border-mute/40 hover:bg-white/[0.03] hover:text-ink"
          >
            clear
          </button>
        </div>
      </div>

      {/* flow ribbon — lights from the X-OmniBeat-Upstream header each
          real response carried; it never animates on its own behalf */}
      <div className="flex items-center gap-3 border-b border-hairline/60 px-4 py-1.5">
        <RibbonNode label="This browser" sub="the stage" lit={frames.length > 0} pulse={inFlight} busyTone={busy} />
        <span aria-hidden="true" className={`font-mono text-[11px] ${inFlight ? "animate-pulse text-brand" : lastServed ? "text-sage/60" : "text-faint"}`}>──▶</span>
        <RibbonNode
          label="Orchestrator"
          sub=":4000"
          lit={viaOrchestrator}
          bypassed={viaFallback}
          down={connection === "down"}
          busyTone={busy}
        />
        <span aria-hidden="true" className={`font-mono text-[11px] ${inFlight ? "animate-pulse text-brand" : lastServed ? "text-sage/60" : "text-faint"}`}>──▶</span>
        <RibbonNode label="OmniBeat brain" sub=":8080" lit={!!lastServed} down={connection === "down"} busyTone={busy} />
        <span className="flex-1" />
        <span className="truncate font-mono text-[10.5px] text-faint">
          {lastServed
            ? viaFallback
              ? `last answer served direct by ${lastServed.upstream} — the orchestrator didn't answer, the fallback did`
              : `last answer served by ${lastServed.upstream}`
            : "the ribbon lights from real frame metadata as answers arrive"}
        </span>
      </div>

      <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {framesTotal > frames.length && (
          <div className="border-b border-hairline/60 px-3 py-1 font-mono text-[10.5px] text-faint">
            — showing the last {frames.length} of {framesTotal} frames · older frames dropped from the
            on-screen ring; the wire itself is unchanged —
          </div>
        )}
        {frames.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
            <div className="font-mono text-[12px] text-faint">
              {"// no frames yet — this inspector only renders real HTTP frames."}
            </div>
            <div className="text-[11px] text-faint/70">
              Hit <span className="text-brand">⚡ Fire MCP initialize</span> to open a real session with the Python MCP server.
            </div>
          </div>
        ) : (
          frames.map((f) => (
            <FrameRow
              key={f.n}
              f={f}
              expanded={expandedN === f.n}
              onToggle={() => setExpandedN((cur) => (cur === f.n ? null : f.n))}
            />
          ))
        )}
      </div>
    </footer>
  );
}
