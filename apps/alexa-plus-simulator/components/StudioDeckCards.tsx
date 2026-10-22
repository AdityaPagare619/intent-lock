/**
 * RIGHT panel — StudioDeckCards.
 * Phonetic morph card · artwork-first hook sampler (REAL elicitation
 * audio under a deadline pipeline + verified-effect playback contract) ·
 * truth-ledger view (REAL resource when the server is up) ·
 * phase-sync visualizer (REAL measured drift via multiroom_clock) ·
 * bunker pill (REAL IndexedDB cache via indexedb_bunker).
 *
 * Honesty rule: anything labeled SIM is a stand-in. Audio hooks, ledger
 * rows, drift numbers and cached bytes are all real or explicitly marked
 * unavailable — never synthesized. A hook is only ever shown as "heard"
 * on evidence of audible playback (FM-36); a slow preview is called
 * slow, never silently swapped or spun forever (FM-34).
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { useSim } from "../lib/sim-context";
import { findRelink, mcpInitialize, mcpCallTool, mcpRpc } from "../lib/mcp";
import {
  BunkerPlayer,
  bunkerCacheTrack,
  bunkerList,
  BUNKER_SEED_TRACKS,
  type BunkerTrack,
} from "../workers/indexedb_bunker";
import { MultiroomClock } from "../workers/multiroom_clock";
import {
  DeadlineToken,
  PlaybackEvidence,
  extractHookUnderDeadline,
  EXTRACT_DEADLINE_MS,
  type ChorusWindowResult,
} from "../workers/chorus_extract";

/* ------------------------------------------------------------------ */
/* Phonetic morph card (unchanged — the 200ms visual money-shot)       */
/* ------------------------------------------------------------------ */

