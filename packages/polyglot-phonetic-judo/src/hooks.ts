// hooks.ts — 30s preview resolution + 3s chorus-hook slicing (E2 / Sub-Engine 2).
//
// HONEST DESIGN NOTE (read before "improving" this):
// A 3s chorus hook is NOT produced by byte-slicing the MP3 on the server.
// MP3 byte offsets only map to seconds under constant bitrate, and neither
// Deezer nor iTunes previews guarantee CBR — a Range-request slice would land
// on the wrong seconds or a corrupt frame boundary. Instead we hand the
// browser the full 30s preview URL with a W3C media fragment (#t=start,end)
// plus explicit startOffsetSec/durationSec metadata. Every modern browser
// seeks <audio> to the fragment on load; the player then stops at endSec.
// The "stitch" (hooks back-to-back) happens client-side by chaining slices.
// Zero server compute, zero ffmpeg, zero cost — and the seconds are exact.
//
// Preview sources (both FREE, NO OAuth, NO API key — the ₹0 law):
//   Deezer Search API : https://api.deezer.com/search?q=…&limit=…  → data[].preview (30s mp3)
//   iTunes Search API : https://itunes.apple.com/search?term=…&media=music&entity=song&limit=…
//                                                       → results[].previewUrl (30s m4a)
//
// NOTE: Deezer preview URLs are SIGNED with expiring tokens (exp=… in the
// query string). Never cache them across sessions — resolve previews live
// per demo session, or the audio will 403 mid-judging. iTunes URLs are
// stable but either source can rotate; treat every previewUrl as
// single-session.

export interface PreviewHit {
  title: string;
  artist: string;
  previewUrl: string;
  source: "deezer" | "itunes";
  artworkUrl?: string;
  durationSec?: number;
}

export interface HookSlice {
  /** Playable URL: preview + #t=start,end media fragment. */
  url: string;
  startOffsetSec: number;
  durationSec: number;
  method: "media-fragment";
  note: string;
}

const fetchFn: typeof fetch = (globalThis as any).fetch.bind(globalThis);

async function getJson(url: string, timeoutMs = 8000): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, {
      signal: ctl.signal,
      headers: { "User-Agent": "omnibeat-mcp/0.1.0 (hackathon demo)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** 30s preview URLs for a canonical "Title — Artist" query. Deezer first, iTunes as backup. */
export async function searchPreviews(
  query: string,
  limit = 5
): Promise<PreviewHit[]> {
  const q = encodeURIComponent(query);
  const hits: PreviewHit[] = [];

  try {
    const dz = await getJson(`https://api.deezer.com/search?q=${q}&limit=${limit}`);
    for (const d of dz?.data ?? []) {
      if (d?.preview)
        hits.push({
          title: d.title,
          artist: d.artist?.name ?? "unknown",
          previewUrl: d.preview,
          source: "deezer",
          artworkUrl: d.album?.cover_medium,
          durationSec: d.duration,
        });
    }
  } catch {
    /* Deezer down — iTunes below is the fallback, silence is fine */
  }

  if (hits.length < limit) {
    try {
      const it = await getJson(
        `https://itunes.apple.com/search?term=${q}&media=music&entity=song&limit=${limit}`
      );
      for (const r of it?.results ?? []) {
        if (r?.previewUrl)
          hits.push({
            title: r.trackName,
            artist: r.artistName ?? "unknown",
            previewUrl: r.previewUrl,
            source: "itunes",
            artworkUrl: r.artworkUrl100,
            durationSec: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1000) : undefined,
          });
      }
    } catch {
      /* both down — caller gets what we have, possibly [] */
    }
  }

  return hits.slice(0, limit);
}

/**
 * Build a playable 3s chorus slice from a 30s preview.
 * Default window t=12–15s: the chorus hook of most 30s previews (blueprint §1B).
 */
export function hookSlice(
  previewUrl: string,
  startSec = 12,
  endSec = 15
): HookSlice {
  if (!previewUrl || typeof previewUrl !== "string")
    throw new Error("hookSlice: previewUrl must be a non-empty string");
  if (!(endSec > startSec) || startSec < 0)
    throw new Error("hookSlice: need 0 <= startSec < endSec");
  return {
    url: `${previewUrl}#t=${startSec},${endSec}`,
    startOffsetSec: startSec,
    durationSec: endSec - startSec,
    method: "media-fragment",
    note: "Browser seeks to #t fragment; player stops at endSec. No server-side audio slicing (see module doc).",
  };
}
