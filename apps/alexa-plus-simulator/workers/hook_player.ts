/**
 * Hook-First player + Warmth Shift (Wave 3, SYNTHESIS stagecraft).
 *
 * HOOK-FIRST: the locked track's REAL 30s preview is fetched and
 * decoded (decodeAudioData — CORS for these preview URLs was proven
 * in CORS_PROOF.md), an RMS envelope is computed over the samples, and
 * playback is cued at the HOOK: the start of the best sustained-energy
 * 8-second window. Not a fade, not a guess — a measurement of the
 * recording itself. If the decode fails, the caller says so on the
 * card and links the raw preview; nothing is substituted silently.
 *
 * WARMTH SHIFT: presentation DSP over the SAME real preview — a
 * generated-impulse convolver + gentle lowpass for warmth, a whisper
 * of generated vinyl crackle, and gain compensation measured from the
 * decoded buffer's own RMS (the LoFi Mix's preview measures ≈4.3 dB
 * under the original; the compensation is computed per-buffer, not
 * hardcoded). It is labelled on the card as presentation. It is never
 * a version, never a different recording.
 *
 * The analyser node is real: the card's bars read live frequency data
 * from the playing graph — silence draws silence.
 */

export interface HookAnalysis {
  buffer: AudioBuffer;
  durationSec: number;
  /** RMS per envelope step (step = 0.25s), linear 0..~1 */
  envelope: Float32Array;
  stepSec: number;
  /** start of the best sustained 8s window, seconds */
  hookStartSec: number;
  /** whole-buffer RMS (linear) — the gain-comp measurement */
  rms: number;
}

const STEP_SEC = 0.25;
const HOOK_WINDOW_SEC = 8;

export function analyzeHook(buffer: AudioBuffer): HookAnalysis {
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;
  const stepSamples = Math.max(1, Math.floor(buffer.sampleRate * STEP_SEC));
  const steps = Math.ceil(ch0.length / stepSamples);
  const envelope = new Float32Array(steps);
  let sumSq = 0;
  let n = 0;
  for (let s = 0; s < steps; s++) {
    const start = s * stepSamples;
    const end = Math.min(ch0.length, start + stepSamples);
    let acc = 0;
    for (let i = start; i < end; i++) {
      const v = (ch0[i] + ch1[i]) * 0.5;
      acc += v * v;
    }
    envelope[s] = Math.sqrt(acc / Math.max(1, end - start));
    sumSq += acc;
    n += end - start;
  }
  const rms = Math.sqrt(sumSq / Math.max(1, n));

  // Best sustained window: maximize the MEAN envelope over the window
  // (sustained energy, not a single transient spike).
  const winSteps = Math.max(1, Math.round(HOOK_WINDOW_SEC / STEP_SEC));
  let bestStart = 0;
  let bestMean = -1;
  const maxStart = Math.max(0, steps - winSteps);
  for (let s = 0; s <= maxStart; s++) {
    let acc = 0;
    for (let k = 0; k < winSteps; k++) acc += envelope[s + k];
    const mean = acc / winSteps;
    if (mean > bestMean) {
      bestMean = mean;
      bestStart = s;
    }
  }
  return {
    buffer,
    durationSec: buffer.duration,
    envelope,
    stepSec: STEP_SEC,
    hookStartSec: bestStart * STEP_SEC,
    rms,
  };
}

/** Warmth impulse: 1.6s stereo noise burst, exponential decay,
 *  lowpassed by construction (successive averaging) — a small-room
 *  glow, generated in code, applied to the real recording only. */
function warmthImpulse(ctx: BaseAudioContext, seconds = 1.6): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const ir = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      lp += 0.22 * (white - lp); // one-pole warmth tilt
      d[i] = lp * Math.pow(1 - i / len, 2.6) * 0.9;
    }
  }
  return ir;
}

/** Vinyl crackle bed: sparse impulses + soft surface hiss, looped.
 *  Generated — no audio file is shipped or sampled. */
function vinylBed(ctx: BaseAudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = rate * 3;
  const buf = ctx.createBuffer(1, len, rate);
  const d = buf.getChannelData(0);
  let lp = 0;
  for (let i = 0; i < len; i++) {
    const hiss = (Math.random() * 2 - 1) * 0.012;
    lp += 0.1 * (hiss - lp);
    d[i] = lp;
    if (Math.random() < 0.00045) {
      const amp = 0.12 + Math.random() * 0.25;
      const dec = 60 + Math.floor(Math.random() * 200);
      for (let k = 0; k < dec && i + k < len; k++) {
        d[i + k] += amp * (1 - k / dec) * (Math.random() < 0.5 ? -1 : 1);
      }
      i += dec;
    }
  }
  return buf;
}

