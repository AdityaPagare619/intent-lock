/**
 * lib/mutation_queue.ts — offline mutation queue with replay-on-reconnect (E5).
 *
 * When the ISP toggle kills the network, voice commands that would mutate
 * server state (play/pause/skip/room-sync) are queued here instead of being
 * dropped. On reconnect they replay in Lamport order through the MCP
 * Streamable HTTP transport, filtered by Last-Event-ID so the server never
 * re-applies what it already saw.
 *
 * Deliberately NOT a full CRDT: the shared docs' CRDT is overkill for a
 * single-user simulator. What we keep from the docs:
 *   - queueOfflineVoiceMutation() / drainQueuedMutationsOnReconnect() shape
 *   - Lamport ordering (local counter + mergeRemoteClock on inbound events)
 *   - Last-Event-ID carried per mutation for idempotent replay
 * What we skip (documented, Phase 2): cross-reload persistence, multi-writer
 * merge. The queue is session-scoped: offline means "ISP toggle", not
 * "browser restarted".
 *
 * Idempotency contract: every mutation has a stable id; the sender MUST
 * dedupe by id server-side. replay() keeps failed sends queued (at-least-
 * once delivery).
 */

export interface QueuedMutation {
  /** Stable id for server-side dedupe: `mq-<lamport>-<rand6>` (rand is an id suffix, not a proof). */
  id: string;
  /** Lamport clock value at enqueue time — the replay order. */
  lamport: number;
  /** MCP tool name, e.g. "omnibeat_resolve_and_play". */
  tool: string;
  /** Tool arguments (must be JSON-serializable). */
  args: Record<string, unknown>;
  /** Last MCP SSE event id the client had seen when this was queued. */
  lastEventId: string | null;
  enqueuedAt: number;
}

export interface ReplayResult {
  sent: string[];
  failed: string[];
  /** Highest lastEventId acknowledged by the server, if reported. */
  serverEventId: string | null;
}

function rid(lamport: number): string {
  const suffix = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, "0");
  return `mq-${lamport}-${suffix}`;
}

export class MutationQueue {
  private lamport = 0;
  private pending: QueuedMutation[] = [];

  /** Current Lamport clock (for the wire inspector). */
  get clock(): number {
    return this.lamport;
  }

  /** Lamport merge on inbound server events: clock = max(local, remote) + 1. */
  mergeRemoteClock(remoteLamport: number): void {
    if (Number.isFinite(remoteLamport)) {
      this.lamport = Math.max(this.lamport, Math.floor(remoteLamport)) + 1;
    }
  }

  /**
   * Queue one offline mutation. Docs-compatible alias:
   * queueOfflineVoiceMutation(command) == enqueue("voice_command", {command}).
   */
  enqueue(
    tool: string,
    args: Record<string, unknown> = {},
    lastEventId: string | null = null
  ): QueuedMutation {
    this.lamport += 1;
    const m: QueuedMutation = {
      id: rid(this.lamport),
      lamport: this.lamport,
      tool,
      args,
      lastEventId,
      enqueuedAt: Date.now(),
    };
    this.pending.push(m);
    return m;
  }

  queueOfflineVoiceMutation(command: string): QueuedMutation {
    return this.enqueue("voice_command", { command });
  }

  /** Mutations still waiting, in Lamport order. */
  pendingMutations(): QueuedMutation[] {
    return [...this.pending].sort((a, b) => a.lamport - b.lamport);
  }

  get depth(): number {
    return this.pending.length;
  }

  /**
   * Replay everything through `send` in Lamport order.
   *
   * @param send  performs one MCP tools/call; resolves with the server's
   *              latest event id (or null). Must be idempotent by mutation id.
   * @param ackedLamport  highest Lamport value the server confirms it already
   *              applied (from its Last-Event-ID resume) — anything at or
   *              below is dropped without resending.
   *
   * A send rejection stops the replay at that mutation (order preserved);
   * the failed mutation and everything after it stays queued for the next
   * reconnect — at-least-once delivery, idempotent by id.
   */
  async replay(
    send: (m: QueuedMutation) => Promise<string | null>,
    ackedLamport = 0
  ): Promise<ReplayResult> {
    if (ackedLamport > 0) {
      this.pending = this.pending.filter((m) => m.lamport > ackedLamport);
    }
    const result: ReplayResult = { sent: [], failed: [], serverEventId: null };
    for (const m of this.pendingMutations()) {
      try {
        const evt = await send(m);
        if (evt) {
          result.serverEventId = evt;
          const n = parseInt(evt.replace(/\D/g, ""), 10);
          if (Number.isFinite(n)) this.mergeRemoteClock(n);
        }
        this.pending = this.pending.filter((p) => p.id !== m.id);
        result.sent.push(m.id);
      } catch {
        result.failed.push(m.id);
        // stop at first failure: preserve order, retry the rest later
        break;
      }
    }
    return result;
  }

  /** Docs-compatible drain: hand back everything and empty the queue. */
  drainQueuedMutationsOnReconnect(): QueuedMutation[] {
    const copy = this.pendingMutations();
    this.pending = [];
    return copy;
  }

  clear(): void {
    this.pending = [];
  }
}
