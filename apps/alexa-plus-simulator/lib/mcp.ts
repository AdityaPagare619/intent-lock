/**
 * The honest MCP 2025-11-25 Streamable HTTP client.
 * The browser NEVER talks to :8080 directly — it goes through our own
 * Next.js route /api/mcp (same origin, so no CORS games), which proxies
 * over real HTTP to the Python MCP server. Every frame rendered in the
 * wire inspector below is an actual HTTP request/response pair.
 * Nothing here is ever synthesized.
 *
 * Connection-layer redesign (Failure Lab FM-22…FM-26, Transformation
 * systems 1+2+5):
 *  - STREAMING: the response body is read incrementally (ReadableStream)
 *    and every SSE event is pushed to the inspector AS IT ARRIVES, with
 *    its true arrival timestamp — never buffered to end-of-call.
 *  - DEADLINE: every call carries an AbortController deadline
 *    (WIRE_TIMEOUT_MS). A silent wire produces a distinct, honest
 *    "the wire went silent" result — never an infinite spinner, and the
 *    whole exchange (headers AND body) lives inside one try/catch, so a
 *    mid-stream drop can no longer escape as an unhandled rejection.
 *  - SESSION HEALING: when the server rejects our session id (HTTP
 *    404/400 — the spec's "unknown session" signal, the same one the
 *    orchestrator's client heals on), the transport asks the session
 *    manager (lib/session.ts, registered via registerSessionHooks) for a
 *    healed id and retries the call ONCE. Call sites never change.
 *  - REPLAY CURSOR: the last SSE event id per session is tracked; if a
 *    stream drops mid-call, one Last-Event-ID replay GET is attempted
 *    and the call only counts as recovered when the replay delivers
 *    this call's own response frame.
 */

export interface WireFrame {
  n: number; // sequence
  t: string; // ISO timestamp (arrival time for S→C frames)
  dir: "C→S" | "S→C" | "⚠";
  label: string; // e.g. "initialize", "SSE event (id: 7)"
  body: string; // the real payload bytes (JSON or SSE data)
  // Terminal metadata — all real, measured on this wire, never invented.
  // Absent on frames pushed by components that don't have it.
  method?: string; // JSON-RPC method this frame belongs to
  tool?: string; // tools/call target, when applicable
  status?: string; // HTTP status that carried the frame, or "SSE"
  ms?: number; // ms since the request frame was pushed (arrival offset)
  upstream?: string; // X-OmniBeat-Upstream: which hop actually served us
  eventId?: string; // SSE event id (the replay cursor material)
}

let seq = 0;
export const nextFrame = (f: Omit<WireFrame, "n" | "t">): WireFrame => ({
  ...f,
  n: ++seq,
  t: new Date().toISOString(),
});

const PROTOCOL_VERSION = "2025-11-25";
const CLIENT_INFO = { name: "alexa-plus-simulator", version: "0.1.0" };

/** Every wire call gets this long before the client declares the wire
 * silent. The server's own hydration budget is 6s; 20s leaves room for
 * the slowest honest resolve while still ending every wait. */
export const WIRE_TIMEOUT_MS = 20_000;

export interface RpcResult {
  ok: boolean;
  sessionId: string | null;
  payloads: unknown[]; // parsed JSON bodies from this call (JSON or SSE data)
  error?: string;
  httpStatus?: number;
}

type PushFn = (f: Omit<WireFrame, "n" | "t">) => void;

/* ------------------------------------------------------------------ */
/* Session hooks — registered by lib/session.ts (the session manager). */
/* mcp.ts never imports session.ts, so there is no import cycle: the   */
/* manager registers itself and the transport consults the registry.   */
/* ------------------------------------------------------------------ */

export interface SessionHooks {
  /** The server rejected `staleId`. Return a usable session id — the
   * manager's current one if it already moved on, else a fresh mint —
   * or null when the stack is unreachable. */
  healSession: (push: PushFn, staleId: string) => Promise<string | null>;
  /** Any successful initialize anywhere funnels the minted id here. */
  onMinted: (sessionId: string) => void;
  /** Each SSE event id seen on a session (the replay cursor). */
  onEventId: (sessionId: string, eventId: string) => void;
  /** A call completed over the wire — the stack is reachable. */
  onAlive: () => void;
}

let hooks: SessionHooks | null = null;
export function registerSessionHooks(h: SessionHooks): void {
  hooks = h;
}

/** Last SSE event id seen per session — the local replay cursor. */
const lastEventBySession = new Map<string, string>();
export function lastEventIdFor(sessionId: string): string | null {
  return lastEventBySession.get(sessionId) ?? null;
}

/* ------------------------------------------------------------------ */
/* SSE parsing — incremental.                                          */
/* ------------------------------------------------------------------ */

