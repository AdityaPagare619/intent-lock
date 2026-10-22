/**
 * The Living Ring — Alexa's presence, rebuilt in her own grammar
 * (audit-2 §4.1 state table + audit-3 §C1 state map).
 *
 * Form: a luminous azure→blue gradient core wrapped in an Echo-style
 * light ring, rendered on ONE canvas (Canvas-2D renderer — the audit's
 * designated fallback; state semantics identical to the shader spec).
 * The RING carries state, exactly as on Echo hardware:
 *   idle      → near-dark, slow irregular breath (she is not attending)
 *   listening → cyan wedge opens at the base, widening with REAL mic level
 *   thinking  → light travels around the ring (~1.1s/rev) — a tool call
 *               is in flight on the real wire
 *   speaking  → soft base pulse synced to level / labeled SIM cadence
 *   yield     → everything DIPS to ~35% luminance, stays in the blue
 *               family — she lowers her light-voice (Graceful Yield)
 *   banter    → dims to ~15%, desaturates — light low = not attending
 *   refused   → dim + contracted + desaturated (Round 2): a no_lock is
 *               the kernel working as designed — she withdraws rather
 *               than guess; never dressed as an error
 *
 * Laws honored: states MORPH (every parameter lerps toward its target,
 * interruptible at any instant — no class-swap teleports); motion is
 * CAUSED (mic level comes from the real VAD via the parent's envelope
 * ref; silence in = stillness out); reduced motion renders one static
 * frame per state change (Tier 3 keeps color + geometry).
 */
"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { OrbState } from "../lib/sim-context";

export type PresenceState = OrbState | "thinking" | "refused";

interface PresenceParams {
  bright: number;   // overall luminance 0..1.1
  churn: number;    // core gradient churn rate
  wedge: number;    // listening wedge amount 0..1
  travel: number;   // thinking travel amount 0..1
  pulse: number;    // speaking base-pulse amount 0..1
  contract: number; // core scale multiplier (yield dip)
  sat: number;      // saturation 0..1 (banter desaturates)
  level: number;    // smoothed real audio level 0..1
  t: number;        // seconds, monotonic
  travelAngle: number;
}

interface Targets {
  bright: number; churn: number; wedge: number; travel: number;
  pulse: number; contract: number; sat: number;
}

const TARGETS: Record<PresenceState, Targets> = {
  idle:      { bright: 0.34, churn: 0.22, wedge: 0, travel: 0, pulse: 0,    contract: 1.0,  sat: 0.8 },
  listening: { bright: 1.0,  churn: 0.5,  wedge: 1, travel: 0, pulse: 0,    contract: 1.0,  sat: 1.0 },
  thinking:  { bright: 0.82, churn: 1.0,  wedge: 0, travel: 1, pulse: 0,    contract: 0.96, sat: 1.0 },
  speaking:  { bright: 1.05, churn: 0.7,  wedge: 0, travel: 0, pulse: 1,    contract: 1.0,  sat: 1.0 },
  yield:     { bright: 0.5,  churn: 0.3,  wedge: 0, travel: 0, pulse: 0.35, contract: 0.92, sat: 0.95 },
  banter:    { bright: 0.38, churn: 0.18, wedge: 0, travel: 0, pulse: 0,    contract: 0.98, sat: 0.3 },
  // refused (Round 2, D3): a no_lock is the product working — she
  // withdraws: dimmer than yield, contracted, desaturated toward
  // grey-blue. No travel, no wedge, no coral: not an error costume.
  refused:   { bright: 0.30, churn: 0.08, wedge: 0, travel: 0, pulse: 0,    contract: 0.88, sat: 0.35 },
};

const lerpTo = (cur: number, target: number, dt: number, tau: number) =>
  cur + (target - cur) * (1 - Math.exp(-dt / tau));

/** SIM speech cadence — permitted by audit-2 §4.1: in scripted beats the
 *  orb's STATE is real (she is "speaking" in the labeled simulation);
 *  only the amplitude source is this cadence model, never the mic. */
