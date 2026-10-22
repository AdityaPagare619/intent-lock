/**
 * Scripted demo beats. Everything the "user" and "Alexa" SAY in these beats
 * is labeled SIM (stand-ins for Echo mic/ASR/TTS — the judging laptop has no
 * Echo). The MCP wire calls are REAL — and a beat NEVER silently skips
 * one (Audit-4's silent-simulation trap): it asks the shared session
 * manager for a live session, and if the stack is unreachable it says so
 * on stage and in the ledger instead of performing an unfalsifiable show.
 */
import { findRelink, mcpCallTool } from "./mcp";
import { personaById, type PersonaDef } from "./personas";

type Sim = {
  pushTranscript: (t: string, tag: "SIM-ASR" | "ALEXA" | "YOU" | "SYS") => void;
  clearTranscript: () => void;
  setOrb: (o: "idle" | "listening" | "speaking" | "banter" | "yield") => void;
  setMorph: (m: { mangled: string; canonical: string; on: boolean } | null) => void;
  setYieldStep: (n: number) => void;
  pushLedger: (t: string, k: "SAMPLE" | "LIVE") => void;
  pushFrame: (f: { dir: "C→S" | "S→C" | "⚠"; label: string; body: string }) => void;
  sessionId: string | null;
  /** The shared session lifecycle (lib/session.ts via sim-context). */
  ensureSession: () => Promise<string | null>;
  activeChaosFault: string | null;
  setRelink: (r: { url: string; provider: string } | null) => void;
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function realToolCall(sim: Sim, def: PersonaDef) {
  if (!def.tool) return;
  // Never a silent no-op: get a live session from the shared manager
  // (it mints/re-mints as needed), or surface the failure on stage.
  const sid = sim.sessionId ?? (await sim.ensureSession());
  if (!sid) {
    sim.pushTranscript(
      "⚠ This beat's real MCP call never fired — the music brain isn't answering, so there is no session. Nothing on this stage is faked to fill the gap; the wire below shows the failed handshake.",
      "SYS"
    );
    sim.pushLedger(`${def.tool} → NOT SENT — no live MCP session (stack unreachable)`, "LIVE");
    return;
  }
  const res = await mcpCallTool(sim.pushFrame, sid, def.tool, def.args ?? {}, sim.activeChaosFault);
  const rl = findRelink(res.payloads);
  if (rl) {
    sim.setRelink(rl);
    return;
  }
  if (res.ok) {
    const summary = res.payloads
      .map((p) => (typeof p === "string" ? p : JSON.stringify(p)))
      .join(" ")
      .slice(0, 140);
    sim.pushLedger(`${def.tool} → ${summary || "ok"}`, "LIVE");
  } else {
    sim.pushLedger(`${def.tool} → FAILED: ${res.error}`, "LIVE");
  }
}

export async function runDemoTurn(sim: Sim, def: PersonaDef, token: { cancelled: boolean }) {
  sim.clearTranscript();
  sim.setYieldStep(0);
  sim.setMorph(null);
  sim.setOrb("listening");
  await wait(500);
  if (token.cancelled) return;
  sim.pushTranscript(def.simAsr, "SIM-ASR");

  if (def.id === "madrid") {
    // UC-3: banter shield — she does NOT take the turn.
    await wait(700);
    if (token.cancelled) return;
    sim.setOrb("banter");
    sim.pushTranscript("[room laughter, two voices overlapping — no wake-word lock]", "SYS");
    await wait(900);
    if (token.cancelled) return;
    sim.pushTranscript(def.alexaLine, "ALEXA");
    await wait(1600);
    if (token.cancelled) return;
    sim.pushTranscript("♪ soft earcon — room settled, she's available again", "SYS");
    sim.setOrb("idle");
    return;
  }

  if (def.id === "seattle") {
    // UC-4: the Graceful Yield — dip, listen pulse, short answer, resume offer.
    sim.setOrb("speaking");
    sim.setYieldStep(1);
    sim.pushTranscript(
      "Pawan Singh (born 5 January 1986) is an Indian playback singer and actor known as the Power Star of Bhojpuri cinema, with a career spanning…",
      "ALEXA"
    );
    await wait(1700);
    if (token.cancelled) return;
    sim.pushTranscript("bro, stop yapping — just the short version", "YOU");
    sim.setOrb("yield");
    sim.setYieldStep(2); // the dip + "listening…" pulse, not a guillotine
    await wait(1500);
    if (token.cancelled) return;
    sim.setYieldStep(3);
    sim.pushTranscript(def.alexaLine, "ALEXA");
    sim.pushLedger("fastpath_interrupt @ word 34 → graceful yield, remainder compressed to 12 words", "SAMPLE");
    await wait(1300);
    if (token.cancelled) return;
    sim.setYieldStep(4); // resume offer
    sim.setOrb("idle");
    realToolCall(sim, def); // fire-and-forget: real wire, honest timing
    return;
  }

  // noida (UC-1) + rural (UC-5): speak, show the studio-deck visual, then the real call.
  await wait(700);
  if (token.cancelled) return;
  sim.setOrb("speaking");
  if (def.morph) sim.setMorph({ ...def.morph, on: true });
  await wait(900);
  if (token.cancelled) return;
  sim.pushTranscript(def.alexaLine, "ALEXA");
  await realToolCall(sim, def);
  if (token.cancelled) return;
  sim.setOrb("idle");
}

export { personaById };
