/**
 * alexa-agent-orchestrator — the Alexa+ host brain as its own process
 * (:4000). Real MCP 2025-11-25 client -> :8080 over HTTP at every hop.
 * The Brain (Wave 2) parses play turns with Gemini 3 Flash via the
 * extraction helper (BRAIN_PROVIDER=gemini, the default) into the
 * Doc-12 extraction shape and calls ONE tool — intent_lock. The helper
 * uses GEMINI_API_KEY from the environment when one is set, and the
 * vaulted connector route otherwise; with neither, the deterministic
 * floor serves alone. BRAIN_PROVIDER=local serves the floor alone
 * (Rs.0, no model); legacy decision providers (groq/openrouter/ollama)
 * remain available for flag-gated legacy turns.
 */

import http from "node:http";
import { Readable } from "node:stream";
import { McpClient } from "./mcpClient.js";
import { IntentRouter, TurnRequest } from "./router.js";
import { Brain } from "./brain/brain.js";
import { buildProviders } from "./brain/providers.js";

const PORT = Number(process.env.PORT ?? 4000);
const MCP_SERVER_URL = process.env.MCP_SERVER_URL ?? "http://127.0.0.1:8080/mcp";
const VERSION = "0.1.0";

const mcp = new McpClient(MCP_SERVER_URL);
const router = new IntentRouter(mcp);
const brain = new Brain(router, mcp, buildProviders(process.env.BRAIN_PROVIDER ?? "gemini"));

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res: http.ServerResponse, status: number, obj: unknown, headers: Record<string, string> = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers": "Mcp-Session-Id, MCP-Protocol-Version",
    ...headers,
  });
  res.end(body);
}

async function probeMcp(): Promise<{ reachable: boolean; protocol?: string; error?: string }> {
  try {
    const r = await fetch(MCP_SERVER_URL.replace(/\/mcp$/, "/health"), {
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return { reachable: false, error: `HTTP ${r.status}` };
    const j = (await r.json()) as { protocol?: string };
    return { reachable: true, protocol: j.protocol };
  } catch (e) {
    return { reachable: false, error: (e as Error).message };
  }
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID, X-Chaos-Fault, X-Client-Session",
      "Access-Control-Expose-Headers": "Mcp-Session-Id, MCP-Protocol-Version",
    });
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  try {
    // --- GET /health -------------------------------------------------------
    if (req.method === "GET" && url.pathname === "/health") {
      const mcpProbe = await probeMcp();
      send(res, 200, {
        status: "ok",
        service: "alexa-agent-orchestrator",
        version: VERSION,
        brain: brain.describe(),
        protocol: "2025-11-25",
        mcp_server_url: MCP_SERVER_URL,
        mcp: mcpProbe,
        cost: process.env.GEMINI_API_KEY
          ? "deterministic floor Rs.0; Gemini extraction via GEMINI_API_KEY from the environment"
          : "deterministic floor Rs.0; Gemini extraction via the vaulted custom.gemini connector (no key in this process)",
      });
      return;
    }

    // --- POST /turn — the orchestrated voice/text turn ---------------------
    if (req.method === "POST" && url.pathname === "/turn") {
      const bodyStr = await readBody(req);
      let body: TurnRequest;
      try {
        body = JSON.parse(bodyStr || "{}");
      } catch {
        send(res, 400, { error: "invalid JSON body" });
        return;
      }
      const chaosHeader = req.headers["x-chaos-fault"];
      if (!body.utterance && !body.pending_id && !body.pin && !body.reject) {
        send(res, 400, { error: 'body needs "utterance" (or pending_id + input_responses, or a pin/reject follow-up)' });
        return;
      }
      const turnReq: TurnRequest = {
        ...body,
        chaos_fault: body.chaos_fault ?? (Array.isArray(chaosHeader) ? chaosHeader[0] : chaosHeader),
      };
      const out = await brain.turn(turnReq);
      send(res, 200, out);
      return;
    }

    // --- /mcp passthrough — transparent, for the simulator's wire inspector
    // (D-08: Meera's proxy repoints here; frames stay real, one extra hop).
    if (url.pathname === "/mcp" && ["POST", "GET", "DELETE"].includes(req.method ?? "")) {
      const bodyStr = req.method === "GET" || req.method === "DELETE" ? null : await readBody(req);
      const inH: Record<string, string | string[] | undefined> = {};
      for (const [k, v] of Object.entries(req.headers)) inH[k] = v;
      const p = await mcp.passthrough(req.method!, bodyStr, inH);
      const headers: Record<string, string> = { "Access-Control-Allow-Origin": "*" };
      for (const [k, v] of Object.entries(p.headers)) {
        if (/^(content-type|mcp-session-id|mcp-protocol-version)$/i.test(k)) headers[k] = v;
      }
      // SSE streams pass through untouched — piped chunk by chunk (FM-27),
      // never buffered: progress frames reach the client as the MCP server
      // emits them, not in one clump when the call completes.
      res.writeHead(p.status, headers);
      if (p.body) {
        const nodeStream = Readable.fromWeb(p.body as Parameters<typeof Readable.fromWeb>[0]);
        req.on("close", () => nodeStream.destroy());
        nodeStream.on("error", () => res.end());
        nodeStream.pipe(res);
      } else {
        res.end();
      }
      return;
    }

    send(res, 404, { error: "not found", routes: ["GET /health", "POST /turn", "POST|GET|DELETE /mcp"] });
  } catch (e) {
    send(res, 500, { error: (e as Error).message });
  }
});

server.listen(PORT, () => {
  console.log(
    `[orchestrator] :${PORT} up — brain=${brain.describe()} protocol=2025-11-25 mcp=${MCP_SERVER_URL}`
  );
});
