/**
 * The -32042 re-link card (F-10), rendered when the server answers a tool
 * call with a URL elicitation: "your provider token expired — reconnect".
 * D-30: this modal is driven ONLY by a real -32042 payload captured on
 * the wire (lib/mcp findRelink) — it is never shown speculatively.
 *
 * Copy follows the plain-words rule (J-05/J-10): say what happened, say
 * what to tap, keep the protocol detail in the wire inspector where it
 * belongs. The provider name comes from the payload, not a guess.
 *
 * Motion (design wave): the card earns an entrance and an exit — backdrop
 * fade + a short rise/settle on the card — driven by a local mount state
 * machine so the exit can play AFTER sim state clears the payload.
 * Behavior is otherwise identical to D-30: same trigger, same copy, same
 * href rebuild, same two actions. prefers-reduced-motion renders it
 * instantly, with no transform at all.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { useSim } from "../lib/sim-context";

/** Mirrors the relink payload shape in lib/sim-context (SimState.relink). */
interface RelinkInfo {
  url: string;
  provider: string;
}

const PROVIDER_NAMES: Record<string, string> = {
  spotify: "Spotify",
  jiosaavn: "JioSaavn",
  gaana: "Gaana",
  wynk: "Wynk",
  youtube: "YouTube Music",
  "amazon music": "Amazon Music",
  "apple music": "Apple Music",
};

const BACKDROP_MS = 160;
const CARD_MS = 210;
const EXIT_MS = 220; // >= the longest exit transition
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

export default function RelinkModal() {
  const { relink, setRelink } = useSim();
  // `shown` keeps the payload alive through the exit animation after
  // `relink` clears; `entered` is the transition target (false = the
  // pre-entrance / exiting pose).
  const [shown, setShown] = useState<RelinkInfo | null>(() => relink);
  const [entered, setEntered] = useState(false);
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (exitTimer.current) {
      clearTimeout(exitTimer.current);
      exitTimer.current = null;
    }
    if (relink) {
      setShown(relink);
      if (reduced) {
        setEntered(true);
        return;
      }
      // Double rAF: let the pre-entrance pose paint, then transition in.
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setEntered(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        if (raf2) cancelAnimationFrame(raf2);
      };
    }
    // Payload cleared ("Not now", a fresh state, a completed return):
    // play the exit, then unmount.
    setEntered(false);
    if (shown) {
      exitTimer.current = setTimeout(() => setShown(null), reduced ? 0 : EXIT_MS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relink, reduced]);

  if (!shown) return null;

  const name = PROVIDER_NAMES[shown.provider.toLowerCase()] ?? shown.provider;
  // The server builds the URL from ITS caller's origin (the orchestrator);
  // the page it names lives on this app, so keep the payload's path +
  // query and serve it from the origin the user is actually looking at.
  let href = shown.url;
  try {
    const u = new URL(shown.url);
    href = `${window.location.origin}${u.pathname}${u.search}`;
  } catch {
    /* keep the payload URL verbatim */
  }

  const backdropStyle: React.CSSProperties = reduced
    ? {}
    : {
        opacity: entered ? 1 : 0,
        transition: `opacity ${BACKDROP_MS}ms ease`,
      };
  const cardStyle: React.CSSProperties = reduced
    ? {}
    : {
        opacity: entered ? 1 : 0,
        transform: entered ? "none" : "translateY(10px) scale(0.97)",
        transition: `opacity ${CARD_MS}ms ${EASE}, transform ${CARD_MS}ms ${EASE}`,
      };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      style={backdropStyle}
    >
      <div
        className="panel w-full max-w-sm rounded-2xl p-5 shadow-2xl"
        style={cardStyle}
      >
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand">
          Music link expired
        </div>
        <h2 className="mt-2 text-lg font-semibold leading-snug text-ink">
          Your {name} link needs a quick reconnect.
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-mute">
          The link between Intent Lock and {name} has expired, so nothing can
          play through it right now. Nothing is broken — these links expire
          on purpose, and reconnecting takes one tap.
        </p>
        <div className="mt-4 flex items-center gap-2">
          <a
            href={href}
            className="rounded-lg border border-brand/50 bg-brand/20 px-3 py-2 text-[13px] font-semibold text-ink hover:bg-brand/30"
          >
            Reconnect {name}
          </a>
          <button
            onClick={() => setRelink(null)}
            className="rounded-lg bg-panel-2 px-3 py-2 text-[13px] text-mute hover:bg-white/[0.06]"
          >
            Not now
          </button>
        </div>
        <div className="mt-3 font-mono text-[9.5px] leading-snug text-faint">
          wire: JSON-RPC −32042 · URL elicitation · render=modal (see the
          inspector below)
        </div>
      </div>
    </div>
  );
}
