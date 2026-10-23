"""E2 — StudioPureGuard: the studio-purity firewall + anti-upsell guard (v2).

For every candidate track c, the deterministic purity score is computed from
the TRACK TEXT ITSELF (trackName + collectionName) — not from catalog
metadata, which keyless APIs (iTunes/MusicBrainz) never provide:

    P(c) = 100·vpps_sim(c) + 15·popularity01(c) + 35·studio(c) − penalties(c)

    LIVE_TOKENS  \\b(live|concert|unplugged|tour|stadium|session|mtv|bbc)\\b  → −65
    FAKE_TOKENS  \\b(karaoke|tribute|in the style of|instrumental|8-bit|ringtone|cover|sped up|nightcore)\\b → −80
    REMIX_TOKENS \\b(remix|remaster|dj|lo-fi|flip|mashup|edit)\\b              → −40
    UPSELL trap                                                             → −150 + firewall block

Explicit user intent overrides the penalty (E1's frame peeler detects "play
X live" / "play the X remix"): if the user asked for it, it is not a penalty.

Decision rule (the 3-gate funnel, Gate 2):
  - margin P1 − P2 ≥ 15 (Zone A) → ("play", track)
  - margin < 15 with ≥2 same-title studio contenders (Zone B) → ("elicit", cards)
  - nothing playable (Zone C) → ("none", None)

Phonetics dominates popularity by construction (100 vs 15), and the exact-title
short-circuit plus the 0.95x phonetic gate protect verbatim matches — together
these kill the FL-14 bug class (popularity overruling a genuine phonetic
winner) without special-casing. Note honestly: the 100:15 ratio alone is not
a proof — a phonetic gap under 0.15 *can* be tipped by popularity; the gates
are what make it robust.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Tuple

log = logging.getLogger("intent-lock.e2")

# --- v2: text-token penalties (weights are published policy, not tuned secrets)
LIVE_TOKENS = re.compile(
    r"\b(live|concert|unplugged|tour|stadium|session|mtv|bbc|acoustic set)\b",
    re.IGNORECASE)
FAKE_TOKENS = re.compile(
    r"\b(karaoke|tribute|in the style of|instrumental|8-?bit|ringtone|cover|"
    r"sped ?up|slowed ?\+? ?reverb|nightcore)\b",
    re.IGNORECASE)
REMIX_TOKENS = re.compile(
    r"\b(remix|remaster(?:ed)?|d\.?\s*j\.?|lo-?fi|\bmix\b|\bflip\b|mashup|"
    r"\bedit\b)\b",
    re.IGNORECASE)

PENALTY_LIVE, PENALTY_FAKE, PENALTY_REMIX, PENALTY_UPSELL = 65, 80, 40, 150
STUDIO_BONUS = 35
AMBIGUITY_BAND = 15  # v2 funnel: Zone A ≥15 play · Zone B <15 elicit
_TITLE_NORM = re.compile(r"[^A-Z0-9]+")


def _title_key(title: str) -> str:
    return _TITLE_NORM.sub("", (title or "").upper())


def _norm_tokens(s: str) -> List[str]:
    return [t for t in re.sub(r"[^a-z0-9 ]", " ", (s or "").lower()).split()
            if t]


def _exact_title_hit(utterance: str, title: str) -> bool:
    """True when the user said the title verbatim: the title's token sequence
    appears contiguously in the utterance's tokens. Token-level (not joined
    string) so short titles can't false-positive inside longer words."""
    ut, tt = _norm_tokens(utterance), _norm_tokens(title)
    if not tt:
        return False
    return any(ut[i:i + len(tt)] == tt for i in range(len(ut) - len(tt) + 1))


def _track_text(track: Dict[str, Any]) -> str:
    """The text purity is scored on: trackName + collectionName (+ artist)."""
    return " ".join(str(track.get(k) or "") for k in
                    ("title", "collection", "artist"))


