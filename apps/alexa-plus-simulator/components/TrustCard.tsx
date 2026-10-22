/**
 * THE TRUST CARD (Wave 3) — the MCP App view of Intent Lock, rendered
 * on the stage from the REAL intent_lock payload of the last /turn.
 *
 * Rendering law (JUDGMENT + SYNTHESIS + founder correction 21 Oct):
 *  - The Morph: Heard ➔ Grounded. The middle step is captioned
 *    "sound form (PanPhon features)" — the pipeline's real IPA pair,
 *    never a prettier invention.
 *  - Score hierarchy is DISPLAY LAW, in this order, always:
 *      1. Lock Score: NN (Floor: 60 — Passed +N)
 *      2. Consonant Skeleton: NN%
 *      3. Articulatory Features: NN%
 *    Values come from payload.grounding — never hardcoded. Absent
 *    fields hide; nothing is estimated to fill a gap.
 *  - Two-tone grammar: SOLID pills are server-enforced (operators[]
 *    from the Universal Sub-Local Grammar, else the vetoes[] the
 *    server itself derived); HOLLOW pills are brain-parsed structure
 *    (include/exclude tags the host proposed and the server checked).
 *  - Every eliminated row is a real catalog row with its real reason.
 *  - Playback is Hook-First from the payload's own preview_url, and
 *    Warmth Shift is labelled presentation DSP — never a version.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import {
  artwork600,
  provenanceLabel,
  type ElimRow,
  type IntentLockPayload,
  type LockRow,
} from "../lib/turn";
import { HookPlayer, type HookAnalysis, type PlayHandle } from "../workers/hook_player";

export interface TrustCardActions {
  pin: (row: LockRow) => void;
  reject: (row: LockRow) => void;
  tasteLock: (row: LockRow) => void;
  busy: boolean;
}

const OP_LABELS: Record<string, string> = {
  OP_VETO: "HARD VETO",
  HARD_VETO: "HARD VETO",
  OP_HARD_VETO: "HARD VETO",
  OP_CANONICAL_ORIGIN: "CANONICAL ORIGIN",
  CANONICAL_ORIGIN: "CANONICAL ORIGIN",
  OP_EXACT_LOCK: "EXACT LOCK",
  EXACT_LOCK: "EXACT LOCK",
  OP_EXACT_ONLY: "EXACT LOCK",
  OP_CONTEXT_ANCHOR: "CONTEXT ANCHOR",
  CONTEXT_ANCHOR: "CONTEXT ANCHOR",
  OP_VARIANT_CLASS: "VARIANT CLASS",
};
const OP_GLYPHS: Record<string, string> = {
  HARD_VETO: "✕",
  OP_VETO: "✕",
  CANONICAL_ORIGIN: "t₀",
  OP_ORIGIN: "t₀",
  EXACT_LOCK: "≡",
  OP_EXACT_LOCK: "≡",
  EXACT_ONLY: "≡",
  CONTEXT_ANCHOR: "@",
  OP_ANCHOR: "@",
  VARIANT_CLASS: "Δ",
  OP_VARIANT_CLASS: "Δ",
};

function opLabel(op: string): string {
  return OP_LABELS[op] ?? op.replace(/^OP_/, "").replace(/_/g, " ");
}

/* ------------------------------------------------------------------ */
/* Score hierarchy — order is law.                                     */
/* ------------------------------------------------------------------ */

