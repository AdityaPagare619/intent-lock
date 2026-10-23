/**
 * The provider re-link page the -32042 elicitation points at (F-10, D-30).
 *
 * HONEST LABELING: this is a SIMULATED provider page. No real provider
 * account exists in the demo and none is touched — the page stands in for
 * the provider's OAuth consent screen so the re-link loop can be walked
 * end to end: expire → -32042 → modal → this page → return, reconnected.
 */
"use client";

import { useEffect, useState } from "react";

const PROVIDER_NAMES: Record<string, string> = {
  spotify: "Spotify",
  jiosaavn: "JioSaavn",
  gaana: "Gaana",
  wynk: "Wynk",
  youtube: "YouTube Music",
  "amazon music": "Amazon Music",
  "apple music": "Apple Music",
};

export default function RelinkPage() {
  const [provider, setProvider] = useState("spotify");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("provider");
    if (p) setProvider(p.toLowerCase());
  }, []);

  const name = PROVIDER_NAMES[provider] ?? provider;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-obsidian p-4">
      <div className="panel w-full max-w-sm rounded-2xl p-6">
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-faint">
          Simulated provider page
        </div>
        <h1 className="mt-2 text-xl font-semibold text-ink">{name}</h1>
        {!done ? (
          <>
            <p className="mt-2 text-[13px] leading-relaxed text-mute">
              Intent Lock is asking to reconnect to your {name} account so it
              can play music again. This demo page stands in for the real
              {name} sign-in — no account is touched and nothing is stored.
            </p>
            <button
              onClick={() => setDone(true)}
              className="mt-5 w-full rounded-lg border border-brand/50 bg-brand/20 px-3 py-2.5 text-[14px] font-semibold text-ink hover:bg-brand/30"
            >
              Reconnect {name}
            </button>
          </>
        ) : (
          <>
            <p className="mt-2 text-[13px] leading-relaxed text-mute">
              Done — {name} is reconnected and the link is live again. Head
              back and the music can play.
            </p>
            <a
              href={`/?relinked=${encodeURIComponent(provider)}`}
              className="mt-5 block w-full rounded-lg border border-brand/50 bg-brand/20 px-3 py-2.5 text-center text-[14px] font-semibold text-ink hover:bg-brand/30"
            >
              Return to Intent Lock
            </a>
          </>
        )}
        <div className="mt-4 font-mono text-[9.5px] leading-snug text-faint">
          demo stand-in for the provider OAuth screen · no credentials
          requested, none stored
        </div>
      </div>
    </div>
  );
}