function parseSseBlock(block: string): { id: string | null; event: string | null; data: string } | null {
  let id: string | null = null;
  let event: string | null = null;
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("id:")) id = line.slice(3).trim();
    else if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (!dataLines.length) return null;
  return { id, event, data: dataLines.join("\n") };
}

/** Split a growing buffer into complete SSE event blocks + remainder. */
function drainEvents(buf: string): { blocks: string[]; rest: string } {
  const blocks: string[] = [];
  let rest = buf.replace(/\r\n/g, "\n");
  let i = rest.indexOf("\n\n");
  while (i >= 0) {
    blocks.push(rest.slice(0, i));
    rest = rest.slice(i + 2);
    i = rest.indexOf("\n\n");
  }
  return { blocks, rest };
}

interface FrameMeta {
  method: string;
  tool?: string;
  status: string;
  upstream?: string;
  startedAt: number;
  sessionId: string | null;
}

/** Push one parsed SSE event as a frame (arrival-stamped by nextFrame)
 * and collect its payload. Returns true when data was present. */
function emitSseEvent(
  push: PushFn,
  ev: { id: string | null; event: string | null; data: string },
  meta: FrameMeta,
  payloads: unknown[]
): void {
  const tag = `← SSE${ev.id ? ` (id: ${ev.id})` : ""}${ev.event ? ` [${ev.event}]` : ""}`;
  push({
    dir: "S→C",
    label: tag,
    body: ev.data,
    method: meta.method,
    tool: meta.tool,
    status: meta.status,
    ms: Date.now() - meta.startedAt,
    upstream: meta.upstream,
    eventId: ev.id ?? undefined,
  });
  if (ev.id && meta.sessionId) {
    lastEventBySession.set(meta.sessionId, ev.id);
    hooks?.onEventId(meta.sessionId, ev.id);
  }
  try {
    payloads.push(JSON.parse(ev.data));
  } catch {
    payloads.push(ev.data);
  }
}

/** Read an SSE response body incrementally, pushing frames as events
 * arrive. Throws on transport failure (caller owns the try/catch). */
async function consumeSse(res: Response, push: PushFn, meta: FrameMeta, payloads: unknown[]): Promise<void> {
  if (!res.body) {
    // No stream to read (exotic runtime) — fall back to a full read so the
    // payload contract still holds.
    const text = await res.text();
    for (const block of drainEvents(text).blocks) {
      const ev = parseSseBlock(block);
      if (ev) emitSseEvent(push, ev, meta, payloads);
    }
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const { blocks, rest } = drainEvents(buf);
    buf = rest;
    for (const block of blocks) {
      const ev = parseSseBlock(block);
      if (ev) emitSseEvent(push, ev, meta, payloads);
    }
  }
  buf += decoder.decode();
  const tail = drainEvents(buf);
  for (const block of tail.blocks) {
    const ev = parseSseBlock(block);
    if (ev) emitSseEvent(push, ev, meta, payloads);
  }
  if (tail.rest.trim()) {
    const ev = parseSseBlock(tail.rest);
    if (ev) emitSseEvent(push, ev, meta, payloads);
  }
}

/* ------------------------------------------------------------------ */
/* Replay (FM-25): one GET with Last-Event-ID against the session's    */
/* event ring on the server. Frames recovered this way are real frames */
/* pushed through the same path — labeled as replay in the inspector.  */
/* ------------------------------------------------------------------ */