function MorphCard() {
  const { morph, persona, pushTranscript } = useSim();
  if (!morph || persona !== "noida") return null;
  return (
    <div className="panel rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-faint">
          Phonetic morph · E1
        </span>
        <button
          onClick={() => pushTranscript("replaying the morph…", "SYS")}
          className="rounded bg-panel-2 px-1.5 py-0.5 text-[9px] text-faint hover:bg-white/[0.06]"
        >
          ↻ replay
        </button>
      </div>
      <div key={morph.mangled + morph.canonical} className="mt-2">
        <div className="animate-morph-in font-mono text-[15px] text-coral/90 line-through decoration-coral/60">
          “{morph.mangled}”
        </div>
        <div className="my-1.5 flex items-center gap-2 text-faint">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-brand/60 to-transparent" />
          <span className="text-[10px] uppercase tracking-[0.2em] text-brand">phonetic judo · ~200ms</span>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-brand/60 to-transparent" />
        </div>
        <div className="animate-morph-in font-mono text-[15px] text-sage" style={{ animationDelay: "0.35s" }}>
          “{morph.canonical}”
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hook sampler — REAL MCP elicitation: artwork-first candidate cards,  */
/* hooks from the wire under a deadline pipeline (FM-34), played under  */
/* a verified-effect contract (FM-36); pick by card or by voice         */
/* ("the second one!") sent back as input_responses. The choice layer   */
/* never depends on the audio layer: cards + pick buttons render the    */
/* moment candidates exist, and every candidate stays pickable —        */
/* heard, not-heard, slow or dead.                                      */
/* ------------------------------------------------------------------ */

/** Whole-sequence budget: one slow candidate can never starve the rest
 *  past this; per-candidate extraction draws child tokens from it. */
const HOOK_SEQUENCE_BUDGET_MS = 24000;

type PlayOutcome = "audible" | "not-heard" | "dead" | "cancelled";

type HookAttempt =
  | { kind: "heard"; via: "preview" | "local" }
  | { kind: "not-heard" }
  | { kind: "slow" }
  | { kind: "dead"; detail?: string }
  | { kind: "no-preview" }
  | { kind: "cancelled" };

/** Per-card hook truth. "playing" is entered ONLY on verified audible
 *  progression — never on a timer, never on hope. */
interface HookCardState {
  status:
    | "waiting"
    | "fetching"
    | "starting"
    | "playing"
    | "heard"
    | "not-heard"
    | "slow"
    | "dead";
  via?: "preview" | "local";
  /** plain-words note when a fallback covered for a failed preview */
  note?: string;
  /** live verified progression (seconds) while the hook is sounding */
  heardSec?: number;
}

/** Plain-words copy for every hook state (J-05 voice). Slow, dead and
 *  not-heard are three different sentences because they are three
 *  different truths; "heard" is the only success and it is earned. */
function hookStateCopy(hs: HookCardState): { text: string; cls: string } {
  switch (hs.status) {
    case "waiting":
      return { text: "hook not played yet", cls: "text-faint" };
    case "fetching":
      return { text: "fetching the real 30-second preview…", cls: "text-brand/80" };
    case "starting":
      return { text: "starting the hook…", cls: "text-brand/80" };
    case "playing":
      return {
        text: `♪ playing the chorus — ${(hs.heardSec ?? 0).toFixed(1)}s heard so far`,
        cls: "font-semibold text-sage",
      };
    case "heard":
      return {
        text:
          hs.via === "preview"
            ? "♪ heard it — the real preview chorus"
            : "♪ heard it — a local hook",
        cls: "font-semibold text-sage",
      };
    case "not-heard":
      return {
        text: "couldn't hear it — nothing actually played",
        cls: "text-coral/85",
      };
    case "slow":
      return {
        text: "the preview was too slow — gave up waiting",
        cls: "text-coral/85",
      };
    case "dead":
      return { text: "the preview link is dead", cls: "text-coral/85" };
  }
}

interface Candidate {
  index: number;
  id: string;
  title: string;
  artist: string;
  kind: string;
  popularity: number;
  region: string;
  hook_url: string;
  /** real 30s iTunes preview (E2 zero-cost hydration) — dynamic hooks when present */
  preview_url?: string;
  /** real catalog cover art (artworkUrl100) — rendered at 600px, never faked */
  artwork_url?: string;
  purity_score: number;
}

/** iTunes serves artwork at the size named in the URL path (…/100x100bb.jpg).
 *  Ask the same CDN path for 600x600. Non-iTunes-shaped URLs pass through. */
function artwork600(url: string): string {
  return url.replace(/\/\d+x\d+bb\./, "/600x600bb.");
}

/** Elicitation hook_url (/static/hooks/<id>.mp3 — dangling on the server) ->
 *  our royalty-free local motifs in /public/hooks. The server track ids
 *  (rj-001…) do NOT match the WAV stems, so map SEMANTICALLY: title+kind
 *  first, known title aliases next, raw id-stem last. Returns an ordered
 *  fallback list — the player tries each until one plays.
 *  (Contract fix 2026-10-19: Kabir's catalog ids vs Meera's WAV stems —
 *  "hook unavailable" on every card until this landed.) */
const HOOK_STEM_ALIASES: Record<string, string> = {
  "mujhe-tum-yaad-aana": "mujhe-tum-yaad",
  "mujhe-tum-yaad-aate-ho": "mujhe-tum-yaad",
};
function normStem(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function hookUrlsFor(c: Candidate): string[] {
  const urls: string[] = [];
  const rawTitle = normStem(c.title);
  const titleStem = HOOK_STEM_ALIASES[rawTitle] ?? rawTitle;
  const kind = normStem((c as unknown as { kind?: string }).kind || "studio") || "studio";
  if (titleStem) {
    urls.push(`/hooks/${titleStem}-${kind}.wav`);
    if (kind !== "studio") urls.push(`/hooks/${titleStem}-studio.wav`);
    urls.push(`/hooks/${titleStem}.wav`);
  }
  const serverStem = (c.hook_url || "").split("/").pop()?.replace(/\.[^.]+$/, "");
  if (serverStem) urls.push(`/hooks/${normStem(serverStem)}.wav`);
  return [...new Set(urls)];
}

type SamplerPhase = "idle" | "fetching" | "playing" | "awaiting-pick" | "resolving" | "resolved" | "unavailable";

function VinylSampler() {
  const { persona, pickedVinyl, setPickedVinyl, pushTranscript, setOrb, pushFrame, sessionId, setSessionId, faults, activeChaosFault, setRelink } =
    useSim();
  const [cands, setCands] = useState<Candidate[] | null>(null);
  const [phase, setPhase] = useState<SamplerPhase>("idle");
  const [nowPlaying, setNowPlaying] = useState<number | null>(null);
  const [hookStates, setHookStates] = useState<Record<string, HookCardState>>({});
  const [artFailed, setArtFailed] = useState<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Dynamic-hook DSP cache: preview_url -> extracted 3s chorus window.
  // (Declared with the other hooks — above the persona gate per FL-15.)
  const hookWinCache = useRef(new Map<string, ChorusWindowResult>());
  const audioCtxRef = useRef<AudioContext | null>(null);
  // Hook-sequence run control: a monotonically increasing run id plus the
  // live deadline token / in-flight play, so cancel, pick, ISP takeover
  // and unmount can each stop the pipeline deterministically.
  const seqRef = useRef(0);
  const seqTokenRef = useRef<DeadlineToken | null>(null);
  const activePlayRef = useRef<{
    element: HTMLAudioElement;
    cancel: () => void;
  } | null>(null);

  const stopAudio = () => {
    activePlayRef.current?.cancel();
    audioRef.current?.pause();
    audioRef.current = null;
    setNowPlaying(null);
  };
  /** Stop the whole hook pipeline (audio + extraction + loop) now. */
  const killSequence = () => {
    seqRef.current += 1;
    seqTokenRef.current?.cancel();
    stopAudio();
  };
  useEffect(
    () => () => {
      seqRef.current += 1;
      seqTokenRef.current?.cancel();
      stopAudio();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  // ISP kill takes over all audio — stop hooks so the bunker owns the room.
  useEffect(() => {
    if (faults.isp) killSequence();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faults.isp]);

  // NOTE: the persona gate MUST come after every hook — an early return
  // above the useEffects changes the hook order between renders and React
  // hard-crashes (caught on the live demo rig, 2026-10-19).
  if (persona !== "noida" && persona !== "seattle") return null;

  const ensureSession = async (): Promise<string | null> => {
    if (sessionId) return sessionId;
    const r = await mcpInitialize(pushFrame);
    if (r.ok && r.sessionId) {
      setSessionId(r.sessionId);
      return r.sessionId;
    }
    return null;
  };

  /* ----- Verified-effect playback (FM-36) ------------------------------
   * A hook may be reported as played ONLY on evidence: the element's
   * `playing` event plus real playhead progression (PlaybackEvidence).
   * The hard cap is a bound, not a success condition — when it expires
   * without evidence the outcome is "not-heard", never the old
   * resolve(true)-on-silence. Outcomes:
   *   audible   — evidence satisfied (and, for segments, the full window
   *               of verified progression was heard)
   *   not-heard — nothing provably sounded (stall, autoplay rejection,
   *               silent file, cap expired with no progression)
   *   dead      — the element itself reported a media error
   *   cancelled — stopAudio()/cancel tore the play down
   * -------------------------------------------------------------------- */
  const playVerified = (
    url: string,
    opts: {
      startSec?: number;
      /** verified-progression window to play before resolving audible */
      playMs: number;
      onAudibleProgress?: (sec: number) => void;
    }
  ): Promise<PlayOutcome> =>
    new Promise((resolve) => {
      const evidence = new PlaybackEvidence();
      const a = new Audio(url);
      a.preload = "auto";
      audioRef.current = a;
      let done = false;
      let poll: ReturnType<typeof setInterval> | null = null;
      const finish = (outcome: PlayOutcome) => {
        if (done) return;
        done = true;
        if (poll) clearInterval(poll);
        clearTimeout(capTimer);
        if (activePlayRef.current?.element === a) activePlayRef.current = null;
        try {
          a.pause();
        } catch {
          /* element already gone */
        }
        resolve(outcome);
      };
      // Hard cap: segment window + generous startup grace. Expiry is a
      // verdict on the evidence, not a success in itself.
      const capTimer = setTimeout(
        () => finish(evidence.audible ? "audible" : "not-heard"),
        opts.playMs + 2500
      );
      activePlayRef.current = { element: a, cancel: () => finish("cancelled") };
      const seek = () => {
        if (opts.startSec === undefined) return;
        try {
          const dur = a.duration && Number.isFinite(a.duration) ? a.duration : 30;
          a.currentTime = Math.min(Math.max(0, opts.startSec), Math.max(0, dur - 3.2));
        } catch {
          /* seek unsupported — play from 0 */
        }
      };
      if (opts.startSec !== undefined) {
        if (a.readyState >= 2) seek();
        else a.addEventListener("canplay", seek, { once: true });
      }
      a.addEventListener("playing", () => evidence.notePlaying());
      a.addEventListener("error", () => finish("dead"));
      a.addEventListener("ended", () =>
        finish(evidence.audible ? "audible" : "not-heard")
      );
      poll = setInterval(() => {
        evidence.sample(a.currentTime);
        if (evidence.audible) {
          opts.onAudibleProgress?.(evidence.progressionSec);
          if (evidence.progressionSec * 1000 >= opts.playMs) finish("audible");
        }
      }, 120);
      a.play().catch(() => {
        // Rejected before a frame sounded (autoplay policy / bad source).
        // If the element already carries a media error it is "dead";
        // otherwise the honest verdict is NOT HEARD — nothing sounded.
        if (evidence.audible) return;
        finish(a.error ? "dead" : "not-heard");
      });
    });

  /** Dynamic chorus hook under the deadline pipeline (FM-34): the real
   *  30s preview is fetched + decoded under the candidate's deadline
   *  token (child of the sequence token), then its DSP chorus window is
   *  played under the verified-effect contract. Slow and dead are
   *  different outcomes and stay different all the way to the card. */
  const playDynamicHook = async (
    c: Candidate,
    seq: DeadlineToken,
    onProgress: (sec: number) => void,
    onStarting: () => void
  ): Promise<HookAttempt> => {
    const previewUrl = c.preview_url;
    if (!previewUrl || typeof window === "undefined") return { kind: "no-preview" };
    if (!audioCtxRef.current) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return { kind: "no-preview" };
      audioCtxRef.current = new AC();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") void ctx.resume();
    let win = hookWinCache.current.get(previewUrl);
    if (!win) {
      const token = seq.child(EXTRACT_DEADLINE_MS);
      const out = await extractHookUnderDeadline(previewUrl, ctx, token);
      token.dispose();
      if (!out.ok) {
        if (out.reason === "cancelled") return { kind: "cancelled" };
        if (out.reason === "slow") return { kind: "slow" };
        return { kind: "dead", detail: out.detail };
      }
      win = out.window;
      hookWinCache.current.set(previewUrl, win);
    }
    if (seq.aborted) return { kind: "cancelled" };
    onStarting();
    const played = await playVerified(previewUrl, {
      startSec: win.startSec,
      playMs: 3200,
      onAudibleProgress: onProgress,
    });
    if (played === "audible") return { kind: "heard", via: "preview" };
    if (played === "cancelled") return { kind: "cancelled" };
    if (played === "dead") return { kind: "dead", detail: "preview would not play" };
    return { kind: "not-heard" };
  };

  /** Local-motif fallback: try each mapped WAV under the same verified
   *  contract. "not-heard" from any source outranks "dead" from another —
   *  if something loaded but never sounded, that is the truer story. */
  const playLocalHooks = async (
    c: Candidate,
    onProgress: (sec: number) => void
  ): Promise<HookAttempt> => {
    let sawNotHeard = false;
    for (const url of hookUrlsFor(c)) {
      const played = await playVerified(url, {
        playMs: 3400,
        onAudibleProgress: onProgress,
      });
      if (played === "audible") return { kind: "heard", via: "local" };
      if (played === "cancelled") return { kind: "cancelled" };
      if (played === "not-heard") sawNotHeard = true;
    }
    return sawNotHeard ? { kind: "not-heard" } : { kind: "dead" };
  };

  /** The hook sequence: per-candidate state machines under ONE sequence
   *  deadline token. No candidate can block the others past its share;
   *  the pick UI is already live (cards rendered at setCands) and stays
   *  live throughout — hooks are garnish, the choice is the product. */
  const runHookSequence = async (list: Candidate[], runId: number) => {
    const seq = new DeadlineToken(HOOK_SEQUENCE_BUDGET_MS);
    seqTokenRef.current = seq;
    const alive = () => seqRef.current === runId && !seq.aborted;
    for (const c of list) {
      if (!alive()) break;
      setNowPlaying(c.index);
      const setState = (patch: Partial<HookCardState>) =>
        setHookStates((s) => ({
          ...s,
          [c.id]: { ...(s[c.id] ?? { status: "waiting" as const }), ...patch },
        }));
      const onProgress = (sec: number) =>
        setState({ status: "playing", heardSec: Math.round(sec * 10) / 10 });
      setState({ status: c.preview_url ? "fetching" : "starting" });
      let attempt: HookAttempt = { kind: "no-preview" };
      if (c.preview_url) {
        attempt = await playDynamicHook(c, seq, onProgress, () =>
          setState({ status: "starting" })
        );
        if (attempt.kind === "cancelled" || !alive()) break;
        if (attempt.kind === "heard") {
          setState({ status: "heard", via: "preview", note: undefined });
          continue;
        }
      }
      // Fallback path: no preview, or the preview was slow / dead / mute.
      setState({ status: "starting" });
      const local = await playLocalHooks(c, onProgress);
      if (local.kind === "cancelled" || !alive()) break;
      if (local.kind === "heard") {
        setState({
          status: "heard",
          via: "local",
          note:
            attempt.kind === "slow"
              ? "the real preview was too slow — a local hook played instead"
              : attempt.kind === "dead"
                ? "the real preview was unavailable — a local hook played instead"
                : attempt.kind === "not-heard"
                  ? "the real preview never sounded — a local hook played instead"
                  : undefined,
        });
      } else if (attempt.kind === "slow") {
        setState({ status: "slow" });
      } else if (attempt.kind === "dead") {
        setState({ status: "dead" });
      } else {
        setState({ status: local.kind === "dead" ? "dead" : "not-heard" });
      }
    }
    seq.dispose();
    if (seqRef.current === runId) {
      setNowPlaying(null);
      setPhase((p) => (p === "playing" ? "awaiting-pick" : p));
    }
  };

  /** User cancel during the hook sequence: stop everything, keep the pick. */
  const cancelHooks = () => {
    killSequence();
    setPhase("awaiting-pick");
  };

  /** Step 1: ask the server; on true collision it returns the elicitation with hook URLs. */
  const fetchElicitation = async () => {
    killSequence();
    setPhase("fetching");
    setCands(null);
    setHookStates({});
    setArtFailed(new Set());
    const sid = await ensureSession();
    if (!sid) {
      setPhase("unavailable");
      return;
    }
    const res = await mcpCallTool(pushFrame, sid, "omnibeat_resolve_and_play", {
      raw_utterance: "play Lollipop",
      locale_hint: "en-IN",
    }, activeChaosFault);
    const rl0 = findRelink(res.payloads);
    if (rl0) {
      setRelink(rl0);
      setPhase("idle");
      return;
    }
    const elic = res.payloads
      .map((p) => (p as { result?: { structuredContent?: { elicitation?: { candidates?: Candidate[] } } } })?.result?.structuredContent?.elicitation)
      .find((e) => e?.candidates?.length);
    if (!elic?.candidates) {
      setPhase("unavailable");
      pushTranscript("Could not fetch the versions to compare. The music brain (:8080) is not answering.", "SYS");
      return;
    }
    setCands(elic.candidates);
    setHookStates(
      Object.fromEntries(
        elic.candidates.map((c) => [c.id, { status: "waiting" as const }])
      )
    );
    pushTranscript(
      `alexa: I found ${elic.candidates.length} tracks called 'Lollipop'. I won't guess — hear the hooks and pick one.`,
      "ALEXA"
    );
    // Step 2: the deadline-bounded, verified-effect hook sequence.
    // Cards + pick buttons are ALREADY live — the sequence only fills in
    // each card's hook truth; it can never hold the choice hostage.
    setPhase("playing");
    const runId = ++seqRef.current;
    void runHookSequence(elic.candidates, runId);
  };

  /** Step 3: the voice pick — "the second one!" → input_responses on the SAME session. */
  const pick = async (idx: number) => {
    if (!cands || !sessionId) return;
    killSequence();
    setPhase("resolving");
    const res = await mcpCallTool(pushFrame, sessionId, "omnibeat_resolve_and_play", {
      raw_utterance: "play Lollipop",
      input_responses: { selection_index: idx },
    }, activeChaosFault);
    const rl1 = findRelink(res.payloads);
    if (rl1) {
      setRelink(rl1);
      setPhase("awaiting-pick");
      return;
    }
    const sc = res.payloads
      .map((p) => (p as { result?: { structuredContent?: { track?: Candidate; disambiguated?: boolean }; content?: { text: string }[] } })?.result)
      .find((r) => r?.structuredContent && !("elicitation" in (r.structuredContent as object)));
    const spoken =
      sc?.content?.[0]?.text ??
      (sc?.structuredContent?.track
        ? `Playing '${sc.structuredContent.track.title}' by ${sc.structuredContent.track.artist}.`
        : `Take ${idx + 1} locked in.`);
    setPickedVinyl(idx + 1);
    setPhase("resolved");
    pushTranscript(`you: the ${["first", "second", "third", "fourth", "fifth"][idx] ?? `#${idx + 1}`} one!`, "YOU");
    pushTranscript(`alexa: ${spoken} No blind guess — you chose.`, "ALEXA");
    setOrb("speaking");
    setTimeout(() => setOrb("idle"), 1500);
  };

  return (
    <div className="panel rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-faint">
          Same-name standoff · UC-2
        </span>
        {phase === "idle" || phase === "unavailable" || phase === "resolved" ? (
          <button
            onClick={fetchElicitation}
            className="rounded-lg border border-brand/50 bg-brand/15 px-2 py-1 text-[11px] font-semibold text-ink hover:bg-brand/25"
          >
            ▶ play the hooks
          </button>
        ) : (
          <span className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-brand/80">
              {phase === "fetching" && "asking the wire…"}
              {phase === "playing" && "playing real hooks…"}
              {phase === "awaiting-pick" && "your pick?"}
              {phase === "resolving" && "resolving…"}
            </span>
            {phase === "playing" && (
              <button
                onClick={cancelHooks}
                className="rounded bg-panel-2 px-2 py-1 text-[10px] font-semibold text-mute hover:bg-white/[0.06]"
              >
                ■ stop hooks
              </button>
            )}
          </span>
        )}
      </div>

      {phase === "unavailable" && (
        <div className="mt-3 rounded-lg border border-coral/30 bg-coral/10 px-3 py-2 text-center">
          <div className="text-[12px] font-semibold text-coral/90">
            I couldn&apos;t fetch the versions to compare. The music brain (:8080) isn&apos;t answering.
          </div>
          <div className="mt-0.5 text-[11px] text-coral/70">
            No hooks play until the server answers. Nothing is faked to fill the silence.
          </div>
          <div className="mt-1 font-mono text-[9px] text-coral/50">
            wire detail: elicitation unavailable · no response from :8080
          </div>
        </div>
      )}

      {cands && (
        <div className="mt-3 space-y-2">
          {cands.slice(0, 3).map((c) => {
            const hs: HookCardState = hookStates[c.id] ?? { status: "waiting" };
            const picked = pickedVinyl === c.index + 1;
            const isNow = nowPlaying === c.index;
            const art = c.artwork_url ? artwork600(c.artwork_url) : null;
            const showArt = !!art && !artFailed.has(c.id);
            const copy = hookStateCopy(hs);
            return (
              <div
                key={c.id}
                className={`flex items-center gap-3 rounded-xl border px-2.5 py-2 ${
                  picked
                    ? "border-sage/50 bg-sage/10 shadow-[0_0_18px_rgba(16,185,129,0.25)]"
                    : "border-hairline bg-panel-2/50"
                }`}
              >
                {/* Artwork first: the real catalog cover at 600px. The
                    vinyl texture survives ONLY as the fallback when the
                    catalog gave no art or the art failed to load — its
                    absence is labeled in the card, never faked over. */}
                <div className="relative h-16 w-16 shrink-0">
                  {showArt ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={art}
                        alt=""
                        className="h-16 w-16 rounded-lg object-cover"
                        onError={() =>
                          setArtFailed((s) => new Set(s).add(c.id))
                        }
                      />
                      <span className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 font-mono text-[10px] font-bold text-white">
                        {c.index + 1}
                      </span>
                    </>
                  ) : (
                    <div
                      className={`vinyl-grooves flex h-16 w-16 items-center justify-center rounded-full border border-hairline ${
                        isNow && hs.status === "playing" ? "animate-spin-slow" : ""
                      }`}
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/90 font-mono text-[10px] font-bold text-black">
                        {c.index + 1}
                      </span>
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold leading-tight text-ink">
                    {c.title}
                  </div>
                  <div className="truncate text-[12px] leading-tight text-mute">
                    {c.artist}
                  </div>
                  <div className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-faint">
                    {c.kind} · P={c.purity_score?.toFixed?.(1) ?? "?"}
                  </div>
                  <div className="mt-1">
                    <span className={`text-[10px] leading-snug ${copy.cls}`}>
                      {copy.text}
                    </span>
                    {hs.note && (
                      <div className="text-[10px] leading-snug text-faint">
                        {hs.note}
                      </div>
                    )}
                    {!c.artwork_url && (
                      <div className="text-[9.5px] leading-snug text-faint">
                        no cover art in the catalog
                      </div>
                    )}
                  </div>
                </div>
                {/* The choice never waits for the audio: pick is live in
                    every phase where candidates exist, for every card —
                    heard, not-heard, slow or dead (retires FM-37). */}
                {(phase === "playing" || phase === "awaiting-pick") && (
                  <button
                    onClick={() => pick(c.index)}
                    className="shrink-0 rounded bg-sage/15 px-2 py-1 text-[10px] font-semibold text-sage hover:bg-sage/25"
                  >
                    pick this one
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {phase === "awaiting-pick" && cands && cands.length > 1 && (
        <button
          onClick={() => pick(1)}
          className="mt-3 w-full rounded-lg border border-brand/40 bg-brand/15 px-2 py-1.5 text-[12px] font-semibold text-ink hover:bg-brand/25"
        >
          🗣️ “the second one! the bass boost one!”
        </button>
      )}
      {phase === "resolved" && pickedVinyl !== null && (
        <div className="mt-2 animate-pill-in rounded-lg border border-sage/40 bg-sage/10 px-2.5 py-1.5 text-center text-[12px] text-sage">
          ✓ take {pickedVinyl} locked in — resolved by the real wire, you chose
        </div>
      )}
      <div className="mt-2 text-[9px] text-faint">
        hooks: real 30s previews → DSP chorus windows, fetched under a hard deadline and
        counted as heard only on proof of playback · local motifs only as fallback
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ledger card — REAL omnibeat://session/audit-ledger when up;          */
/* clearly-labeled SAMPLE rows only as fallback.                        */
/* ------------------------------------------------------------------ */

interface LedgerRec {
  id: number;
  ts_ms: number;
  actor: string;
  action: string;
  utterance_hash: string;
  mic_snr_db: number;
  prev_state: string;
  next_state: string;
}

function LedgerCard() {
  const { ledger, pushFrame, sessionId, setSessionId, serverState, faults, activeChaosFault, setRelink, pushLedger, pushTranscript } = useSim();
  const [live, setLive] = useState<LedgerRec[]>([]);
  const [loading, setLoading] = useState(false);
  const [tried, setTried] = useState(false);
  const [verdict, setVerdict] = useState<string | null>(null);
  const [challenging, setChallenging] = useState(false);

  /** E4 challenge: ask the ledger to prove itself. With Expire Token armed
   *  this passes force_oauth_expired, so the server answers -32042 and the
   *  re-link modal opens (D-30) — the F-10 flow, end to end, on any stack. */
  const challenge = async () => {
    setChallenging(true);
    setVerdict(null);
    let sid = sessionId;
    if (!sid) {
      const r = await mcpInitialize(pushFrame);
      if (r.ok && r.sessionId) {
        setSessionId(r.sessionId);
        sid = r.sessionId;
      }
    }
    if (!sid) {
      setVerdict("The music brain (:8080) isn't answering — no challenge sent.");
      setChallenging(false);
      return;
    }
    const res = await mcpCallTool(pushFrame, sid, "omnibeat_verify_ledger_or_relink", {
      user_challenge: "did I actually ask for that?",
      ...(faults.token ? { force_oauth_expired: true } : {}),
    }, activeChaosFault);
    const rl = findRelink(res.payloads);
    if (rl) {
      setRelink(rl);
      setVerdict("The provider link has expired — the re-link card is open.");
      setChallenging(false);
      return;
    }
    const text = res.payloads
      .map((p) => (p as { result?: { content?: { text?: string }[] } })?.result?.content?.[0]?.text)
      .find((t) => t);
    if (text) {
      setVerdict(text);
      pushLedger(`challenge → ${text}`, "LIVE");
      pushTranscript(`alexa: ${text}`, "ALEXA");
      void fetchLedger();
    } else {
      setVerdict("No verdict came back — check the wire inspector below.");
    }
    setChallenging(false);
  };

  const fetchLedger = async () => {
    setLoading(true);
    let sid = sessionId;
    if (!sid) {
      const r = await mcpInitialize(pushFrame);
      if (r.ok && r.sessionId) {
        setSessionId(r.sessionId);
        sid = r.sessionId;
      }
    }
    if (!sid) {
      setLoading(false);
      setTried(true);
      return;
    }
    const res = await mcpRpc(pushFrame, sid, "resources/read", { uri: "omnibeat://session/audit-ledger" }, "resources/read audit-ledger");
    const text = (res.payloads[0] as { result?: { contents?: { text?: string }[] } })?.result?.contents?.[0]?.text;
    if (text) {
      try {
        const arr = JSON.parse(text) as LedgerRec[];
        setLive(arr.slice(-12).reverse());
      } catch {
        /* keep fallback */
      }
    }
    setLoading(false);
    setTried(true);
  };

  useEffect(() => {
    if (serverState === "up" && sessionId && live.length === 0 && !tried) void fetchLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverState, sessionId]);

  const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString("en-GB");

  return (
    <div className="panel rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-faint">
          Truth ledger · E4
        </span>
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[9px] text-faint">
            omnibeat://session/audit-ledger
          </span>
          <button
            onClick={fetchLedger}
            className="rounded bg-panel-2 px-1.5 py-0.5 text-[9px] text-faint hover:bg-white/[0.06]"
          >
            {loading ? "…" : "↻ read live"}
          </button>
          <button
            onClick={challenge}
            className="rounded border border-brand/50 bg-brand/15 px-1.5 py-0.5 text-[9px] font-semibold text-ink hover:bg-brand/25"
          >
            {challenging ? "…" : "⚖ challenge"}
          </button>
        </div>
      </div>
      {faults.token && (
        <div className="mt-1.5 text-[10px] leading-snug text-faint">
          Token expiry is armed — challenging will trigger the re-link card.
        </div>
      )}
      {verdict && (
        <div className="mt-1.5 rounded-lg border border-brand/40 bg-brand/10 px-2.5 py-1.5 text-[11.5px] leading-snug text-ink">
          {verdict}
        </div>
      )}
      {/* Receipt roll (polish only — data and labels untouched): every row
          a stamped receipt on a perforated roll. LIVE/SAMPLE stays the
          honesty stamp; #id is the receipt number; the chain hash is the
          receipt's serial, printed where a skeptic looks for it. */}
      <div className="scroll-thin mt-2 max-h-44 overflow-y-auto rounded-lg border border-hairline bg-black/25 px-2.5 py-1">
        {live.map((r) => (
          <div
            key={`live-${r.id}`}
            className="border-b border-dashed border-white/[0.08] py-1.5 text-[11.5px] leading-snug text-ink last:border-b-0"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span>
                <span className="mr-1.5 inline-block -rotate-3 rounded-sm border border-sage/60 px-1 font-mono text-[8.5px] font-bold tracking-[0.12em] text-sage">
                  LIVE
                </span>
                <span className="font-mono text-[10px] text-faint">
                  receipt #{r.id} · {fmtTime(r.ts_ms)}
                </span>
              </span>
              {r.utterance_hash && (
                <span className="shrink-0 font-mono text-[9px] text-faint">
                  hash {r.utterance_hash.slice(0, 8)}
                </span>
              )}
            </div>
            <div className="mt-0.5">
              {r.actor} · {r.action}
            </div>
            <div className="font-mono text-[9.5px] text-faint">
              {r.prev_state} → {r.next_state} · mic {r.mic_snr_db} dB
            </div>
          </div>
        ))}
        {live.length === 0 && tried && (
          <div className="py-1.5 text-[11px] text-faint">
            ledger is empty on the server — trigger an action (play a track, inject a ghost) then ↻ read live.
          </div>
        )}
        {ledger.map((e, i) => (
          <div
            key={`sample-${i}`}
            className="border-b border-dashed border-white/[0.08] py-1.5 text-[11.5px] leading-snug text-mute last:border-b-0"
          >
            <span className="mr-1.5 inline-block -rotate-3 rounded-sm border border-white/20 px-1 font-mono text-[8.5px] font-bold tracking-[0.12em] text-faint">
              SAMPLE
            </span>
            <span className="mr-1.5 font-mono text-[10px] text-faint">{e.t}</span>
            {e.text}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Phase sync — REAL measured drift from the multiroom_clock rig.       */
/* ------------------------------------------------------------------ */

function PhaseSync() {
  const clockRef = useRef<MultiroomClock | null>(null);
  const [rigOn, setRigOn] = useState(false);
  const [drifts, setDrifts] = useState<number[]>([0, 0, 0]);

  const enable = async () => {
    if (!clockRef.current) clockRef.current = new MultiroomClock();
    await clockRef.current.ensure();
    clockRef.current.startWander();
    setRigOn(true);
  };

  useEffect(() => {
    if (!rigOn) return;
    const id = setInterval(() => {
      const c = clockRef.current;
      if (c) setDrifts(c.sampleDriftMs());
    }, 600);
    return () => clearInterval(id);
  }, [rigOn]);

  useEffect(
    () => () => {
      clockRef.current?.dispose();
      clockRef.current = null;
    },
    []
  );

  const rooms = clockRef.current?.roomNames() ?? ["Living Room", "Kitchen", "Bedroom"];

  return (
    <div className="panel rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-faint">
          Multi-room phase sync · E5
        </span>
        {!rigOn ? (
          <button
            onClick={enable}
            className="rounded-lg border border-brand/50 bg-brand/15 px-2 py-1 text-[11px] font-semibold text-ink hover:bg-brand/25"
          >
            ▶ enable audio rig
          </button>
        ) : (
          <button
            onClick={() => clockRef.current?.phaseLock()}
            className="rounded bg-panel-2 px-1.5 py-0.5 text-[9px] text-faint hover:bg-white/[0.06]"
          >
            ⟡ phase-lock
          </button>
        )}
      </div>
      {!rigOn ? (
        <div className="mt-2 text-[11px] leading-snug text-faint">
          3 real AudioContexts, one per room — drift measured from the live graph, never animated.
          <br />
          <span className="text-faint/70">(Browsers need one click to start audio.)</span>
        </div>
      ) : (
        <>
          <div className="mt-2 space-y-1.5">
            {rooms.map((r, i) => {
              const d = drifts[i] ?? 0;
              const bad = Math.abs(d) > 25;
              return (
                <div key={r} className="flex items-center gap-2 text-[11.5px]">
                  <span className="w-24 shrink-0 text-mute">{r}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel-2">
                    <div
                      className={`h-full rounded-full transition-colors ${bad ? "bg-coral" : "bg-sage"}`}
                      style={{ width: `${Math.min(100, Math.abs(d) * 2)}%` }}
                    />
                  </div>
                  <span className={`w-20 text-right font-mono ${bad ? "text-coral" : "text-sage"}`}>
                    {d >= 0 ? "+" : ""}
                    {d.toFixed(1)} ms
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 text-[9px] text-faint">
            measured live: delayTime read-back + currentTime skew across 3 AudioContexts · ⟡ snaps to 0.0ms
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bunker pill — REAL IndexedDB cache; ISP kill crossfades into it.     */
/* ------------------------------------------------------------------ */

const bunkerPlayer = new BunkerPlayer();

function BunkerPill() {
  const { faults, pushTranscript } = useSim();
  const [cached, setCached] = useState<BunkerTrack[]>([]);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [caching, setCaching] = useState(true);

  // Session start: pre-cache the 5 emergency vibe tracks (real bytes, IndexedDB).
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const t of BUNKER_SEED_TRACKS) {
        try {
          await bunkerCacheTrack(t.id, t.title, t.url);
        } catch {
          /* a missing file must not kill the session — honest count below */
        }
      }
      if (alive) {
        setCached(await bunkerList());
        setCaching(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ISP toggle: crossfade into the cache (zero dead air) / stop on restore.
  useEffect(() => {
    (async () => {
      if (faults.isp) {
        const list = await bunkerList();
        setCached(list);
        if (list.length > 0) {
          const ok = await bunkerPlayer.crossfadeTo(list[0].id);
          setIdx(0);
          setPaused(!ok);
          pushTranscript(
            ok
              ? "sys: ISP down — crossfaded into the local vibe cache. zero dead air."
              : "sys: ISP down — but the bunker is empty. cache failed; honest silence.",
            "SYS"
          );
        }
      } else {
        bunkerPlayer.stop();
        setPaused(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faults.isp]);

  if (!faults.isp) return null;

  const cur = cached[idx % Math.max(1, cached.length)];
  const togglePause = () => {
    if (paused) {
      bunkerPlayer.resume();
      setPaused(false);
    } else {
      bunkerPlayer.pause();
      setPaused(true);
    }
  };
  const skip = async () => {
    if (cached.length === 0) return;
    const n = (idx + 1) % cached.length;
    setIdx(n);
    await bunkerPlayer.crossfadeTo(cached[n].id);
    setPaused(false);
  };

  return (
    <div className="animate-pill-in rounded-2xl border border-sage/40 bg-sage/10 p-3">
      <div className="text-center text-[13px] font-bold text-ink">🛰️ ISP DOWN — Running on Local Vibe Cache</div>
      <div className="mt-0.5 text-center text-[11px] text-sage/80">
        {caching ? "caching emergency tracks…" : `zero dead air · ${cached.length}/5 tracks cached in IndexedDB`}
      </div>
      {cur && (
        <div className="mt-2 flex items-center justify-center gap-2">
          <button
            onClick={togglePause}
            className="rounded-lg bg-sage/20 px-3 py-1 text-[13px] font-bold text-ink hover:bg-sage/30"
            aria-label={paused ? "resume" : "pause"}
          >
            {paused ? "▶" : "⏸"}
          </button>
          <button
            onClick={skip}
            className="rounded-lg bg-sage/20 px-3 py-1 text-[13px] font-bold text-ink hover:bg-sage/30"
            aria-label="skip"
          >
            ⏭
          </button>
          <span className="max-w-[220px] truncate text-[11px] text-mute">
            ♪ {cur.title}
            {paused && " (paused)"}
          </span>
        </div>
      )}
      {cached.length === 0 && !caching && (
        <div className="mt-1 text-center text-[11px] text-coral/80">
          bunker empty — nothing cached, nothing to play. (honest, not silent)
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function StudioDeckCards() {
  return (
    <section className="scroll-thin flex min-h-0 flex-col gap-3 overflow-y-auto pr-0.5">
      <BunkerPill />
      <MorphCard />
      <VinylSampler />
      <LedgerCard />
      <PhaseSync />
    </section>
  );
}