function ScoreHierarchy({ payload }: { payload: IntentLockPayload }) {
  const g = payload.grounding;
  if (!g) return null;
  const lockPct = g.lock_score != null ? Math.round(g.lock_score * 100) : null;
  const floorPct = g.floor != null ? Math.round(g.floor * 100) : null;
  const skeleton = g.vpps_pct != null ? Math.round(g.vpps_pct) : null;
  const articulatory = g.phonetic_pct != null ? Math.round(g.phonetic_pct) : null;
  if (lockPct == null && skeleton == null && articulatory == null) return null;
  const passed = lockPct != null && floorPct != null ? lockPct - floorPct : null;
  const missedFloor = passed != null && passed < 0;
  return (
    <div className="mt-3 rounded-xl bg-black/25 px-3.5 py-3" aria-label="Lock scores">
      {lockPct != null && (
        <div>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-stage-ink-3">
                Lock Score
              </div>
              {floorPct != null && (
                <div
                  className={`mt-1 text-[12px] font-semibold tabular-nums ${missedFloor ? "text-coral" : "text-sage"}`}
                >
                  Floor: {floorPct} — {missedFloor ? `Missed by ${Math.abs(passed ?? 0)}` : `Passed +${passed ?? 0}`}
                </div>
              )}
            </div>
            <div className="shrink-0 text-[32px] font-extrabold leading-none text-stage-ink tabular-nums">
              {lockPct}
            </div>
          </div>
          {floorPct != null && (
            <div className="relative mt-2.5 h-1.5 rounded-full bg-white/10">
              <div
                className={`h-full rounded-full ${missedFloor ? "bg-coral" : "bg-sage"}`}
                style={{ width: `${Math.min(100, lockPct)}%` }}
              />
              <div
                className={`absolute -top-0.5 h-2.5 w-0.5 ${missedFloor ? "bg-coral" : "bg-white/80"}`}
                style={{ left: `${floorPct}%` }}
                title={`never-guess floor ${floorPct}`}
              />
            </div>
          )}
        </div>
      )}
      {(skeleton != null || articulatory != null) && (
        <div className="mt-3 space-y-1.5 border-t border-white/[0.07] pt-2.5">
          {skeleton != null && (
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="text-stage-ink-2">Consonant Skeleton</span>
              <span className="font-semibold text-stage-ink tabular-nums">{skeleton}%</span>
            </div>
          )}
          {articulatory != null && (
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="text-stage-ink-2">Articulatory Features</span>
              <span className="font-semibold text-stage-ink tabular-nums">{articulatory}%</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pills — solid = server-enforced, hollow = brain-parsed.             */
/* ------------------------------------------------------------------ */

function Pills({ payload, brainTags }: { payload: IntentLockPayload; brainTags?: { include?: string[]; exclude?: string[] } }) {
  const ops = payload.operators ?? null;
  const vetoes = payload.vetoes ?? payload.constraints_echo?.vetoes ?? [];
  const include = payload.constraints_echo?.include_tags ?? brainTags?.include ?? [];
  const exclude = payload.constraints_echo?.exclude_tags ?? brainTags?.exclude ?? [];
  // Vetoes the operator list does not already name (by target or
  // token) still deserve their own solid pill — they are enforced.
  const opWords = new Set(
    (ops ?? []).flatMap((o) => [(o.target ?? "").toLowerCase(), (o.token ?? "").toLowerCase()])
  );
  const extraVetoes = ops && ops.length > 0 ? vetoes.filter((v) => !opWords.has(v.toLowerCase())) : vetoes;
  const hasSolid = (ops && ops.length > 0) || extraVetoes.length > 0;
  const hasHollow = include.length > 0 || exclude.length > 0;
  if (!hasSolid && !hasHollow) return null;
  const solidCls =
    "rounded-full bg-alexa px-2 py-0.5 text-[10.5px] leading-snug font-bold text-[#04263b] shadow-[0_1px_6px_rgba(0,202,255,0.18)]";
  return (
    <div className="mt-3 space-y-1.5">
      {hasSolid && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-stage-ink-3">
            server-enforced
          </span>
          {(ops ?? []).map((o, i) => {
            const label = opLabel(o.op);
            const glyph = OP_GLYPHS[o.op] ?? (o.code ? OP_GLYPHS[o.code] : undefined) ?? "•";
            const headline = (o.target || o.token || "").toUpperCase();
            return (
              <span key={`op-${i}`} className={solidCls}>
                {glyph} {headline} — {label}
                {o.locale || o.token
                  ? ` [${o.locale ?? ""}${o.locale && o.token ? ": " : ""}${o.token ? `"${o.token}"` : ""} → ${o.code ?? o.op}]`
                  : ""}
              </span>
            );
          })}
          {extraVetoes.map((v, i) => (
            <span key={`veto-${i}`} className={solidCls}>
              ✕ {v.toUpperCase()} — HARD VETO · your words
            </span>
          ))}
        </div>
      )}
      {hasHollow && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-stage-ink-3">
            brain-parsed
          </span>
          {include.map((t, i) => (
            <span key={`in-${i}`} className="rounded-full border border-stage-ink-3/50 px-2 py-0.5 text-[10.5px] leading-snug text-stage-ink-2">
              + {t}
            </span>
          ))}
          {exclude.map((t, i) => (
            <span key={`ex-${i}`} className="rounded-full border border-stage-ink-3/50 px-2 py-0.5 text-[10.5px] leading-snug text-stage-ink-2">
              − {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hook-first player strip (lives inside the locked row's card).       */
/* ------------------------------------------------------------------ */

function HookStrip({
  row,
  player,
  onPalette,
}: {
  row: LockRow;
  player: HookPlayer;
  onPalette?: (colors: string[] | null) => void;
}) {
  const [analysis, setAnalysis] = useState<HookAnalysis | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [warmth, setWarmth] = useState(false);
  const handleRef = useRef<PlayHandle | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const attemptedRef = useRef<string | null>(null);
  const isLofi = /lo\s?-?fi/i.test(row.version ?? "") || /lo\s?-?fi/i.test(row.title ?? "");
  const previewUrl = row.preview_url ?? null;
  const trackKey = `${row.source ?? ""}:${row.track_id ?? row.title}`;

  const stopViz = () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  const drawEnvelope = (a: HookAnalysis, progressSec: number | null) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx2d = cv.getContext("2d");
    if (!ctx2d) return;
    const W = cv.width;
    const H = cv.height;
    ctx2d.clearRect(0, 0, W, H);
    const n = a.envelope.length;
    const hookStep = Math.floor(a.hookStartSec / a.stepSec);
    const winSteps = Math.round(8 / a.stepSec);
    const max = Math.max(0.05, ...Array.from(a.envelope));
    for (let i = 0; i < n; i++) {
      const x = (i / n) * W;
      const h = Math.max(1, (a.envelope[i] / max) * (H - 6));
      const inHook = i >= hookStep && i < hookStep + winSteps;
      ctx2d.fillStyle = inHook ? "rgba(0,202,255,0.85)" : "rgba(143,235,255,0.28)";
      ctx2d.fillRect(x, H - h, Math.max(1, W / n - 0.5), h);
    }
    if (progressSec != null) {
      const x = (progressSec / a.durationSec) * W;
      ctx2d.fillStyle = "#fafafa";
      ctx2d.fillRect(x, 0, 1.5, H);
    }
  };

  const startViz = (handle: PlayHandle, a: HookAnalysis) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx2d = cv.getContext("2d");
    if (!ctx2d) return;
    const freq = new Uint8Array(handle.analyser.frequencyBinCount);
    const loop = () => {
      const ctxNow = player.context;
      if (!ctxNow) return;
      handle.analyser.getByteFrequencyData(freq);
      const W = cv.width;
      const H = cv.height;
      ctx2d.clearRect(0, 0, W, H);
      const bars = 56;
      for (let i = 0; i < bars; i++) {
        const bin = Math.floor(Math.pow(i / bars, 1.6) * freq.length * 0.72);
        const v = freq[bin] / 255;
        const h = Math.max(1, v * (H - 4));
        ctx2d.fillStyle = "rgba(0,202,255,0.8)";
        ctx2d.fillRect((i / bars) * W, H - h, W / bars - 1.5, h);
      }
      // playhead over the envelope's timeline
      const t = handle.offsetSec + (ctxNow.currentTime - handle.startedAtCtxTime);
      const x = (t / a.durationSec) * W;
      ctx2d.fillStyle = "rgba(250,250,250,0.9)";
      ctx2d.fillRect(x, 0, 1.5, H);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  };

  const play = async (a: HookAnalysis, warm: boolean) => {
    try {
      const handle = player.play(a, {
        fromHook: true,
        warmth: warm,
        onEnded: () => {
          setPlaying(false);
          stopViz();
          drawEnvelope(a, null);
        },
      });
      handleRef.current = handle;
      setPlaying(true);
      startViz(handle, a);
    } catch {
      setPlaying(false);
    }
  };

  const load = async (autoplay: boolean) => {
    if (!previewUrl) return;
    setLoading(true);
    setLoadErr(null);
    try {
      const a = await player.load(previewUrl);
      setAnalysis(a);
      drawEnvelope(a, null);
      if (autoplay && player.context?.state === "running") {
        await play(a, warmth);
      }
    } catch (e) {
      setLoadErr(
        `preview could not be decoded in this browser (${(e as Error).message}) — the lock stands; the audio hop is the browser's, not the server's.`
      );
    } finally {
      setLoading(false);
    }
  };

  // New lock → analyze its preview; autoplay only if a prior gesture
  // already unlocked the AudioContext (browsers forbid cold autoplay,
  // and the card never pretends a silent play happened).
  useEffect(() => {
    if (!previewUrl) return;
    if (attemptedRef.current === trackKey) return;
    attemptedRef.current = trackKey;
    setAnalysis(null);
    setPlaying(false);
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackKey]);

  useEffect(
    () => () => {
      stopViz();
      handleRef.current?.stop();
    },
    []
  );

  // Room Glow palette from the real artwork (canvas-sampled). A tainted
  // canvas (no CORS) yields no palette — the glow simply stays off.
  useEffect(() => {
    if (!row.artwork_url || !onPalette) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = 8;
        c.height = 8;
        const g = c.getContext("2d");
        if (!g) return;
        g.drawImage(img, 0, 0, 8, 8);
        const d = g.getImageData(0, 0, 8, 8).data;
        const buckets = new Map<string, { r: number; g: number; b: number; n: number; sat: number }>();
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i];
          const gg = d[i + 1];
          const b = d[i + 2];
          const key = `${r >> 5},${gg >> 5},${b >> 5}`;
          const mx = Math.max(r, gg, b);
          const mn = Math.min(r, gg, b);
          const sat = mx === 0 ? 0 : (mx - mn) / mx;
          const cur = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0, sat: 0 };
          cur.r += r;
          cur.g += gg;
          cur.b += b;
          cur.n += 1;
          cur.sat += sat;
          buckets.set(key, cur);
        }
        const ranked = [...buckets.values()]
          .map((b) => ({
            rgb: `rgb(${Math.round(b.r / b.n)}, ${Math.round(b.g / b.n)}, ${Math.round(b.b / b.n)})`,
            score: b.n * (0.35 + b.sat / Math.max(1, b.n)),
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 2)
          .map((b) => b.rgb);
        if (ranked.length) onPalette(ranked);
      } catch {
        /* tainted canvas — no glow, honestly absent */
      }
    };
    img.src = artwork600(row.artwork_url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.artwork_url]);

  if (!previewUrl) {
    return (
      <div className="mt-2 text-[11px] text-stage-ink-3">
        no 30s preview in the catalog row — nothing to play, nothing faked.
      </div>
    );
  }

  const togglePlay = async () => {
    if (playing) {
      handleRef.current?.stop();
      setPlaying(false);
      stopViz();
      if (analysis) drawEnvelope(analysis, null);
      return;
    }
    player.ensureCtx();
    if (!analysis) {
      await load(true);
      return;
    }
    await play(analysis, warmth);
  };

  const toggleWarmth = async () => {
    const next = !warmth;
    setWarmth(next);
    if (playing && analysis) {
      handleRef.current?.stop();
      stopViz();
      await play(analysis, next);
    }
  };

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={togglePlay}
          aria-label={playing ? "Stop preview playback" : "Play preview from the hook"}
          className="rounded-full bg-alexa px-3.5 py-1.5 text-[12.5px] font-bold text-[#04263b] shadow-[0_4px_16px_rgba(0,202,255,0.4)] transition-colors duration-150 hover:bg-cyan-soft active:bg-alexa-deep active:text-white"
        >
          {loading ? "decoding preview…" : playing ? "⏸ stop" : analysis ? `▶ play from the hook · ${analysis.hookStartSec.toFixed(1)}s` : "▶ fetch + play the hook"}
        </button>
        {isLofi && (
          <button
            onClick={toggleWarmth}
            className={
              "rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors duration-150 active:bg-alexa/30 " +
              (warmth
                ? "border-alexa bg-alexa/20 text-cyan-soft"
                : "border-stage-line text-stage-ink-2 hover:border-alexa/60 hover:text-stage-ink")
            }
            aria-pressed={warmth}
            aria-label="Toggle Warmth Shift presentation DSP"
          >
            Warmth Shift {warmth ? "on" : "off"}
          </button>
        )}
        {analysis && (
          <span className="font-mono text-[10px] text-stage-ink-3">
            hook = best sustained 8s window of the real preview&apos;s RMS envelope · {analysis.durationSec.toFixed(1)}s preview
          </span>
        )}
      </div>
      {isLofi && (
        <div className="mt-1 text-[10.5px] text-stage-ink-3">
          Warmth Shift is presentation DSP over this same LoFi preview (convolver warmth + vinyl + measured gain
          compensation) — never a different version.
        </div>
      )}
      <div className="mt-2 overflow-hidden rounded-lg border border-stage-line/60 bg-stage-deep/70 shadow-[inset_0_1px_0_rgba(143,235,255,0.06)] ring-1 ring-white/[0.04]">
        <canvas ref={canvasRef} width={560} height={46} className="block h-[46px] w-full bg-black/20" aria-label="Preview waveform" />
      </div>
      {loadErr && (
        <div className="mt-1.5 text-[12px] leading-relaxed text-stage-ink-2">
          {loadErr}{" "}
          <a href={previewUrl} target="_blank" rel="noreferrer" className="font-medium text-coral underline underline-offset-2 hover:text-stage-ink">
            open the raw preview ↗
          </a>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One catalog row (locked / tied / eliminated share the grammar).     */
/* ------------------------------------------------------------------ */

function RowBadges({ row }: { row: LockRow }) {
  const prov = provenanceLabel(row);
  return (
    <span className="flex shrink-0 flex-wrap justify-end gap-1">
      {row.source_name && (
        <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-stage-ink-2">
          {row.source_name}
        </span>
      )}
      {prov && (
        <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-stage-ink-3">
          {prov}
        </span>
      )}
    </span>
  );
}

function RowTitle({ row, dim }: { row: LockRow; dim?: boolean }) {
  return (
    <div className="min-w-0">
      <div className={`truncate text-[15px] font-semibold leading-tight ${dim ? "text-stage-ink-2" : "text-stage-ink"}`}>
        {row.title}
      </div>
      <div className="truncate text-[12px] leading-tight text-stage-ink-3">
        {row.artist}
        {row.version ? ` · ${row.version}` : ""}
        {row.year ? ` · ${row.year}` : ""}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tie identity — a tied row is a CHOICE, so its distinguishing facts */
/* (film, year, version) render as chips that can never be truncated */
/* away, and title/artist wrap instead of clipping. The film identity */
/* rides in the row's version string ('From "Ek Tha Tiger"') or an    */
/* explicit collection/album/film field when the server sends one.   */
/* ------------------------------------------------------------------ */

function filmIdentity(row: LockRow): string | null {
  const rec = row as Record<string, unknown>;
  for (const key of ["collection", "album", "film"]) {
    const v = rec[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  const m = /^from\s+["“](.+?)["”]\s*$/i.exec((row.version ?? "").trim());
  return m ? m[1] : null;
}

function TieIdentity({ row }: { row: LockRow }) {
  const film = filmIdentity(row);
  const showVersion = row.version && !film ? row.version : null;
  const [artFailed, setArtFailed] = useState(false);
  return (
    <div className="flex min-w-0 items-start gap-3">
      {row.artwork_url && !artFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={artwork600(row.artwork_url)}
          alt=""
          onError={() => setArtFailed(true)}
          className="size-14 shrink-0 rounded-lg object-cover ring-1 ring-white/15"
        />
      ) : (
        <div className="vinyl-grooves flex size-14 shrink-0 items-center justify-center rounded-lg ring-1 ring-white/15">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-alexa font-mono text-[9px] font-bold text-[#04263b]">♪</span>
        </div>
      )}
      <div className="min-w-0">
        <div className="text-[15px] font-semibold leading-snug text-stage-ink">{row.title}</div>
        {row.artist && (
          <div className="mt-0.5 text-[12.5px] leading-snug text-stage-ink-2">{row.artist}</div>
        )}
        {(row.year != null || film || showVersion) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {row.year != null && (
              <span className="rounded-md bg-white/10 px-2 py-0.5 text-[11.5px] font-bold tabular-nums text-stage-ink">
                {row.year}
              </span>
            )}
            {film && (
              <span className="rounded-md border border-white/15 px-2 py-0.5 text-[11.5px] font-medium text-stage-ink-2">
                from “{film}”
              </span>
            )}
            {showVersion && (
              <span className="rounded-md border border-white/15 px-2 py-0.5 text-[11.5px] font-medium text-stage-ink-2">
                {showVersion}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The card.                                                           */
/* ------------------------------------------------------------------ */

export default function TrustCard({
  payload,
  brainTags,
  actions,
  player,
  onPalette,
}: {
  payload: IntentLockPayload;
  brainTags?: { include?: string[]; exclude?: string[] };
  actions: TrustCardActions;
  player: HookPlayer;
  onPalette?: (colors: string[] | null) => void;
}) {
  const g = payload.grounding;
  const locked = payload.locked ?? null;
  const tied = payload.tied ?? [];
  const eliminated = (payload.eliminated ?? []).slice(0, 4);
  const statusChip =
    payload.status === "locked"
      ? { text: "LOCKED", cls: "bg-sage/20 text-sage border-sage/40", dotCls: "bg-sage" }
      : payload.status === "tie_choice"
        ? { text: "TIE — YOUR CALL", cls: "bg-alexa/15 text-cyan-soft border-alexa/40", dotCls: "bg-alexa" }
        : { text: "NO LOCK — HONEST REFUSAL", cls: "bg-coral/15 text-coral border-coral/40", dotCls: "bg-coral" };

  return (
    <div className="stage-card animate-rise-in p-4" aria-label="Trust Card">
      {/* header */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-stage-ink-3">
          Trust Card · intent_lock
        </span>
        <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[9.5px] font-bold tracking-wide ${statusChip.cls}`}>
          <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${statusChip.dotCls}`} />
          {statusChip.text}
        </span>
      </div>

      {/* THE MORPH — Heard ➔ Grounded */}
      <div
        key={`${g?.ref_text ?? payload.heard ?? ""}::${payload.rescued ?? locked?.title ?? ""}`}
        className="animate-morph-in mt-2.5"
      >
        <div className="text-[13px] text-stage-ink-3">
          Heard: <span className="font-mono text-stage-ink-2">“{g?.ref_text ?? payload.heard ?? ""}”</span>
        </div>
        {g?.said_ipa && g?.locked_ipa && (
          <div className="mt-0.5 font-mono text-[10.5px] text-stage-ink-3">
            sound form (PanPhon features): /{g.said_ipa}/ → /{g.locked_ipa}/
          </div>
        )}
        <div className="mt-1 flex items-center gap-2">
          <span className="text-alexa">➔</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-stage-ink-3">Grounded</span>
        </div>
        <div className="text-balance text-[26px] font-extrabold leading-[1.05] text-stage-ink">
          {payload.rescued ?? locked?.title ?? "—"}
        </div>
      </div>

      <Pills payload={payload} brainTags={brainTags} />
      <ScoreHierarchy payload={payload} />

      {payload.rule_active && (
        <div className="mt-3 rounded-lg border border-sage/40 bg-sage/10 px-3 py-2 text-[12.5px] font-medium text-sage">
          {payload.rule_active}
        </div>
      )}

      {/* locked winner */}
      {locked && payload.status === "locked" && (
        <div className="mt-3 rounded-xl border border-sage/35 bg-sage/[0.07] p-3">
          <div className="flex items-start gap-3">
            {locked.artwork_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={artwork600(locked.artwork_url)} alt="" className="size-16 shrink-0 rounded-xl object-cover ring-1 ring-white/15" />
            ) : (
              <div className="vinyl-grooves flex size-16 shrink-0 items-center justify-center rounded-xl ring-1 ring-white/15">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-alexa font-mono text-[9px] font-bold text-[#04263b]">♪</span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <RowTitle row={locked} />
            </div>
            <RowBadges row={locked} />
          </div>
          <HookStrip row={locked} player={player} onPalette={onPalette} />
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <button
              onClick={() => actions.tasteLock(locked)}
              disabled={actions.busy}
              aria-label="Taste Lock this recording"
              className="rounded-full border border-sage/50 bg-sage/10 px-3 py-1 text-[11.5px] font-semibold text-sage transition-colors duration-150 hover:border-sage hover:bg-sage/20 active:bg-sage/30 disabled:opacity-50"
            >
              ♡ Taste Lock this recording
            </button>
          </div>
        </div>
      )}

      {/* tie — both named, nothing plays until the user/host picks */}
      {payload.status === "tie_choice" && tied.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="text-[12px] text-stage-ink-2">
            {tied.length} recordings the evidence cannot separate. Nothing plays until one is pinned — a pin is
            re-verified by the server before it locks.
          </div>
          {tied.map((row, i) => (
            <div key={`${row.source}-${row.track_id}-${i}`} className="rounded-xl border border-alexa/30 bg-alexa/[0.05] p-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <TieIdentity row={row} />
                </div>
                <RowBadges row={row} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  onClick={() => actions.pin(row)}
                  disabled={actions.busy}
                  aria-label="Pin this recording"
                  className="rounded-full bg-alexa px-3 py-1 text-[11.5px] font-bold text-[#04263b] transition-colors duration-150 hover:bg-cyan-soft active:bg-alexa-deep active:text-white disabled:opacity-50"
                >
                  📌 Pin this one
                </button>
                <button
                  onClick={() => actions.reject(row)}
                  disabled={actions.busy}
                  aria-label="Reject this recording"
                  className="rounded-full border border-coral/50 px-3 py-1 text-[11.5px] font-semibold text-coral transition-colors duration-150 hover:border-coral hover:bg-coral/10 active:bg-coral/20 disabled:opacity-50"
                >
                  ✕ Not this one
                </button>
              </div>
            </div>
          ))}
          {payload.tie_break?.by && (
            <div className="text-[11px] text-stage-ink-3">
              tie-break by {payload.tie_break.by}
              {payload.tie_break.chose ? ` — chose ${payload.tie_break.chose}` : ""}
              {payload.tie_break.why ? ` · ${payload.tie_break.why}` : ""}
            </div>
          )}
        </div>
      )}

      {/* honest refusal */}
      {payload.status === "no_lock" && (
        <div className="mt-3 rounded-xl border border-coral/30 bg-coral/[0.06] px-3 py-2.5 text-[13px] leading-snug text-stage-ink-2">
          No confident match{payload.rescued ? (
            <>
              {" "}for <span className="font-mono text-stage-ink">“{payload.rescued}”</span>
            </>
          ) : null}
          . The evidence stayed under the never-guess floor, so the engine refuses instead of crowning a
          stranger. Ask again with more of the title — it will not guess.
        </div>
      )}

      {/* transparent elimination */}
      {eliminated.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-stage-ink-3">
            Eliminated — real rows, real reasons
          </div>
          <div className="mt-1.5 space-y-1.5">
            {eliminated.map((row: ElimRow, i: number) => (
              <div key={i} className="flex items-start gap-2.5 rounded-lg bg-black/20 px-2.5 py-2 opacity-80 transition-colors duration-150 hover:bg-white/[0.07]">
                <span className="mt-0.5 shrink-0 font-mono text-[11px] text-coral">✕</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <RowTitle row={row} dim />
                    <RowBadges row={row} />
                  </div>
                  {row.reason && <div className="mt-0.5 text-[11.5px] leading-snug text-stage-ink-2">{row.reason}</div>}
                  <div className="mt-0.5 font-mono text-[9px] uppercase tracking-wide text-stage-ink-3">
                    {row.kill_channel ? `channel: ${row.kill_channel}` : ""}
                    {row.phonetic_pct != null ? ` · sound ${Math.round(row.phonetic_pct)}%` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* telemetry — fields hide when absent, never estimated */}
      {payload.telemetry && (
        <div className="mt-3 border-t border-white/[0.07] pt-2 font-mono text-[9.5px] leading-relaxed text-stage-ink-3">
          {payload.telemetry.server_total_ms != null && <>server {Math.round(payload.telemetry.server_total_ms)}ms · </>}
          {payload.telemetry.time_source && <>clock: {payload.telemetry.time_source} · </>}
          {payload.telemetry.pool != null && <>pool {payload.telemetry.pool} · </>}
          {payload.telemetry.sources &&
            Object.entries(payload.telemetry.sources)
              .map(([k, v]) => `${k}:${v.status ?? "?"}${v.rows != null ? `(${v.rows})` : ""}`)
              .join(" · ")}
        </div>
      )}
    </div>
  );
}
