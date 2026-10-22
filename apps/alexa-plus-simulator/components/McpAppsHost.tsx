"use client";

/**
 * Layer D (doc 11): the MCP Apps HOST side of the simulator.
 *
 * Until now the Studio Deck was rendered bespoke, from sim state. This
 * panel renders the SAME deck the way a real MCP Apps host (Alexa+,
 * Claude, ChatGPT) would: the bundle is fetched from :8080 over the wire
 * (resources/list → resources/read of the content-hashed ui:// resource),
 * loaded into a sandboxed iframe with an opaque origin, and driven
 * purely through the ext-apps postMessage bridge:
 *
 *   app → host   ui/initialize            (host answers with hostContext)
 *   host → app   ui/notifications/tool-result        (content + structuredContent)
 *   host → app   ui/notifications/host-context-changed   (on mode switch)
 *
 * The Display Mode Switcher is a HOST control: Inline Card (inline) and
 * Fullscreen are the spec's displayMode values; Voice-Only withdraws the
 * visual surface entirely (a host surface choice — the deck simply
 * receives no visual channel; results still flow as structuredContent).
 * Styling follows the engine room's existing panel grammar — no new
 * visual language (transformation design law).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { mcpCallTool, mcpRpc } from "../lib/mcp";
import { ensureSession } from "../lib/session";
import { useSim } from "../lib/sim-context";

type Mode = "inline" | "fullscreen" | "voice";

interface ToolResultPayload {
  content?: unknown;
  structuredContent?: Record<string, unknown>;
}

function hostContext(mode: Mode) {
  return {
    deviceClass: "echo-show",
    platform: "web",
    isMobile: false,
    displayMode: mode === "fullscreen" ? "fullscreen" : "inline",
    theme: "dark",
    maxWidth: mode === "fullscreen" ? 1600 : 880,
    maxHeight: mode === "fullscreen" ? 1000 : 520,
    safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    deviceCapabilities: ["display", "touch", "audio"],
  };
}

export default function McpAppsHost() {
  const sim = useSim();
  const [mode, setMode] = useState<Mode>("inline");
  const [html, setHtml] = useState<string | null>(null);
  const [deckUri, setDeckUri] = useState<string>("");
  const [loadError, setLoadError] = useState<string>("");
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const initializedRef = useRef(false);
  const modeRef = useRef<Mode>(mode);
  modeRef.current = mode;

  // Latest verified tool result on the wire (S→C frames), parsed
  // defensively — the same frames the wire inspector renders.
  const latestResult = useMemo<ToolResultPayload | null>(() => {
    for (let i = sim.frames.length - 1; i >= 0; i--) {
      const f = sim.frames[i];
      if (f.dir !== "S→C") continue;
      try {
        const obj = JSON.parse(f.body) as {
          result?: { content?: unknown; structuredContent?: Record<string, unknown> };
        };
        if (obj?.result?.structuredContent) {
          return {
            content: obj.result.content,
            structuredContent: obj.result.structuredContent,
          };
        }
      } catch {
        /* not a JSON payload frame — keep looking */
      }
    }
    return null;
  }, [sim.frames]);
  const latestRef = useRef<ToolResultPayload | null>(null);
  latestRef.current = latestResult;

  const postToApp = (msg: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(msg, "*");
  };

  // Fetch the deck bundle over the wire, once (resources/list → read).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sid = await ensureSession(sim.pushFrame);
        if (!sid) throw new Error("no MCP session");
        const list = await mcpRpc(sim.pushFrame, sid, "resources/list", {}, "resources/list");
        const resources = (
          list.payloads[0] as { result?: { resources?: Array<{ uri: string; mimeType?: string }> } }
        )?.result?.resources;
        const deck = resources?.find((r) => r.mimeType === "text/html;profile=mcp-app");
        if (!deck) throw new Error("no MCP Apps resource offered by :8080");
        const read = await mcpRpc(
          sim.pushFrame, sid, "resources/read", { uri: deck.uri }, "resources/read"
        );
        const text = (
          read.payloads[0] as { result?: { contents?: Array<{ text?: string }> } }
        )?.result?.contents?.[0]?.text;
        if (!text) throw new Error("deck bundle came back empty");
        if (!cancelled) {
          setDeckUri(deck.uri);
          setHtml(text);
        }
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bridge: answer ui/initialize with hostContext; then push the
  // current tool result so the deck opens on real state.
  //
  // Wave 3 adds the OUTBOUND branch (ext-apps): when the deck itself
  // asks the host to call a tool — the Trust Card's tap-to-pin,
  // one-tap Taste Lock and symmetric reject ride exactly this — the
  // host executes it through the same lib/mcp path as every other
  // call (real wire, frames in the inspector, chaos header honored)
  // and posts the JSON-RPC result back to the app. A tap inside the
  // iframe can therefore change server state — and the refreshed
  // tool-result notification that follows re-renders the deck from
  // the server's own re-verified payload, never from local optimism.
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      const data = ev.data as {
        method?: string;
        id?: unknown;
        params?: { name?: string; arguments?: Record<string, unknown> };
      } | null;
      if (!data || data.id == null || !data.method) return;

      if (data.method === "ui/initialize") {
        initializedRef.current = true;
        postToApp({
          jsonrpc: "2.0",
          id: data.id,
          result: {
            protocolVersion: "2026-01-26",
            hostContext: hostContext(modeRef.current),
          },
        });
        const cur = latestRef.current;
        if (cur) {
          postToApp({
            jsonrpc: "2.0",
            method: "ui/notifications/tool-result",
            params: { content: cur.content, structuredContent: cur.structuredContent },
          });
        }
        return;
      }

      if (data.method === "tools/call") {
        const id = data.id;
        const name = data.params?.name ?? "";
        const args = data.params?.arguments ?? {};
        void (async () => {
          const sid = await ensureSession(sim.pushFrame);
          if (!sid) {
            postToApp({
              jsonrpc: "2.0",
              id,
              error: { code: -32000, message: "host has no live MCP session — the tap was not executed" },
            });
            return;
          }
          const res = await mcpCallTool(sim.pushFrame, sid, name, args, sim.activeChaosFault);
          const result = res.payloads
            .map((p) => (p as { result?: unknown })?.result)
            .find((r) => r !== undefined);
          if (result !== undefined) {
            postToApp({ jsonrpc: "2.0", id, result });
          } else {
            postToApp({
              jsonrpc: "2.0",
              id,
              error: {
                code: -32000,
                message: res.error ?? "tools/call returned no result payload",
              },
            });
          }
        })();
        return;
      }

      // Any other app→host request: an honest method-not-found rather
      // than silence the app would hang on.
      postToApp({
        jsonrpc: "2.0",
        id: data.id,
        error: { code: -32601, message: `host does not implement ${data.method}` },
      });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Forward every new verified result to the deck.
  useEffect(() => {
    if (!latestResult || !initializedRef.current) return;
    postToApp({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: {
        content: latestResult.content,
        structuredContent: latestResult.structuredContent,
      },
    });
  }, [latestResult]);

  // Mode switches re-contextualize WITHOUT reload (per the spec).
  useEffect(() => {
    if (!initializedRef.current) return;
    postToApp({
      jsonrpc: "2.0",
      method: "ui/notifications/host-context-changed",
      params: { hostContext: hostContext(mode) },
    });
  }, [mode]);

  const modes: Array<{ id: Mode; label: string }> = [
    { id: "inline", label: "Inline Card" },
    { id: "fullscreen", label: "Fullscreen" },
    { id: "voice", label: "Voice-Only" },
  ];

  return (
    <section className="panel p-3" aria-label="MCP Apps host rendering of the Studio Deck">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 px-1">
        <h3 className="text-[12.5px] font-bold text-ink">
          MCP Apps — the deck as a real host renders it
        </h3>
        <div className="ml-auto flex gap-1" role="group" aria-label="Display mode">
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={
                "rounded-full border px-2.5 py-1 text-[11px] " +
                (mode === m.id
                  ? "border-brand font-bold text-brand"
                  : "border-line text-mute")
              }
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <p className="px-1 pb-2 text-[11px] text-mute">
        {deckUri
          ? `Bundle served by :8080 as ${deckUri} (content-hashed), rendered in a sandboxed iframe and driven only by the ext-apps bridge — ui/initialize → hostContext, tool-result notifications, host-context-changed on mode switch.`
          : loadError
            ? `Deck bundle unavailable: ${loadError}`
            : "Fetching the deck bundle via resources/list → resources/read…"}
      </p>
      {mode === "voice" ? (
        <div className="flex h-[120px] items-center justify-center rounded-lg border border-line px-4 text-center">
          <p className="text-[12.5px] text-mute">
            Voice-Only surface — the visual channel is withdrawn. The deck
            receives nothing to render; results still arrive as
            structuredContent for the voice to speak.
          </p>
        </div>
      ) : html ? (
        <iframe
          ref={iframeRef}
          title="OmniBeat Studio Deck (MCP Apps)"
          sandbox="allow-scripts"
          srcDoc={html}
          className={
            mode === "fullscreen"
              ? "fixed inset-0 z-50 h-full w-full bg-black"
              : "h-[380px] w-full rounded-lg border border-line"
          }
        />
      ) : (
        <div className="flex h-[120px] items-center justify-center rounded-lg border border-line">
          <p className="text-[12.5px] text-mute">{loadError || "Loading deck bundle…"}</p>
        </div>
      )}
    </section>
  );
}
