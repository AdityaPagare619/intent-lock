/**
 * workers/chorus_extract.ts — dynamic chorus hook extractor (E2 sub-engine).
 *
 * Replaces fixed synthetic WAVs and hardcoded timestamps: decodes a real
 * 30-second iTunes preview in the browser and finds the highest-energy
 * 3.0-second chorus window with real DSP — no randomness, no mocks.
 *
 * Algorithm (per 250 ms frame):
 *   score = RMS × (0.65 + 0.35 × spectralFluxProxy)
 * where spectralFluxProxy is the RMS of the first-order difference
 * (mid/high vocal presence, 300 Hz–3.4 kHz band emphasis).
 * A 3.0 s window (12 frames) slides over t = 2.5 s … 25 s (intro/outro
 * fades excluded); the max-energy window wins.
 *
 * The core is a pure function over Float32Array PCM — testable in Node with
 * zero DOM. The browser helper adds fetch + Web Audio decode.
 */

export interface ChorusWindowResult {
  startSec: number;
  endSec: number;
  /** mean per-frame score of the winning window */
  peakRmsEnergy: number;
  /** best-window mean flux / whole-track mean flux, clamped 0..1.
   *  Real vocal-presence estimate — choruses are flux-rich vs the track mean. */
  vocalPresenceRatio: number;
  /** diagnostics: every frame's score (for the wire inspector / tests) */
  frameScores: number[];
  /** top-3 individual frames by score */
  topFrames: { startSec: number; score: number }[];
}

const FRAME_SEC = 0.25;

/**
 * Pure DSP core: highest-energy 3.0 s window in decoded PCM.
 * channelData must be mono; sampleRate in Hz.
 */
