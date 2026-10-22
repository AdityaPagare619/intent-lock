"""E1 Layer B2 (doc 11): the LLM phonetic reconstructor.

Fires ONLY where the deterministic pipeline abstains (no candidates, or
the vault's best guess fell under the never-guess floor). It is the GER
stage from the literature (doc 10 §5.1), built to the published safe
shape (§5.6): the model may propose NEW SEARCH QUERIES (reconstructed
transliterations of what the user plausibly said) and may RANK the
already-retrieved dead candidates — it can never name a track that was
not retrieved, never bypass the confidence floor, and never touch the
purity guard. Whatever its queries hydrate still faces B1 re-scoring,
the floor's replacement threshold, and the untouched guard.

CONFIG (all env; default OFF):
  RECONSTRUCTOR        off | groq | gemini
  RECONSTRUCTOR_API_KEY  (falls back to GROQ_API_KEY / GEMINI_API_KEY)
  RECONSTRUCTOR_MODEL    default openai/gpt-oss-20b / gemini-2.5-flash-lite
  RECONSTRUCTOR_BASE_URL Groq-compatible endpoint override (self-host /
                         test stubs); never set in the demo by default.

Validation is total: unparseable output, >3 queries, over-long queries,
queries identical to what already failed, or picks naming IDs outside
the retrieved set ⇒ the whole output is discarded as an abstention.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import urllib.request
from typing import Any, Dict, List, Optional

log = logging.getLogger("omnibeat.reconstructor")

_TIMEOUT_S = 6.0
_MAX_QUERIES = 3
_MAX_QUERY_LEN = 80

_SYSTEM = (
    "You are a phonetician reconstructing what a music listener actually "
    "said before an English ASR mangled it. You receive the raw ASR text, "
    "the frame-peeled payload, a locale hint, and titles the deterministic "
    "engine already rejected. Propose up to 3 NEW search queries — the "
    "most plausible correct spellings/transliterations of the song or "
    "artist (try the original-language romanization, the common English "
    "spelling, and a split/merged variant). You may also rank the listed "
    "rejected candidates by id if one is very likely the true target. "
    "If you have no good reconstruction, abstain. Output ONLY JSON: "
    '{"queries": [string], "picks": [candidate-id], "abstain": boolean}'
)


def configured() -> Optional[str]:
    mode = (os.environ.get("RECONSTRUCTOR") or "off").strip().lower()
    return mode if mode in ("groq", "gemini") else None


def _api_key(mode: str) -> str:
    return (
        os.environ.get("RECONSTRUCTOR_API_KEY")
        or os.environ.get("GROQ_API_KEY" if mode == "groq" else "GEMINI_API_KEY")
        or ""
    )


def _call_groq(prompt: str, model: str, key: str) -> Optional[str]:
    base = (os.environ.get("RECONSTRUCTOR_BASE_URL")
            or "https://api.groq.com/openai/v1").rstrip("/")
    body = json.dumps({
        "model": model,
        "temperature": 0,
        "messages": [
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": prompt},
        ],
        "response_format": {"type": "json_object"},
    }).encode()
    req = urllib.request.Request(
        f"{base}/chat/completions", data=body, method="POST",
        headers={"Content-Type": "application/json",
                 "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as resp:
        data = json.loads(resp.read().decode("utf-8", "replace"))
    return data["choices"][0]["message"]["content"]


def _call_gemini(prompt: str, model: str, key: str) -> Optional[str]:
    body = json.dumps({
        "systemInstruction": {"parts": [{"text": _SYSTEM}]},
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0,
                             "responseMimeType": "application/json"},
    }).encode()
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent",
        data=body, method="POST",
        headers={"Content-Type": "application/json", "x-goog-api-key": key})
    with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as resp:
        data = json.loads(resp.read().decode("utf-8", "replace"))
    return data["candidates"][0]["content"]["parts"][0]["text"]


def _validate(text: Optional[str], peeled: str,
              dead_ids: set) -> Dict[str, Any]:
    abstain: Dict[str, Any] = {"queries": [], "picks": [], "abstain": True}
    if not text:
        return abstain
    try:
        start, end = text.index("{"), text.rindex("}")
        obj = json.loads(text[start:end + 1])
    except Exception:  # noqa: BLE001
        return abstain
    if obj.get("abstain") is True:
        return abstain
    queries: List[str] = []
    for q in obj.get("queries") or []:
        if (isinstance(q, str) and 2 <= len(q.strip()) <= _MAX_QUERY_LEN
                and q.strip().lower() != peeled.lower()
                and q.strip() not in queries):
            queries.append(q.strip())
        if len(queries) >= _MAX_QUERIES:
            break
    picks: List[str] = []
    for p in obj.get("picks") or []:
        if isinstance(p, str) and p in dead_ids and p not in picks:
            picks.append(p)
    if not queries and not picks:
        return abstain
    return {"queries": queries, "picks": picks, "abstain": False}


async def reconstruct(raw: str, peeled: str, locale_hint: str,
                      mood_hint: str,
                      dead_candidates: List[Dict[str, Any]]) -> Dict[str, Any]:
    """One bounded reconstruction attempt. Never raises; abstains on any
    doubt, misconfiguration, or provider failure."""
    mode = configured()
    key = _api_key(mode) if mode else ""
    if not mode or not key:
        return {"queries": [], "picks": [], "abstain": True}
    model = os.environ.get(
        "RECONSTRUCTOR_MODEL",
        "openai/gpt-oss-20b" if mode == "groq" else "gemini-2.5-flash-lite")
    dead_lines = "\n".join(
        f"- id={c.get('id')} :: '{c.get('title')}' by {c.get('artist')}"
        for c in dead_candidates[:10])
    prompt = (
        f"raw ASR: {raw}\npeeled payload: {peeled}\n"
        f"locale: {locale_hint or 'unknown'}\n"
        f"mood hint: {mood_hint or 'none'}\n"
        f"rejected candidates:\n{dead_lines or '(none)'}\n"
        "Return the JSON object now.")
    try:
        fn = _call_groq if mode == "groq" else _call_gemini
        text = await asyncio.to_thread(fn, prompt, model, key)
    except Exception as exc:  # noqa: BLE001 — abstain, never crash a turn
        log.info("reconstructor provider failed (%s) — abstaining", exc)
        return {"queries": [], "picks": [], "abstain": True}
    out = _validate(text, peeled, {str(c.get("id")) for c in dead_candidates})
    log.info("reconstructor[%s/%s]: queries=%s picks=%s abstain=%s",
             mode, model, out["queries"], out["picks"], out["abstain"])
    return out
