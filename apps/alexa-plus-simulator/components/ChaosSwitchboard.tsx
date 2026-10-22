/**
 * TOP bar — ChaosSwitchboard.
 * 4 persona buttons (the demo scripts) + 4 fault-injection toggles.
 * Faults are UI intent for now; the chaos-injection wire contract
 * (tool call vs header) is Arjun's call — see archive/build-record/apps/alexa-plus-simulator/BLOCKERS.md B-02.
 */
"use client";

import { FAULTS, PERSONAS } from "../lib/personas";
import { useSim } from "../lib/sim-context";

export default function ChaosSwitchboard() {
  const { persona, setPersona, faults, toggleFault, serverState, sessionId } = useSim();

  return (
    <header className="panel scroll-thin z-20 flex h-16 shrink-0 items-center gap-2 overflow-x-auto px-4">
      <div className="mr-2 shrink-0 select-none leading-none">
        <div className="text-[13px] font-extrabold tracking-[0.18em] text-brand">
          THE YAP PATROL
        </div>
        <div className="mt-1 text-[10px] leading-snug tracking-wide text-faint">
          <span className="block whitespace-nowrap">OmniBeat-MCP · Alexa+ sim</span>
          <span className="block whitespace-nowrap text-faint/70">Borrow the Brain, Own the Guarantee.</span>
        </div>
      </div>

      <div className="mx-1 h-8 w-px bg-hairline" />

      {/* personas */}
      <div className="flex items-center gap-1.5">
        {PERSONAS.map((p) => {
          const active = persona === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setPersona(p.id)}
              title={`${p.useCase} — ${p.sub}`}
              className={`group flex items-center gap-2 rounded-xl border px-3 py-1.5 text-left transition-colors ${
                active
                  ? "border-brand/60 bg-brand/15 shadow-[0_0_18px_rgba(229,142,38,0.3)]"
                  : "border-hairline bg-white/[0.02] hover:border-mute/40 hover:bg-white/[0.05]"
              }`}
            >
              <span className="text-lg leading-none">{p.icon}</span>
              <span>
                <span className="block whitespace-nowrap text-[12px] font-semibold text-ink">{p.label}</span>
                <span className="block whitespace-nowrap text-[9.5px] text-faint">{p.sub}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mx-1 h-8 w-px bg-hairline" />

      {/* fault toggles */}
      <div className="flex items-center gap-1.5">
        <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.16em] text-coral/80">
          Chaos
        </span>
        {FAULTS.map((f) => {
          const on = faults[f.id];
          return (
            <button
              key={f.id}
              onClick={() => toggleFault(f.id)}
              title={f.hint}
              className={`whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                on
                  ? "border-coral/70 bg-coral/15 text-ink shadow-[0_0_14px_rgba(239,68,68,0.3)]"
                  : "border-hairline bg-white/[0.02] text-mute hover:border-coral/40 hover:text-ink"
              }`}
            >
              <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${on ? "bg-coral" : "bg-graphite"}`} />
              {f.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1" />

      {/* server status */}
      <div
        className="flex shrink-0 items-center gap-2 rounded-lg border border-hairline bg-panel px-2.5 py-1.5"
        title={sessionId ? `Mcp-Session-Id: ${sessionId}` : "No MCP session yet — fire initialize below"}
      >
        <span
          className={`h-2 w-2 rounded-full ${
            serverState === "up" ? "bg-sage shadow-[0_0_8px_rgba(16,185,129,0.9)]"
            : serverState === "down" ? "bg-coral shadow-[0_0_8px_rgba(239,68,68,0.9)]"
            : "bg-graphite"
          }`}
        />
        <span className="whitespace-nowrap font-mono text-[11px] text-mute">
          {serverState === "up" ? ":8080 up" : serverState === "down" ? ":8080 down" : ":8080 ?"}
        </span>
      </div>
    </header>
  );
}
