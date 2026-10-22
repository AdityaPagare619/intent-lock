import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The folded orchestrator: API routes proxy to the real MCP server.
  // Override with MCP_UPSTREAM=http://host:8080/mcp in docker-compose.
  reactStrictMode: true,
  // D-23 (Petu, 2026-10-19): serverExternalPackages REMOVED. On Next 15.5.4
  // it breaks the static build worker (/_document resolution failure), while
  // the plain webpack bundle builds clean — the VAD dynamic import()
  // (lib/vad.ts:212) only executes in the browser on mic-enable click, so
  // the server bundle never touches onnxruntime at runtime. Verified:
  // full `npm run build` passes without it on this box.
};

export default nextConfig;
