/**
 * The transformed stage — "Above the waterline / the Engine Room"
 * (TRANSFORMATION_DESIGN.md, fusing audits 1–4).
 *
 * ABOVE: the Stage — a framed Echo-Show-like surface in Squid Ink +
 * Alexa Blue ONLY: Living Ring, light bar, the utterance in display
 * type. Amber never crosses up.
 * BELOW: the Engine Room — matte graphite + amber ONLY: the story rail,
 * the chaos bench, the deck (sampler / ledger / sync / bunker), and the
 * real MCP wire as an always-visible bottom rail. Blue never crosses down.
 *
 * Composition only: every control that existed still exists — persona
 * runs, typed turns (the deck's), mic VAD, SIM injectors, chaos toggles,
 * wire inspector, ledger, relink modal, bunker. The story rail names
 * the five beats by PAIN; personas remain as the cast inside them; the
 * full console is one "Explore freely" toggle away, nothing removed.
 */
"use client";

import { useMemo, useState } from "react";
import AlexaOrbAndVad from "../components/AlexaOrbAndVad";
import ChaosSwitchboard from "../components/ChaosSwitchboard";
import McpWireInspector from "../components/McpWireInspector";
import RelinkModal from "../components/RelinkModal";
import StoryRail, { type Beat } from "../components/StoryRail";
import StudioDeckCards from "../components/StudioDeckCards";
import McpAppsHost from "../components/McpAppsHost";
import ToolCallTerminal from "../components/ToolCallTerminal";
import {
  IntentLockControls,
  IntentLockProvider,
  TrustCardPanel,
} from "../components/IntentLockStage";
import { SimProvider, useSim, type PersonaId } from "../lib/sim-context";

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}

function StageShell() {
  const sim = useSim();
  const [freeMode, setFreeMode] = useState(false);

  // The orb's `thinking` state is REAL wire state: the latest frame on
  // the inspector is an outbound call with no answer yet. (Frames are
  // the same objects the wire inspector renders — nothing synthetic.)
  const thinking = useMemo(() => {
    const last = sim.frames[sim.frames.length - 1];
    return !!last && last.dir === "C→S";
  }, [sim.frames]);

  const onPersona = (p: PersonaId) => {
    setFreeMode(false);
    sim.setPersona(p);
  };

  const onBeat = (b: Beat) => {
    setFreeMode(false);
    if (b.action === "chaos") scrollToId("engine-chaos");
    else scrollToId("engine-deck");
  };

  return (
    <IntentLockProvider>
    <div className="flex min-h-dvh flex-col gap-3 bg-obsidian p-3 min-[1100px]:h-dvh min-[1100px]:overflow-hidden min-[1100px]:p-4">
      {/* ── engine-room top strip: wordmark · the bench · status ── */}
      <div id="engine-chaos" className="scroll-mt-3 shrink-0">
        <ChaosSwitchboard />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 min-[1100px]:flex-row">
        {/* ── the story rail ── */}
        <StoryRail
          persona={sim.persona}
          freeMode={freeMode}
          onToggleFree={() => setFreeMode((v) => !v)}
          onPersona={onPersona}
          onBeat={onBeat}
        />

        {/* ── stage + deck descend in one reading column ── */}
        <div className="scroll-thin flex min-h-0 min-w-0 flex-1 flex-col gap-3 min-[1100px]:overflow-y-auto min-[1100px]:pr-0.5">
          {/* THE STAGE (above the waterline) */}
          <section
            className="stage-frame stage-scope flex min-h-[540px] shrink-0 flex-col"
            aria-label="Alexa+ stage — simulated environment"
          >
            <AlexaOrbAndVad thinking={thinking} />
            {/* Wave 3: the Trust Card lives ON the device screen — the
                intent_lock payload of the last real /turn, with the
                hook-first player and the artwork's room glow. */}
            <TrustCardPanel />
            {/* Round 2: the tool-call terminal — Alexa caught in the
                act, directly under her proof card: every line is a real
                wire frame or the /turn exchange's own record. */}
            <div className="relative px-4 pb-4">
              <ToolCallTerminal />
            </div>
          </section>

          {/* THE ENGINE ROOM (below the waterline) */}
          <div id="engine-deck" className="shrink-0 scroll-mt-3">
            <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3 px-1">
              <h2 className="text-[15px] font-bold tracking-tight text-ink">The engine room</h2>
              <p className="text-[11.5px] text-mute">
                Intent Lock&apos;s machinery, working live under the stage — the deck, the receipts, the sync, the bunker.
              </p>
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-hairline bg-panel px-2 py-0.5 font-mono text-[9.5px] text-mute">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sage" aria-hidden />
                intent_lock · live wire
              </span>
            </div>
            {/* Wave 3 controls: clock scrubber · Break My Lock · coda */}
            <div className="mb-3">
              <IntentLockControls />
            </div>
            <StudioDeckCards />
          </div>

          {/* Layer D: the same deck, rendered the official MCP Apps way —
              a sandboxed ui:// resource driven by the host bridge. */}
          <div className="shrink-0">
            <McpAppsHost />
          </div>

          <p className="shrink-0 px-1 pb-1 text-[10.5px] leading-relaxed text-faint">
            Not an Amazon product. Built for the Alexa+ track of the Amazon Build, Ship, Shape hackathon — the stage
            above is a labeled simulation; every frame in the wire below is a real MCP call. Team: The Yap Patrol.
          </p>
        </div>
      </div>

      {/* ── the wire rail — always on screen ── */}
      <div className="shrink-0">
        <McpWireInspector />
      </div>

      <RelinkModal />
    </div>
    </IntentLockProvider>
  );
}

export default function Stage() {
  return (
    <SimProvider>
      <StageShell />
    </SimProvider>
  );
}
