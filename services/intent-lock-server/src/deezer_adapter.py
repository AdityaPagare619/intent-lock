"""Deezer supply adapter for Intent Lock Stage C (Lane S, 2026-10-22).

Council C3 verdict: ADOPT Deezer as an additional racer in the existing
Stage C race (COUNCIL_C3_SUPPLY.md §1). This module mirrors the shape
of server.py's `itunes_hydrate` — same return contract
``(candidates, ms, ok)``, same candidate tensor fields — so the kernel
owner can wire it into `_lock_pipeline` exactly like an iTunes round.

Design constraints honored here (C3 §1.4 conditions):

1. Source tag is ``deezer``; every row carries its ISRC when Deezer
   provides one, ready to be used as an additional `_merge_pool`
   identity key by the kernel owner.
2. Preview URLs are SIGNED and expire in ~hours (observed ≈ +3.6 h).
   This module performs NO file I/O of any kind: previews live only in
   the returned in-memory dicts. Never write these rows (or any row
   that adopted a Deezer preview through a merge) into
   ``catalog_snapshot.json`` or any other file cache.
3. Release year is ABSENT from Deezer search rows. The album endpoint
   supplies the ALBUM's release year (album year != track year in
   general — Deezer's top Despacito row sits on the 2019 album *VIDA*
   for a 2017 recording). Year enrichment is therefore BOUNDED: it is
   OFF by default for bulk search rows and is fetched only for rows
   the caller flags as head-contention candidates, cached per album
   id for the life of the process. The cache stores ONLY year ints —
   never URLs, never artwork, never previews.
4. Rows with ``readable: false`` or an empty preview are returned as
   no-preview rows (``preview_url is None``), the MusicBrainz
   precedent: they can be eliminated on the Trust Card and can win
   only when nothing playable exists. (Artwork is still carried —
   Deezer cover URLs are unsigned CDN links; the no-preview contract
   downstream keys on ``preview_url``.)
5. The artist string is passed through verbatim as a match field
   only. Deezer attribution is noisy (its top Saiyaara row credits
   the lyricist); nothing in this module treats artist as trusted.

Stdlib only. The HTTP getter below mirrors server.py's `_http_get`
deadline discipline (FM-02: absolute monotonic deadline, per-read
socket timeout shrunk to the remaining budget) so this module is
testable standalone, without importing the server. The kernel owner
MAY inject the server's own `_http_get` / `vpps_sim_batch` via the
``http_get_fn`` / ``vpps_batch_fn`` parameters; both default to the
self-contained equivalents.

Scoring: like `itunes_hydrate`, each row's ``score``/``vpps_sim`` is
the VPPS similarity of (vpps_ref, title). When the caller injects the
server's `vpps_sim_batch`, rows carry no ``vpps_engine`` key — the
server's own provenance machinery resolves it, exactly as for iTunes
rows. Standalone (no injection), a local difflib skeleton stand-in
(identical algorithm to server.py's fallback) is used and rows are
stamped ``vpps_engine="local-fallback"`` — honest by construction.
"""

from __future__ import annotations

import difflib
import json
import os
import re
import threading
import time
import urllib.parse
import urllib.request
from typing import Any, Callable, Dict, List, Optional, Sequence, Set, Tuple

# Sized to sit inside the Stage C shared harvest deadline (5 s in
# _lock_pipeline; HYDRO_BUDGET 6.0): C3 measured Deezer warm at
# 0.92–1.10 s and cold at 1.44 s from this box, so 2.5 s covers the
# observed p95 with margin, mirroring ITUNES_TIMEOUT.
DEEZER_TIMEOUT = 2.5
ALBUM_TIMEOUT = 1.5

_UA = {"User-Agent": "IntentLock/0.1.0 (+hackathon demo; keyless)"}
_API = "https://api.deezer.com"


def deezer_enabled() -> bool:
    """Env kill-switch for the kernel owner's race wiring.

    ``INTENT_LOCK_DEEZER=0`` disables the Deezer leg; anything else
    (including unset) leaves it enabled once wired in."""
    return os.environ.get("INTENT_LOCK_DEEZER", "1") != "0"


# ----------------------------------------------------------------------
# HTTP (self-contained mirror of server.py's FM-02 deadline getter)
# ----------------------------------------------------------------------

