// sidecar.js — Node stdio sidecar for the Python MCP server (D-07, Kabir FLAG-1).
// Spawned ONCE by server.py at startup; long-lived, no per-query spawn.
// Protocol:  stdin  — one JSON object per line: {"mangled": str, "localeHint"?: str, "topN"?: int}
//            stdout — one JSON object per line: {"candidates": [{title, artist, score, trace}]}
//            errors — {"error": msg} on stdout. Bad input never kills the process.
import { createInterface } from "node:readline";
import { resolvePhoneticTrack, vppsSimilarity } from "./dist/index.js";
import { CHAOS_CATALOG_30 } from "./dist/catalog.js";
// The JSON protocol carries no catalog (it isn't JSON-serializable state);
// the sidecar always resolves against the bundled 30-track chaos catalog —
// the same catalog the 25 unit tests assert against. Tests are the contract.

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

for await (const line of rl) {
  const t = line.trim();
  if (!t) continue;
  try {
    const req = JSON.parse(t);
    // Additive op (v2 integration): batch VPPS similarity for hydration.
    // {"op":"sim","pairs":[[query,title],...]} → {"sims":[0..1,...]}
    // The resolve op below is untouched (D-07 contract).
    if (req && req.op === "sim") {
      const pairs = Array.isArray(req.pairs) ? req.pairs : [];
      const sims = pairs.map((p) => {
        try {
          // P1-2: bound the O(n²) DP — 200 chars covers any spoken query.
          const a = String(p[0] || "").slice(0, 200), b = String(p[1] || "").slice(0, 200);
          if (!a.trim() || !b.trim()) return 0;
          return Math.max(0, Math.min(1, vppsSimilarity(a, b)));
        } catch { return 0; }
      });
      process.stdout.write(JSON.stringify({ sims }) + "\n");
      continue;
    }
    const { mangled, localeHint, topN = 5 } = req;
    if (typeof mangled !== "string" || !mangled.trim())
      throw new Error("field 'mangled' must be a non-empty string");
    const candidates = resolvePhoneticTrack(mangled, localeHint, {
      catalog: CHAOS_CATALOG_30,
      topN,
    // Full metadata passes through (additive to the {title, artist, score, trace}
    // contract): the Python purity guard needs version/popularity/upsellRisk/id.
    // Cross-lane note (Arjun, D-07): contracted fields unchanged, only extended.
    }).map((c) => ({
      id: c.id, title: c.title, artist: c.artist, version: c.version,
      year: c.year, localeTags: c.localeTags, popularity: c.popularity,
      providers: c.providers, upsellRisk: !!c.upsellRisk, mock: !!c.mock,
      score: c.score, trace: c.trace,
      // v2 additive (E2 lane): raw VPPS phonetic similarity [0,1] and the
      // full deterministic purity score. Contracted fields above unchanged.
      phoneticSimilarity: c.phoneticSimilarity, purityScore: c.purityScore,
    }));
    process.stdout.write(JSON.stringify({ candidates }) + "\n");
  } catch (err) {
    process.stdout.write(
      JSON.stringify({ error: String((err && err.message) || err) }) + "\n"
    );
  }
}