export interface PlayHandle {
  stop: () => void;
  /** live frequency data for the card's bars (0..255 per bin) */
  analyser: AnalyserNode;
  startedAtCtxTime: number;
  offsetSec: number;
}

export class HookPlayer {
  private ctx: AudioContext | null = null;
  private current: { src: AudioBufferSourceNode; stop: () => void } | null = null;

  /** Create/resume the context. Must be called inside a user gesture
   *  at least once (chip click / play tap) before autoplay can sound. */
  ensureCtx(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  /** Fetch + decode a preview. Throws on network/CORS/decode failure —
   *  the caller renders the honest fallback, never a substitute. */
  async load(previewUrl: string): Promise<HookAnalysis> {
    const ctx = this.ensureCtx();
    if (!ctx) throw new Error("WebAudio unavailable in this browser");
    const res = await fetch(previewUrl);
    if (!res.ok) throw new Error(`preview fetch HTTP ${res.status}`);
    const bytes = await res.arrayBuffer();
    const buffer = await ctx.decodeAudioData(bytes);
    return analyzeHook(buffer);
  }

  /** Play an analyzed preview from its hook (or from 0). With warmth,
   *  the chain is source → lowpass → dry/wet convolver mix → measured
   *  gain compensation → analyser → out, plus the vinyl bed under it. */
  play(
    analysis: HookAnalysis,
    opts: { fromHook?: boolean; warmth?: boolean; onEnded?: () => void } = {}
  ): PlayHandle {
    const ctx = this.ensureCtx();
    if (!ctx) throw new Error("WebAudio unavailable in this browser");
    this.stop();
    const offset = opts.fromHook ? analysis.hookStartSec : 0;

    const src = ctx.createBufferSource();
    src.buffer = analysis.buffer;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.72;
    analyser.connect(ctx.destination);

    let bedSrc: AudioBufferSourceNode | null = null;

    if (opts.warmth) {
      // source → lowpass ─┬→ dry ─┐
      //                   └→ convolver → wet ─┴→ gain comp → analyser
      // vinyl bed ─────────────────────────────→ analyser
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 3900;
      lp.Q.value = 0.4;
      src.connect(lp);

      // Gain compensation, measured: lift this buffer's RMS toward a
      // −17 dBFS presentation target, clamped to a sane range. A
      // quieter pressing (the LoFi Mix) is lifted; a loud one is not
      // pushed past unity by much. The number comes from the audio.
      const target = 0.141; // ≈ −17 dBFS RMS
      const comp = ctx.createGain();
      comp.gain.value = Math.min(2.2, Math.max(0.6, target / Math.max(0.02, analysis.rms)));
      comp.connect(analyser);

      const dry = ctx.createGain();
      dry.gain.value = 0.82;
      lp.connect(dry);
      dry.connect(comp);

      const wet = ctx.createGain();
      wet.gain.value = 0.33;
      const conv = ctx.createConvolver();
      conv.buffer = warmthImpulse(ctx);
      lp.connect(conv);
      conv.connect(wet);
      wet.connect(comp);

      const bed = ctx.createBufferSource();
      bed.buffer = vinylBed(ctx);
      bed.loop = true;
      const bedGain = ctx.createGain();
      bedGain.gain.value = 0.5;
      bed.connect(bedGain);
      bedGain.connect(analyser);
      bed.start();
      bedSrc = bed;
    } else {
      src.connect(analyser);
    }

    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      if (bedSrc) {
        try {
          bedSrc.stop();
        } catch {
          /* already stopped */
        }
      }
      if (this.current?.src === src) this.current = null;
    };
    src.onended = () => {
      if (!stopped) {
        stopped = true;
        if (this.current?.src === src) this.current = null;
        opts.onEnded?.();
      }
    };
    src.start(0, offset);
    this.current = { src, stop };
    return { stop, analyser, startedAtCtxTime: ctx.currentTime, offsetSec: offset };
  }

  stop(): void {
    this.current?.stop();
    this.current = null;
  }

  get playing(): boolean {
    return this.current !== null;
  }
}
