/**
 * POST /api/turn
 *
 * The stage's voice-turn wire. Proxies to the REAL :4000 orchestrator
 * (the Alexa+ host brain) over HTTP — never a local import, never a
 * stub. The orchestrator parses the utterance (Gemini 3 Flash via the
 * vaulted connector, deterministic floor beneath) and calls ONE MCP
 * tool — intent_lock — on :8080. The response's `payload` is the
 * intent_lock structuredContent the Trust Card renders.
 *
 * Same-origin by design, mirroring /api/mcp: the browser never talks
 * to :4000/:8080 directly. Chaos intent rides the body field
 * `chaos_fault` (the router reads it first) and the X-Chaos-Fault
 * header is forwarded untouched for good measure.
 */

const TURN_URL = process.env.TURN_UPSTREAM ?? "http://127.0.0.1:4000/turn";

export async function POST(req: Request): Promise<Response> {
  // Buffer-once: the ONLY read of the request body in this route.
  const body = await req.arrayBuffer();

  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
  const chaos = req.headers.get("x-chaos-fault");
  if (chaos) headers.set("X-Chaos-Fault", chaos);

  let upstream: Response | null = null;
  try {
    upstream = await fetch(TURN_URL, { method: "POST", headers, body });
  } catch {
    upstream = null; // connection refused / down — honest 502 below
  }
  if (!upstream) {
    return Response.json(
      {
        error: "orchestrator unreachable",
        tried: [TURN_URL],
        hint: "Is the :4000 orchestrator running? The turn was not faked to fill the silence.",
      },
      { status: 502 }
    );
  }

  const out = new Headers();
  out.set("Content-Type", upstream.headers.get("content-type") ?? "application/json");
  out.set("X-OmniBeat-Upstream", TURN_URL); // honest: which hop served us
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

// never statically optimize: this is a live proxy
export const dynamic = "force-dynamic";
