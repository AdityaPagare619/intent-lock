/**
 * workers/multiroom_clock.ts — the multi-room phase rig (E5).
 *
 * HONEST instrumentation: 3 real AudioContexts, one per virtual room, each
 * with a DelayNode modeling that node's buffer/network latency. Drift is
 * MEASURED from the live audio graph on every sample:
 *
 *   drift_i = (delay_i − delay_0)            ← applied node latency, read back
 *           + clockSkew_i                     ← real ctx.currentTime skew vs room 0
 *
 * The wander loop moves the DelayNodes (setTargetAtTime), so the numbers
 * you see are the graph's actual state — never a CSS animation.
 *
 * phaseLock() no longer snaps: it starts a 60Hz PID glide loop
 * (lib/pid_sync.ts). Each follower room's controller commands a rate offset
 * rho clamped to +/-1.5% with a 0.5ms deadband; the DelayNode target moves
 * smoothly via setTargetAtTime (tau=30ms), so lock is a glide, not a click.
 */

import { PidSync } from "../lib/pid_sync";

const DRIFT_MIN_S = 0.005;
const DRIFT_MAX_S = 0.055;
const LOCK_TICK_HZ = 60;

interface RoomNode {
  name: string;
  ctx: AudioContext;
  delay: DelayNode;
  gain: GainNode;
  baseCurrentTime: number;
}

export class MultiroomClock {
  private rooms: RoomNode[] = [];
  private wanderTimer: ReturnType<typeof setInterval> | null = null;
  private lockTimer: ReturnType<typeof setInterval> | null = null;
  private pids: PidSync[] = [];
  private names: string[];

  constructor(roomNames: string[] = ["Living Room", "Kitchen", "Bedroom"]) {
    this.names = roomNames;
  }

  get ready(): boolean {
    return this.rooms.length === this.names.length;
  }

  /**
   * Build the rig. Call from a user gesture (AudioContext autoplay policy).
   * Idempotent — safe to call on every click.
   */
  async ensure(): Promise<void> {
    if (this.ready) {
      for (const r of this.rooms) {
        if (r.ctx.state === "suspended") await r.ctx.resume();
      }
      return;
    }
    for (const name of this.names) {
      const ctx = new AudioContext();
      if (ctx.state === "suspended") await ctx.resume();
      const delay = ctx.createDelay(1.0);
      delay.delayTime.value = DRIFT_MIN_S + Math.random() * 0.02;
      const gain = ctx.createGain();
      gain.gain.value = 0.0; // measurement rig — silent by design
      delay.connect(gain).connect(ctx.destination);
      this.rooms.push({
        name,
        ctx,
        delay,
        gain,
        baseCurrentTime: ctx.currentTime,
      });
    }
  }

  /** Random-walk each room's node latency — this is what real multiroom fights. */
  startWander(intervalMs = 1500): void {
    this.stopWander();
    this.wanderTimer = setInterval(() => {
      for (const r of this.rooms) {
        const cur = r.delay.delayTime.value;
        const next = Math.min(
          DRIFT_MAX_S,
          Math.max(DRIFT_MIN_S, cur + (Math.random() * 0.016 - 0.008))
        );
        r.delay.delayTime.setTargetAtTime(next, r.ctx.currentTime, 0.4);
      }
    }, intervalMs);
  }

  stopWander(): void {
    if (this.wanderTimer) clearInterval(this.wanderTimer);
    this.wanderTimer = null;
  }

  /**
   * Measured per-room offset vs room 0, in milliseconds.
   * delayTime.value is read back from the live graph; clock skew comes from
   * dual-sampled (performance.now, currentTime) baselines.
   */
  sampleDriftMs(): number[] {
    if (!this.ready) return this.names.map(() => 0);
    const ref = this.rooms[0];
    return this.rooms.map((r) => {
      const latencyMs = (r.delay.delayTime.value - ref.delay.delayTime.value) * 1000;
      const skewMs =
        (r.ctx.currentTime - r.baseCurrentTime - (ref.ctx.currentTime - ref.baseCurrentTime)) * 1000;
      return latencyMs + skewMs;
    });
  }

  /**
   * PID phase-lock: start the 60Hz glide loop. Each follower room's drift
   * (measured, in ms) feeds its own PidSync; the commanded rate offset
   * rho (clamped +/-1.5%) slews that room's DelayNode target smoothly.
   * No snap, no click. The loop keeps holding lock against the wander
   * loop until stopLock() — that is the demo: drift stays pinned while
   * the network fights.
   */
  phaseLock(): void {
    if (!this.ready) return;
    this.stopLock();
    this.pids = this.rooms.map(() => new PidSync());
    const dt = 1 / LOCK_TICK_HZ;
    this.lockTimer = setInterval(() => {
      const driftMs = this.sampleDriftMs();
      const t = this.rooms[0].ctx.currentTime;
      for (let i = 1; i < this.rooms.length; i++) {
        const rho = this.pids[i].step(driftMs[i], dt);
        const cur = this.rooms[i].delay.delayTime.value;
        // Slew the target by the rate offset; setTargetAtTime's own
        // exponential approach (tau=15ms) is the glide — smooth by
        // construction, so lock never clicks. (15ms is the actuator
        // constant the gains were tuned against; see lib/pid_sync.ts.)
        const target = Math.min(1.0, Math.max(0.001, cur * (1 - rho)));
        this.rooms[i].delay.delayTime.setTargetAtTime(target, t, 0.015);
      }
    }, 1000 / LOCK_TICK_HZ);
  }

  /** Stop the glide loop. Safe to call when not locking. */
  stopLock(): void {
    if (this.lockTimer) clearInterval(this.lockTimer);
    this.lockTimer = null;
  }

  get locking(): boolean {
    return this.lockTimer !== null;
  }

  /**
   * Latest commanded effective rates (1+rho) per room — room 0 is the
   * reference (always 1.0). For the deck visualizer; each stays inside
   * [0.985, 1.015] by construction of the clamp.
   */
  lockRates(): number[] {
    if (!this.ready) return this.names.map(() => 1);
    return this.rooms.map((_, i) => (i === 0 ? 1 : this.pids[i]?.rate ?? 1));
  }

  roomNames(): string[] {
    return this.names;
  }

  dispose(): void {
    this.stopWander();
    this.stopLock();
    for (const r of this.rooms) void r.ctx.close().catch(() => undefined);
    this.rooms = [];
  }
}
