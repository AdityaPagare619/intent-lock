/**
 * Real MCP 2025-11-25 Streamable HTTP client — single /mcp endpoint, real HTTP wire.
 * Handles: initialize -> Mcp-Session-Id -> notifications/initialized -> tools/call
 * (JSON + SSE), elicitation follow-ups, Last-Event-ID replay, session re-init.
 * Zero deps. Rs.0. No cloud anything.
 */

export interface SseFrame {
  id?: string;
  event?: string;
  data: unknown;
  raw: string;
}

export interface ToolCallResult {
  ok: boolean;
  result?: unknown;
  frames: SseFrame[];
  sessionId: string;
  mcpMs: number;
  streamed: boolean;
  error?: string;
}

const PROTOCOL_VERSION = "2025-11-25";

function parseSse(text: string): SseFrame[] {
  const frames: SseFrame[] = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    if (!block.trim()) continue;
    let id: string | undefined;
    let event: string | undefined;
    const dataLines: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("id:")) id = line.slice(3).trim();
      else if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      // comments (:...) ignored per SSE spec
    }
    if (dataLines.length === 0) continue;
    const raw = dataLines.join("\n");
    let data: unknown = raw;
    try {
      data = JSON.parse(raw);
    } catch {
      /* keep raw string */
    }
    frames.push({ id, event, data, raw });
  }
  return frames;
}

export class McpClient {
  private baseUrl: string;
  private sessionId: string | null = null;
  private reqId = 0;
  private origin: string;

