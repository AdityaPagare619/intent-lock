#!/usr/bin/env python3
"""Gemini extraction helper for the orchestrator's host brain (Wave 2, S2).

Spawned per play turn by the Node orchestrator. Reads ONE JSON object on
stdin — {"utterance": str, "model": str (optional), "domain": str
(optional, Lane F)} — and prints the Doc-12 extraction JSON on stdout.
Diagnostics go to stderr; the exit code is 0 only when a parseable
extraction was produced.

Credential routes (first match wins):
  1. `GEMINI_API_KEY` in the environment — the helper calls the Gemini
     API directly with that key (sent as a request header, never in a
     URL). This is the path for any machine outside the dev vault.
  2. Otherwise, the vaulted `custom.gemini` connector, reached through
     the dynamic-credentials surrogate flow — the same path the
     connector's own CLIs and the MCP server use (the dev machine).
With neither available the helper exits non-zero and the orchestrator's
deterministic floor serves the turn. Either way the key is never
printed, logged, or written to any file.

Model ladder (ordered by MEASURED evidence, 2026-10-21 evening probe
through this helper's own call path): gemini-3-flash-preview (best
extraction quality; seen in 429 windows), gemini-3.1-flash-lite (OK,
~16 s in a slow window), gemini-3.5-flash-lite (OK, ~16 s),
gemini-2.5-flash (OK, ~2 s). The Node side may name a different primary
via GEMINI_MODEL; the ladder then starts from that model.
gemini-2.5-flash-lite is a DIFFERENT id — retired on this account
(404, verified in GEMINI_PROBE.md) — and appears nowhere.

Timing: generateContent is unary — no bytes arrive until the full
extraction is ready — so the old 2.8 s per-model read timeout sat far
below real provider latency on a slow night and the ladder starved.
Each attempt now gets GEMINI_EXTRACT_TIMEOUT_S (default 20 s), a model
is retried ONCE on a retryable failure (408/429/5xx/timeout) after a
short backoff, and the whole ladder is bounded by
GEMINI_EXTRACT_BUDGET_S (default 55 s), inside the orchestrator's
extraction deadline. On success the helper reports the serving model
on stderr ("served model=… route=env|vault") so the BrainStatus health
string can name the model that actually served.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

for _p in ("/opt/muse/skills/custom-connector-setup/bin",
           "/opt/muse/skills/custom-connector-setup/templates/skill/bin"):
    if _p not in sys.path:
        sys.path.insert(0, _p)

try:
    from dynamic_credentials import (  # type: ignore
        read_json_response, url_with_surrogate_query_param)
    _CREDS_OK = True
except Exception as exc:  # noqa: BLE001 — capability detection
    print(f"gemini_extract: dynamic credentials unavailable ({exc})",
          file=sys.stderr)
    _CREDS_OK = False

_HOST = "generativelanguage.googleapis.com"
_PRIMARY = "gemini-3-flash-preview"
_LADDER = [
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-2.5-flash",
]
_TIMEOUT_S = float(os.environ.get("GEMINI_EXTRACT_TIMEOUT_S") or 20)
_BUDGET_S = float(os.environ.get("GEMINI_EXTRACT_BUDGET_S") or 55)
_MAX_ATTEMPTS = 2          # one bounded retry per model, retryable only
_BACKOFF_S = 2.0
_RETRYABLE_HTTP = {408, 429, 500, 502, 503, 504}


def _retryable(exc: Exception) -> bool:
    if isinstance(exc, urllib.error.HTTPError):
        return exc.code in _RETRYABLE_HTTP
    return isinstance(exc, (TimeoutError, urllib.error.URLError, OSError))

# The Doc-12 extraction prompt. The canonical Node-side copy lives in
# src/brain/providers.ts (EXTRACTION_SYSTEM); keep the two in step.
SYSTEM = (
    "You are the language-understanding layer of a music voice assistant "
    "(the host brain). You do NOT choose the song and you never invent "
    "catalog data. You parse the user's raw utterance — often messy, "
    "mixed Hindi-English (Hinglish), with speech-recognition errors — "
    "into a small JSON structure. A deterministic server verifies "
    "everything against real catalogs; your output is advisory only.\n"
    "Return ONLY this JSON object:\n"
    "{\n"
    '  "extracted_title_hint": "<best guess at the song title, clean, '
    'or empty string>",\n'
    '  "include_tags": ["<version/style words the user WANTS: original, '
    'film, studio, slow, lofi, acoustic, unplugged, live, remix, '
    'remaster>"],\n'
    '  "exclude_tags": ["<versions the user BANS — including bans via '
    "Hindi negation 'nahi', 'nahin', 'mat' (e.g. 'remix nahi' bans "
    'remix)>"],\n'
    '  "rule": null OR {"after_time": "HH:MM", "version": "<version '
    'words>", "artist": "<optional artist>"},\n'
    '  "candidate_hints": ["<up to 4 plausible real song titles — ONLY '
    "when the request is descriptive or memory-style with no clear "
    "title ('that song where...'), otherwise empty>\"]\n"
    "}\n"
    "Rules: include_tags and exclude_tags hold at most 8 short lowercase "
    "words each. 'rule' is non-null ONLY when the user states a standing "
    "rule with a time ('after 10 PM, Saiyaara means the lofi version') — "
    "convert the time to 24-hour HH:MM. If the user clearly names a "
    "title, candidate_hints is empty. No commentary, no code fences."
)

# Domain notes (Lane F): appended to SYSTEM for non-music turns so the
# SAME extraction produces the entity hint + include/exclude tags for a
# product or grocery item. The canonical Node-side copy lives in
# src/brain/providers.ts (EXTRACTION_DOMAIN_NOTES); keep the two in step.
DOMAIN_NOTES = {
    "commerce": (
        "Domain note: this turn is a COMMERCE (product) request, not "
        "music. Read 'extracted_title_hint' as the product or item name "
        "the user wants (e.g. 'Thunderbolt 40Gbps cable 2m'). "
        "include_tags hold attribute or spec words the user WANTS (e.g. "
        "thunderbolt, 40gbps, 2m, usb-c); exclude_tags hold attributes "
        "the user BANS — a ban can be phrased 'not', 'no', 'without', "
        "or 'sin' before the attribute (e.g. 'not the USB 2.0 knockoff' "
        "bans usb 2.0). candidate_hints stays empty unless the request "
        "is descriptive with no clear item name. The 'rule' shape is "
        "unchanged."
    ),
    "grocery": (
        "Domain note: this turn is a GROCERY (food) request, not music. "
        "Read 'extracted_title_hint' as the grocery item name the user "
        "wants (e.g. 'oat milk'). include_tags hold attribute words the "
        "user WANTS (e.g. oat, unsweetened); exclude_tags hold "
        "ingredients or items the user BANS — a ban can be phrased "
        "'not', 'no', 'without', or 'sin' before the word (e.g. 'no "
        "almond' bans almond). candidate_hints stays empty unless the "
        "request is descriptive with no clear item name. The 'rule' "
        "shape is unchanged."
    ),
}


def _request_body(utterance: str, system: str) -> dict:
    return {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"parts": [{"text": utterance}]}],
        "generationConfig": {
            "temperature": 0,
            "maxOutputTokens": 512,
            "responseMimeType": "application/json",
        },
    }


def _call_model(model: str, utterance: str, timeout: float,
                system: str = SYSTEM):
    url = (f"https://{_HOST}/v1beta/models/{model}:generateContent")
    url = url_with_surrogate_query_param(url, "custom.gemini",
                                         allowed_hosts=[_HOST])
    req = urllib.request.Request(
        url, data=json.dumps(_request_body(utterance, system)).encode("utf-8"),
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return read_json_response(resp)


def _call_model_direct(model: str, utterance: str, timeout: float,
                       system: str, api_key: str):
    """GEMINI_API_KEY route: direct Gemini API call. The key travels as
    the x-goog-api-key header only — never in the URL, never logged."""
    url = (f"https://{_HOST}/v1beta/models/{model}:generateContent")
    req = urllib.request.Request(
        url, data=json.dumps(_request_body(utterance, system)).encode("utf-8"),
        headers={"Content-Type": "application/json",
                 "x-goog-api-key": api_key}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        if _CREDS_OK:
            return read_json_response(resp)
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    api_key = (os.environ.get("GEMINI_API_KEY") or "").strip()
    if not api_key and not _CREDS_OK:
        # No env key and no vault route: report no-key (exit 1); the
        # orchestrator's deterministic floor serves the turn.
        print("gemini_extract: no GEMINI_API_KEY in environment and "
              "vault credential route unavailable", file=sys.stderr)
        return 1
    try:
        raw = sys.stdin.read()
        req = json.loads(raw) if raw.strip().startswith("{") else {}
        utterance = str(req.get("utterance") or raw).strip()
        model = str(req.get("model") or _PRIMARY).strip() or _PRIMARY
        domain = str(req.get("domain") or "music").strip().lower()
    except Exception as exc:  # noqa: BLE001
        print(f"gemini_extract: bad stdin ({exc})", file=sys.stderr)
        return 1
    if not utterance:
        print("gemini_extract: empty utterance", file=sys.stderr)
        return 1

    system = SYSTEM
    if domain in DOMAIN_NOTES:
        system = SYSTEM + "\n" + DOMAIN_NOTES[domain]

    # Ladder: the requested model first (GEMINI_MODEL via the Node
    # side, else the primary), then the measured ladder, de-duplicated.
    ladder = list(dict.fromkeys([model] + _LADDER))
    route = "env" if api_key else "vault"
    started = time.monotonic()
    for m in ladder:
        for attempt in range(1, _MAX_ATTEMPTS + 1):
            remaining = _BUDGET_S - (time.monotonic() - started)
            if remaining < 3:
                print("gemini_extract: extraction budget exhausted",
                      file=sys.stderr)
                return 1
            timeout = max(3.0, min(_TIMEOUT_S, remaining))
            try:
                if api_key:
                    data = _call_model_direct(m, utterance, timeout=timeout,
                                              system=system, api_key=api_key)
                else:
                    data = _call_model(m, utterance, timeout=timeout,
                                       system=system)
                parts = (((data or {}).get("candidates") or [{}])[0]
                         .get("content") or {}).get("parts") or []
                text = "".join(str(p.get("text") or "") for p in parts)
                parsed = json.loads(text)  # must be the extraction JSON
                if not isinstance(parsed, dict):
                    raise ValueError("extraction is not a JSON object")
                print(f"gemini_extract: served model={m} route={route}",
                      file=sys.stderr)
                print(json.dumps(parsed))
                return 0
            except Exception as exc:  # noqa: BLE001 — ladder moves on
                # Error class + message only: never the URL, never a
                # body, and scrubbed defensively so a key can never
                # leak via an error string.
                _msg = str(exc)[:160]
                if api_key:
                    _msg = _msg.replace(api_key, "[redacted]")
                print(f"gemini_extract: {m} attempt {attempt} failed "
                      f"({type(exc).__name__}: {_msg})", file=sys.stderr)
                if attempt < _MAX_ATTEMPTS and _retryable(exc):
                    time.sleep(_BACKOFF_S)
                    continue
                break
    return 1


if __name__ == "__main__":
    sys.exit(main())
