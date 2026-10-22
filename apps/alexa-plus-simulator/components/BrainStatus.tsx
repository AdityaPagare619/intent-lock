/**
 * BRAIN STATUS — the borrowed brain, proven attached (Round 2, D1).
 *
 * Two real signals, nothing else:
 *  - standing liveness: GET /api/brain → the orchestrator's own /health,
 *    whose `brain` string names its extraction ladder verbatim
 *    ("extract:gemini:gemini-3-flash-preview+local-floor") and whose
 *    MCP probe is live. Polled; a failed poll IS the Offline state.
 *  - per-turn truth: the last extraction turn's own response fields
 *    (extraction_source / brain, via the stage provider). When a turn
 *    fell to the local floor, the chip SAYS SO until a Gemini turn
 *    clears it — a green dot that cannot be true is not shipped.
 *
 * Copy names the fact and the consequence (balise): the model that is
 * attached, the fallback that actually served, or the outage itself.
 */
"use client";

import { useEffect, useState } from "react";
import { useStage } from "./IntentLockStage";
import { IconWifiOff } from "./Icons";

interface BrainProbe {
  ok: boolean;
  model?: string;
  describe?: string;
  mcpReachable?: boolean;
}

const POLL_MS = 8000;

/** The ladder's primary model, from the orchestrator's own description
 * ("extract:gemini:<model>+local-floor"). Null when it names none. */
function parseModel(describe: string | undefined): string | null {
  if (!describe) return null;
  const m = describe.match(/gemini:([a-z0-9.\-]+)/i);
  return m ? m[1] : null;
}

export default function BrainStatus() {
  const stage = useStage();
  const [probe, setProbe] = useState<BrainProbe | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/brain", { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
          health?: { brain?: string; mcp?: { reachable?: boolean } };
        } | null;
        if (!alive) return;
        if (res.ok && data?.ok && data.health) {
          setProbe({
            ok: true,
            model: parseModel(data.health.brain) ?? undefined,
            describe: data.health.brain,
            mcpReachable: data.health.mcp?.reachable,
          });
        } else {
          setProbe({ ok: false });
        }
      } catch {
        if (alive) setProbe({ ok: false });
      }
    };
    void poll();
    const iv = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  const chip = "stage-card flex shrink-0 items-center gap-2 px-3 py-1.5 text-[12px] text-stage-ink-2";

  if (probe === null) {
    return (
      <span className={chip} role="status">
        <span className="h-2 w-2 rounded-full bg-stage-ink-3" />
        Brain · checking…
      </span>
    );
  }

  if (!probe.ok) {
    return (
      <span className={chip} role="status" title="GET /api/brain → the :4000 orchestrator did not answer">
        <IconWifiOff size={14} className="text-stage-ink-3" />
        Brain offline — the orchestrator isn&apos;t answering
      </span>
    );
  }

  const fellToFloor = stage.lastBrain?.source === "local-floor";
  if (fellToFloor) {
    return (
      <span
        className={chip}
        role="status"
        title={`Last extraction turn: ${stage.lastBrain?.brain ?? "local-floor"} — the deterministic floor served it, not Gemini`}
      >
        <span className="h-2 w-2 rounded-full border border-alexa bg-transparent" />
        Brain · Gemini attached — last turn fell to the local floor
      </span>
    );
  }

  return (
    <span
      className={chip}
      role="status"
      title={probe.describe ?? "orchestrator /health"}
    >
      <span className="h-2 w-2 rounded-full bg-alexa shadow-[0_0_8px_rgba(0,202,255,0.9)]" />
      Brain · Gemini connected{probe.model ? ` — ${probe.model}` : ""}
      {probe.mcpReachable === false ? " · kernel unreachable" : ""}
    </span>
  );
}
