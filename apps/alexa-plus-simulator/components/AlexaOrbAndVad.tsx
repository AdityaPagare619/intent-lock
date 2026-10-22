/**
 * THE STAGE — Alexa's world (audit-3 two-world system).
 * Squid Ink + Alexa Blue only above this waterline. Her presence is the
 * Living Ring + the bottom light bar; her words are set in display type;
 * the mangled phrase is struck through and resolves as understanding
 * lands. Plain words only — codenames live in the engine room.
 *
 * Everything Alexa DOES here is unchanged: the VAD engine (Silero WASM
 * primary, WebAudio fallback — lib/vad.ts), the scripted beats
 * (lib/demo.ts), and the LIVE interrupt path (a real tools/call
 * omnibeat_fastpath_interrupt at the exact word index). Only the
 * presentation moved worlds.
 */
"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { runDemoTurn } from "../lib/demo";
import { findRelink, mcpCallTool } from "../lib/mcp";
import { personaById } from "../lib/personas";
import { useSim, type OrbState } from "../lib/sim-context";
import { createVadController, type VadController, type VadEngine } from "../lib/vad";
import BrainStatus from "./BrainStatus";
import { IconMic, IconPlay, IconShield, IconUsers, IconWifiOff, IconZap } from "./Icons";
import { useStage, type TurnPhase } from "./IntentLockStage";
import { LivingRing, StageLightBar, usePresence } from "./LivingRing";

// The long bio Alexa "reads" in the live-interrupt flow. Word cursor runs
// at ~300 ms/word (labeled SIM cadence — the judging laptop has no Echo TTS).
const LONG_BIO =
  "Pawan Singh, born 5 January 1986, is an Indian playback singer and actor known as the Power Star of Bhojpuri cinema, with a career spanning over two decades, dozens of chart-topping hits, and a massive fan following across Bihar, Uttar Pradesh, and the global Bhojpuri diaspora.";
const SHORT_ANSWER = "Got it — short version: Pawan Singh, 2011 Bhojpuri hit.";
const WORD_MS = 300;

/** Plain-words names for the beats, for stage copy (no codenames up here). */
const BEAT_PLAIN: Record<string, string> = {
  noida: "the mishear",
  seattle: "the interruption",
  madrid: "the group-chat shield",
  rural: "the blackout bunker",
};

const STATE_LABEL: Record<OrbState | "thinking", string> = {
  idle: "Ready when you are",
  listening: "Listening…",
  thinking: "Working on it — watch the wire below",
  speaking: "She's talking",
  banter: "Waiting out the group chat",
  yield: "Yielding — she's listening to you",
};

/** Round 2: labels for the Intent Lock turn lifecycle. Each names the
 * state the system is verifiably in — the phase is set by fire() and
 * the response's own status, never by a timer acting a part. */
const PHASE_LABEL: Record<Exclude<TurnPhase, "idle">, string> = {
  inflight: "Working on it — her calls are in the terminal below",
  locked: "Locked — the proof is on the card",
  tie: "A tie — she named them, the pick is yours",
  refused: "No lock — she refused to guess",
  error: "That turn failed — nothing was faked",
};

const TAG_PLAIN: Record<string, string> = {
  "SIM-ASR": "heard · simulated",
  ALEXA: "Alexa",
  YOU: "You",
  SYS: "note",
};

/* ── Room sound: REAL mic envelope only ────────────────────────────────
   The old waveform drew sin() clockwork — fabricated activity, deleted.
   This meter is driven by the parent envelope ref, which is fed by real
   VAD events from the live microphone. Mic off → the line stays flat,
   and the label says why. */
