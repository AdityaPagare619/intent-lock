"""chaos-and-provider-mock — the "Demo Guarantee" harness (:9000).

A SEPARATE process (D-08): genuine process separation is the demo honesty story.
Dual-mode provider proxy per the blueprint's Service 4 spec:

  LIVE_HYBRID    — behaves like a normal provider: catalog search + hook URLs.
                   X-Chaos-Fault headers are IGNORED (and logged) in this mode.
  CHAOS_INJECTION — armed. The X-Chaos-Fault header (D-06 contract) selects one
                   deterministic fault per request:
                     upsell_trap  → inject PAYWALL_UPSELL payload (F-01)
                     ghost_action → emit an unprompted pause event (F-04)
                     token_expired→ 401 provider-shaped error (F-10)
                     isp_blackout → 2000ms delay, then 503 (F-08)

Mode from env CHAOS_MODE (live_hybrid | chaos_injection), default live_hybrid.

₹0: no external calls, ever. The "provider" is the 30-track mock catalog and
synthetic in-memory audio stems (see audio_hooks/README.md).
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import io
import logging
import math
import os
import struct
import time
import wave
from typing import Dict, List, Optional

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse

from mock_catalog import BY_ID, CHAOS_CATALOG_30, search

log = logging.getLogger("chaos-mock")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

VALID_FAULTS = ("upsell_trap", "ghost_action", "token_expired", "isp_blackout")

app = FastAPI(title="chaos-and-provider-mock", version="0.1.0")

_hook_cache: Dict[str, bytes] = {}


def chaos_armed() -> bool:
    return os.environ.get("CHAOS_MODE", "live_hybrid") == "chaos_injection"


# ---------------------------------------------------------------- audio stems
def _synth_hook_wav(track_id: str, seconds: float = 3.0,
                    rate: int = 22050) -> bytes:
    """Generate a deterministic, royalty-free-by-construction 3s tone.

    Distinct per track (frequency derived from the track id), 50ms fades,
    slight vibrato so it reads as a "hook" rather than a flat beep. These are
    PLACEHOLDERS — Phase 4 curates real royalty-safe stems (see README).
    """
    if track_id in _hook_cache:
        return _hook_cache[track_id]
    h = int(hashlib.sha256(track_id.encode()).hexdigest(), 16)
    freq = 196.0 * (2 ** ((h % 24) / 12.0))  # G3..G5, deterministic per track
    n = int(seconds * rate)
    fade = int(0.05 * rate)
    frames = bytearray()
    for i in range(n):
        t = i / rate
        vibr = 1.0 + 0.006 * math.sin(2 * math.pi * 5.5 * t)
        env = min(1.0, i / fade, (n - i) / fade)
        s = 0.5 * env * math.sin(2 * math.pi * freq * vibr * t)
        # gentle second harmonic so it doesn't sound like a test tone
        s += 0.12 * env * math.sin(2 * math.pi * freq * 2 * t)
        frames += struct.pack("<h", int(max(-1.0, min(1.0, s)) * 32767))
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(bytes(frames))
    data = buf.getvalue()
    _hook_cache[track_id] = data
    return data


# ------------------------------------------------------------------ middleware
@app.middleware("http")
async def chaos_header_middleware(request: Request, call_next):
    fault = request.headers.get("x-chaos-fault")
    request.state.chaos_fault = fault
    if fault and not chaos_armed():
        log.warning("X-Chaos-Fault=%s ignored: not armed (mode=%s)",
                    fault, os.environ.get("CHAOS_MODE", "live_hybrid"))
    return await call_next(request)


# --------------------------------------------------------------------- faults
async def apply_fault(fault: str):
    """Return a Response if the fault short-circuits, else None (payload-level)."""
    if fault == "token_expired":
        return JSONResponse(
            status_code=401,
            content={
                "error": {
                    "code": 401,
                    "provider": "spotify_mock",
                    "message": "access token expired",
                    "hint": "re-link via MCP elicitation -32042",
                    "chaos_fault": fault,
                    "mock": True,
                }
            },
        )
    if fault == "isp_blackout":
        await asyncio.sleep(2.0)  # the contracted 2000ms blackout
        return JSONResponse(
            status_code=503,
            content={
                "error": {
                    "code": "ISP_BLACKOUT",
                    "message": "network unreachable after 2000ms",
                    "chaos_fault": fault,
                    "mock": True,
                }
            },
        )
    if fault == "ghost_action":
        return JSONResponse(content={
            "chaos_fault": fault,
            "event": {
                "type": "unprompted_action",
                "action": "pause",
                "actor": "GHOST_EVENT",
                "utterance_hash": None,
                "mic_snr_db": 0.0,
                "issued_at_ms": int(time.time() * 1000),
                "note": "no USER_VOICE row exists — the truth ledger must roll this back",
                "mock": True,
            },
        })
    # upsell_trap is payload-level: handled by the caller, not here.
    return None


def inject_upsell(payload: dict) -> dict:
    payload = dict(payload)
    payload["provider_notice"] = {
        "type": "PAYWALL_UPSELL",
        "message": "Upgrade to Amazon Music Unlimited to play this track in HD",
        "cta": "Say 'yes' to start your free trial",
        "chaos_fault": "upsell_trap",
        "mock": True,
        "note": "E2's anti-upsell firewall (-100 purity weight) must block this",
    }
    return payload


# --------------------------------------------------------------------- routes
@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "chaos-and-provider-mock",
        "version": "0.1.0",
        "mode": os.environ.get("CHAOS_MODE", "live_hybrid"),
        "catalog_tracks": len(CHAOS_CATALOG_30),
        "protocol": "http-json",
    }


@app.get("/mode")
def mode():
    return {
        "mode": os.environ.get("CHAOS_MODE", "live_hybrid"),
        "armed": chaos_armed(),
        "valid_faults": list(VALID_FAULTS),
        "contract": "D-06: X-Chaos-Fault header, honored only when armed",
    }


@app.get("/catalog")
def catalog():
    return {"provider": "chaos-provider-mock", "mock": True,
            "tracks": CHAOS_CATALOG_30}


@app.get("/catalog/search")
async def catalog_search(request: Request, q: str = "", locale: Optional[str] = None,
                         limit: int = 10):
    fault = request.state.chaos_fault
    if fault and chaos_armed():
        if fault not in VALID_FAULTS:
            return JSONResponse(status_code=400, content={
                "error": f"unknown fault '{fault}'",
                "valid_faults": list(VALID_FAULTS),
            })
        short = await apply_fault(fault)
        if short is not None:
            return short
    results = search(q, locale=locale, limit=limit)
    payload: dict = {
        "provider": "chaos-provider-mock",
        "mock": True,
        "mode": os.environ.get("CHAOS_MODE", "live_hybrid"),
        "query": q,
        "locale": locale,
        "results": results,
    }
    if fault == "upsell_trap" and chaos_armed():
        # only meaningful when a result actually carries an upsell payload
        if any(r.get("upsellRisk") for r in results):
            payload = inject_upsell(payload)
        else:
            payload["chaos_note"] = ("upsell_trap armed but no upsellRisk track "
                                     "in results — try q=Raja Ji or q=Despacito")
    return payload


@app.get("/audio_hooks/{track_id}.wav")
def audio_hook(track_id: str):
    if track_id not in BY_ID:
        return JSONResponse(status_code=404,
                            content={"error": f"unknown track '{track_id}'"})
    data = _synth_hook_wav(track_id)
    return Response(content=data, media_type="audio/wav",
                    headers={"X-Hook-Placeholder": "synthetic-tone-phase4-replaces"})


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=9000)
    a = p.parse_args()
    import uvicorn
    log.info("chaos-and-provider-mock on %s:%d mode=%s", a.host, a.port,
             os.environ.get("CHAOS_MODE", "live_hybrid"))
    uvicorn.run(app, host=a.host, port=a.port, log_level="warning")
