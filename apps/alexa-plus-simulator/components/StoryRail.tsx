/**
 * The story rail — the directed demo (audit-4 + TRANSFORMATION_DESIGN).
 * Five beats named by the PAIN they cure, not by city or codename.
 * Personas remain as the cast inside the beats; the full console is one
 * "Explore freely" toggle away and nothing is ever removed.
 *
 * This rail is OmniBeat's directing hand, so it lives in the engine
 * room's language (matte graphite + amber) — the stage above it stays
 * purely Alexa's.
 */
"use client";

import type { PersonaId } from "../lib/sim-context";
import { IconChevronD } from "./Icons";

export type BeatAction = "deck" | "challenge" | "chaos";

export interface Beat {
  id: string;
  title: string;
  hint: string;
  persona?: PersonaId;
  action?: BeatAction;
}

export const BEATS: Beat[] = [
  {
    id: "mishear",
    title: "The Mishear",
    hint: "She hears the song title wrong. Watch it get fixed before it plays.",
    persona: "noida",
  },
  {
    id: "standoff",
    title: "The Standoff",
    hint: "Three famous songs, one name. She refuses to guess — you listen and pick.",
    action: "deck",
  },
  {
    id: "interruption",
    title: "The Interruption",
    hint: "She won't stop talking. Cut in — she yields, listens, keeps it short.",
    persona: "seattle",
  },
  {
    id: "receipt",
    title: "The Receipt",
    hint: "Ask her why she did that. She has to show her receipts — every action, on record.",
    action: "challenge",
  },
  {
    id: "break",
    title: "Now Break Her",
    hint: "Faults armed, wire live. Try to make her lie, guess, or play the wrong song.",
    action: "chaos",
  },
];

export default function StoryRail({
  persona,
  freeMode,
  onToggleFree,
  onPersona,
  onBeat,
}: {
  persona: PersonaId | null;
  freeMode: boolean;
  onToggleFree: () => void;
  onPersona: (p: PersonaId) => void;
  onBeat: (b: Beat) => void;
}) {
  return (
    <nav
      aria-label="The demo story"
      className="panel flex shrink-0 gap-2 overflow-x-auto rounded-2xl p-3 min-[1100px]:w-[228px] min-[1100px]:flex-col min-[1100px]:overflow-visible"
    >
      <div className="hidden px-2 pb-2 min-[1100px]:block">
        <div className="text-[13px] font-bold text-ink">The demo, in five pains</div>
        <div className="mt-0.5 text-[11.5px] leading-snug text-mute">
          Follow the story, or explore freely — every control stays live either way.
        </div>
      </div>

      {BEATS.map((b, i) => {
        const active = !freeMode && b.persona != null && b.persona === persona;
        return (
          <button
            key={b.id}
            onClick={() => (b.persona ? onPersona(b.persona) : onBeat(b))}
            aria-current={active ? "step" : undefined}
            className={`group min-w-[168px] shrink-0 rounded-xl border px-3 py-3 text-left transition-[border-color,background-color,box-shadow,transform] duration-150 ease-out-house active:scale-[0.98] min-[1100px]:min-w-0 ${
              active
                ? "border-brand/60 bg-brand/10 shadow-[inset_3px_0_0_#e58e26]"
                : "border-hairline bg-white/[0.02] hover:border-mute/40 hover:bg-white/[0.05]"
            } ${freeMode ? "opacity-55" : ""}`}
          >
            <span className="flex items-center gap-2">
              <span
                className={`flex h-6 w-7 shrink-0 items-center justify-center rounded-md font-mono text-[10px] font-bold tabular-nums transition-colors duration-150 ${
                  active
                    ? "bg-brand/15 text-brand"
                    : "bg-white/[0.04] text-faint group-hover:bg-white/[0.07] group-hover:text-mute"
                }`}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className={`text-[13.5px] font-semibold transition-colors duration-150 ${active ? "text-ink" : "text-ink/90 group-hover:text-ink"}`}>
                {b.title}
              </span>
            </span>
            <span className="ml-9 mt-2 hidden text-[11.5px] leading-snug text-mute min-[1100px]:block">
              {b.hint}
            </span>
          </button>
        );
      })}

      <div className="hidden flex-1 min-[1100px]:block" />

      <button
        onClick={onToggleFree}
        aria-pressed={freeMode}
        className={`flex shrink-0 items-center gap-2 self-start rounded-full border px-3 py-2 text-[12px] font-semibold transition-[border-color,background-color,color,transform] duration-150 ease-out-house active:scale-[0.97] min-[1100px]:self-stretch ${
          freeMode
            ? "border-brand/60 bg-brand/15 text-brand hover:bg-brand/20"
            : "border-hairline bg-white/[0.02] text-mute hover:border-mute/40 hover:text-ink"
        }`}
      >
        <span
          aria-hidden="true"
          className={`relative h-4 w-8 shrink-0 rounded-full transition-colors duration-200 ${
            freeMode ? "bg-brand" : "bg-graphite"
          }`}
        >
          <span
            className="absolute left-[2px] top-[2px] size-3 rounded-full bg-white shadow transition-transform duration-200 ease-out-house"
            style={{ transform: freeMode ? "translateX(16px)" : "translateX(0)" }}
          />
        </span>
        Explore freely
        <IconChevronD size={13} className="opacity-60" />
      </button>
    </nav>
  );
}
