/**
 * workers/edge_dsp.ts — GATE 1 (PHYSICAL) of the 3-gate funnel.
 *
 * AcousticBanterAndBargeInGate: real DSP that separates multi-speaker room
 * banter / laughter from an intentional single-speaker barge-in, BEFORE any
 * text exists. Feeds the Graceful Yield shapes in E3 — it never changes them.
 *
 * Per analysis frame (50 ms):
 *   SNR      — RMS vs an adaptive noise floor (dB)
 *   ZCR      — zero-crossing rate; variance over a 250 ms rolling window
 *   pitch    — fundamental frequency via normalized autocorrelation
 *              (85–320 Hz, parabolic interpolation); variance over 250 ms
 *
 * Classification (deterministic, no randomness anywhere):
 *   SILENCE               — snrDb < 10
 *   VOICE_SUB_THRESHOLD   — 10 ≤ snrDb < 13.5, low variance: audible speech
 *                           below barge-in confidence (P1-5: never label
 *                           audible voice as nobody-talking)
 *   ROOM_BANTER_SHIELDED  — pitchVar > 1400 Hz² or zcrVar > 0.0045
 *                           → wake-word locked, NEVER interrupts
 *   INTENTIONAL_BARGE_IN  — snrDb ≥ 13.5 with low variance, sustained
 *                           5 consecutive frames (≈250 ms) → slice the TTS
 *
 * 5 frames × 50 ms = 250 ms sustain: a cough or a dropped pan never fires it;
 * a human deliberately talking over Alexa does.
 *
 * CPU-local, ₹0. No network, no models, no dependencies.
 */

export type AcousticClassification =
  | "SILENCE"
  | "VOICE_SUB_THRESHOLD"
  | "ROOM_BANTER_SHIELDED"
  | "INTENTIONAL_BARGE_IN";

export interface AcousticTelemetryFrame {
  snrDb: number;
  fundamentalFreqHz: number;
  pitchVariance: number; // Hz², rolling 250 ms
  zcrVariance: number; // rolling 250 ms
  sustainedFrames: number; // consecutive barge-qualifying frames
  classification: AcousticClassification;
}

export interface GateConfig {
  /** samples per analysis frame; 2400 @48kHz = 50 ms */
  frameSamples: number;
  /** rolling variance window in frames; 5 × 50 ms = 250 ms */
  varianceWindowFrames: number;
  /** speech-present floor (dB) */
  voiceSnrDb: number;
  /** barge-in SNR gate (dB) */
  bargeSnrDb: number;
  /** consecutive qualifying frames before INTENTIONAL_BARGE_IN */
  bargeSustainFrames: number;
  /** banter trip-wires */
  banterPitchVarHz2: number;
  banterZcrVar: number;
  /** pitch search band */
  pitchMinHz: number;
  pitchMaxHz: number;
  /** normalized-autocorrelation voicing threshold */
  voicingThreshold: number;
}

export const DEFAULT_GATE_CONFIG: Readonly<GateConfig> = {
  frameSamples: 2400, // 50 ms @ 48 kHz
  varianceWindowFrames: 5, // 250 ms rolling
  voiceSnrDb: 10.0,
  bargeSnrDb: 13.5,
  bargeSustainFrames: 5, // ≈250 ms sustain
  banterPitchVarHz2: 1400,
  banterZcrVar: 0.0045,
  pitchMinHz: 85,
  pitchMaxHz: 320,
  voicingThreshold: 0.35,
};

function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  let acc = 0;
  for (const x of xs) acc += (x - mean) * (x - mean);
  return acc / xs.length;
}

export class AcousticBanterAndBargeInGate {
  private readonly cfg: GateConfig;
  private noiseFloorRms = 0.008;
  private pitchHistory: number[] = [];
  private zcrHistory: number[] = [];
  private sustainedSingleVoiceFrames = 0;