function simCadence(t: number): number {
  const v =
    0.38 +
    0.30 * Math.sin(t * 7.3) * Math.sin(t * 2.9 + 1.3) +
    0.18 * Math.sin(t * 13.7 + 0.6) +
    0.10 * Math.sin(t * 3.1 + 4.0);
  return Math.min(0.95, Math.max(0.06, v));
}

/**
 * Owns the presence parameter field: one rAF loop lerps every parameter
 * toward the current state's targets and smooths the real mic level
 * (attack 40ms / release 180ms, per audit-2). Both canvases (ring +
 * light bar) read the same ref — one creature, two expressions.
 */
export function usePresence(
  state: OrbState,
  thinking: boolean,
  levelRef: RefObject<number>,
  refused = false
): RefObject<PresenceParams> {
  const params = useRef<PresenceParams>({
    bright: 0.34, churn: 0.22, wedge: 0, travel: 0, pulse: 0,
    contract: 1, sat: 0.8, level: 0, t: 0, travelAngle: 0,
  });
  const stateRef = useRef<{ s: OrbState; th: boolean; rf: boolean }>({ s: state, th: thinking, rf: refused });
  stateRef.current = { s: state, th: thinking, rf: refused };

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (document.hidden) return;
      const p = params.current;
      p.t += dt;
      const eff: PresenceState = stateRef.current.rf
        ? "refused"
        : stateRef.current.th
          ? "thinking"
          : stateRef.current.s;
      const tg = TARGETS[eff];
      const tau = 0.16; // 260–450ms critically-damped-feel transitions
      p.bright = lerpTo(p.bright, tg.bright, dt, tau);
      p.churn = lerpTo(p.churn, tg.churn, dt, tau);
      p.wedge = lerpTo(p.wedge, tg.wedge, dt, tau);
      p.travel = lerpTo(p.travel, tg.travel, dt, tau);
      p.pulse = lerpTo(p.pulse, tg.pulse, dt, tau);
      p.contract = lerpTo(p.contract, tg.contract, dt, tau);
      p.sat = lerpTo(p.sat, tg.sat, dt, tau);
      p.travelAngle += dt * ((Math.PI * 2) / 1.1) * p.travel;
      // real mic level: fast attack, slower release
      const raw = Math.min(1, Math.max(0, levelRef.current ?? 0));
      const lt = raw > p.level ? 0.04 : 0.18;
      p.level = lerpTo(p.level, raw, dt, lt);
      if (eff === "speaking") {
        // SIM cadence floor while she "speaks" in the labeled simulation;
        // a live mic always wins over the model.
        const cad = simCadence(p.t) * 0.85;
        if (cad > p.level) p.level = lerpTo(p.level, cad, dt, 0.09);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [levelRef]);

  return params;
}