  constructor(baseUrl: string, origin = "http://localhost:4000") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.origin = origin;
  }

  get hasSession(): boolean {
    return this.sessionId !== null;
  }

  private nextId(): number {
    return ++this.reqId;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const h: Record<string, string> = {
      Origin: this.origin,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...extra,
    };
    if (this.sessionId) {
      h["MCP-Protocol-Version"] = PROTOCOL_VERSION;
      h["Mcp-Session-Id"] = this.sessionId;
    }
    return h;
  }

  async initialize(chaosFault?: string): Promise<{ sessionId: string; serverInfo: unknown }> {
    const body = {
      jsonrpc: "2.0",
      id: this.nextId(),
      method: "initialize",
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { elicitation: {} },
        clientInfo: { name: "alexa-agent-orchestrator", version: "0.1.0" },
      },
    };
    const extra: Record<string, string> = {};
    if (chaosFault) extra["X-Chaos-Fault"] = chaosFault;
    const res = await fetch(this.baseUrl, {
      method: "POST",
      headers: this.headers(extra),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`initialize failed: HTTP ${res.status}`);
    const sid = res.headers.get("mcp-session-id");
    if (!sid) throw new Error("initialize: no Mcp-Session-Id header returned");
    this.sessionId = sid;
    const payload = (await res.json()) as {
      result?: { protocolVersion?: string; serverInfo?: unknown };
    };
    if (payload.result?.protocolVersion !== PROTOCOL_VERSION) {
      throw new Error(
        `protocol mismatch: server said ${payload.result?.protocolVersion}, want ${PROTOCOL_VERSION}`
      );
    }
    // notifications/initialized — 202 expected, no body
    await fetch(this.baseUrl, {
      method: "POST",
      headers: this.headers(extra),
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      signal: AbortSignal.timeout(15000),
    });
    return { sessionId: sid, serverInfo: payload.result?.serverInfo ?? null };
  }

  async ensureSession(chaosFault?: string): Promise<string> {
    if (!this.sessionId) await this.initialize(chaosFault);
    return this.sessionId!;
  }

  /** tools/list — the Brain's decision context (Layer A, doc 11). */
  async listTools(): Promise<
    Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>
  > {
    await this.ensureSession();
    const res = await fetch(this.baseUrl, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: this.nextId(),
        method: "tools/list",
        params: {},
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`tools/list failed: HTTP ${res.status}`);
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("text/event-stream")) {
      const frames = parseSse(await res.text());
      for (let i = frames.length - 1; i >= 0; i--) {
        const d = frames[i].data as { result?: { tools?: unknown } } | null;
        if (d?.result?.tools) return d.result.tools as never;
      }
      return [];
    }
    const payload = (await res.json()) as { result?: { tools?: unknown } };
    return (payload.result?.tools as never) ?? [];
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    opts: {
      chaosFault?: string;
      lastEventId?: string;
      /** Per-request JSON-RPC _meta (e.g. { host_time: "22:05" } — the
       * host-clock channel, Wave 2 W2-4). Sent only when provided. */
      meta?: Record<string, unknown>;
    } = {}
  ): Promise<ToolCallResult> {
    const t0 = Date.now();
    try {
      await this.ensureSession(opts.chaosFault);
    } catch (e) {
      return {
        ok: false,
        frames: [],
        sessionId: "",
        mcpMs: Date.now() - t0,
        streamed: false,
        error: `session: ${(e as Error).message}`,
      };
    }
    const extra: Record<string, string> = {};
    if (opts.chaosFault) extra["X-Chaos-Fault"] = opts.chaosFault;
    if (opts.lastEventId) extra["Last-Event-ID"] = opts.lastEventId;

    const attempt = async (): Promise<ToolCallResult> => {
      const params: Record<string, unknown> = { name, arguments: args };
      if (opts.meta && Object.keys(opts.meta).length) params._meta = opts.meta;
      const res = await fetch(this.baseUrl, {
        method: "POST",
        headers: this.headers(extra),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: this.nextId(),
          method: "tools/call",
          params,
        }),
        signal: AbortSignal.timeout(30000),
      });
      // Dead session -> re-init once and retry
      if ((res.status === 400 || res.status === 404) && !opts.lastEventId) {
        this.sessionId = null;
        await this.ensureSession(opts.chaosFault);
        return attempt();
      }
      if (!res.ok) {
        return {
          ok: false,
          frames: [],
          sessionId: this.sessionId!,
          mcpMs: Date.now() - t0,
          streamed: false,
          error: `tools/call ${name}: HTTP ${res.status}`,
        };
      }
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("text/event-stream")) {
        const text = await res.text();
        const frames = parseSse(text);
        // Final result = last frame whose data is a JSON-RPC result/error envelope
        let result: unknown;
        for (let i = frames.length - 1; i >= 0; i--) {
          const d = frames[i].data as Record<string, unknown> | null;
          if (d && typeof d === "object" && ("result" in d || "error" in d)) {
            result = (d as { result?: unknown }).result ?? d;
            break;
          }
        }
        return {
          ok: true,
          result,
          frames,
          sessionId: this.sessionId!,
          mcpMs: Date.now() - t0,
          streamed: true,
        };
      }
      const payload = (await res.json()) as {
        result?: unknown;
        error?: { message?: string };
      };
      const frames: SseFrame[] = [{ data: payload, raw: JSON.stringify(payload) }];
      if (payload.error) {
        return {
          ok: false,
          result: payload,
          frames,
          sessionId: this.sessionId!,
          mcpMs: Date.now() - t0,
          streamed: false,
          error: payload.error.message ?? "JSON-RPC error",
        };
      }
      return {
        ok: true,
        result: payload.result,
        frames,
        sessionId: this.sessionId!,
        mcpMs: Date.now() - t0,
        streamed: false,
      };
    };

    try {
      return await attempt();
    } catch (e) {
      return {
        ok: false,
        frames: [],
        sessionId: this.sessionId ?? "",
        mcpMs: Date.now() - t0,
        streamed: false,
        error: `transport: ${(e as Error).message}`,
      };
    }
  }

  /** Replay missed SSE notifications after an outage (F-08). */
  async replay(lastEventId: string): Promise<SseFrame[]> {
    await this.ensureSession();
    const res = await fetch(this.baseUrl, {
      method: "GET",
      headers: { ...this.headers(), "Last-Event-ID": lastEventId },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    return parseSse(await res.text());
  }

  /** Transparent passthrough for the simulator's wire inspector (D-08). */
  async passthrough(
    method: string,
    body: string | null,
    inHeaders: Record<string, string | string[] | undefined>
  ): Promise<{ status: number; headers: Record<string, string>; body: ReadableStream<Uint8Array> | null }> {
    const pick = (n: string): string | undefined => {
      const v = inHeaders[n.toLowerCase()];
      return Array.isArray(v) ? v[0] : v ?? undefined;
    };
    const out: Record<string, string> = { Origin: this.origin };
    for (const n of [
      "content-type",
      "accept",
      "mcp-protocol-version",
      "mcp-session-id",
      "last-event-id",
      "x-chaos-fault",
    ]) {
      const v = pick(n);
      if (v) out[n] = v;
    }
    const res = await fetch(this.baseUrl, {
      method,
      headers: out,
      body: body ?? undefined,
      signal: AbortSignal.timeout(30000),
    });
    const rh: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      rh[k] = v;
    });
    // Stream the body through untouched (FM-27): buffering it here with
    // res.text() delivered every SSE progress frame in one end-of-call clump,
    // which silently killed live narration on the primary path.
    return { status: res.status, headers: rh, body: res.body };
  }
}
