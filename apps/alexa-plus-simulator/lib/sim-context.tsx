/**
 * Shared simulator state. One rule: anything tagged `sim` is a labeled
 * stand-in for Echo hardware (ASR, mic, rooms). The MCP wire frames are
 * always real HTTP — the inspector never shows a synthetic frame.
 */
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { WireFrame } from "./mcp";
import { nextFrame } from "./mcp";
import {
  adoptSession,
  ensureSession as managerEnsureSession,
  getSessionSnapshot,
  reconnectSession,
  subscribeSession,
  type ConnectionState,
  type SessionSnapshot,
} from "./session";

export type PersonaId = "noida" | "seattle" | "madrid" | "rural";
export type FaultId = "upsell" | "ghost" | "token" | "isp";
export type OrbState = "idle" | "listening" | "speaking" | "banter" | "yield";

export interface TranscriptLine {
  text: string;
  tag: "SIM-ASR" | "ALEXA" | "YOU" | "SYS";
  ts: string;
}

/** D-06 fault names on the wire, per UI toggle. One header value travels,
 * so when several toggles are armed the first by this priority wins. */
export const FAULT_TO_CHAOS: Record<FaultId, string> = {
  token: "token_expired",
  ghost: "ghost_action",
  upsell: "upsell_trap",
  isp: "isp_blackout",
};
const FAULT_PRIORITY: FaultId[] = ["token", "ghost", "upsell", "isp"];

interface SimState {
  persona: PersonaId | null;
  setPersona: (p: PersonaId) => void;
  faults: Record<FaultId, boolean>;
  toggleFault: (f: FaultId) => void;
  /** The armed fault's wire name (D-06), or null when all toggles are off. */
  activeChaosFault: string | null;
  /** A live -32042 URL elicitation from the server, awaiting the modal. */
  relink: { url: string; provider: string } | null;
  setRelink: (r: { url: string; provider: string } | null) => void;
  frames: WireFrame[];
  pushFrame: (f: Omit<WireFrame, "n" | "t">) => void;
  clearFrames: () => void;
  /** Total frames pushed this page load (the on-screen ring is capped;
   * framesTotal - frames.length = frames honestly dropped from view). */
  framesTotal: number;
  sessionId: string | null;
  setSessionId: (s: string | null) => void;
  /** Connection lifecycle (lib/session.ts owns the one session):
   * connecting → live → (server forgets us) → reconnecting → live/down. */
  connection: ConnectionState;
  /** Last SSE event id on this session — the replay cursor. */
  lastEventId: string | null;
  /** The shared session: returns the live id, minting on first need.
   * Call sites must ask for this instead of caching an id (FM-23). */
  ensureSession: () => Promise<string | null>;
  /** Force a fresh handshake (the ⚡ re-initialize path). */
  reconnect: () => Promise<string | null>;
  serverState: "unknown" | "up" | "down";
  setServerState: (s: "unknown" | "up" | "down") => void;
  orb: OrbState;
  setOrb: (o: OrbState) => void;
  transcript: TranscriptLine[];
  pushTranscript: (text: string, tag: TranscriptLine["tag"]) => void;
  clearTranscript: () => void;
  morph: { mangled: string; canonical: string; on: boolean } | null;
  setMorph: (m: { mangled: string; canonical: string; on: boolean } | null) => void;
  yieldStep: number; // 0 idle, 1 speaking-long, 2 dip+listen, 3 short-answer, 4 resume-offer
  setYieldStep: (n: number) => void;
  pickedVinyl: number | null;
  setPickedVinyl: (n: number | null) => void;
  ledger: { t: string; text: string; kind: "SAMPLE" | "LIVE" }[];
  pushLedger: (text: string, kind: "SAMPLE" | "LIVE") => void;
}

const Ctx = createContext<SimState | null>(null);

const SEED_LEDGER: SimState["ledger"] = [
  { t: "21:14:02", text: "play Lollipop Lagelu → played [Studio Original] (purity 0.97)", kind: "SAMPLE" },
  { t: "21:14:40", text: "ghost pause detected → rolled back + resumed. sorry about that.", kind: "SAMPLE" },
  { t: "21:15:11", text: "upsell payload blocked: 'Alexa, want Music Unlimited?' never spoken", kind: "SAMPLE" },
];