def token_penalties(track: Dict[str, Any],
                    allow_live_version: bool = False,
                    allow_remix: bool = False) -> Tuple[float, str, List[str]]:
    """Return (penalty, display_kind, matched_tokens) from the track text.

    Explicit user intent overrides the penalty — never punish the user for
    what they asked for. display_kind is honest labeling for the UI.
    """
    text = _track_text(track)
    penalty = 0.0
    kind = "studio"
    matched: List[str] = []
    for m in FAKE_TOKENS.finditer(text):
        matched.append(m.group(0).lower())
    if matched:
        penalty += PENALTY_FAKE
        kind = "karaoke"
    else:
        live_hits = [m.group(0).lower() for m in LIVE_TOKENS.finditer(text)]
        if live_hits:
            if allow_live_version:
                kind = "live"
                log.debug("E2 live intent honored for %r — no penalty",
                          track.get("title"))
            else:
                penalty += PENALTY_LIVE
                kind = "live"
                matched.extend(live_hits)
        remix_hits = [m.group(0).lower() for m in REMIX_TOKENS.finditer(text)]
        if remix_hits:
            if allow_remix:
                if kind == "studio":
                    kind = "remix"
                log.debug("E2 remix intent honored for %r — no penalty",
                          track.get("title"))
            else:
                penalty += PENALTY_REMIX
                if kind == "studio":
                    kind = "remix"
                matched.extend(remix_hits)
    return penalty, kind, matched


def purity(track: Dict[str, Any],
           allow_live_version: bool = False,
           allow_remix: bool = False) -> float:
    """Deterministic purity score.

        P = 100·vpps_sim + 15·popularity01 + 35·studio − penalties

    vpps_sim ∈ [0,1]: phonetic similarity of the candidate to the peeled
    utterance (sidecar score clamped, or the local skeleton sim for iTunes
    candidates). Phonetics outweighs popularity 100:15 by construction.
    """
    try:
        sim = max(0.0, min(1.0, float(track.get("vpps_sim",
                                                track.get("score", 0.0) or 0.0))))
    except (TypeError, ValueError):
        sim = 0.0
    try:
        pop01 = max(0.0, min(1.0, float(track.get("popularity01", 0.5))))
    except (TypeError, ValueError):
        pop01 = 0.5
    penalty, _kind, _matched = token_penalties(
        track, allow_live_version=allow_live_version, allow_remix=allow_remix)
    studio = 1.0 if penalty == 0 else 0.0
    return round(100.0 * sim + 15.0 * pop01 + STUDIO_BONUS * studio - penalty, 2)


def hook_url(track: Dict[str, Any]) -> str:
    """Hook audio URL. Prefers the REAL 30s iTunes preview (resolved fresh
    per session — never cached, they're signed/expiring); falls back to the
    deterministic local stem path used by the demo."""
    preview = (track or {}).get("preview_url")
    if preview:
        return preview
    safe = re.sub(r"[^a-z0-9_-]", "", str((track or {}).get("id", "")).lower()) or "unknown"
    return f"/static/hooks/{safe}.mp3"


# A canonical upsell trap the firewall must block (injected in --chaos mode
# via the upsell_trap fault, or when a provider flags PAYWALL_UPSELL).
UPSELL_TRAP = {
    "id": "upsell-trap", "title": "Raja Ji", "artist": "Amazon Music Unlimited",
    "kind": "upsell", "popularity01": 0.99, "locale_tags": ["GLOBAL"],
    "upsell_risk": True, "providers": ["amazon-music"],
    "score": 0.0, "vpps_sim": 0.0, "trace": [], "mock": True, "degraded": False,
}