def _http_get(url: str, timeout: float) -> bytes:
    """GET bounded by a TRUE deadline, not a per-socket-op timeout.

    Identical discipline to server.py's `_http_get`: body read in
    chunks against an absolute monotonic deadline; the socket's
    per-op timeout shrinks to the time remaining before every read,
    so a trickling upstream cannot stretch the call past `timeout`."""
    deadline = time.monotonic() + max(0.05, timeout)
    req = urllib.request.Request(url, headers=_UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        sock = None
        try:
            sock = r.fp.raw._sock  # type: ignore[attr-defined]
        except Exception:  # noqa: BLE001
            sock = None
        chunks: List[bytes] = []
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError(
                    f"GET {url.split('?')[0]} exceeded its "
                    f"{timeout:.2f}s deadline")
            if sock is not None:
                try:
                    sock.settimeout(remaining)
                except Exception:  # noqa: BLE001
                    pass
            chunk = r.read(65536)
            if not chunk:
                break
            chunks.append(chunk)
        return b"".join(chunks)


# ----------------------------------------------------------------------
# Local VPPS stand-in (only used when no batch scorer is injected)
# ----------------------------------------------------------------------

def _skel(s: str) -> str:
    """Vowel-stripped skeleton — identical to server.py's `_skel`."""
    return re.sub(r"[aeiou\s'\-]", "", (s or "").lower())


def _local_sim(a: str, b: str) -> float:
    sa, sb = _skel(a), _skel(b)
    if not sa or not sb:
        return 0.0
    return round(difflib.SequenceMatcher(None, sa, sb).ratio(), 4)


# ----------------------------------------------------------------------
# Album-year cache — process-life, keyed by Deezer album id.
# Stores ONLY Optional[int] years. No URLs, no previews, no artwork:
# nothing expiring or signed ever enters a cache in this module.
# ----------------------------------------------------------------------

_ALBUM_YEAR_CACHE: Dict[int, Optional[int]] = {}
_ALBUM_YEAR_LOCK = threading.Lock()


def deezer_album_year(album_id: Any, timeout: float = ALBUM_TIMEOUT,
                      http_get_fn: Optional[Callable] = None) -> Optional[int]:
    """The ALBUM's release year for a Deezer album id, or None.

    Cached per album id for the life of the process (failures cache
    as None too, so a down album endpoint is paid once, not per row).
    This is the album's year, NOT the track's — callers must keep the
    distinction (see module docstring, condition 3)."""
    try:
        aid = int(album_id)
    except (TypeError, ValueError):
        return None
    with _ALBUM_YEAR_LOCK:
        if aid in _ALBUM_YEAR_CACHE:
            return _ALBUM_YEAR_CACHE[aid]
    year: Optional[int] = None
    try:
        get = http_get_fn or _http_get
        raw = get(f"{_API}/album/{aid}", timeout)
        data = json.loads(raw.decode("utf-8", "replace"))
        date = str(data.get("release_date") or "")
        if date[:4].isdigit():
            year = int(date[:4])
    except Exception:  # noqa: BLE001 — best-effort enrichment
        year = None
    with _ALBUM_YEAR_LOCK:
        _ALBUM_YEAR_CACHE[aid] = year
    return year


def _full_title(row: Dict[str, Any]) -> str:
    """Deezer's display title. `title` normally already carries the
    version text ("Saiyaara - LoFi Mix", "Jab Saiyaan (Lofi)"); when
    `title_version` holds text the title lacks, append it so version
    classification downstream sees the same text iTunes exposes."""
    title = str(row.get("title") or "")
    version = str(row.get("title_version") or "").strip()
    if version and version.lower() not in title.lower():
        title = f"{title} {version}".strip()
    return title


def deezer_search(query: str, vpps_ref: str = "",
                  timeout: float = DEEZER_TIMEOUT, limit: int = 25,
                  vpps_batch_fn: Optional[Callable] = None,
                  enrich_years: bool = False,
                  head_candidate_ids: Optional[Set[Any]] = None,
                  http_get_fn: Optional[Callable] = None) -> tuple:
    """Deezer Search hydration (keyless, ₹0): real catalog rows with
    30 s previews + artwork + ISRC, in the iTunes candidate tensor
    shape. Returns ``(candidates, ms, ok)`` — the `itunes_hydrate`
    contract. Never raises; any failure returns ``([], ms, False)``.

    popularity01 is RANK-derived exactly like iTunes (0.95 − 0.15·index,
    floor 0.15) — honest, labeled, never presented as a real popularity
    signal; Deezer's own popularity integer is preserved verbatim as
    ``deezer_rank`` for telemetry.

    Year enrichment (BOUNDED, condition 3): bulk rows ship with
    ``year=None``. Years are fetched via the album endpoint ONLY when
    ``enrich_years`` is True, or for rows whose Deezer track id (or
    internal ``deezer-<id>``) appears in ``head_candidate_ids``.
    Prefer the two-phase pattern: race with enrichment off, then call
    :func:`enrich_deezer_years` on the head contenders only."""
    t0 = time.monotonic()
    ref = vpps_ref or query
    try:
        get = http_get_fn or _http_get
        q = urllib.parse.urlencode({"q": query, "limit": limit})
        raw = get(f"{_API}/search?{q}", timeout)
        data = json.loads(raw.decode("utf-8", "replace"))
        results = data.get("data") or []
        titles = [_full_title(r) for r in results]
        # VPPS sims: injected batch scorer when the kernel wires one
        # (the server's vpps_sim_batch), else the local stand-in.
        injected = vpps_batch_fn is not None
        if injected:
            sims = vpps_batch_fn([[ref, t] for t in titles])
            if sims is None or len(sims) != len(titles):
                sims = [_local_sim(ref, t) for t in titles]
                injected = False
        else:
            sims = [_local_sim(ref, t) for t in titles]
        cands: List[Dict[str, Any]] = []
        # Dedup mirrors iTunes: same (title, artist) keeps the
        # highest-ranked occurrence; distinct versions differ in
        # title text and survive.
        seen_ta: set = set()
        rank = 0
        for i, r in enumerate(results):
            if r.get("id") is None:
                continue  # never mint "deezer-None" ids
            title = titles[i]
            artist = str((r.get("artist") or {}).get("name") or "")
            ta = (title.strip().lower(), artist.strip().lower())
            if ta in seen_ta:
                continue
            seen_ta.add(ta)
            album = r.get("album") or {}
            preview = str(r.get("preview") or "")
            # Condition 5 (C3 §1.4.5a): unreadable or preview-less
            # rows become no-preview rows — preview_url None, the
            # MusicBrainz contract. The preview string itself is
            # dropped, never stored anywhere else.
            playable = bool(r.get("readable")) and bool(preview)
            sim = round(float(sims[i]), 4) if i < len(sims) else 0.0
            cand: Dict[str, Any] = {
                "id": f"deezer-{r.get('id')}",
                "title": title,
                "artist": artist,
                "collection": str(album.get("title") or ""),
                "kind": "studio",  # re-labeled from track text downstream
                "popularity01": round(max(0.15, 0.95 - 0.15 * rank), 4),
                "locale_tags": [], "upsell_risk": False,
                "providers": ["deezer"],
                "score": sim, "vpps_sim": sim,
                "trace": [{"said": ref, "heardAs": title,
                           "via": "deezer-search"}],
                # Year arrives ONLY via bounded album enrichment
                # (below, or enrich_deezer_years). It is the ALBUM's
                # year; "album_year" carries the same value under its
                # honest name once enriched.
                "year": None,
                "album_year": None,
                "year_source": None,
                "album_id": album.get("id"),
                "preview_url": preview if playable else None,
                "preview_missing": not playable,
                "artwork_url": (album.get("cover_medium")
                                or album.get("cover_big")
                                or album.get("cover") or None),
                "isrc": str(r.get("isrc") or "") or None,
                "deezer_rank": r.get("rank"),
                "duration": r.get("duration"),
                "source": "deezer", "mock": False, "degraded": False,
            }
            if not injected:
                cand["vpps_engine"] = "local-fallback"
            cands.append(cand)
            rank += 1
        # Bounded year enrichment (opt-in only; see docstring).
        want: Optional[Set[str]] = None
        if head_candidate_ids is not None:
            want = {str(x) for x in head_candidate_ids}
        if enrich_years or want:
            enrich_deezer_years(
                cands, only_ids=want, timeout=timeout,
                http_get_fn=http_get_fn)
        ms = round((time.monotonic() - t0) * 1000, 1)
        return cands, ms, True
    except Exception:  # noqa: BLE001 — fallback chain, never hard-fail
        return [], round((time.monotonic() - t0) * 1000, 1), False


def enrich_deezer_years(cands: List[Dict[str, Any]],
                        only_ids: Optional[Set[Any]] = None,
                        timeout: float = ALBUM_TIMEOUT,
                        http_get_fn: Optional[Callable] = None) -> int:
    """Fetch ALBUM years for Deezer rows in-place; returns the number
    of rows enriched. This is the head-contention second phase the
    kernel owner calls AFTER scoring narrows the pool: pass
    ``only_ids`` as the set of contending track ids (raw Deezer ids or
    internal ``deezer-<id>`` strings both accepted); ``None`` enriches
    every Deezer row in the list. One album-endpoint call per DISTINCT
    album (process-life cache), so a head of 8 rows spanning 3 albums
    costs at most 3 calls. Non-Deezer rows and rows already carrying a
    year are untouched. Sets ``year`` (pipeline compatibility),
    ``album_year`` (the honest name) and ``year_source="deezer_album"``
    together — the value is the album's release year, never relabeled
    as the track's."""
    want: Optional[Set[str]] = None
    if only_ids is not None:
        want = set()
        for x in only_ids:
            s = str(x)
            want.add(s)
            want.add(s[len("deezer-"):] if s.startswith("deezer-") else s)
    enriched = 0
    for c in cands:
        if c.get("source") != "deezer":
            continue
        if c.get("year") is not None:
            continue
        if want is not None:
            tid = str(c.get("id") or "")
            raw_id = tid[len("deezer-"):] if tid.startswith("deezer-") else tid
            if tid not in want and raw_id not in want:
                continue
        year = deezer_album_year(c.get("album_id"), timeout=timeout,
                                 http_get_fn=http_get_fn)
        if year is not None:
            c["year"] = year
            c["album_year"] = year
            c["year_source"] = "deezer_album"
            enriched += 1
    return enriched