  constructor(sampleRate: number, overrides: Partial<GateConfig> = {}) {
    // Scale the frame to the context's sample rate so "50 ms" stays true
    // on 44.1 kHz contexts as well as 48 kHz.
    const frameMs = 50;
    this.cfg = {
      ...DEFAULT_GATE_CONFIG,
      ...overrides,
      frameSamples: Math.round((sampleRate * frameMs) / 1000),
    };
  }

  get frameSamples(): number {
    return this.cfg.frameSamples;
  }

  reset(): void {
    this.pitchHistory = [];
    this.zcrHistory = [];
    this.sustainedSingleVoiceFrames = 0;
    this.noiseFloorRms = 0.008;
  }

  /**
   * Fundamental frequency via normalized autocorrelation with parabolic
   * interpolation. Returns 0 when the frame is unvoiced (no lag clears the
   * voicing threshold) — unvoiced frames never pollute the pitch history.
   */
  private estimatePitch(frame: Float32Array, sampleRate: number): number {
    const n = frame.length;
    let energy = 0;
    for (let i = 0; i < n; i++) energy += frame[i] * frame[i];
    if (energy < 1e-10) return 0;

    const minLag = Math.max(2, Math.floor(sampleRate / this.cfg.pitchMaxHz));
    const maxLag = Math.min(n - 2, Math.ceil(sampleRate / this.cfg.pitchMinHz));
    let bestLag = -1;
    let bestCorr = this.cfg.voicingThreshold;
    // Normalized (biased) autocorrelation: R(lag) / R(0)
    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0;
      for (let i = 0; i < n - lag; i++) corr += frame[i] * frame[i + lag];
      corr /= energy;
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }
    if (bestLag < 0) return 0;
    // Parabolic interpolation around the peak for sub-sample accuracy
    let refined = bestLag;
    if (bestLag > minLag && bestLag < maxLag) {
      let cm = 0,
        cp = 0,
        c0 = 0;
      for (let i = 0; i < n - bestLag; i++) {
        c0 += frame[i] * frame[i + bestLag];
        if (i < n - bestLag - 1) cp += frame[i] * frame[i + bestLag + 1];
      }
      for (let i = 0; i < n - bestLag + 1; i++) {
        if (i < n - bestLag + 1) cm += frame[i] * frame[i + bestLag - 1];
      }
      c0 /= energy;
      cp /= energy;
      cm /= energy;
      const denom = cm - 2 * c0 + cp;
      if (Math.abs(denom) > 1e-9) {
        const shift = (0.5 * (cm - cp)) / denom;
        if (Math.abs(shift) <= 1) refined = bestLag + shift;
      }
    }
    return sampleRate / refined;
  }

  /**
   * Analyze one time-domain frame. Call with consecutive frames; the gate
   * keeps its own rolling history — there is no hidden global state.
   */
  analyzeFrame(
    timeDomain: Float32Array,
    sampleRate: number,
    isAlexaCurrentlySpeaking: boolean
  ): AcousticTelemetryFrame {
    const n = timeDomain.length;

    // 1. RMS, adaptive noise floor, SNR
    let sumSq = 0;
    let zeroCrossings = 0;
    for (let i = 0; i < n; i++) {
      const s = timeDomain[i];
      sumSq += s * s;
      if (i > 0 && (s >= 0) !== (timeDomain[i - 1] >= 0)) zeroCrossings++;
    }
    const rms = Math.sqrt(sumSq / n);
    if (rms < this.noiseFloorRms * 1.5) {
      this.noiseFloorRms =
        0.95 * this.noiseFloorRms + 0.05 * Math.max(rms, 0.002);
    }
    const snrDb = 20 * Math.log10(Math.max(rms, 1e-4) / this.noiseFloorRms);
    const zcr = zeroCrossings / n;

    // 2. Pitch (voiced frames only enter the history)
    const f0 = this.estimatePitch(timeDomain, sampleRate);
    if (snrDb > 8.0) {
      if (f0 > 0) {
        this.pitchHistory.push(f0);
        if (this.pitchHistory.length > this.cfg.varianceWindowFrames)
          this.pitchHistory.shift();
      }
      this.zcrHistory.push(zcr);
      if (this.zcrHistory.length > this.cfg.varianceWindowFrames)
        this.zcrHistory.shift();
    }

    const pitchVar = variance(this.pitchHistory);
    const zcrVar = variance(this.zcrHistory);

    // 3. Deterministic classification
    let classification: AcousticClassification = "SILENCE";
    if (snrDb >= this.cfg.voiceSnrDb) {
      if (
        pitchVar > this.cfg.banterPitchVarHz2 ||
        zcrVar > this.cfg.banterZcrVar
      ) {
        // Overlapping speakers / laughter: shield holds, wake-word locked.
        classification = "ROOM_BANTER_SHIELDED";
        this.sustainedSingleVoiceFrames = 0;
      } else if (snrDb >= this.cfg.bargeSnrDb) {
        this.sustainedSingleVoiceFrames++;
        if (
          !isAlexaCurrentlySpeaking ||
          this.sustainedSingleVoiceFrames >= this.cfg.bargeSustainFrames
        ) {
          classification = "INTENTIONAL_BARGE_IN";
        } else {
          // Sustaining toward barge-in but not there yet: audible speech.
          classification = "VOICE_SUB_THRESHOLD";
        }
      } else {
        // 10 ≤ snrDb < 13.5, low variance: a voice is present, just not
        // loud/clear enough to barge in. Never SILENCE (P1-5).
        classification = "VOICE_SUB_THRESHOLD";
        this.sustainedSingleVoiceFrames = 0;
      }
    } else {
      this.sustainedSingleVoiceFrames = 0;
    }

    return {
      snrDb: Math.round(snrDb * 10) / 10,
      fundamentalFreqHz: Math.round(f0),
      pitchVariance: Math.round(pitchVar),
      zcrVariance: Math.round(zcrVar * 1e5) / 1e5,
      sustainedFrames: this.sustainedSingleVoiceFrames,
      classification,
    };
  }
}