function useReducedMotion(): RefObject<boolean> {
  const ref = useRef(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    ref.current = mq.matches;
    const on = () => { ref.current = mq.matches; };
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return ref;
}

/** Shared canvas plumbing: DPR clamp 2, pause offscreen/hidden is the
 *  caller's draw-loop concern; returns a sized 2D context or null. */
function fitCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return null;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

const desat = (r: number, g: number, b: number, sat: number): [number, number, number] => {
  const lum = 0.3 * r + 0.55 * g + 0.15 * b;
  return [lum + (r - lum) * sat, lum + (g - lum) * sat, lum + (b - lum) * sat];
};
const rgba = (c: [number, number, number], a: number) =>
  `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

const ALEXA: [number, number, number] = [0, 202, 255];
const CYAN: [number, number, number] = [143, 235, 255];
const AZURE: [number, number, number] = [77, 124, 254];
// DEEP_BLUE is #2F7BFF — the deep end of the founder's Alexa light
// ramp (#5BD7FF → #2F7BFF). The orb lives entirely inside that ramp;
// the old out-of-family stop and churn tint are gone (founder §5,
// Jury 4 V5).
const DEEP_BLUE: [number, number, number] = [47, 123, 255];
const DEEP: [number, number, number] = [16, 34, 56];
// rim tone: DEEP lifted 30% toward DEEP_BLUE — the sphere's edge keeps
// its chromatic identity instead of dissolving into the backdrop.
const RIM: [number, number, number] = [25, 61, 116];

function drawRing(ctx: CanvasRenderingContext2D, w: number, h: number, p: PresenceParams) {
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) / 2 - 6;
  const coreR = R * 0.795 * p.contract;
  const sat = p.sat;
  ctx.clearRect(0, 0, w, h);

  // halo — luminous, colored, meaningful (audit-3 glow recipe)
  const halo = ctx.createRadialGradient(cx, cy, coreR * 0.4, cx, cy, R * 1.55);
  halo.addColorStop(0, rgba(desat(...ALEXA, sat), 0.2 * p.bright));
  halo.addColorStop(0.6, rgba(desat(...AZURE, sat), 0.095 * p.bright));
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);

  // core sphere — cyan→azure→deep-blue field with slow churn highlights
  const breath = 1 + 0.018 * (Math.sin(p.t * 0.9) + Math.sin(p.t * 0.37 + 1.7)) + 0.05 * p.level;
  const r = coreR * breath;
  const hx = cx + Math.cos(p.t * 0.23 * (0.4 + p.churn)) * r * 0.22;
  const hy = cy - r * 0.34 + Math.sin(p.t * 0.31 * (0.4 + p.churn)) * r * 0.08;
  const core = ctx.createRadialGradient(hx, hy, r * 0.05, cx, cy, r * 1.05);
  core.addColorStop(0, rgba(desat(...CYAN, sat), 0.97));
  core.addColorStop(0.38, rgba(desat(...ALEXA, sat), 0.94));
  core.addColorStop(0.72, rgba(desat(...AZURE, sat), 0.95));
  core.addColorStop(0.94, rgba(desat(...DEEP_BLUE, sat), 0.92));
  core.addColorStop(1, rgba(desat(...RIM, sat), 1));
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = core;
  // dim by richness, not transparency: the old 0.35 floor composited the
  // sphere toward the backdrop and read as translucent plastic; a 0.55
  // floor keeps idle clearly dim (bright still rules) but chromatic.
  ctx.globalAlpha = 0.55 + 0.45 * Math.min(1, p.bright);
  ctx.fill();
  ctx.globalAlpha = 1;

  // churn blob — a soft deep-blue light drifting through the core
  const bx = cx + Math.cos(p.t * 0.41 * (0.3 + p.churn) + 2.1) * r * 0.42;
  const by = cy + Math.sin(p.t * 0.53 * (0.3 + p.churn)) * r * 0.38;
  const blob = ctx.createRadialGradient(bx, by, 0, bx, by, r * 0.75);
  blob.addColorStop(0, rgba(desat(...DEEP_BLUE, sat), 0.30 * p.bright));
  blob.addColorStop(1, "rgba(0,0,0,0)");
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = blob;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();

  // specular — a soft glass highlight riding the same light position as
  // the gradient's hot spot; sells the sphere's curvature.
  const spec = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 0.55);
  spec.addColorStop(0, rgba([208, 246, 255], 0.1 + 0.13 * Math.min(1, p.bright)));
  spec.addColorStop(1, "rgba(0,0,0,0)");
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = spec;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();

  // ── the ring — the state machine's voice ──
  const ringR = R * 0.915;
  const lw = Math.max(3, R * 0.075);
  ctx.lineCap = "round";

  // soft under-glow so the ring reads as light, not a painted pipe
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.strokeStyle = rgba(desat(...ALEXA, sat), 0.05 + 0.05 * p.bright);
  ctx.lineWidth = lw * 2.3;
  ctx.stroke();

  // base ring, dim
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.strokeStyle = rgba(desat(...ALEXA, sat), 0.13 + 0.10 * p.bright);
  ctx.lineWidth = lw;
  ctx.stroke();

  // thinking: light travels around the ring (~1.1s/rev)
  if (p.travel > 0.02) {
    const a0 = p.travelAngle;
    const sweep = 1.25;
    const grad = ctx.createConicGradient
      ? ctx.createConicGradient(a0, cx, cy)
      : null;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, a0 - sweep, a0);
    if (grad) {
      grad.addColorStop(0, rgba(desat(...ALEXA, sat), 0));
      grad.addColorStop(0.85, rgba(desat(...ALEXA, sat), 0.85 * p.travel));
      grad.addColorStop(1, rgba(desat(...CYAN, sat), 0.95 * p.travel));
      ctx.strokeStyle = grad;
    } else {
      ctx.strokeStyle = rgba(desat(...CYAN, sat), 0.8 * p.travel);
    }
    ctx.lineWidth = lw * 1.15;
    ctx.shadowColor = rgba(ALEXA, 0.55);
    ctx.shadowBlur = 14 * p.travel;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // speaking: soft base pulse synced to level
  if (p.pulse > 0.02) {
    const half = 0.9 + 0.5 * p.level;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, Math.PI / 2 - half, Math.PI / 2 + half);
    ctx.strokeStyle = rgba(desat(...ALEXA, sat), (0.25 + 0.55 * p.level) * p.pulse);
    ctx.lineWidth = lw * (1 + 0.5 * p.level);
    ctx.shadowColor = rgba(ALEXA, 0.5);
    ctx.shadowBlur = 12 * p.pulse;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // listening: cyan wedge at the base, aimed at the user — its width and
  // brightness follow the REAL mic level (Amazon's published behavior)
  if (p.wedge > 0.02) {
    const half = (0.32 + 0.62 * p.level) * p.wedge;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, Math.PI / 2 - half, Math.PI / 2 + half);
    ctx.strokeStyle = rgba(desat(...CYAN, sat), (0.55 + 0.45 * p.level) * p.wedge);
    ctx.lineWidth = lw * 1.3;
    ctx.shadowColor = rgba(CYAN, 0.8);
    ctx.shadowBlur = 18 * p.wedge;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

export function LivingRing({
  params,
  state,
  thinking,
  refused = false,
  className,
}: {
  params: RefObject<PresenceParams>;
  state: OrbState;
  thinking: boolean;
  refused?: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const visibleRef = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const io = new IntersectionObserver((es) => {
      visibleRef.current = es[0]?.isIntersecting ?? true;
    });
    io.observe(canvas);
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (document.hidden || !visibleRef.current) return;
      const ctx = fitCanvas(canvas);
      if (ctx && params.current) drawRing(ctx, canvas.clientWidth, canvas.clientHeight, params.current);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [params]);

  // reduced motion: one static frame per state change (Tier 3 keeps
  // color + geometry — the wedge position still says "listening")
  useEffect(() => {
    if (!reduced.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = fitCanvas(canvas);
    if (ctx && params.current) {
      const snap = { ...params.current, ...staticSnap(state, thinking, refused) };
      drawRing(ctx, canvas.clientWidth, canvas.clientHeight, snap);
    }
  }, [state, thinking, refused, params, reduced]);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
}

function staticSnap(state: OrbState, thinking: boolean, refused = false): Partial<PresenceParams> {
  const eff: PresenceState = refused ? "refused" : thinking ? "thinking" : state;
  const tg = TARGETS[eff];
  return {
    bright: tg.bright, wedge: tg.wedge, travel: 0,
    pulse: tg.pulse, contract: tg.contract, sat: tg.sat,
    level: eff === "listening" ? 0.4 : 0.3, travelAngle: -0.6,
  };
}

/* ── The light bar — Alexa+'s bottom-edge grammar (audit-3 §A2) ── */
function drawBar(ctx: CanvasRenderingContext2D, w: number, h: number, p: PresenceParams, eff: PresenceState) {
  ctx.clearRect(0, 0, w, h);
  const cy = h / 2;
  const bh = Math.max(3, h * 0.36);
  const sat = p.sat;
  const round = (x: number, y: number, ww: number, hh: number, r: number) => {
    ctx.beginPath();
    ctx.roundRect(x, y, ww, hh, r);
  };
  // track
  round(0, cy - bh / 2, w, bh, bh / 2);
  ctx.fillStyle = "rgba(143,235,255,0.07)";
  ctx.fill();

  const dip = eff === "yield" ? 0.35 + 0.07 * Math.sin(p.t * 1.4) : eff === "banter" ? 0.15 : eff === "refused" ? 0.22 : 1;
  const seg = (x0: number, x1: number, color: [number, number, number], a: number, glow = 0) => {
    if (x1 <= x0) return;
    round(x0, cy - bh / 2, x1 - x0, bh, bh / 2);
    ctx.fillStyle = rgba(desat(...color, sat), a * dip);
    if (glow > 0) {
      ctx.shadowColor = rgba(color, 0.7);
      ctx.shadowBlur = glow;
    }
    ctx.fill();
    ctx.shadowBlur = 0;
  };

  if (eff === "idle") {
    const sw = Math.min(72, w * 0.16);
    seg(w / 2 - sw / 2, w / 2 + sw / 2, ALEXA, 0.28);
  } else if (eff === "listening") {
    seg(0, w, ALEXA, 0.20);
    const sw = (Math.min(150, w * 0.3) + w * 0.38 * p.level) * p.wedge;
    seg(w / 2 - sw / 2, w / 2 + sw / 2, CYAN, 0.65 + 0.35 * p.level, 14);
  } else if (eff === "thinking") {
    seg(0, w, ALEXA, 0.16);
    const pos = ((p.t * 0.45) % 1.35) - 0.175; // ocean wave, left → right
    const hx = pos * w;
    const hw = w * 0.17;
    const grad = ctx.createLinearGradient(hx - hw, 0, hx + hw, 0);
    grad.addColorStop(0, "rgba(0,202,255,0)");
    grad.addColorStop(0.5, rgba(desat(...CYAN, sat), 0.9 * dip));
    grad.addColorStop(1, "rgba(0,202,255,0)");
    round(0, cy - bh / 2, w, bh, bh / 2);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = grad;
    ctx.fillRect(0, cy - bh / 2, w, bh);
    ctx.restore();
  } else if (eff === "speaking") {
    const n = 24;
    const sw = w / n;
    for (let i = 0; i < n; i++) {
      const ph = Math.abs(Math.sin(i * 1.7 + p.t * 2.2)) * 0.5 + 0.5;
      const a = (0.18 + 0.5 * p.level * ph) * p.pulse;
      seg(i * sw + 1, (i + 1) * sw - 1, i % 2 ? CYAN : ALEXA, a);
    }
  } else {
    // yield (dipped) / banter (dimmed): the whole bar lowers its voice
    seg(0, w, ALEXA, 0.5);
  }
}

export function StageLightBar({
  params,
  state,
  thinking,
  refused = false,
}: {
  params: RefObject<PresenceParams>;
  state: OrbState;
  thinking: boolean;
  refused?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const visibleRef = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const io = new IntersectionObserver((es) => {
      visibleRef.current = es[0]?.isIntersecting ?? true;
    });
    io.observe(canvas);
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (document.hidden || !visibleRef.current || reduced.current) return;
      const ctx = fitCanvas(canvas);
      if (ctx && params.current) {
        const eff: PresenceState = refused ? "refused" : thinking ? "thinking" : state;
        drawBar(ctx, canvas.clientWidth, canvas.clientHeight, params.current, eff);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [params, state, thinking, refused, reduced]);

  // reduced motion: static frame per state change
  useEffect(() => {
    if (!reduced.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = fitCanvas(canvas);
    if (ctx && params.current) {
      const eff: PresenceState = refused ? "refused" : thinking ? "thinking" : state;
      const snap = { ...params.current, ...staticSnap(state, thinking, refused), t: 0.4 };
      drawBar(ctx, canvas.clientWidth, canvas.clientHeight, snap, eff);
    }
  }, [state, thinking, refused, params, reduced]);

  return <canvas ref={canvasRef} className="h-[14px] w-full" aria-hidden />;
}
