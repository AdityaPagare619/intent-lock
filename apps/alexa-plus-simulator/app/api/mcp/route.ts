/**
 * POST /api/mcp  ·  GET /api/mcp
 *
 * The simulator's only wire. This route proxies to a REAL MCP stack over
 * HTTP — never a local import, never a stub.
 *
 * D-08 topology: PRIMARY = the :4000 orchestrator (local deterministic
 * router + real MCP client over HTTP). FALLBACK = :8080 MCP server direct,
 * used automatically when :4000 is unreachable. The full chain
 * browser → :4000 → :8080 stays real HTTP at every hop.
 * D-06: forwards X-Chaos-Fault untouched (honored only in --chaos mode).
 *
 * Contract preserved: Mcp-Session-Id and Last-Event-ID flow both ways.
 * SSE (text/event-stream) is streamed through untouched.
 *
 * FM-22 fix (buffer-once failover): the request body is read ONCE into
 * an ArrayBuffer before any upstream attempt, and the same buffer is
 * handed to the primary and — if the primary is unreachable — the
 * fallback. The previous shape let each attempt read `req` itself; a
 * Fetch body can be consumed exactly once, so the fallback attempt
 * threw `TypeError: Body is unusable` and every POST failed with a 500
 * while :8080 sat healthy. Failover now works by construction, and the
 * kill-test (dead primary, POST served by fallback) is part of this
 * lane's verification.
 */

const PRIMARY = process.env.MCP_UPSTREAM ?? "http://127.0.0.1:4000/mcp";
const FALLBACK = process.env.MCP_FALLBACK ?? "http://127.0.0.1:8080/mcp";

function buildHeaders(req: Request): Headers {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json, text/event-stream");
  headers.set("MCP-Protocol-Version", "2025-11-25");

  const sid = req.headers.get("mcp-session-id");
  if (sid) headers.set("Mcp-Session-Id", sid);

  const lastEventId = req.headers.get("last-event-id");
  if (lastEventId) headers.set("Last-Event-ID", lastEventId);

  // D-06: chaos-injection intent, per-request. Honored only in --chaos mode.
  const chaos = req.headers.get("x-chaos-fault");
  if (chaos) headers.set("X-Chaos-Fault", chaos);

  return headers;
}

async function tryUpstream(
  url: string,
  method: string,
  headers: Headers,
  body: ArrayBuffer | undefined
): Promise<Response | null> {
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    // An ArrayBuffer body is reusable across fetch attempts (unlike a
    // stream, it is never "disturbed") — primary and fallback share it.
    init.body = body;
  }
  try {
    return await fetch(url, init);
  } catch {
    return null; // connection refused / down — caller decides fallback
  }
}

async function proxy(req: Request): Promise<Response> {
  const method = req.method;
  // Buffer-once: the ONLY read of the request body in this route.
  const body = method !== "GET" && method !== "HEAD" ? await req.arrayBuffer() : undefined;
  const headers = buildHeaders(req);

  let upstream = await tryUpstream(PRIMARY, method, headers, body);
  let via = PRIMARY;
  if (!upstream) {
    upstream = await tryUpstream(FALLBACK, method, headers, body);
    via = FALLBACK;
  }
  if (!upstream) {
    return Response.json(
      {
        error: "MCP stack unreachable",
        tried: [PRIMARY, FALLBACK],
        hint: "Is the :4000 orchestrator or :8080 MCP server running? (D-08 topology)",
      },
      { status: 502 }
    );
  }

  const out = new Headers();
  const outSid = upstream.headers.get("mcp-session-id");
  if (outSid) out.set("Mcp-Session-Id", outSid);
  out.set("Content-Type", upstream.headers.get("content-type") ?? "application/json");
  out.set("X-OmniBeat-Upstream", via); // honest: which hop served this frame

  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export const POST = proxy;
export const GET = proxy;

// never statically optimize: this is a live proxy
export const dynamic = "force-dynamic";
