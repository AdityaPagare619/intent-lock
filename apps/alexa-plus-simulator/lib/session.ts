/**
 * The session manager — ONE owner of the MCP session lifecycle for the
 * whole app (Transformation system 1; Failure Lab FM-23 + Audit-4's
 * silent-simulation trap).
 *
 * The designed lifecycle, replacing every component's private
 * "if (sessionId) return it" cache:
 *
 *   mount ──ensure()──▶ connecting ──mint ok──▶ live
 *                          │                      │
 *                       mint fails            server forgets the id
 *                          ▼                 (restart → HTTP 404)
 *                        down                     │
 *                          ▲                      ▼
 *                          └── mint fails ── reconnecting ──mint ok──▶ live
 *
 * Rules:
 *  - Auto-initialize on app load (the provider calls ensure()).
 *  - Concurrent ensures share ONE in-flight mint (StrictMode-safe).
 *  - When the transport reports the server rejected our id, it calls
 *    healSession() here: if the manager already holds a NEWER id (a
 *    parallel call healed first), that id is reused — no second mint;
 *    otherwise a fresh session is minted exactly once.
 *  - Connection state is part of the snapshot and rendered honestly:
 *    "down" means the mint itself failed — never a stale-session guess
 *    dressed up as ":8080 isn't answering" (the FM-23 false copy).
 *  - Every initialize anywhere (deck, inspector, heal) funnels its
 *    minted id back here via the onMinted hook, so there is exactly
 *    one source of truth for "the session we believe in".
 */
import { mcpInitialize, registerSessionHooks, type WireFrame } from "./mcp";

export type ConnectionState = "connecting" | "live" | "reconnecting" | "down";

export interface SessionSnapshot {
  sessionId: string | null;
  connection: ConnectionState;
  /** Last SSE event id the server wrote on this session (replay cursor). */
  lastEventId: string | null;
}

type PushFn = (f: Omit<WireFrame, "n" | "t">) => void;
type Listener = (s: SessionSnapshot) => void;

let snapshot: SessionSnapshot = { sessionId: null, connection: "connecting", lastEventId: null };
const listeners = new Set<Listener>();
let mintInFlight: Promise<string | null> | null = null;
let everHadSession = false;

function setSnapshot(patch: Partial<SessionSnapshot>): void {
  const next = { ...snapshot, ...patch };
  if (
    next.sessionId === snapshot.sessionId &&
    next.connection === snapshot.connection &&
    next.lastEventId === snapshot.lastEventId
  ) {
    return;
  }
  snapshot = next;
  for (const fn of listeners) fn(snapshot);
}

export function getSessionSnapshot(): SessionSnapshot {
  return snapshot;
}

export function subscribeSession(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Run one real handshake. Never throws; resolves to the minted id or
 * null. Concurrent callers share the same in-flight mint. */
function mint(push: PushFn): Promise<string | null> {
  if (mintInFlight) return mintInFlight;
  setSnapshot({ connection: everHadSession ? "reconnecting" : "connecting" });
  mintInFlight = (async () => {
    try {
      const res = await mcpInitialize(push);
      if (res.ok && res.sessionId) {
        // onMinted (fired inside mcpInitialize) already adopted the id
        // and set connection "live"; this is the same value, returned.
        setSnapshot({ sessionId: res.sessionId, connection: "live" });
        return res.sessionId;
      }
      setSnapshot({ connection: "down" });
      return null;
    } catch {
      setSnapshot({ connection: "down" });
      return null;
    } finally {
      mintInFlight = null;
    }
  })();
  return mintInFlight;
}

/** The session id to use right now — minting on first need. This is
 * what every call site should ask for instead of caching an id. */
export function ensureSession(push: PushFn): Promise<string | null> {
  if (snapshot.sessionId) return Promise.resolve(snapshot.sessionId);
  return mint(push);
}

/** Force a brand-new session (the ⚡ re-handshake). Any in-flight mint
 * IS a fresh mint, so it is shared rather than duplicated. */
export function reconnectSession(push: PushFn): Promise<string | null> {
  if (mintInFlight) return mintInFlight;
  setSnapshot({ sessionId: null, lastEventId: null });
  return mint(push);
}

/** Adopt an id minted outside the manager's own mint path (kept for
 * compatibility with components that still call setSessionId). */
export function adoptSession(sessionId: string | null): void {
  if (sessionId === null) {
    setSnapshot({ sessionId: null, lastEventId: null });
    return;
  }
  everHadSession = true;
  if (sessionId === snapshot.sessionId) {
    setSnapshot({ connection: "live" }); // same id — keep the replay cursor
    return;
  }
  setSnapshot({ sessionId, connection: "live", lastEventId: null });
}

/* ------------------------------------------------------------------ */
/* Transport hooks (registered into lib/mcp.ts).                       */
/* ------------------------------------------------------------------ */

registerSessionHooks({
  async healSession(push, staleId) {
    // A parallel call may have healed first — reuse its newer id
    // instead of minting a second session.
    if (snapshot.sessionId && snapshot.sessionId !== staleId) {
      return snapshot.sessionId;
    }
    setSnapshot({ sessionId: null, lastEventId: null, connection: "reconnecting" });
    return mint(push);
  },
  onMinted(sessionId) {
    everHadSession = true;
    if (sessionId === snapshot.sessionId) return;
    setSnapshot({ sessionId, connection: "live", lastEventId: null });
  },
  onEventId(sessionId, eventId) {
    if (snapshot.sessionId === sessionId) setSnapshot({ lastEventId: eventId });
  },
  onAlive() {
    if (snapshot.connection !== "live") setSnapshot({ connection: "live" });
  },
});
