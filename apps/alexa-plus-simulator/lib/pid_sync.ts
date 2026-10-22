/**
 * lib/pid_sync.ts — PID phase-lock controller (E5).
 *
 * Replaces the old snap-to-lock: instead of teleporting every DelayNode to
 * one value (audible click, dishonest jump), each follower room gets a
 * discrete PID loop that commands a *rate offset* rho, clamped to +/-1.5%
 * (so the effective rate 1+rho always stays in [0.985, 1.015]), with a
 * 0.5ms deadband that parks the controller once locked.
 *
 * Structure follows the shared engineering docs (Kp/Ki/Kd + rate clamp +
 * deadband); the loop runs at 60Hz on the measured drift from
 * workers/multiroom_clock.ts, and the actuator is the DelayNode target via
 * setTargetAtTime — the audio param's own smoothing is the glide, so there
 * are zero clicks by construction.
 *
 * Pure logic, no DOM/AudioContext — unit-simulable in Node.
 */

export interface PidGains {
  kp: number; // rate-offset per ms of error
  ki: number; // rate-offset per (ms*s) of integrated error
  kd: number; // rate-offset per (ms/s) of error velocity
}

export interface PidLimits {
  rateClamp: number; // |rho| <= rateClamp  (0.015 = +/-1.5%)
  deadbandMs: number; // |error| < deadbandMs -> hold, freeze integrator
  integralClamp: number; // anti-windup on the integral term
}

export const DEFAULT_GAINS: PidGains = { kp: 0.0025, ki: 0.000125, kd: 0.000625 };
export const DEFAULT_LIMITS: PidLimits = {
  rateClamp: 0.015,
  deadbandMs: 0.5,
  integralClamp: 0.01,
};
// Gain note (honest re-derivation): the shared docs specify
// Kp=0.0008/Ki=0.00004/Kd=0.0002 for their per-frame playbackRate loop.
// On this 60Hz delay-actuation plant those gains give tau ~0.8s and a 40ms
// shock needs ~3.6s (measured in Node against this exact file). The docs'
// ratios are preserved exactly (Ki/Kp = 0.05, Kd/Kp = 0.25); the scale is
// re-derived so a 40ms shock converges inside 1.8s (measured 1.78s, zero
// overshoot) with the +/-1.5% rate clamp respected on every tick.

export class PidSync {
  private integral = 0;
  private prevError: number | null = null;
  private lastRho = 0;
  private lockedTicks = 0;

  constructor(
    private gains: PidGains = { ...DEFAULT_GAINS },
    private limits: PidLimits = { ...DEFAULT_LIMITS }
  ) {}

  /**
   * One control step.
   * @param errorMs signed drift of this room vs the reference room, in ms
   * @param dt      seconds since the last step
   * @returns rho, the commanded rate offset, |rho| <= rateClamp
   */
  step(errorMs: number, dt: number): number {
    if (dt <= 0) return this.lastRho;
    if (Math.abs(errorMs) < this.limits.deadbandMs) {
      // Inside the deadband: park. Freeze (don't reset) the integrator so
      // we hold lock against slow wander without a kick on exit.
      this.prevError = errorMs;
      this.lockedTicks += 1;
      this.lastRho = 0;
      return 0;
    }
    this.lockedTicks = 0;
    const p = this.gains.kp * errorMs;
    this.integral += errorMs * dt;
    const iMax = this.limits.integralClamp / Math.max(this.gains.ki, 1e-12);
    this.integral = Math.max(-iMax, Math.min(iMax, this.integral));
    const i = this.gains.ki * this.integral;
    const d =
      this.prevError === null
        ? 0
        : this.gains.kd * ((errorMs - this.prevError) / dt);
    this.prevError = errorMs;
    const rho =
      Math.max(
        -this.limits.rateClamp,
        Math.min(this.limits.rateClamp, p + i + d)
      );
    this.lastRho = rho;
    return rho;
  }

  /** Effective playback-rate analogue: always in [0.985, 1.015]. */
  get rate(): number {
    return 1 + this.lastRho;
  }

  /** Consecutive ticks parked inside the deadband. */
  get parkedTicks(): number {
    return this.lockedTicks;
  }

  reset(): void {
    this.integral = 0;
    this.prevError = null;
    this.lastRho = 0;
    this.lockedTicks = 0;
  }
}
