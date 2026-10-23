"""E1 — PolyglotPhoneticJudo: the Node sidecar client.

The real phonetic pipeline lives in TypeScript (packages/polyglot-phonetic-judo,
25 unit tests = the contract). This module spawns the Node sidecar ONCE at
server startup and speaks the D-07 JSON-lines protocol over stdio:

    stdin:  {"mangled": str, "localeHint": str, "topN": int}
    stdout: {"candidates": [{id, title, artist, version, ..., score, trace}]}
            {"error": str}   (per-line failure; sidecar never dies on bad input)

If node or the sidecar is missing/unresponsive, we fall back to the embedded
stub scorer and log a LOUD warning — never silently. Degraded results carry
"degraded": true so the UI can label them honestly.
"""
from __future__ import annotations

import json
import logging
import os
import re
import selectors
import shutil
import subprocess
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

log = logging.getLogger("intent-lock.e1")

SERVICE_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SIDECAR = (SERVICE_ROOT.parent.parent
                   / "packages" / "polyglot-phonetic-judo" / "sidecar.js")

# version -> purity kind. lofi/unplugged are documented judgment calls:
# a lo-fi flip is a reinterpretation (like a remix); an unplugged set is a
# live acoustic performance (like live). Reversible with measured data.
VERSION_TO_KIND = {
    "studio": "studio",
    "live": "live",
    "karaoke": "karaoke",
    "remix": "remix",
    "lofi": "remix",
    "unplugged": "live",
}

_VOWELS = re.compile(r"[aeiouAEIOU\s'\-]+")


def _title_skeleton(title: str) -> str:
    return _VOWELS.sub("", title or "").upper()


