/**
 * GET /api/brain
 *
 * Read-only brain-status hop for the stage's Gemini chip. Proxies the
 * REAL :4000 orchestrator /health (which itself probes :8080 live) —
 * never a local import, never a stub, never a cached answer dressed as
 * live. Same-origin by design, mirroring /api/turn: the browser never
 * talks to :4000 directly.
 *
 * The health body passes through verbatim under `health`; the chip
 * reads `health.brain` (the orchestrator's own description of its
 * extraction ladder) and `health.mcp.reachable`. When the orchestrator
 * doesn't answer, this route says so (502 + the honest error) — the
 * chip's Offline state is this route failing, nothing softer.
 */

const HEALTH_URL = process.env.BRAIN_HEALTH_URL ?? "http://127.0.0.1:4000/health";

export async function GET(): Promise<Response> {
  let upstream: Response | null = null;
  try {
    upstream = await fetch(HEALTH_URL, {
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
  } catch {
    upstream = null; // connection refused / timeout — honest 502 below
  }
  if (!upstream) {
    return Response.json(
      {
        ok: false,
        error: "orchestrator unreachable",
        tried: HEALTH_URL,
        hint: "Is the :4000 orchestrator running? The brain status was not faked to fill the silence.",
      },
      { status: 502 }
    );
  }
  if (!upstream.ok) {
    return Response.json(
      { ok: false, error: `orchestrator health answered HTTP ${upstream.status}`, tried: HEALTH_URL },
      { status: 502 }
    );
  }
  const health = (await upstream.json().catch(() => null)) as Record<string, unknown> | null;
  if (!health) {
    return Response.json(
      { ok: false, error: "orchestrator health returned an unreadable body", tried: HEALTH_URL },
      { status: 502 }
    );
  }
  return Response.json({ ok: true, health });
}

// never statically optimize: this is a live probe
export const dynamic = "force-dynamic";