function RoomSound({ levelRef, micOn }: { levelRef: RefObject<number>; micOn: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let shown = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (document.hidden) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      if (canvas.width !== Math.round(w * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      // gentle decay of event spikes toward the room's base level
      if (micOn) levelRef.current = Math.max(0.05, (levelRef.current ?? 0) * 0.998);
      const target = micOn ? levelRef.current ?? 0 : 0;
      shown += (target - shown) * 0.12;
      const t = performance.now() / 1000;
      const bars = 48;
      const bw = w / bars;
      const grad = ctx.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, "rgba(0,202,255,0.85)");
      grad.addColorStop(1, "rgba(143,235,255,0.9)");
      ctx.fillStyle = grad;
      for (let i = 0; i < bars; i++) {
        // texture is proportional to the REAL level: silence = flat line
        const texture = 0.55 + 0.45 * Math.sin(i * 0.7 + t * 3.1) * Math.sin(i * 0.23 - t * 1.7);
        const bh = Math.max(2, shown * texture * h * 0.92);
        ctx.beginPath();
        ctx.roundRect(i * bw + 1.5, (h - bh) / 2, bw - 3, bh, 3);
        ctx.fill();
      }
      if (reduced) return; // one representative frame is enough
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [levelRef, micOn]);

  return (
    <div>
      <canvas ref={ref} className="h-12 w-full" />
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-[11px] text-stage-ink-3">Room sound</span>
        <span className="text-[11px] text-stage-ink-3">
          {micOn ? "live from your microphone" : "mic is off — a quiet room stays flat"}
        </span>
      </div>
    </div>
  );
}

/* ── The utterance, in display type ────────────────────────────────────
   The sentence this product exists to rescue, finally set like it
   matters: what she heard (struck through when it was wrong), what she
   understood (resolved, large), what she said back. */
function StageUtterance() {
  const { transcript, morph, persona } = useSim();
  const def = persona ? personaById(persona) : null;
  const lastAsr = [...transcript].reverse().find((l) => l.tag === "SIM-ASR");
  const lastAlexa = [...transcript].reverse().find((l) => l.tag === "ALEXA");
  const resolved = morph?.on ? morph : null;

  let heard: ReactNode;
  if (resolved) {
    heard = (
      <>
        <span className="text-stage-ink-2">play </span>
        <span className="text-stage-ink-3 line-through decoration-[#ef5350]/80 decoration-[3px]">
          {resolved.mangled}
        </span>
      </>
    );
  } else if (lastAsr) {
    heard = <span className="text-stage-ink">{lastAsr.text}</span>;
  } else if (def) {
    heard = <span className="text-stage-ink">{def.simAsr}</span>;
  } else {
    heard = <span className="text-stage-ink">Say the thing she always gets wrong.</span>;
  }

  return (
    <div className="min-w-0">
      <div className="text-[12.5px] font-medium text-stage-ink-3">
        {lastAsr || resolved ? "You said" : def ? "This beat starts with" : "The whole idea"}
      </div>
      <div
        key={resolved ? resolved.canonical : lastAsr?.text ?? def?.simAsr ?? "idle"}
        className="animate-rise-in mt-1 font-stage text-[26px] font-semibold leading-[1.18] min-[760px]:text-[32px] min-[1280px]:text-[36px]"
      >
        {heard}
      </div>
      {resolved ? (
        <div
          key={`resolved-${resolved.canonical}`}
          className="animate-morph-in mt-2 font-stage text-[19px] font-medium leading-snug text-stage-ink min-[1280px]:text-[21px]"
          style={{ animationDelay: "0.18s" }}
        >
          <span className="text-alexa">Understood: </span>
          {resolved.canonical}
        </div>
      ) : (
        <div className="mt-2 max-w-[52ch] text-[13.5px] leading-relaxed text-stage-ink-2">
          {lastAsr
            ? "Heard by the simulated mic. The rescue itself happens on the real wire — watch it travel below."
            : "She mishears accents, guesses between same-name songs, and won't stop talking. OmniBeat catches all three — live, underneath her."}
        </div>
      )}
      {lastAlexa && (
        <div className="animate-rise-in mt-3 border-l-2 border-alexa/50 pl-3" key={lastAlexa.text}>
          <span className="text-[12px] font-medium text-alexa">Alexa </span>
          <span className="font-stage text-[16.5px] leading-snug text-stage-ink">{lastAlexa.text}</span>
        </div>
      )}
    </div>
  );
}

/* ── Connection state, in product language ── */
function ConnectionChip() {
  const { serverState, sessionId } = useSim();
  if (serverState === "up") {
    return (
      <span className="stage-card flex shrink-0 items-center gap-2 px-3 py-1.5 text-[12px] text-stage-ink-2">
        <span className="h-2 w-2 rounded-full bg-alexa shadow-[0_0_8px_rgba(0,202,255,0.9)]" />
        Connected — the wire below is live
      </span>
    );
  }
  if (serverState === "down") {
    return (
      <span className="stage-card flex shrink-0 items-center gap-2 px-3 py-1.5 text-[12px] text-stage-ink-2">
        <IconWifiOff size={14} className="text-stage-ink-3" />
        Can&apos;t reach the music brain — the engine room below shows why
      </span>
    );
  }
  return (
    <span
      className="stage-card flex shrink-0 items-center gap-2 px-3 py-1.5 text-[12px] text-stage-ink-2"
      title={sessionId ?? undefined}
    >
      <span className="h-2 w-2 rounded-full bg-stage-ink-3" />
      Not connected yet — run a beat, or connect from the wire below
    </span>
  );
}

const stageBtn =
  "flex items-center justify-center gap-2 rounded-full border border-stage-line/50 bg-white/[0.05] px-3.5 py-2.5 text-[13px] font-medium text-stage-ink transition-all duration-150 hover:bg-white/[0.10] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40";

export default function AlexaOrbAndVad({ thinking = false }: { thinking?: boolean }) {
  const sim = useSim();
  const stage = useStage();
  const { persona, orb, transcript, yieldStep } = sim;
  const [running, setRunning] = useState(false);
  const [liveSpeaking, setLiveSpeaking] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [vadEngine, setVadEngine] = useState<VadEngine>("off");
  const [micError, setMicError] = useState<string | null>(null);
  const tokenRef = useRef({ cancelled: false });
  const scrollRef = useRef<HTMLDivElement>(null);
  const vadRef = useRef<VadController | null>(null);
  const wordIndexRef = useRef(0);
  const cursorTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wordsRef = useRef<string[]>([]);
  // REAL mic level envelope (0..1): fed only by live VAD events below;
  // read by the Living Ring (listening wedge) and the room-sound meter.
  const levelRef = useRef(0);
  // Round 2 (D2/D3): the Intent Lock turn lifecycle drives the same
  // ring — in-flight = the travel grammar (one truthful working state;
  // the brain/kernel split is not client-observable mid-call), a lock
  // or tie = she speaks her answer, a no_lock = the refused presence.
  const phase = stage.turnPhase;
  const phaseThinking = thinking || phase === "inflight";
  const refused = phase === "refused" || phase === "error";
  const ringState: OrbState = phase === "locked" || phase === "tie" ? "speaking" : orb;
  const presence = usePresence(ringState, phaseThinking, levelRef, refused);
  // latest sim/sessionId for async VAD callbacks (avoid stale closures)
  const simRef = useRef(sim);
  simRef.current = sim;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduced ? "auto" : "smooth" });
  }, [transcript.length]);

  useEffect(() => {
    return () => {
      if (cursorTimerRef.current) clearInterval(cursorTimerRef.current);
      vadRef.current?.destroy().catch(() => undefined);
    };
  }, []);

  const def = persona ? personaById(persona) : null;
  const effState: OrbState | "thinking" = thinking ? "thinking" : orb;

  const stopCursor = () => {
    if (cursorTimerRef.current) {
      clearInterval(cursorTimerRef.current);
      cursorTimerRef.current = null;
    }
    vadRef.current?.setAlexaSpeaking(false);
  };

  // --- VAD event handlers -------------------------------------------------
  const handleBanter = (source: "mic" | "SIM") => {
    const s = simRef.current;
    if (s.orb === "banter") return;
    s.setOrb("banter");
    s.pushTranscript(
      `Group chat detected — I'll wait. (wake-word locked)${source === "SIM" ? " [simulated]" : ""}`,
      "SYS"
    );
  };

  const handleQuietAfterBanter = () => {
    const s = simRef.current;
    if (s.orb !== "banter") return;
    s.pushTranscript("Soft earcon — room settled, she's available again", "SYS");
    s.setOrb("idle");
  };

  const handleBargeIn = async (source: "mic" | "SIM") => {
    const s = simRef.current;
    if (s.orb !== "speaking" || !liveSpeakingRef.current) return;
    const idx = wordIndexRef.current;
    liveSpeakingRef.current = false;
    setLiveSpeaking(false);
    stopCursor();

    const bargeCmd = "stop yapping, short version";
    s.pushTranscript(`bro, stop yapping — just the short version${source === "SIM" ? " [simulated]" : ""}`, "YOU");
    s.setOrb("yield");
    s.setYieldStep(2); // the dip + "listening…" pulse — NOT a guillotine

    // REAL wire call: the exact word index where she was interrupted.
    let ledgerNote: string;
    if (s.sessionId) {
      const res = await mcpCallTool(s.pushFrame, s.sessionId, "omnibeat_fastpath_interrupt", {
        interrupted_at_word_index: idx,
        barge_in_command: bargeCmd,
      }, s.activeChaosFault);
      const rl = findRelink(res.payloads);
      if (rl) s.setRelink(rl);
      ledgerNote = res.ok
        ? `fastpath_interrupt @ word ${idx} → graceful yield (LIVE, ${source})`
        : `fastpath_interrupt @ word ${idx} → wire FAILED: ${res.error}`;
    } else {
      s.pushFrame({
        dir: "⚠",
        label: "interrupt skipped — no session",
        body: "no Mcp-Session-Id (server down?). Connect from the wire inspector first.",
      });
      ledgerNote = `fastpath_interrupt @ word ${idx} → no session, UI-only yield`;
    }

    await new Promise((r) => setTimeout(r, 1200)); // the 1.2 s listen window
    s.setYieldStep(3);
    s.pushTranscript(SHORT_ANSWER, "ALEXA");
    s.pushLedger(ledgerNote, "LIVE");
    await new Promise((r) => setTimeout(r, 900));
    s.setYieldStep(4); // resume offer
    s.setOrb("idle");
  };

  const liveSpeakingRef = useRef(false);

  const onVadEvent = (e: { kind: string }) => {
    // feed the REAL level envelope — the ring's wedge and the room-sound
    // meter both drink from this, and from nothing else.
    if (e.kind === "speech-start") levelRef.current = 0.75;
    else if (e.kind === "banter") levelRef.current = 0.55;
    else if (e.kind === "barge-in") levelRef.current = 1;
    else if (e.kind === "speech-end" || e.kind === "quiet") levelRef.current = 0.06;

    if (e.kind === "banter") handleBanter("mic");
    else if (e.kind === "quiet") handleQuietAfterBanter();
    else if (e.kind === "barge-in") void handleBargeIn("mic");
  };

  const enableMic = async () => {
    if (vadRef.current) return;
    setMicError(null);
    try {
      const vad = await createVadController(onVadEvent);
      vadRef.current = vad;
      setVadEngine(vad.engine);
      await vad.start();
      setMicOn(true);
      sim.pushTranscript(
        `Mic live — ${vad.engine === "silero" ? "Silero VAD" : "WebAudio fallback"} classifying. Talk over her, or laugh with friends.`,
        "SYS"
      );
    } catch (err) {
      setMicError(err instanceof Error ? err.message : "mic unavailable");
      sim.pushTranscript("Mic blocked — use the simulated inject buttons for the demo.", "SYS");
    }
  };

  // --- live interrupt flow (the interruption, real path) ------------------
  const speakLongBio = () => {
    const s = simRef.current;
    if (liveSpeakingRef.current) return;
    stopCursor();
    wordsRef.current = LONG_BIO.split(" ");
    wordIndexRef.current = 0;
    liveSpeakingRef.current = true;
    setLiveSpeaking(true);
    s.setYieldStep(1);
    s.setOrb("speaking");
    vadRef.current?.setAlexaSpeaking(true);
    s.pushTranscript(LONG_BIO, "ALEXA");
    s.pushTranscript("…(she keeps going — interrupt her by mic, or with the simulated barge-in)", "SYS");
    cursorTimerRef.current = setInterval(() => {
      wordIndexRef.current += 1;
      if (wordIndexRef.current >= wordsRef.current.length) {
        // she finished before anyone interrupted — natural end
        liveSpeakingRef.current = false;
        setLiveSpeaking(false);
        stopCursor();
        simRef.current.setOrb("idle");
        simRef.current.setYieldStep(0);
      }
    }, WORD_MS);
  };

  const resumeBio = () => {
    const s = simRef.current;
    const rest = wordsRef.current.slice(wordIndexRef.current + 1).join(" ");
    s.setYieldStep(0);
    if (rest) s.pushTranscript(`…(continuing) ${rest}`, "ALEXA");
    s.setOrb("idle");
  };

  // --- scripted storyboard beat --------------------------------------------
  const run = async () => {
    if (!def || running) return;
    tokenRef.current.cancelled = true; // cancel any previous run
    const token = { cancelled: false };
    tokenRef.current = token;
    setRunning(true);
    try {
      await runDemoTurn(sim, def, token);
    } finally {
      if (!token.cancelled) setRunning(false);
    }
  };

  return (
    <div className="stage-scope flex min-h-0 flex-1 flex-col">
      {/* frame header — the honesty label is a first-class element */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 min-[760px]:px-6">
        <div>
          <div className="font-stage text-[16px] font-semibold text-stage-ink">Alexa+ stage</div>
          <div className="mt-0.5 max-w-[46ch] text-[12px] leading-snug text-stage-ink-3">
            Simulated Alexa+ environment — the voice shell is a stand-in. The wire in the engine room below is real.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BrainStatus />
          <ConnectionChip />
        </div>
      </div>

      {/* presence + conversation */}
      <div className="scroll-stage flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-5 pb-2 min-[760px]:px-6 min-[900px]:flex-row min-[900px]:gap-7">
        {/* her presence */}
        <div className="flex shrink-0 flex-col items-center justify-center py-2 min-[900px]:w-[280px]">
          <div className="relative">
            <LivingRing
              params={presence}
              state={ringState}
              thinking={phaseThinking}
              refused={refused}
              className="h-[176px] w-[176px] min-[760px]:h-[216px] min-[760px]:w-[216px] min-[1280px]:h-[256px] min-[1280px]:w-[256px]"
            />
            {orb === "banter" && (
              <div className="animate-pill-in absolute -right-1 -top-1 flex items-center gap-1 rounded-full border border-stage-line/60 bg-stage-raise px-2 py-1 text-[11px] text-stage-ink-2 shadow-lg">
                <IconShield size={13} className="text-cyan-soft" />
                shield up
              </div>
            )}
          </div>
          <div className="mt-1 text-center font-stage text-[14px] text-stage-ink-2" aria-live="polite">
            {phase !== "idle" ? PHASE_LABEL[phase] : STATE_LABEL[effState]}
          </div>
          <div className="mt-0.5 text-[11.5px] text-stage-ink-3">
            {vadEngine === "off"
              ? "mic off — her light answers the wire, not the room"
              : vadEngine === "silero"
                ? "Silero VAD · live mic"
                : "WebAudio fallback · live mic"}
          </div>
        </div>

        {/* the conversation */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col py-2">
          <StageUtterance />

          {/* banter shield pill */}
          {orb === "banter" && (
            <div className="animate-pill-in stage-card mt-3 flex items-center gap-2 px-3.5 py-2.5 text-[13px] text-stage-ink-2">
              <IconShield size={15} className="shrink-0 text-cyan-soft" />
              Group chat detected — I&apos;ll wait. <span className="text-stage-ink-3">(no wake-word hijack)</span>
            </div>
          )}

          {/* graceful yield view — the dip, not the guillotine */}
          {yieldStep >= 2 && (
            <div className="animate-pill-in stage-card mt-3 p-3.5">
              <div className="text-[12px] font-semibold text-cyan-soft">
                Graceful yield — not a guillotine
              </div>
              <div className="mt-2 flex h-10 items-end gap-1 overflow-hidden" aria-hidden>
                {Array.from({ length: 36 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-full origin-bottom rounded-sm ${yieldStep === 2 ? "animate-dip bg-alexa/75" : "bg-alexa/20"}`}
                    style={{ height: `${18 + 14 * Math.abs(Math.sin(i * 0.8))}px`, animationDelay: `${i * 18}ms` }}
                  />
                ))}
              </div>
              {yieldStep === 2 && (
                <div className="mt-2 flex items-center gap-2 text-[13.5px] text-stage-ink">
                  <span className="flex gap-1">
                    {[0, 1, 2].map((d) => (
                      <span key={d} className="animate-listening-dots h-1.5 w-1.5 rounded-full bg-cyan-soft" style={{ animationDelay: `${d * 0.22}s` }} />
                    ))}
                  </span>
                  listening…
                </div>
              )}
              {yieldStep >= 4 && (
                <button
                  onClick={resumeBio}
                  className="animate-pill-in mt-2 rounded-full border border-alexa/40 bg-alexa/15 px-3 py-1.5 text-[12.5px] text-stage-ink transition-all duration-150 hover:bg-alexa/25 active:scale-[0.97]"
                >
                  Want the full bio?
                </button>
              )}
            </div>
          )}

          {/* transcript */}
          <div className="mt-4 flex min-h-[120px] flex-1 flex-col">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-medium text-stage-ink-2">The conversation</span>
              <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10.5px] text-stage-ink-3">
                voice lines are simulated
              </span>
            </div>
            <div ref={scrollRef} className="scroll-stage min-h-0 flex-1 space-y-2 overflow-y-auto rounded-2xl bg-black/25 p-3.5">
              {transcript.length === 0 && (
                <div className="pt-5 text-center text-[13px] leading-relaxed text-stage-ink-3">
                  Quiet room.<br />Pick a beat on the left and she&apos;ll start talking — wrongly, at first.
                </div>
              )}
              {transcript.map((l, i) => (
                <div key={i} className="animate-rise-in text-[14px] leading-relaxed">
                  <span
                    className={`mr-2 inline-block rounded-full px-2 py-0.5 align-middle text-[10.5px] font-semibold ${
                      l.tag === "ALEXA" ? "bg-alexa/15 text-alexa" : "bg-white/[0.07] text-stage-ink-2"
                    }`}
                  >
                    {TAG_PLAIN[l.tag]}
                  </span>
                  <span className="text-stage-ink">{l.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* controls — everything she can do, in her language */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={run}
              disabled={!def || running}
              className="flex items-center gap-2 rounded-full bg-alexa px-4 py-2.5 text-[13.5px] font-semibold text-[#04222e] shadow-[0_0_24px_rgba(0,202,255,0.35)] transition-all duration-150 hover:bg-cyan-soft active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              <IconPlay size={14} />
              {!def ? "Pick a beat to begin" : running ? "Running…" : `Run ${BEAT_PLAIN[def.id]}`}
            </button>
            <button onClick={enableMic} disabled={micOn} className={stageBtn}>
              <IconMic size={15} className={micOn ? "text-alexa" : undefined} />
              {micOn ? `Mic live (${vadEngine})` : "Enable the mic"}
            </button>
            <button onClick={speakLongBio} disabled={liveSpeaking} className={stageBtn}>
              <IconPlay size={13} />
              {liveSpeaking ? "She's rambling — interrupt her" : "Let her ramble, then interrupt"}
            </button>
            <button
              onClick={() => (vadRef.current ? vadRef.current.injectTestEvent("barge-in") : void handleBargeIn("SIM"))}
              disabled={!liveSpeaking}
              className={stageBtn}
            >
              <IconZap size={14} />
              Interrupt her (simulated)
            </button>
            <button
              onClick={() => (vadRef.current ? vadRef.current.injectTestEvent("banter") : handleBanter("SIM"))}
              className={stageBtn}
            >
              <IconUsers size={15} />
              Fake a group chat (simulated)
            </button>
          </div>
          {micError && <div className="mt-1.5 text-[12px] text-stage-ink-2">Mic error: {micError}</div>}

          <div className="mt-3">
            <RoomSound levelRef={levelRef} micOn={micOn} />
          </div>
        </div>
      </div>

      {/* the light bar — on the stage's bottom edge, where Alexa+ keeps it */}
      <div className="px-5 pb-3.5 min-[760px]:px-6">
        <StageLightBar params={presence} state={ringState} thinking={phaseThinking} refused={refused} />
        <div className="mt-1 flex items-center justify-between text-[10.5px] text-stage-ink-3">
          <span>Her light bar — cyan wedge: listening · traveling light: thinking · pulse: speaking · dim + low: refused</span>
          <span className="hidden min-[760px]:inline">not an Amazon product — a labeled simulation</span>
        </div>
      </div>
    </div>
  );
}
