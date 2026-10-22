"""E1 Layer B1 (doc 11): universal phonetics — IPA transcription + PanPhon
articulatory-feature distance.

WHY: the VPPS skeleton + hand-set articulatory costs in the sidecar are
effective but hand-rolled. PanPhon (Mortensen et al., COLING 2016) maps
5,000+ IPA segments to 21 articulatory feature vectors and computes a
weighted feature edit distance — the published, principled version of the
same idea. This module gives the server a second, independent phonetic
opinion, used where the first one abstains (the rescue path in server.py).

TRANSCRIPTION SOURCES (capability-detected, honestly labeled):
  1. espeak-ng subprocess — IF the binary ever exists on the host
     (it does not on the demo box; apt has no package for it here).
  2. Epitran 'hin-Deva' — for text containing Devanagari (works; the
     'eng-Latn' table is broken upstream — KeyError on construction —
     so Latin text does NOT go through Epitran).
  3. Skeleton-IPA mapping — the always-available Latin path: the VPPS
     skeleton alphabet (already an articulatory merger: sh/ch→c,
     v/w→b, ph→f…) is mapped 1:1 onto IPA segments and PanPhon scores
     the result. This is PanPhon's math over our normalized alphabet —
     labeled as such wherever it is reported, never dressed up as
     espeak-grade G2P.

Everything here is local, deterministic, and $0. If panphon is missing,
`available()` is False and callers must behave exactly as before.
"""

from __future__ import annotations

import logging
import re
import subprocess
from typing import Optional

log = logging.getLogger("omnibeat.phonetic_ipa")

try:
    import panphon.distance as _panphon_distance

    _DST = _panphon_distance.Distance()
    PANPHON_OK = True
except Exception as exc:  # noqa: BLE001 — capability detection, not failure
    log.warning("panphon unavailable (%s) — B1 phonetics disabled", exc)
    _DST = None
    PANPHON_OK = False

_ESPEAK = None
for _cand in ("espeak-ng", "espeak"):
    try:
        subprocess.run([_cand, "--version"], capture_output=True, timeout=3)
        _ESPEAK = _cand
        break
    except Exception:  # noqa: BLE001
        continue

_EPITRAN_HIN = None
try:
    import epitran as _epitran_mod

    _EPITRAN_HIN = _epitran_mod.Epitran("hin-Deva")
except Exception as exc:  # noqa: BLE001
    log.info("epitran hin-Deva unavailable (%s)", exc)

_DEVANAGARI = re.compile(r"[ऀ-ॿ]")

# VPPS skeleton alphabet → IPA segments. The skeleton is already an
# articulatory normalization, so this mapping is intentionally small and
# symmetric (applied to BOTH sides of every comparison).
_SKELETON_IPA = {
    "a": "a", "b": "b", "c": "tʃ", "d": "d", "e": "e", "f": "f",
    "g": "ɡ", "h": "h", "i": "i", "j": "dʒ", "k": "k", "l": "l",
    "m": "m", "n": "n", "o": "o", "p": "p", "r": "ɾ", "s": "s",
    "t": "t", "u": "u", "v": "b", "w": "w", "x": "ks", "y": "j",
    "z": "z", " ": " ",
}


def transcription_source() -> str:
    """Which transcription path is live — reported verbatim in stages."""
    if _ESPEAK:
        return f"espeak ({_ESPEAK})"
    if _EPITRAN_HIN is not None:
        return "epitran(hin-Deva) for native script; skeleton-IPA for Latin"
    return "skeleton-IPA (VPPS alphabet → IPA segments)"


def available() -> bool:
    return PANPHON_OK


def _espeak_ipa(text: str, lang: str = "en") -> Optional[str]:
    try:
        out = subprocess.run(
            [_ESPEAK, "-v", lang, "--ipa", "-q", text],
            capture_output=True, timeout=4, text=True)
        ipa = (out.stdout or "").strip().splitlines()
        return ipa[0].strip() if ipa else None
    except Exception:  # noqa: BLE001
        return None


def ipa_of(text: str) -> str:
    """Best-available IPA-ish transcription of `text` (never raises)."""
    t = (text or "").strip()
    if not t:
        return ""
    if _DEVANAGARI.search(t) and _EPITRAN_HIN is not None:
        try:
            return _EPITRAN_HIN.transliterate(t).replace("ː", "")
        except Exception:  # noqa: BLE001
            pass
    if _ESPEAK:
        ipa = _espeak_ipa(t)
        if ipa:
            return ipa.replace("ˈ", "").replace("ˌ", "")
    # Skeleton-IPA path: digraph mergers first (mirroring the VPPS
    # DIGRAPH_NORMALIZATIONS, applied symmetrically to both sides), then
    # the per-character segment map.
    low = t.lower()
    for digraph, seg in (("sh", "ʃ"), ("ch", "tʃ"), ("ph", "f"),
                         ("kh", "k"), ("bh", "b"), ("dh", "d"),
                         ("th", "t"), ("zh", "ʒ"), ("ng", "ŋ")):
        low = low.replace(digraph, seg)
    return "".join(
        ch if ch in "ʃʒŋ" else _SKELETON_IPA.get(ch, "") for ch in low)


def _self_cost(ipa: str) -> float:
    """Cost of deleting the whole string — the natural scale for a
    PanPhon distance involving this string. Cached: strings repeat."""
    return _DST.weighted_feature_edit_distance(ipa, "")


def feature_similarity(ipa_a: str, ipa_b: str) -> float:
    """PanPhon weighted feature edit distance → similarity in [0, 1].

    sim = 1 − dist / max(self_cost(a), self_cost(b)): identical strings
    score 1.0, a one-segment slip ~0.85–0.9, unrelated strings ~0.25.
    (A naive length normalization fails here — PanPhon prices deletions
    at full feature cost, which crushes long-string comparisons.)
    Returns 0.0 when panphon is unavailable or input is empty.
    """
    if not PANPHON_OK or not ipa_a or not ipa_b:
        return 0.0
    if ipa_a == ipa_b:
        return 1.0
    try:
        dist = _DST.weighted_feature_edit_distance(ipa_a, ipa_b)
        scale = max(_self_cost(ipa_a), _self_cost(ipa_b), 1e-9)
    except Exception:  # noqa: BLE001
        return 0.0
    return round(max(0.0, 1.0 - dist / scale), 4)


def similarity(text_a: str, text_b: str) -> float:
    """Convenience: transcribe both sides symmetrically, then compare."""
    return feature_similarity(ipa_of(text_a), ipa_of(text_b))


def candidate_similarity(payload: str, title: str, artist: str = "") -> float:
    """Score a peeled payload against a candidate. Title-first: the
    utterance names the title, so the title comparison dominates; the
    title+artist comparison is kept as a max() for the 'song by artist'
    phrasing. Comparing ONLY against title+artist would bury the title
    signal under artist-word deletions."""
    s_title = similarity(payload, title)
    if artist:
        s_full = similarity(payload, f"{title} {artist}")
        return max(s_title, s_full)
    return s_title