/**
 * GateRunner — buffers arbitrary-size PCM chunks (e.g. AudioWorklet messages)
 * into fixed analysis frames and emits one telemetry frame per 50 ms.
 * Framework-agnostic: the app wires onTelemetry to its Graceful Yield state.
 */
export class GateRunner {
  private readonly gate: AcousticBanterAndBargeInGate;
  private readonly sampleRate: number;
  private readonly onTelemetry: (f: AcousticTelemetryFrame) => void;
  private pending: Float32Array;
  private pendingLen = 0;
  private alexaSpeaking = false;

  constructor(
    sampleRate: number,
    onTelemetry: (f: AcousticTelemetryFrame) => void,
    gateOverrides: Partial<GateConfig> = {}
  ) {
    this.gate = new AcousticBanterAndBargeInGate(sampleRate, gateOverrides);
    this.sampleRate = sampleRate;
    this.onTelemetry = onTelemetry;
    this.pending = new Float32Array(this.gate.frameSamples * 4);
  }

  setAlexaSpeaking(speaking: boolean): void {
    this.alexaSpeaking = speaking;
  }

  reset(): void {
    this.gate.reset();
    this.pendingLen = 0;
  }

  pushSamples(chunk: Float32Array): void {
    if (this.pendingLen + chunk.length > this.pending.length) {
      const bigger = new Float32Array(
        Math.max(this.pending.length * 2, this.pendingLen + chunk.length)
      );
      bigger.set(this.pending.subarray(0, this.pendingLen));
      this.pending = bigger;
    }
    this.pending.set(chunk, this.pendingLen);
    this.pendingLen += chunk.length;

    const fs = this.gate.frameSamples;
    let offset = 0;
    while (this.pendingLen - offset >= fs) {
      const frame = this.pending.subarray(offset, offset + fs);
      this.onTelemetry(
        this.gate.analyzeFrame(frame, this.sampleRate, this.alexaSpeaking)
      );
      offset += fs;
    }
    if (offset > 0) {
      this.pending.copyWithin(0, offset, this.pendingLen);
      this.pendingLen -= offset;
    }
  }
}