export async function mcpReplay(
  push: PushFn,
  sessionId: string,
  lastEventId: string
): Promise<RpcResult> {
  const startedAt = Date.now();
  push({
    dir: "C→S",
    label: `→ replay (Last-Event-ID: ${lastEventId})`,
    body: `GET /api/mcp · Mcp-Session-Id: ${sessionId.slice(0, 8)}… · Last-Event-ID: ${lastEventId}`,
    method: "replay",
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), WIRE_TIMEOUT_MS);
  try {
    const res = await fetch("/api/mcp", {
      method: "GET",
      headers: {
        Accept: "text/event-stream",
        "Mcp-Session-Id": sessionId,
        "Last-Event-ID": lastEventId,
      },
      signal: ctrl.signal,
    });
    const upstream = res.headers.get("X-OmniBeat-Upstream") ?? undefined;
    if (!res.ok) {
      return { ok: false, sessionId, payloads: [], error: `replay HTTP ${res.status}`, httpStatus: res.status };
    }
    const payloads: unknown[] = [];
    const ct = res.headers.get("Content-Type") ?? "";
    if (ct.includes("text/event-stream")) {
      await consumeSse(res, push, {
        method: "replay",
        status: String(res.status),
        upstream,
        startedAt,
        sessionId,
      }, payloads);
    } else {
      const text = await res.text();
      if (text.trim()) {
        push({
          dir: "S→C",
          label: `← replay (HTTP ${res.status})`,
          body: text.slice(0, 4000),
          method: "replay",
          status: String(res.status),
          ms: Date.now() - startedAt,
          upstream,
        });
        try {
          payloads.push(JSON.parse(text));
        } catch {
          payloads.push(text);
        }
      }
    }
    return { ok: true, sessionId, payloads, httpStatus: res.status };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, sessionId, payloads: [], error: msg };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* The RPC core.                                                       */
/* ------------------------------------------------------------------ */

async function rpcAttempt(
  push: PushFn,
  sessionId: string | null,
  method: string,
  params: Record<string, unknown> | undefined,
  label: string,
  chaosFault: string | null | undefined,
  isRetry: boolean
): Promise<RpcResult> {
  const id = Math.floor(Math.random() * 1_000_000);
  const tool = method === "tools/call" ? String((params as { name?: unknown })?.name ?? "") || undefined : undefined;
  // Progress notifications ride on the client's own token (spec §Progress):
  // the server echoes it in notifications/progress so stages are ours.
  const wireParams =
    method === "tools/call" && params
      ? { ...params, _meta: { ...(params._meta as Record<string, unknown> | undefined), progressToken: id } }
      : params;
  const body = JSON.stringify({ jsonrpc: "2.0", id, method, ...(wireParams ? { params: wireParams } : {}) });
  const startedAt = Date.now();
  push({ dir: "C→S", label: `→ ${label}`, body, method, tool });

  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, WIRE_TIMEOUT_MS);

  const payloads: unknown[] = [];
  try {
    const res = await fetch("/api/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
        // D-06/D-30: an armed chaos toggle rides the wire for real. The
        // server honors it only when started with --chaos (disclosed in
        // its /health); the token-expiry path also fires via the verify
        // tool's force_oauth_expired argument on any stack.
        ...(chaosFault ? { "X-Chaos-Fault": chaosFault } : {}),
      },
      body,
      signal: ctrl.signal,
    });

    const newSessionId = res.headers.get("Mcp-Session-Id");
    const upstream = res.headers.get("X-OmniBeat-Upstream") ?? undefined;
    const ct = res.headers.get("Content-Type") ?? "";
    const meta: FrameMeta = {
      method,
      tool,
      status: String(res.status),
      upstream,
      startedAt,
      sessionId: newSessionId ?? sessionId,
    };

    if (!res.ok) {
      const text = await res.text();
      push({
        dir: "⚠",
        label: `← HTTP ${res.status} (proxy)`,
        body: text.slice(0, 2000),
        method,
        tool,
        status: String(res.status),
        ms: Date.now() - startedAt,
        upstream,
      });

      // Session healing (FM-23): the spec's unknown-session signal is
      // HTTP 404 (400 when the id is missing/malformed — the same pair
      // the orchestrator's own client heals on). Heal + retry ONCE,
      // here in the transport, so every call site recovers by design.
      const sessionRejected = sessionId !== null && (res.status === 404 || res.status === 400);
      if (sessionRejected && !isRetry && method !== "initialize" && hooks?.healSession) {
        clearTimeout(timer); // the response arrived; the deadline's job is done
        push({
          dir: "⚠",
          label: "session rejected — the server forgot this session; minting a fresh one and retrying once",
          body: `HTTP ${res.status} for Mcp-Session-Id ${sessionId.slice(0, 8)}… — sessions live in server memory, so a restart invalidates them. The call below is the same request on a fresh session.`,
          method,
          tool,
          status: String(res.status),
        });
        const healed = await hooks.healSession(push, sessionId);
        if (healed) {
          return rpcAttempt(push, healed, method, params, label, chaosFault, true);
        }
      }
      return { ok: false, sessionId: newSessionId, payloads: [], error: `HTTP ${res.status}`, httpStatus: res.status };
    }

    if (ct.includes("text/event-stream")) {
      await consumeSse(res, push, meta, payloads);
    } else {
      const text = await res.text();
      push({
        dir: "S→C",
        label: `← ${label} (HTTP ${res.status})`,
        body: text.slice(0, 4000),
        method,
        tool,
        status: String(res.status),
        ms: Date.now() - startedAt,
        upstream,
      });
      try {
        payloads.push(JSON.parse(text));
      } catch {
        payloads.push(text);
      }
    }
    hooks?.onAlive();
    return { ok: true, sessionId: newSessionId, payloads, httpStatus: res.status };
  } catch (e) {
    // Transport failure — before headers, mid-stream, or by deadline.
    // The whole exchange lives in this try (FM-26): nothing escapes as
    // an unhandled rejection, and partial payloads stay truthful.
    if (timedOut) {
      const partial = payloads.length > 0;
      push({
        dir: "⚠",
        label: partial
          ? `the wire went silent mid-answer — deadline hit (${WIRE_TIMEOUT_MS / 1000}s)`
          : `the wire went silent — no answer within ${WIRE_TIMEOUT_MS / 1000}s`,
        body: partial
          ? `${payloads.length} frame(s) arrived, then nothing for the rest of the ${WIRE_TIMEOUT_MS / 1000}s deadline. The call was aborted on this side; nothing was invented to fill the silence.`
          : `No response within ${WIRE_TIMEOUT_MS / 1000}s. The call was aborted on this side — check the MCP stack is running; nothing was faked to fill the silence.`,
        method,
        tool,
        status: "timeout",
        ms: Date.now() - startedAt,
      });
      return {
        ok: false,
        sessionId,
        payloads,
        error: `wire timeout — no answer within ${WIRE_TIMEOUT_MS / 1000}s`,
        httpStatus: undefined,
      };
    }

    const msg = e instanceof Error ? e.message : String(e);

    // Mid-stream drop with a replay cursor (FM-25): the result may
    // already exist in the server's event ring. One replay GET; the
    // call counts as recovered ONLY if the replay delivers this call's
    // own response (matching JSON-RPC id) — otherwise the honest
    // failure below stands.
    if (payloads.length > 0 && sessionId && !isRetry) {
      const cursor = lastEventIdFor(sessionId);
      if (cursor) {
        const replay = await mcpReplay(push, sessionId, cursor);
        if (replay.ok) {
          const mine = replay.payloads.filter(
            (p) => p !== null && typeof p === "object" && (p as { id?: unknown }).id === id
          );
          if (mine.length > 0) {
            push({
              dir: "S→C",
              label: "← recovered via Last-Event-ID replay — the stream dropped, the answer didn't",
              body: `The live stream broke mid-call (${msg}). The server had already written this call's response to its session event ring; the frames above after the replay marker are that response, re-delivered.`,
              method,
              tool,
              status: "replay",
              ms: Date.now() - startedAt,
            });
            hooks?.onAlive();
            return { ok: true, sessionId, payloads: [...payloads, ...replay.payloads] };
          }
        }
      }
    }

    push({ dir: "⚠", label: "transport error — is :8080 up?", body: msg, method, tool, status: "error" });
    return { ok: false, sessionId: null, payloads, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

export async function mcpRpc(
  push: PushFn,
  sessionId: string | null,
  method: string,
  params: Record<string, unknown> | undefined,
  label: string,
  chaosFault?: string | null
): Promise<RpcResult> {
  return rpcAttempt(push, sessionId, method, params, label, chaosFault, false);
}

/** Full handshake: initialize → capture Mcp-Session-Id → notifications/initialized. */
export async function mcpInitialize(
  push: PushFn
): Promise<{ ok: boolean; sessionId: string | null; error?: string }> {
  const init = await mcpRpc(push, null, "initialize", {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: CLIENT_INFO,
  }, "initialize");
  if (!init.ok || !init.sessionId) {
    return { ok: false, sessionId: null, error: init.error ?? "no Mcp-Session-Id minted" };
  }
  // Single funnel: every minted id reaches the session manager, whoever
  // fired the initialize (auto-connect, deck, inspector, heal path).
  hooks?.onMinted(init.sessionId);
  const ack = await mcpRpc(push, init.sessionId, "notifications/initialized", undefined, "notifications/initialized");
  if (!ack.ok) return { ok: false, sessionId: init.sessionId, error: ack.error };
  return { ok: true, sessionId: init.sessionId };
}

/** Convenience: tools/call with the minted session. */
export async function mcpCallTool(
  push: PushFn,
  sessionId: string,
  tool: string,
  args: Record<string, unknown>,
  chaosFault?: string | null
): Promise<RpcResult> {
  return mcpRpc(push, sessionId, "tools/call", { name: tool, arguments: args }, `tools/call ${tool}`, chaosFault);
}

/**
 * D-30: scan a call's payloads for the -32042 URL elicitation (provider
 * token expired). Returns the re-link target the server named, or null.
 * The payload is the contract: { error: { code: -32042, data: { url,
 * provider, render: "modal" } } } — the UI renders the modal it asks for.
 */
export function findRelink(payloads: unknown[]): { url: string; provider: string } | null {
  for (const p of payloads) {
    const err = (p as { error?: { code?: number; data?: { url?: string; provider?: string } } })?.error;
    if (err?.code === -32042 && err.data?.url) {
      return { url: err.data.url, provider: err.data.provider ?? "provider" };
    }
  }
  return null;
}