def guard(candidates: List[Dict[str, Any]],
          allow_live_version: bool = False,
          allow_remix: bool = False,
          inject_upsell: bool = False,
          utterance: str = "") -> Tuple[str, Any, List[Dict[str, Any]]]:
    """Run the purity firewall.

    Three-stage ranking (order matters):
      0. Exact-title short-circuit — if the user said the phonetic winner's
         title verbatim, the contest is restricted to same-title versions
         (the collision rule below still applies among them, so "play
         Raja Ji" with 4 real versions still elicits). Caught live as
         F-02/FL-14: popularity overrode an exact title match.
      1. Phonetic relevance gate — purity only ranks candidates the phonetic
         layer considers genuinely relevant (score within 5% of the top
         phonetic match). Same-title-as-top candidates are exempt: if the
         user said "Raja Ji" and four tracks are literally titled "Raja Ji",
         all four are relevant by definition.
      2. Purity verdict on the gated set — then the collision rule:
           ≥3 legitimate same-title contenders → ELICIT (the respectful move
               when the versions are all real songs, e.g. studio vs DJ
               remix vs lo-fi flip);
           exactly 2, within |ΔP|<15 (Zone B) → ELICIT;
           otherwise                          → PLAY the top (Zone A).
         Karaoke/bootleg junk (P ≤ 0) and upsell traps never make the cards.

    Returns (verdict, payload, blocked) with verdict ∈ {"play","elicit","none"}.
    `blocked` lists every upsell-flagged candidate the firewall stopped.
    """
    pool = list(candidates)
    if inject_upsell:
        pool.append(dict(UPSELL_TRAP))

    blocked: List[Dict[str, Any]] = []
    playable: List[Dict[str, Any]] = []
    for t in pool:
        if t.get("upsell_risk") or t.get("kind") == "upsell":
            blocked.append({**t,
                            "purity_score": purity(t, allow_live_version,
                                                   allow_remix) - PENALTY_UPSELL,
                            "blocked_reason": "upsell_firewall_-150"})
            log.info("E2 upsell firewall blocked %r by %r",
                     t.get("title"), t.get("artist"))
            continue
        _pen, kind, _m = token_penalties(t, allow_live_version, allow_remix)
        t = {**t, "kind": kind}  # honest labeling from the track text
        if kind == "live" and not allow_live_version:
            continue  # honored from the tool schema: studio-first default
        playable.append(t)

    if not playable:
        return "none", None, blocked

    # Stage 1: phonetic relevance gate (relative, scale-invariant).
    scored = sorted(playable, key=lambda t: (t.get("score", 0.0) or 0.0),
                    reverse=True)
    top_phonetic = scored[0].get("score", 0.0) or 0.0
    top_title_key = _title_key(scored[0].get("title"))
    gated = [t for t in playable
             if (t.get("score", 0.0) or 0.0) >= 0.95 * top_phonetic
             or _title_key(t.get("title")) == top_title_key]
    log.debug("E2 phonetic gate: %d/%d candidates (top score %.3f)",
              len(gated), len(playable), top_phonetic)

    # Stage 0: exact-title short-circuit.
    if utterance and _exact_title_hit(utterance, scored[0].get("title")):
        same = [t for t in gated
                if _title_key(t.get("title")) == top_title_key]
        if same:
            log.info("E2 exact-title hit on %r — contest restricted to %d "
                     "same-title versions", scored[0].get("title"), len(same))
            gated = same

    # Stage 2: purity ranking on the gated set.
    def _key(t: Dict[str, Any]):
        return (purity(t, allow_live_version, allow_remix),
                t.get("score", 0) or 0.0)
    ranked = sorted(gated, key=_key, reverse=True)
    top = ranked[0]
    top_p, top_key = _key(top)[0], _title_key(top.get("title"))

    # D-24 (Petu, 2026-10-19): elicitation cards must be distinguishable.
    # iTunes intermittently returns the same recording under different
    # trackIds (single vs album listing). Dedup here as well (defense in
    # depth — the hydration layer also dedups): two identical cards are
    # never a valid elicitation, no matter which provider produced them.
    def _dedup_cards(cands: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        seen: set = set()
        out: List[Dict[str, Any]] = []
        for t in cands:
            k = (str(t.get("title", "")).strip().lower(),
                 str(t.get("artist", "")).strip().lower())
            if k in seen:
                log.info("E2 dedup: dropping indistinguishable card %r by %r",
                         t.get("title"), t.get("artist"))
                continue
            seen.add(k)
            out.append(t)
        return out

    legit = _dedup_cards([t for t in ranked
                          if _title_key(t.get("title")) == top_key and _key(t)[0] > 0])
    if len(legit) >= 3:
        cands = [{**t, "purity_score": _key(t)[0], "hook_url": hook_url(t)}
                 for t in legit[:3]]
        log.info("E2 high title collision: %d legitimate %r versions — eliciting",
                 len(legit), top.get("title"))
        return "elicit", cands, blocked
    if len(legit) == 2 and abs(top_p - _key(legit[1])[0]) < AMBIGUITY_BAND:
        cands = [{**t, "purity_score": _key(t)[0], "hook_url": hook_url(t)}
                 for t in legit[:3]]
        log.info("E2 Zone B: |P1−P2|=%.2f < %d on %r — eliciting, not guessing",
                 abs(top_p - _key(legit[1])[0]), AMBIGUITY_BAND,
                 top.get("title"))
        return "elicit", cands, blocked

    return "play", {**top, "purity_score": top_p}, blocked
