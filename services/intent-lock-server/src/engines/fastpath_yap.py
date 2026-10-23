"""E3 — ZeroYapFastPath / Graceful Yield (D-03, locked).

The blueprint's "guillotine" (hard abort, 3-word clamp) is replaced by the
Graceful Yield: humans don't get unplugged mid-sentence. Three yield states:

  SOFT_YIELD   — duck TTS, pause at the next word boundary, open a 1.2s listen
                 window, acknowledge, compress the remainder to ≤15 words,
                 then OFFER RESUME. The user can continue the thread.
  BANTER_SHIELD— group chatter/laughter: stay quiet, show the pill, soft earcon
                 when the room settles. Never hijack the wake word.
  HARD_BARGE   — explicit "Alexa stop" only: immediate stop, "Stopped. What
                 next?" The single remaining guillotine, and it's user-invoked.

The *mechanism* (VAD word-boundary timestamps, stream cancel at the exact
word index) is unchanged; the *personality* changed from executioner to
conversation partner. Response shapes are frozen — the simulator builds
against them (Meera's lane).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Tuple

log = logging.getLogger("intent-lock.e3")

# What counts as an explicit stop. Everything else is a conversation.
_HARD_STOP_PHRASES = frozenset({
    "stop", "stop stop", "shut up", "quiet", "enough", "bas", "chup",
    "para", "para ya", "cállate",
})

_BANTER_LAUGHTER_THRESHOLD = 0.6


def _is_hard_stop(command: str) -> bool:
    c = (command or "").lower()
    for w in ("alexa", "echo", "amazon"):
        c = c.replace(w, " ")
    return c.strip().strip("!.") in _HARD_STOP_PHRASES


def _compress(text: str, max_words: int = 15) -> str:
    words = (text or "").split()
    if len(words) <= max_words:
        return " ".join(words)
    return " ".join(words[:max_words]) + "…"


def graceful_yield(interrupted_at_word_index: int,
                   barge_in_command: str,
                   active_utterance: str = "") -> Tuple[str, Dict[str, Any]]:
    """Slice the TTS buffer at the exact word index and yield gracefully.

    Returns (spoken_text, structuredContent). Shapes are frozen.
    """
    try:
        idx = max(0, int(interrupted_at_word_index))
    except (TypeError, ValueError):
        idx = 0
    cmd = (barge_in_command or "").strip()
    words = (active_utterance or "").split()
    if words:
        idx = min(idx, len(words))
    dropped_words = words[idx:]
    heard_words = words[:idx]

    if _is_hard_stop(cmd):
        structured = {
            "yield_state": "HARD_BARGE",
            "sliced_at_word_index": idx,
            "heard_prefix": " ".join(heard_words[-8:]),
            "acknowledgment": "Stopped.",
            "short_answer": "What next?",
            "resume_offer": None,
        }
        log.info("E3 HARD_BARGE at word %d (explicit stop)", idx)
        return "Stopped. What next?", structured

    # SOFT_YIELD: the human path. Duck → word-boundary pause → 1.2s listen →
    # acknowledge → compress → offer resume.
    short_cmd = _compress(cmd, 12)
    resume_from = " ".join(dropped_words[:6])
    structured = {
        "yield_state": "SOFT_YIELD",
        "sliced_at_word_index": idx,
        "heard_prefix": " ".join(heard_words[-8:]),
        "dropped_tail_words": len(dropped_words),
        "yield_protocol": {
            "duck_db": -8,
            "pause_at": "word_boundary",
            "listen_window_ms": 1200,
        },
        "acknowledgment": "Got it —",
        "short_answer": _compress(
            f"Heard you on “{short_cmd}”. Short version coming up.", 15),
        "resume_offer": "Want me to continue where I left off?",
        "resume_context": {
            "dropped_preview": _compress(resume_from, 10),
            "dropped_word_count": len(dropped_words),
        },
    }
    text = ("Got it — I heard you. Short version coming up. "
            "Want me to continue where I left off?")
    log.info("E3 SOFT_YIELD at word %d; dropped %d tail words; resume offered",
             idx, len(dropped_words))
    return text, structured


def classify_room(num_voices: int, laughter_score: float,
                  sharp_single_voice: bool = False) -> Dict[str, Any]:
    """Banter-vs-barge-in classifier (the VAD runs client-side in the
    simulator; this is the server-side policy twin used by tests/demos).

    laughter_score ∈ [0,1]; num_voices = distinct simultaneous voices.
    """
    try:
        n = int(num_voices)
    except (TypeError, ValueError):
        n = 1
    try:
        laugh = max(0.0, min(1.0, float(laughter_score)))
    except (TypeError, ValueError):
        laugh = 0.0

    if sharp_single_voice:
        return {"decision": "BARGE_IN", "reason": "sharp single voice over TTS",
                "action": "graceful_yield"}
    if n >= 2 or laugh >= _BANTER_LAUGHTER_THRESHOLD:
        return {"decision": "BANTER_SHIELD",
                "reason": f"{n} voice(s), laughter {laugh:.2f} — group chat, not a command",
                "action": "stay_quiet",
                "ui": {"pill": "Group chat detected — I'll wait", "earcon": "soft_on_settle"}}
    return {"decision": "LISTEN", "reason": "single calm voice — treat as command",
            "action": "wake"}
