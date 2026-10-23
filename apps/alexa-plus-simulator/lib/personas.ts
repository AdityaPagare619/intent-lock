import type { FaultId, PersonaId } from "./sim-context";

export interface PersonaDef {
  id: PersonaId;
  icon: string;
  label: string;
  sub: string;
  useCase: string;
  /** labeled stand-in for what the Echo mic/ASR would produce */
  simAsr: string;
  alexaLine: string;
  tool?: string;
  args?: Record<string, unknown>;
  morph?: { mangled: string; canonical: string };
}

export const PERSONAS: PersonaDef[] = [
  {
    id: "noida",
    icon: "🎶",
    label: "Noida",
    sub: "Hinglish / Bhojpuri",
    useCase: "UC-1 accent rescue",
    simAsr: "alexa, play Lolly Pop La Gelu",
    alexaLine: "Playing Lollipop Lagelu — Pawan Singh, studio original.",
    tool: "resolve_and_play",
    args: {
      raw_utterance: "play Lolly Pop La Gelu",
      locale_hint: "IN-UP-BR",
      preferred_provider: "none",
      allow_live_version: false,
    },
    morph: { mangled: "Lolly Pop La Gelu", canonical: "Lollipop Lagelu — Pawan Singh [Studio Original]" },
  },
  {
    id: "seattle",
    icon: "⚡",
    label: "Seattle",
    sub: "Spotify purist · impatient",
    useCase: "UC-4 graceful yield",
    simAsr: "alexa — bro, stop yapping, just the short version",
    alexaLine: "Got it — short version: Pawan Singh, 2011 Bhojpuri hit.",
    tool: "fastpath_interrupt",
    args: { interrupted_at_word_index: 34, barge_in_command: "stop yapping, short version" },
  },
  {
    id: "madrid",
    icon: "🎉",
    label: "Madrid",
    sub: "Spanglish party",
    useCase: "UC-3 banter shield",
    simAsr: "[laughter] alexa es tonta jajaja [overlapping voices]",
    alexaLine: "…stays quiet — group chat detected, I'll wait…",
  },
  {
    id: "rural",
    icon: "📡",
    label: "Rural",
    sub: "Patchy Wi-Fi",
    useCase: "UC-5 edge bunker",
    simAsr: "alexa, keep playing — don't you dare stop",
    alexaLine: "Edge Continuity Mode — running on local vibe cache.",
    tool: "sync_multiroom_and_bunker",
    args: { session: "init", rooms: ["living-room", "kitchen", "bedroom"] },
  },
];

export interface FaultDef {
  id: FaultId;
  label: string;
  hint: string;
}

export const FAULTS: FaultDef[] = [
  { id: "upsell", label: "Inject Upsell Trap", hint: "server tries to pitch Music Unlimited mid-turn" },
  { id: "ghost", label: "Trigger Ghost Action", hint: "unprompted pause → ledger audit (UC-6)" },
  { id: "token", label: "Expire Token", hint: "next provider call 401s → −32042 re-link elicitation" },
  { id: "isp", label: "Kill ISP Wi-Fi", hint: "drop the network → Edge Continuity bunker (UC-5)" },
];

export const personaById = (id: PersonaId): PersonaDef => PERSONAS.find((p) => p.id === id)!;