class PhoneticJudo:
    """Long-lived Node sidecar client. Thread-safe via an internal lock."""

    def __init__(self, sidecar_path: Optional[str] = None) -> None:
        self.sidecar = Path(sidecar_path or os.environ.get("SIDECAR_PATH", DEFAULT_SIDECAR))
        self._proc: Optional[subprocess.Popen] = None
        self._lock = threading.Lock()
        self.degraded = False
        self._spawn()

    # -- lifecycle ------------------------------------------------------
    def _spawn(self) -> bool:
        node = shutil.which("node")
        if not node:
            return self._degrade("node binary not found on PATH")
        if not self.sidecar.exists():
            return self._degrade(f"sidecar not found: {self.sidecar}")
        try:
            self._proc = subprocess.Popen(
                [node, str(self.sidecar)],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True, bufsize=1,
            )
            # The sidecar announces readiness on stderr (drained to DEVNULL);
            # verify aliveness with a cheap probe instead of sleeping.
            probe = self._roundtrip({"mangled": "probe", "localeHint": "", "topN": 1})
            if probe is None:
                return self._degrade("sidecar probe got no response")
            log.info("E1 sidecar up: %s (node %s)", self.sidecar, node)
            self.degraded = False
            return True
        except Exception as exc:  # noqa: BLE001 — startup must never kill the server
            return self._degrade(f"sidecar spawn failed: {exc}")

    def _degrade(self, reason: str) -> bool:
        self.degraded = True
        self._proc = None
        log.error("╔══════════════════════════════════════════════════════════╗")
        log.error("║  E1 PHONETIC SIDECAR DEGRADED — stub scorer active        ║")
        log.error(f"║  reason: {reason[:52]:<52}║")
        log.error("║  Results are approximate and labeled degraded=true.      ║")
        log.error("╚══════════════════════════════════════════════════════════╝")
        return False

    def _ensure_alive(self) -> bool:
        if self._proc is not None and self._proc.poll() is None:
            return True
        log.warning("E1 sidecar died; respawning once…")
        self._proc = None
        return self._spawn()

    def shutdown(self) -> None:
        if self._proc is not None and self._proc.poll() is None:
            try:
                self._proc.stdin.write(json.dumps({"shutdown": True}) + "\n")
                self._proc.stdin.flush()
                self._proc.wait(timeout=3)
            except Exception:  # noqa: BLE001
                self._proc.kill()
        self._proc = None

    # -- protocol --------------------------------------------------------
    def _roundtrip(self, payload: Dict[str, Any], timeout: float = 8.0) -> Optional[Dict[str, Any]]:
        """One JSON line in, one JSON line out. Returns None on any failure.

        P1-3 (red-team): the timeout is REAL — selectors wait on the child's
        stdout with a deadline instead of a blocking readline(). A hung
        sidecar can no longer pin a threadpool thread forever.
        """
        if self._proc is None or self._proc.poll() is not None:
            return None
        try:
            with self._lock:
                assert self._proc.stdin is not None and self._proc.stdout is not None
                self._proc.stdin.write(json.dumps(payload) + "\n")
                self._proc.stdin.flush()
                sel = selectors.DefaultSelector()
                sel.register(self._proc.stdout, selectors.EVENT_READ)
                try:
                    ready = sel.select(timeout=timeout)
                finally:
                    sel.close()
                if not ready:
                    log.warning("E1 sidecar roundtrip timed out after %.1fs", timeout)
                    return None
                line = self._proc.stdout.readline()
            if not line:
                return None
            return json.loads(line)
        except Exception as exc:  # noqa: BLE001
            log.warning("E1 sidecar roundtrip failed: %s", exc)
            return None

    # -- public API -------------------------------------------------------
    def sim_batch(self, pairs: List[List[str]]) -> Optional[List[float]]:
        """Batch VPPS similarity via the sidecar (one round-trip).

        pairs: [[query, title], ...] → [0..1, ...] or None if the sidecar
        is degraded. Additive to the D-07 contract; resolve() untouched.
        """
        if not pairs:
            return []
        if self._ensure_alive():
            resp = self._roundtrip({"op": "sim", "pairs": pairs}, timeout=8.0)
            if resp and not resp.get("error") and isinstance(resp.get("sims"), list):
                try:
                    return [max(0.0, min(1.0, float(s))) for s in resp["sims"]]
                except (TypeError, ValueError):
                    return None
            log.warning("E1 sidecar sim op failed; caller falls back to local")
        return None

    def resolve(self, mangled: str, locale_hint: str = "", top_n: int = 5) -> List[Dict[str, Any]]:
        """Resolve a mangled utterance to normalized candidates.

        Normalized candidate: {id, title, artist, kind, popularity01, locale_tags,
        upsell_risk, providers, score, trace, degraded, phonetic_similarity,
        purity_score_v2}.
        """
        if self._ensure_alive():
            resp = self._roundtrip({"mangled": mangled, "localeHint": locale_hint, "topN": top_n})
            if resp and not resp.get("error") and resp.get("candidates"):
                return [self._normalize(c, degraded=False) for c in resp["candidates"]]
            log.warning("E1 sidecar returned error/empty; using stub for this query")
        return self._stub_resolve(mangled, locale_hint, top_n)

    # -- normalization ------------------------------------------------------
    @staticmethod
    def _normalize(c: Dict[str, Any], degraded: bool) -> Dict[str, Any]:
        pop = c.get("popularity", 50)
        try:
            pop01 = max(0.0, min(1.0, float(pop) / 100.0))
        except (TypeError, ValueError):
            pop01 = 0.5
        return {
            "id": str(c.get("id", f"unknown-{abs(hash(c.get('title','')))%10_000}")),
            "title": str(c.get("title", "")),
            "artist": str(c.get("artist", "")),
            "kind": VERSION_TO_KIND.get(str(c.get("version", "studio")).lower(), "studio"),
            "popularity01": round(pop01, 4),
            "locale_tags": list(c.get("localeTags") or []),
            "upsell_risk": bool(c.get("upsellRisk", False)),
            "providers": list(c.get("providers") or []),
            "score": float(c.get("score") or 0.0),
            "trace": c.get("trace") or [],
            "mock": bool(c.get("mock", False)),
            "degraded": degraded,
            # v2 additive (E2 lane): raw VPPS phonetic similarity + full purity.
            "phonetic_similarity": c.get("phoneticSimilarity"),
            "purity_score_v2": c.get("purityScore"),
        }

    # -- stub fallback (degraded mode only; LOUD by construction) ------------
    _STUB_TRACKS = [
        {"id": "stub-lollipop", "title": "Lollipop Lagelu", "artist": "Pawan Singh",
         "kind": "studio", "popularity01": 0.97, "locale_tags": ["IN-BR"],
         "upsell_risk": False, "providers": ["youtube"]},
        {"id": "stub-raja-ji", "title": "Raja Ji", "artist": "Pawan Singh",
         "kind": "studio", "popularity01": 0.95, "locale_tags": ["IN-BR"],
         "upsell_risk": False, "providers": ["youtube"]},
        {"id": "stub-mujhe", "title": "Mujhe Tum Yaad Aate Ho",
         "artist": "Alka Yagnik & Babul Supriyo", "kind": "studio",
         "popularity01": 0.90, "locale_tags": ["IN-UP"],
         "upsell_risk": False, "providers": ["youtube"]},
    ]

    def _stub_resolve(self, mangled: str, locale_hint: str, top_n: int) -> List[Dict[str, Any]]:
        def skel(t: str) -> str:
            return _VOWELS.sub("", t or "").upper()

        qs = skel(mangled)
        out = []
        for t in self._STUB_TRACKS:
            ts = skel(t["title"])
            m, n = len(qs), len(ts)
            if not m or not n:
                continue
            dp = [[0] * (n + 1) for _ in range(m + 1)]
            for i in range(m):
                for j in range(n):
                    dp[i + 1][j + 1] = dp[i][j] + 1 if qs[i] == ts[j] else max(dp[i + 1][j], dp[i][j + 1])
            ratio = dp[m][n] / max(m, n)
            if ratio > 0.45:
                out.append({**t, "score": round(ratio, 4), "trace": [],
                            "mock": True, "degraded": True})
        out.sort(key=lambda c: c["score"], reverse=True)
        return out[:top_n]