export function extractDynamicChorusHookWindow(
  channelData: Float32Array,
  sampleRate: number,
  windowDurationSec = 3.0
): ChorusWindowResult {
  const frameSize = Math.max(64, Math.floor(sampleRate * FRAME_SEC));
  const totalFrames = Math.floor(channelData.length / frameSize);
  const windowFrames = Math.max(1, Math.floor(windowDurationSec / FRAME_SEC));

  const frameScores: number[] = new Array(totalFrames);
  const frameFlux: number[] = new Array(totalFrames);

  for (let f = 0; f < totalFrames; f++) {
    const base = f * frameSize;
    let sumSq = 0;
    let diffSq = 0;
    let prev = 0;
    for (let i = 0; i < frameSize; i++) {
      const s = channelData[base + i];
      sumSq += s * s;
      const d = s - prev;
      diffSq += d * d;
      prev = s;
    }
    const rms = Math.sqrt(sumSq / frameSize);
    const spectralFluxProxy = Math.sqrt(diffSq / frameSize);
    frameScores[f] = rms * (0.65 + 0.35 * spectralFluxProxy);
    frameFlux[f] = spectralFluxProxy;
  }

  // Search t=2.5 s (frame 10) … t=25 s, excluding intro/outro fades.
  const startSearchFrame = Math.min(10, Math.max(0, totalFrames - windowFrames));
  const endSearchFrame = Math.max(
    startSearchFrame + 1,
    totalFrames - windowFrames - 8
  );

  let bestFrameIdx = startSearchFrame;
  let maxWindowScore = -1;
  for (let k = startSearchFrame; k <= endSearchFrame; k++) {
    let winScore = 0;
    for (let w = 0; w < windowFrames; w++) winScore += frameScores[k + w] ?? 0;
    if (winScore > maxWindowScore) {
      maxWindowScore = winScore;
      bestFrameIdx = k;
    }
  }

  const startSec = Math.round(bestFrameIdx * FRAME_SEC * 100) / 100;
  const endSec = Math.round((startSec + windowDurationSec) * 100) / 100;

  // Real vocal-presence ratio: best-window flux vs whole-track flux.
  let winFlux = 0;
  for (let w = 0; w < windowFrames; w++)
    winFlux += frameFlux[bestFrameIdx + w] ?? 0;
  winFlux /= windowFrames;
  const meanFlux =
    frameFlux.reduce((a, b) => a + b, 0) / Math.max(1, frameFlux.length);
  const vocalPresenceRatio =
    meanFlux > 1e-9
      ? Math.min(1, Math.max(0, winFlux / (2 * meanFlux)))
      : 0;

  const topFrames = frameScores
    .map((score, f) => ({ startSec: Math.round(f * FRAME_SEC * 100) / 100, score: Math.round(score * 1e4) / 1e4 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return {
    startSec,
    endSec,
    peakRmsEnergy: Math.round((maxWindowScore / windowFrames) * 1e4) / 1e4,
    vocalPresenceRatio: Math.round(vocalPresenceRatio * 100) / 100,
    frameScores: frameScores.map((s) => Math.round(s * 1e4) / 1e4),
    topFrames,
  };
}

/* ------------------------------------------------------------------ */
/* Deadline media pipeline (FM-34)                                      */
/*                                                                      */
/* The pre-FM-34 helper armed an 8s abort that was CLEARED the moment   */
/* fetch() resolved — i.e. it bounded only time-to-headers. A CDN that  */
/* answers fast and then trickles the body (lagging, not dead) wedged   */
/* the elicitation forever: body read + decode sat outside any bound.   */
/*                                                                      */
/* The designed replacement: ONE deadline token per candidate covers    */
/* headers + body + decode end to end. Expiry is a normal outcome,      */
/* never an exception the caller must catch — and it is DISTINGUISHED   */
/* from death: "slow" (the deadline fired: the bytes were coming too    */
/* slowly) vs "dead" (the CDN refused/errored promptly). A parent       */
/* token (the whole hook sequence) caps every child, and any token can  */
/* be cancelled by the user; the first cause to fire wins and is the    */
/* cause reported.                                                      */
/* ------------------------------------------------------------------ */

/** Per-candidate extraction cap: headers + body + decode, end to end. */
export const EXTRACT_DEADLINE_MS = 6000;

export type HookExtractFailReason = "slow" | "dead" | "decode" | "cancelled";

export type HookExtractOutcome =
  | { ok: true; window: ChorusWindowResult; ms: number }
  | {
      ok: false;
      reason: HookExtractFailReason;
      /** pipeline stage the failure landed in — diagnostics for the wire */
      stage: "fetch" | "body" | "decode";
      detail: string;
      ms: number;
    };

/**
 * A mint-once deadline. `signal` aborts when the deadline expires OR the
 * token is cancelled OR a parent token aborts; `reason()` reports which
 * cause fired first ("slow" = own/ancestor deadline, "cancelled" = an
 * explicit cancel). All waits in the media pipeline hang off one token,
 * so no stage can outlive the budget unnoticed.
 */
export class DeadlineToken {
  /** absolute expiry, performance.now() clock */
  readonly expiresAt: number;
  private controller = new AbortController();
  private fired: "slow" | "cancelled" | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private parent: DeadlineToken | null = null;

  constructor(budgetMs: number, parent?: DeadlineToken) {
    this.parent = parent ?? null;
    const now = performance.now();
    let at = now + Math.max(0, budgetMs);
    if (parent) at = Math.min(at, parent.expiresAt);
    this.expiresAt = at;
    this.timer = setTimeout(() => this.fire("slow"), Math.max(0, at - now));
    if (parent) {
      if (parent.signal.aborted) {
        this.fire(parent.reason() ?? "cancelled");
      } else {
        parent.signal.addEventListener(
          "abort",
          () => this.fire(parent.reason() ?? "cancelled"),
          { once: true }
        );
      }
    }
  }

  private fire(reason: "slow" | "cancelled") {
    if (this.fired) return; // first cause wins — it is the reported cause
    this.fired = reason;
    this.controller.abort();
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }
  get aborted(): boolean {
    return this.controller.signal.aborted;
  }
  /** "slow" if a deadline fired, "cancelled" if a user cancel fired, else null */
  reason(): "slow" | "cancelled" | null {
    return this.fired;
  }
  remainingMs(): number {
    return Math.max(0, this.expiresAt - performance.now());
  }
  /** A child token: its own budget, never outliving this token. */
  child(budgetMs: number): DeadlineToken {
    return new DeadlineToken(budgetMs, this);
  }
  cancel(): void {
    this.fire("cancelled");
  }
  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

/** Race a non-abortable promise (decodeAudioData) against the token. */
function raceAgainstToken<T>(p: Promise<T>, token: DeadlineToken): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (token.aborted) {
      reject(new Error("deadline token already aborted"));
      return;
    }
    const onAbort = () => reject(new Error("aborted by deadline token"));
    token.signal.addEventListener("abort", onAbort, { once: true });
    p.then(
      (v) => {
        token.signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        token.signal.removeEventListener("abort", onAbort);
        reject(e);
      }
    );
  });
}

/**
 * Fetch a preview, decode it, extract the chorus window — all under ONE
 * deadline token (headers + body + decode). Never throws: every ending
 * is a typed outcome the caller renders honestly.
 *
 *   slow      — the deadline fired mid-flight (trickling CDN, stalled
 *               body, decode that never lands): "too slow", NOT dead.
 *   dead      — prompt refusal: HTTP error or a network failure that was
 *               not caused by the deadline.
 *   decode    — bytes arrived in time but are not decodable audio.
 *   cancelled — the user (or a superseding run) cancelled the token.
 */
export async function extractHookUnderDeadline(
  previewUrl: string,
  audioCtx: AudioContext,
  token: DeadlineToken
): Promise<HookExtractOutcome> {
  const t0 = performance.now();
  const ms = () => Math.round(performance.now() - t0);
  let stage: "fetch" | "body" | "decode" = "fetch";
  try {
    const res = await fetch(previewUrl, { signal: token.signal });
    if (!res.ok) {
      return { ok: false, reason: "dead", stage, detail: `HTTP ${res.status}`, ms: ms() };
    }
    stage = "body";
    // The token stays ARMED through the body read — this await is exactly
    // where the old code wedged: a trickling body now aborts at deadline.
    const buf = await res.arrayBuffer();
    stage = "decode";
    // slice: decodeAudioData detaches the buffer; keep the caller's copy intact
    const audioBuffer = await raceAgainstToken(
      audioCtx.decodeAudioData(buf.slice(0)),
      token
    );
    const channels = audioBuffer.numberOfChannels;
    const len = audioBuffer.length;
    const mono = new Float32Array(len);
    for (let ch = 0; ch < channels; ch++) {
      const data = audioBuffer.getChannelData(ch);
      for (let i = 0; i < len; i++) mono[i] += data[i] / channels;
    }
    return {
      ok: true,
      window: extractDynamicChorusHookWindow(mono, audioBuffer.sampleRate, 3.0),
      ms: ms(),
    };
  } catch (e) {
    const why = token.reason();
    if (why) {
      // Our own deadline or a cancel caused this rejection.
      return { ok: false, reason: why, stage, detail: (e as Error).message, ms: ms() };
    }
    if (stage === "decode") {
      return { ok: false, reason: "decode", stage, detail: (e as Error).message, ms: ms() };
    }
    return { ok: false, reason: "dead", stage, detail: (e as Error).message, ms: ms() };
  }
}

/* ------------------------------------------------------------------ */
/* Verified-effect playback contract (FM-36)                            */
/*                                                                      */
/* The pre-FM-36 players resolved `true` when a safety timer expired —  */
/* silence rendered as success and the user "heard" hooks that never    */
/* sounded. This tracker is the evidence standard every hook player     */
/* must satisfy before the UI may say "played":                         */
/*                                                                      */
/*   AUDIBLE requires BOTH the element's `playing` event AND observed   */
/*   currentTime progression of at least AUDIBLE_PROGRESSION_SEC past   */
/*   the baseline sample. A seek jump re-baselines instead of counting  */
/*   as progression (a 12s seek is not 12s of listening). A stalled     */
/*   element, a rejected play(), or a silent file can never satisfy     */
/*   it. No evidence → the hook is "not heard", in plain words.         */
/* ------------------------------------------------------------------ */

/** Seconds of real playhead advancement required to call a hook audible. */
export const AUDIBLE_PROGRESSION_SEC = 0.35;
/** A playhead jump larger than this between samples is a seek, not listening. */
const SEEK_JUMP_SEC = 1.5;

export class PlaybackEvidence {
  private playingSeen = false;
  private baseline: number | null = null;
  private maxT = 0;
  /** flips true only on evidence: playing event + real progression */
  audible = false;

  constructor(private readonly minProgressionSec: number = AUDIBLE_PROGRESSION_SEC) {}

  notePlaying(): void {
    this.playingSeen = true;
  }

  sample(currentTime: number): void {
    if (!Number.isFinite(currentTime)) return;
    if (this.baseline === null) {
      this.baseline = currentTime;
      this.maxT = currentTime;
      return;
    }
    if (currentTime - this.maxT > SEEK_JUMP_SEC) {
      // Seek discontinuity — re-baseline; the jump is not listening time.
      this.baseline = currentTime;
      this.maxT = currentTime;
      return;
    }
    if (currentTime > this.maxT) this.maxT = currentTime;
    if (
      this.playingSeen &&
      this.maxT - this.baseline >= this.minProgressionSec
    ) {
      this.audible = true;
    }
  }

  /** seconds of verified playhead progression observed so far */
  get progressionSec(): number {
    return this.baseline === null ? 0 : Math.max(0, this.maxT - this.baseline);
  }
}