export function SimProvider({ children }: { children: ReactNode }) {
  const [persona, setPersonaState] = useState<PersonaId | null>(null);
  const [faults, setFaults] = useState<Record<FaultId, boolean>>({ upsell: false, ghost: false, token: false, isp: false });
  const [frames, setFrames] = useState<WireFrame[]>([]);
  const [framesTotal, setFramesTotal] = useState(0);
  const frameCountRef = useRef(0);
  // Session state is OWNED by lib/session.ts (the session manager);
  // these React states are mirrors of its snapshot, kept in sync by the
  // subscription effect below — one source of truth, no stale caches.
  const [sessionId, setSessionIdState] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [lastEventId, setLastEventId] = useState<string | null>(null);
  const [serverState, setServerState] = useState<"unknown" | "up" | "down">("unknown");
  const [orb, setOrb] = useState<OrbState>("idle");
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [morph, setMorph] = useState<SimState["morph"]>(null);
  const [yieldStep, setYieldStep] = useState(0);
  const [pickedVinyl, setPickedVinyl] = useState<number | null>(null);
  const [ledger, setLedger] = useState<SimState["ledger"]>(SEED_LEDGER);
  const [relink, setRelink] = useState<SimState["relink"]>(null);

  const pushFrame = useCallback((f: Omit<WireFrame, "n" | "t">) => {
    frameCountRef.current += 1;
    setFramesTotal(frameCountRef.current);
    setFrames((prev) => [...prev.slice(-199), nextFrame(f)]);
  }, []);

  // The session manager is the single owner; mirror its snapshot into
  // React state and auto-initialize on load (Audit-4 R1: the proof
  // surface is never empty on arrival — the handshake fires itself).
  useEffect(() => {
    const sync = (s: SessionSnapshot) => {
      setSessionIdState(s.sessionId);
      setConnection(s.connection);
      setLastEventId(s.lastEventId);
      setServerState(s.connection === "live" ? "up" : s.connection === "down" ? "down" : "unknown");
    };
    sync(getSessionSnapshot());
    const unsub = subscribeSession(sync);
    void managerEnsureSession(pushFrame);
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setSessionId = useCallback((s: string | null) => {
    adoptSession(s);
  }, []);
  const ensureSession = useCallback(() => managerEnsureSession(pushFrame), [pushFrame]);
  const reconnect = useCallback(() => reconnectSession(pushFrame), [pushFrame]);
  const clearFrames = useCallback(() => setFrames([]), []);
  const pushTranscript = useCallback((text: string, tag: TranscriptLine["tag"]) => {
    setTranscript((prev) => [...prev.slice(-49), { text, tag, ts: new Date().toLocaleTimeString("en-GB") }]);
  }, []);
  const clearTranscript = useCallback(() => setTranscript([]), []);
  const pushLedger = useCallback((text: string, kind: "SAMPLE" | "LIVE") => {
    setLedger((prev) => [{ t: new Date().toLocaleTimeString("en-GB"), text, kind }, ...prev].slice(0, 30));
  }, []);
  const toggleFault = useCallback((f: FaultId) => setFaults((p) => ({ ...p, [f]: !p[f] })), []);

  // D-30: returning from the /relink page with ?relinked=<provider> closes
  // the F-10 loop — the token fault disarms (the link is fresh again) and
  // the return is written to the ledger + transcript, not silently swallowed.
  // The param is stripped before any state push, so a StrictMode double-run
  // or a refresh cannot double-report it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const provider = params.get("relinked");
    if (!provider) return;
    params.delete("relinked");
    const qs = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    setFaults((p) => ({ ...p, token: false }));
    pushLedger(`${provider} reconnected — provider token fresh again`, "LIVE");
    pushTranscript(`alexa: ${provider} is reconnected. Your music link is live again.`, "ALEXA");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setPersona = useCallback((p: PersonaId) => {
    setPersonaState(p);
    setMorph(null);
    setYieldStep(0);
    setPickedVinyl(null);
    setOrb("idle");
  }, []);

  const activeChaosFault = FAULT_PRIORITY.find((f) => faults[f])
    ? FAULT_TO_CHAOS[FAULT_PRIORITY.find((f) => faults[f]) as FaultId]
    : null;

  const value = useMemo<SimState>(() => ({
    persona, setPersona, faults, toggleFault, activeChaosFault, relink, setRelink,
    frames, pushFrame, clearFrames, framesTotal,
    sessionId, setSessionId, connection, lastEventId, ensureSession, reconnect,
    serverState, setServerState, orb, setOrb,
    transcript, pushTranscript, clearTranscript, morph, setMorph,
    yieldStep, setYieldStep, pickedVinyl, setPickedVinyl, ledger, pushLedger,
  }), [persona, setPersona, faults, toggleFault, activeChaosFault, relink,
      frames, pushFrame, clearFrames, framesTotal,
      sessionId, setSessionId, connection, lastEventId, ensureSession, reconnect,
      serverState, orb, transcript, pushTranscript, clearTranscript,
      morph, yieldStep, pickedVinyl, ledger, pushLedger]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSim(): SimState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSim outside SimProvider");
  return v;
}
