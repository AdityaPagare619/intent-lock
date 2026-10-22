"""Intent Lock helpers (doc 12): version classification, plain-language
elimination reasons, and the deterministic voice-rule store.

Pure stdlib + the E2 guard's token classifier. No network. The only
state is the rules file — a small JSON document the server owns.
Everything here is deterministic: same input, same output, forever.
"""

from __future__ import annotations

import json
import re
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    from engines.studio_pure_guard import token_penalties
except ImportError:  # direct-module import (tests run from src/)
    from studio_pure_guard import token_penalties  # type: ignore

# ---------------------------------------------------------------------------
# Version classification
# ---------------------------------------------------------------------------
# F-01 honesty rule (doc 12): public catalogs carry NO sponsored flag.
# The trap class the data can actually prove is the unsolicited
# compilation / ad-tier swap — tribute albums, compilation re-uploads,
# "in the style of" rows and Various-Artists bait returned instead of
# the canonical release.
_SWAP_RE = re.compile(
    r"various artists|\btribute\b|in the style of|originally performed by|"
    r"\bworkout\b|now that'?s what i call|kids hits|\bcompilation\b|"
    r"party hits|gym music|fitness beats", re.IGNORECASE)
_LOFI_RE = re.compile(r"lo[-\s]?fi", re.IGNORECASE)
_ACOUSTIC_RE = re.compile(r"\bacoustic\b|\bunplugged\b|\bstripped\b",
                          re.IGNORECASE)
_REMASTER_RE = re.compile(r"remaster", re.IGNORECASE)

# REISSUE PACKAGING (FIX4 guard, 2026-10-23). Measured hole: the
# server's scoring core strips trailing bracketed tags from a title
# before comparing ('Saiyaara (From "Ek Tha Tiger") [Rebirth]' cores
# to 'Saiyaara'), so a reissue row enters the title family at FULL
# similarity — while no classifier pattern knows 'rebirth', so the
# row is labeled a plain "Original". Wrong-film can't save the call
# when supply is degraded: if the true original never enters the
# pool, the packaged row grounds as canonical itself and crowns as
# sole survivor (Judge P2's cold run locked iTunes 1179020344). The
# packaging is visible only in the title's WRAPPER segments — the
# [...] / (...) tags and the trailing dash suffix — so the
# detector reads exactly those, never the core name: a film
# provenance paren ('(From "Ek Tha Tiger")') or a credit
# ('(feat. …)') carries no version word and never fires.
_REISSUE_WORDS_RE = re.compile(
    r"\b(rebirth|remake|remade|reprise|redux|reissue|reissued|"
    r"rerecorded|re-recorded|remaster|remastered|remix|remixed|"
    r"lo[-\s]?fi|karaoke|live|acoustic|unplugged|sped|slowed|"
    r"reverb|instrumental|cover|version|mix|edit|flip)\b",
    re.IGNORECASE)
_WRAPPER_SEG_RE = re.compile(r"[\(\[]([^\(\)\[\]]*)[\)\]]")
_DASH_SUFFIX_RE = re.compile(r"\s+[-–—]\s+([^\-–—]+)$")


def reissue_packaging(title: str) -> bool:
    """True when the title's packaging — bracketed/parenthesized
    tags or a trailing dash suffix — names a version or reissue
    the plain original would not carry. Core title words are never
    inspected: a version word inside a song's actual name is the
    catalog's business; the same word in a wrapper tag is
    packaging."""
    t = str(title or "")
    segments = [m.group(1) for m in _WRAPPER_SEG_RE.finditer(t)]
    dash = _DASH_SUFFIX_RE.search(t)
    if dash:
        segments.append(dash.group(1))
    return any(_REISSUE_WORDS_RE.search(seg) for seg in segments)


def _lead_token(artist: str) -> str:
    """First token of the lead artist ('Mohit Chauhan & …' → 'mohit')."""
    head = re.split(r",|&|\bfeat\.?\b|\bft\.?\b", (artist or "").lower())[0]
    toks = re.findall(r"[a-z0-9]+", head)
    return toks[0] if toks else ""


def _damerau_levenshtein(a: str, b: str) -> int:
    """Edit distance with adjacent transposition costing 1 (optimal
    string alignment) — 'saiyaraa' vs 'saiyaara' is ONE metathesis,
    the classic ASR/transliteration spelling mutation."""
    la, lb = len(a), len(b)
    d = [[0] * (lb + 1) for _ in range(la + 1)]
    for i in range(la + 1):
        d[i][0] = i
    for j in range(lb + 1):
        d[0][j] = j
    for i in range(1, la + 1):
        for j in range(1, lb + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1,
                          d[i - 1][j - 1] + cost)
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] \
                    and a[i - 2] == b[j - 1]:
                d[i][j] = min(d[i][j], d[i - 2][j - 2] + 1)
    return d[la][lb]


def same_title_family(a: str, b: str) -> bool:
    """Same title under ASR spelling mutation: skeletons within one
    Damerau edit (substitution, insertion, deletion, transposition).
    Measured margins (2026-10-21): the true spelling family
    saiyaraa<->saiyaara sits at distance 1; the nearest stranger,
    sahara<->saiyaara, sits at distance >=3 (its PanPhon similarity
    is also lower, 0.694 vs the family's 0.785). One edit is the
    structural line between a respelling and a different song."""
    sa, sb = skeleton(a), skeleton(b)
    if not sa or not sb:
        return False
    return _damerau_levenshtein(sa, sb) <= 1


def is_wrong_film(track: Dict[str, Any],
                  canonical: Optional[Dict[str, Any]],
                  family: bool = False) -> bool:
    """Wrong-film evidence (JUDGMENT Part 4.2): same title as the
    grounded canonical, a different release year, and a different lead
    artist — the 2025 'Saiyaara' (Arijit Singh) against the 2012 film
    original (Mohit Chauhan) the user asked for. All three legs must
    hold; a missing year or a shared singer means NO verdict.
    'Same title' is the phonetic spelling family (same_title_family),
    not byte equality: catalogs spell one title two ways, and the
    byte-exact test let the 2025 namesake escape through the gap."""
    if not canonical:
        return False
    # Title leg: the caller may pass family=True when it has already
    # established component membership (the server's title-family
    # gate); otherwise the pairwise spelling-family test decides.
    if not family and not same_title_family(
            str(track.get("title") or ""),
            str(canonical.get("title") or "")):
        return False
    # The verdict claims the row is from a different FILM: the row
    # must itself carry film provenance. A same-title non-film row
    # (a single, a namesake album track) is not a wrong-film row —
    # the film discipline demotes it with its own honest reason.
    if not is_film_row(track):
        return False
    ty, cy = track.get("year"), canonical.get("year")
    if not ty or not cy or int(ty) == int(cy):
        return False
    lt = _lead_token(str(track.get("artist") or ""))
    lc = _lead_token(str(canonical.get("artist") or ""))
    return bool(lt and lc and lt != lc)


def classify(track: Dict[str, Any],
             canonical: Optional[Dict[str, Any]] = None,
             family: bool = False,
             original_demanded: bool = False
             ) -> Tuple[str, Optional[str]]:
    """Return (human version label, hard trap class or None).

    Hard traps die on sight in the Decide step: "karaoke" (E2's FAKE
    token class) and "swap" (F-01 compilation/ad-tier swap). Live,
    remix, acoustic, lofi and remaster are honest labels — they die
    only when the user's words ban them or a rule overrides them.
    With `canonical` (the grounded reference recording), a same-title
    row from a different film is labeled "Wrong Film" (trap class
    "wrong-film") — see is_wrong_film for the evidence bar. With
    `original_demanded` (the user's own words demand the original),
    a row that would otherwise pass as a plain "Original" but whose
    title packaging names a reissue/remake is a hard trap instead
    (trap class "reissue") — see reissue_packaging.
    """
    text = " ".join(str(track.get(k) or "") for k in
                    ("title", "collection", "artist"))
    _penalty, kind, _matched = token_penalties(track)
    if kind == "karaoke":
        return "Karaoke", "karaoke"
    if _SWAP_RE.search(text):
        return "Compilation", "swap"
    if is_wrong_film(track, canonical, family=family):
        return "Wrong Film", "wrong-film"
    if _LOFI_RE.search(text):
        return "LoFi", None
    if _ACOUSTIC_RE.search(text):
        return "Acoustic", None
    if kind == "live":
        return "Live", None
    if _REMASTER_RE.search(text):
        return "Remaster", None
    if kind == "remix":
        return "Remix", None
    if original_demanded and reissue_packaging(
            str(track.get("title") or "")):
        # The row calls itself the original, but its own packaging
        # says reissue/remake — on an original demand that is a
        # hard trap, never a crown (FIX4 guard; the reason prints
        # via reason_reissue).
        return "Reissue", "reissue"
    return "Original", None


# Host tags (doc 12 include/exclude structure) → version labels.
TAG_TO_LABELS: Dict[str, set] = {
    "remix": {"Remix"}, "live": {"Live"}, "karaoke": {"Karaoke"},
    "acoustic": {"Acoustic"}, "unplugged": {"Acoustic"},
    "lofi": {"LoFi"}, "lo-fi": {"LoFi"},
    "remaster": {"Remaster"}, "remastered": {"Remaster"},
    "studio": {"Original"}, "original": {"Original"}, "film": {"Original"},
    "compilation": {"Compilation"},
}


def labels_for_tags(tags: List[str]) -> set:
    out: set = set()
    for t in tags or []:
        out |= TAG_TO_LABELS.get(str(t).strip().lower(), set())
    return out


def label_for_version_text(version_text: str) -> Optional[str]:
    """Map a rule's free-text version ('lofi acoustic') to ONE label.
    The first mappable word wins — the rule sentence the user spoke is
    ordered by emphasis."""
    for token in re.split(r"[^a-z-]+", (version_text or "").lower()):
        for label_set in (TAG_TO_LABELS.get(token),):
            if label_set:
                return next(iter(label_set))
    return None


# ---------------------------------------------------------------------------
# Plain-language elimination reasons (the Trust Card shows these verbatim)
# ---------------------------------------------------------------------------

def reason_banned(label: str, include_tags: List[str]) -> str:
    inc = {str(t).lower() for t in (include_tags or [])}
    if label == "Remix":
        return "Remix — you said not the remix"
    if label == "Live":
        if inc & {"film", "original", "studio"}:
            return "Live cover — you asked for the film version"
        return "Live version — you said not live"
    if label == "Karaoke":
        return "Karaoke track — no original vocals"
    if label == "Acoustic":
        return "Acoustic version — not the one you asked for"
    if label == "LoFi":
        return "LoFi version — not the one you asked for"
    if label == "Remaster":
        return "Remaster — you asked for the original"
    return f"{label} version — you asked for a different version"


def reason_swap() -> str:
    return "Compilation swap — not the canonical release"


def reason_karaoke() -> str:
    return "Karaoke track — no original vocals"


def reason_said_want(label: str) -> str:
    return ("Not the version you asked for in this request — "
            "the version named in your own words rules this call.")


def reason_rule(label: str, version_text: str, after_time: str) -> str:
    # v1.2 wording (founder lock): the elimination names the ACTIVE
    # Taste Lock, not an abstract preference.
    return (f"Active Taste Lock — after {fmt_time(after_time)}, "
            f"you locked the {version_text} version.")


def reason_low() -> str:
    return "Weaker match — sounds less like what you said"


def reason_tie() -> str:
    return "Tied — too close to call honestly"


def reason_pin_loser() -> str:
    return "Tied — the host picked the other one"


def reason_vetoed(label: str, span: str) -> str:
    return f"{label} — you said '{span}'. Vetoed by your words."


def reason_veto_track() -> str:
    return "Vetoed — you ruled this exact track out"


def reason_wrong_film(title: str, year: Any, purana: bool = False) -> str:
    if purana:
        return "Same title, wrong film — you asked for the old one."
    if year:
        return f"Same title, wrong film — the {year} {title}."
    return "Same title, wrong film."


def reason_reissue() -> str:
    return "Reissue/remake packaging — not the original recording"


# ---------------------------------------------------------------------------
# The Nahi Veto + Purana Wala selector (Lane 10, SYNTHESIS §2.1–2.2).
# The server re-reads the user's OWN words deterministically: a negation
# marker bound to a version noun is a hard veto the host cannot remove,
# and "purana/original wala" is a selector, not filler.
# ---------------------------------------------------------------------------
_NEG_MARKERS = {"nahi", "nahin", "na", "mat",
                "not", "no", "never", "don't", "dont"}
_VETO_NOUNS = {"remix": "remix", "live": "live", "karaoke": "karaoke",
               "lofi": "lofi", "acoustic": "acoustic",
               "unplugged": "acoustic", "remaster": "remaster",
               "remastered": "remaster"}


# ---------------------------------------------------------------------------
# Universal Sub-Local Operator Grammar (founder correction, 2026-10-21).
# The constraint lexicon lives in sublocal_grammar.json — DATA, not code:
# code-switched tokens across locales (hi-IN, ta-IN, es-US, en-GLOBAL)
# map to four universal operators — HARD_VETO (≠), CANONICAL_ORIGIN
# (t₀), EXACT_LOCK (≡), CONTEXT_ANCHOR (@). A new dialect is a JSON
# edit; this module implements the binding machinery (windows,
# precedence, attribution) once, for every locale. Grammar candidates
# (verify: true) are never loaded — unverified tokens fire nothing.
# ---------------------------------------------------------------------------
_GRAMMAR_PATH = Path(__file__).resolve().parent.parent \
    / "sublocal_grammar.json"


def _load_grammar() -> Dict[str, Any]:
    try:
        return json.loads(_GRAMMAR_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {"locales": {}, "binding_rules": {}}


_GRAMMAR = _load_grammar()
_OP_TOKEN_LOCALES: Dict[str, List[Tuple[str, str]]] = {}
_OP_PHRASES: List[Tuple[str, str, str]] = []
for _loc, _ldata in (_GRAMMAR.get("locales") or {}).items():
    for _op, _odata in ((_ldata or {}).get("operators") or {}).items():
        for _tok in (_odata or {}).get("tokens") or []:
            _OP_TOKEN_LOCALES.setdefault(
                str(_tok).lower(), []).append((_op, _loc))
        for _ph in (_odata or {}).get("phrases") or []:
            _OP_PHRASES.append((_op, str(_ph).lower(), _loc))
_OP_PHRASES.sort(key=lambda x: -len(x[1]))

# The veto marker set is grammar-sourced now: every locale's HARD_VETO
# tokens bind version nouns, not just the Hinglish/English ones the
# first build hardcoded. "don't"/"dont" ride along as en-GLOBAL
# contractions of "not" (ASR emits them constantly; the grammar file
# lists canonical forms).
_VETO_MARKER_LOCALE: Dict[str, str] = {}
for _tok, _hits in _OP_TOKEN_LOCALES.items():
    for _op, _loc in _hits:
        if _op == "HARD_VETO" and (
                _tok not in _VETO_MARKER_LOCALE or _loc != "en-GLOBAL"):
            _VETO_MARKER_LOCALE[_tok] = _loc
_VETO_MARKER_LOCALE.setdefault("don't", "en-GLOBAL")
_VETO_MARKER_LOCALE.setdefault("dont", "en-GLOBAL")
if _VETO_MARKER_LOCALE:
    _NEG_MARKERS = set(_VETO_MARKER_LOCALE)


def _locale_evidence(tokens: List[str]) -> set:
    """Locales with DISTINCTIVE evidence in this utterance: a matched
    token owned by exactly one locale (e.g. 'nahi' can only be hi-IN).
    Used to attribute tokens that several locales share."""
    ev = set()
    for tok in tokens:
        hits = _OP_TOKEN_LOCALES.get(tok, [])
        locs = {loc for (_op, loc) in hits}
        if len(locs) == 1:
            ev.add(next(iter(locs)))
    return ev


def _attribute_locale(token: str, op: str, evidence: set) -> str:
    hits = [loc for (o, loc) in _OP_TOKEN_LOCALES.get(token, [])
            if o == op]
    if not hits:
        return "en-GLOBAL"
    if len(hits) == 1:
        return hits[0]
    for loc in hits:
        if loc != "en-GLOBAL" and loc in evidence:
            return loc
    return "en-GLOBAL" if "en-GLOBAL" in hits else hits[0]


def detect_operators(raw: str) -> List[Dict[str, str]]:
    """Universal operator firings over the raw utterance, in utterance
    order: [{op, locale, token}]. Locale is detected per matched
    token, never from a user profile (grammar detection rule); a
    token shared across locales is attributed to a specific locale
    only when that locale has distinctive evidence in the same
    utterance, else to en-GLOBAL."""
    text = re.sub(r"lo[\s-]fi", "lofi", (raw or "").lower())
    tokens = re.findall(r"[a-z']+", text)
    if not tokens:
        return []
    evidence = _locale_evidence(tokens)
    matched: List[Tuple[int, str, str, Optional[str]]] = []
    for i, tok in enumerate(tokens):
        for op, _loc in _OP_TOKEN_LOCALES.get(tok, []):
            matched.append((i, op, tok, None))
    joined = " " + " ".join(tokens) + " "
    for op, phrase, loc in _OP_PHRASES:
        needle = " " + phrase + " "
        if needle in joined:
            matched.append((joined.find(needle), op, phrase, loc))
    out: List[Dict[str, str]] = []
    seen = set()
    for _pos, op, tok, loc in sorted(matched, key=lambda x: x[0]):
        if (op, tok) in seen:
            continue
        seen.add((op, tok))
        out.append({"op": op,
                    "locale": loc or _attribute_locale(
                        tok, op, evidence),
                    "token": tok})
    return out


def detect_vetoes(raw: str) -> List[Dict[str, str]]:
    """Negation guard over the raw utterance. A marker within ≤3 tokens
    of a version noun — before it ('not the remix', 'sin remix') or
    after it ('remix nahi', 'remix vendam') — vetoes that version.
    The marker set is the grammar's HARD_VETO tokens across every
    locale; each veto records the marker that fired and its locale,
    so the card can show [hi-IN: "nahi" → HARD_VETO] as proof.
    Returns [{tag, label, span, marker, locale}] in utterance order,
    one per vetoed tag."""
    text = re.sub(r"lo[\s-]fi", "lofi", (raw or "").lower())
    # CLAUSE BOUNDING: a negation binds only inside its own clause.
    # 'Kesariya slowed lofi, not the dance mix' put a comma between
    # the wanted version and the marker, and the flat ±3 window
    # vetoed the wanted lofi (Lane C chip 4, re-measured on the
    # current code). 'lofi nahi' has no boundary and still binds.
    tokens: List[str] = []
    clause_of: List[int] = []
    # CONJUNCTION BOUNDARIES (Council C4, P-NEG-1/V4): a standalone
    # conjunction token also ends a clause — 'remix mat chalana
    # lekin lofi version bajana' carries no punctuation, and
    # without the split the marker bleeds across 'lekin' and
    # vetoes the version the user asked to PLAY. The conjunction
    # token belongs to neither clause.
    _CONJ = {"lekin", "par", "but", "pero", "and"}
    _cid = -1
    for clause in re.split(r"[,;—–]|\s-\s", text):
        _cid += 1
        for _tok in re.findall(r"[a-z']+", clause):
            if _tok in _CONJ:
                _cid += 1
                continue
            tokens.append(_tok)
            clause_of.append(_cid)
    evidence = _locale_evidence(tokens)
    out: List[Dict[str, str]] = []
    seen: set = set()
    for i, tok in enumerate(tokens):
        tag = _VETO_NOUNS.get(tok)
        if not tag or tag in seen:
            continue
        lo, hi = max(0, i - 3), min(len(tokens), i + 4)
        for j in list(range(lo, i)) + list(range(i + 1, hi)):
            if clause_of[j] == clause_of[i] \
                    and tokens[j] in _NEG_MARKERS:
                span = " ".join(tokens[min(i, j):max(i, j) + 1])
                label = next(iter(TAG_TO_LABELS[tag]))
                out.append({"tag": tag, "label": label, "span": span,
                            "marker": tokens[j],
                            "locale": _attribute_locale(
                                tokens[j], "HARD_VETO", evidence)})
                seen.add(tag)
                break
    # POST-POSITION CLAUSE-SCOPE BINDING (Council C4, P-NEG-1):
    # in the hi/ta pattern the marker FOLLOWS its noun ('remix
    # version bilkul bhi mat chalana' — distance 4+). A marker
    # binds leftward across its whole clause to the NEAREST veto
    # noun before it — the noun it grammatically negates. Pre-
    # position binding stays capped at ≤3: widening THAT side
    # would break the discourse guards ('Nahi mujhe … lofi …
    # hai' — a sentence-initial 'nahi' negates the speech act,
    # not the version; guards V5/V5b cap this fix).
    for j, tok in enumerate(tokens):
        if tok not in _NEG_MARKERS:
            continue
        for i in range(j - 1, -1, -1):
            if clause_of[i] != clause_of[j]:
                break
            tag = _VETO_NOUNS.get(tokens[i])
            if not tag:
                continue
            if tag not in seen:
                label = next(iter(TAG_TO_LABELS[tag]))
                out.append({"tag": tag, "label": label,
                            "span": " ".join(tokens[i:j + 1]),
                            "marker": tok,
                            "locale": _attribute_locale(
                                tok, "HARD_VETO", evidence)})
                seen.add(tag)
            break
    # FUSED-NEGATION RESCUE (FIX6, 2026-10-23): ASR run-together
    # fuses a whole ask into ONE token ('playsaiyaaranottheremix').
    # Tokenization then sees neither a marker token nor a noun
    # token, so both passes above stay silent and the user's own
    # 'not the remix' never becomes a veto — replay ASR-03 locked
    # Deezer's 'Saiyaan Ji Remix' at 0.7717 off a sloppy host's
    # inverted include_tags. Rescue, narrowly: scan each token for
    # a negation stem fused to a veto noun INSIDE THE SAME TOKEN —
    # stem directly before the noun ('notremix'), before + 'the'
    # ('nottheremix'), or after it ('remixnahi'). A spaced
    # utterance's tokens are single words, so no token can contain
    # both halves — the rescue can only fire on genuinely fused
    # tokens, and only for tags not already vetoed above (no
    # double-counting). Emits the identical veto dict the spaced
    # form produces, plus a 'fused' evidence flag.
    _FUSED_STEMS = ("never", "nahi", "dont", "not", "no")
    for tok in tokens:
        if len(tok) < 6:
            continue
        for surface, ftag in sorted(_VETO_NOUNS.items(),
                                    key=lambda kv: -len(kv[0])):
            if ftag in seen:
                continue
            pos = tok.find(surface)
            if pos < 0:
                continue
            marker = None
            head, tail = tok[:pos], tok[pos + len(surface):]
            for stem in _FUSED_STEMS:
                if head.endswith(stem) or head.endswith(stem + "the"):
                    marker = stem
                    break
            if marker is None:
                for stem in _FUSED_STEMS:
                    if tail.startswith(stem) or \
                            tail.startswith("the" + stem):
                        marker = stem
                        break
            if marker is None:
                continue
            label = next(iter(TAG_TO_LABELS[ftag]))
            out.append({"tag": ftag, "label": label, "span": tok,
                        "marker": marker,
                        "locale": _attribute_locale(
                            marker, "HARD_VETO", evidence),
                        "fused": True})
            seen.add(ftag)
    return out


_PURANA_RE = re.compile(
    r"\b(purana|purani|original|film)\s+(wala|waala|wali)\b"
    r"|\bthe (old|original) one\b", re.IGNORECASE)
_ORIGINAL_SELECTOR_RE = re.compile(
    r"\boriginal\s+(movie\s+)?(version|film|song)\b"
    r"|\boriginal\b", re.IGNORECASE)
_WALA_RE = re.compile(
    r"\b(lofi|remix|original|acoustic|live|film)\s+(wala|waala|wali)\b",
    re.IGNORECASE)


def detect_selectors(raw: str) -> Tuple[bool, List[str], bool]:
    """(purana_wala_fired, wala_tags, original_selector).

    'Purana/original wala' selects the old/original one; 'X wala'
    mid-sentence is a variant pointer, recorded as an advisory include
    tag — never filler again. The originality selector is the broader
    deterministic signal ('original movie version', 'the original
    one', purana wala): when it fires, the server derives include
    {original, film} and, among same-title namesakes, the EARLIEST
    release year grounds the canonical — catalog rank cannot do it
    (every catalog leans toward the newest film; the user's word
    'original' is the only honest evidence, Lane 10 §Idea 2)."""
    text = re.sub(r"lo[\s-]fi", "lofi", (raw or "").lower())
    purana = bool(_PURANA_RE.search(text))
    original_selector = purana or bool(_ORIGINAL_SELECTOR_RE.search(text))
    tags: List[str] = []
    for m in _WALA_RE.finditer(text):
        t = m.group(1)
        if t not in tags:
            tags.append(t)
    return purana, tags, original_selector


# ---------------------------------------------------------------------------
# Film provenance + phonetic fetch expansion (principal fix, 2026-10-21)
# ---------------------------------------------------------------------------
# Measured defect: with the heard form 'Sayaraa' as the only fetch
# query, the spelling-based catalogs return a Sahara-only pool — the
# true version zoo never enters the room, and phonetics alone ranks
# 'Sahara' (0.87) above 'Saiyaara' (0.76) against the heard reference.
# Two deterministic repairs, both evidence-based:
#   1. FETCH EXPANSION — respelling variants (one glide insertion,
#      'Saiyaraa', flips the pool completely) widen the fetch. Variants
#      are queries only; scoring always uses the original reference.
#   2. FILM HEAD DISCIPLINE — when the user's own words ask for the
#      film song and film-provenance rows survive, only they may head
#      the pool. A voice rule in force outranks the discipline.

_FILM_ROW_RE = re.compile(
    r"soundtrack|motion picture|\(from\s+[\"“]", re.IGNORECASE)


def is_film_row(track: Dict[str, Any]) -> bool:
    """Catalog-side film provenance: the row's own title/collection
    text carries a soundtrack / motion-picture / (From "Film")
    marker. Metadata evidence only — never inferred from fame."""
    text = " ".join(str(track.get(k) or "") for k in ("title", "collection"))
    return bool(_FILM_ROW_RE.search(text))


def reason_not_film() -> str:
    return "Not a film track — you asked for the film song."


def reason_not_named() -> str:
    return "A different song — not the title you named."


def reason_rule_other_song(rule_title: str) -> str:
    return (f"A different song's version — your rule is about "
            f"'{rule_title}'.")


def reason_rule_bound() -> str:
    return "Your Taste Lock picked this exact recording before."


def reason_cover() -> str:
    return ("A third-party rendition — not the original "
            "artists' recording.")


def _levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1,
                           prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


_GLIDE_OF = {"y": "i", "w": "u"}


def query_variants(query: str, cap: int = 4) -> List[str]:
    """Deterministic respellings of a heard title for the fetch race.

    One edit per variant, in attested ASR-confusion order: glide-vowel
    insertion/deletion around y/w, y<->j, v<->w, ph<->f, doubled-vowel
    collapse. A Levenshtein guard (<=2 on the whole string) keeps
    near-homophone junk out. Variants widen the pool; they never move
    the scoring reference."""
    q = re.sub(r"\s+", " ", (query or "").strip().lower())
    if len(q) < 3:
        return []
    out: List[str] = []

    def add(v: str) -> None:
        v = re.sub(r"\s+", " ", (v or "").strip())
        if v and v != q and v not in out and _levenshtein(q, v) <= 2:
            out.append(v)

    # 0) Word-boundary repair (ASR segmentation): ASR chops one
    #    transliterated title into several words ('lolly pop la
    #    gelu' for the Bhojpuri 'Lollipop Lagelu'). A deleted space
    #    is the cheapest ASR error there is, so joined spellings
    #    race FIRST — pairwise joins, then the full join. Joins
    #    bypass the Levenshtein guard by class (each removed space
    #    is one edit, and a 4-word title needs three), but they are
    #    few and deterministic; like every variant, they widen the
    #    pool only — scoring always uses the original reference.
    _words = q.split(" ")
    if len(_words) >= 2:
        for i in range(len(_words) - 1):
            _j = " ".join(_words[:i] + [_words[i] + _words[i + 1]]
                          + _words[i + 2:])
            if _j != q and _j not in out:
                out.append(_j)
        _full = "".join(_words)
        if _full != q and _full not in out:
            out.append(_full)

    # 1) Glide insertion: vowel + y/w gains its glide vowel
    #    (sayaraa -> saiyaraa — the measured pool-flipping edit).
    for m in re.finditer(r"[aeiou][yw]", q):
        add(q[:m.start() + 1] + _GLIDE_OF[m.group(0)[1]] + q[m.start() + 1:])
    # 2) Glide deletion: saiyaraa -> sayaraa (the reverse mangling).
    for m in re.finditer(r"[aeiou][iu][yw]", q):
        add(q[:m.start() + 1] + q[m.start() + 2:])
    # 3) y<->j and v<->w (Germanic/Indic ASR confusions), first hit.
    for a, b in (("y", "j"), ("j", "y"), ("v", "w"), ("w", "v")):
        i = q.find(a)
        if i >= 0:
            add(q[:i] + b + q[i + 1:])
    # 4) ph<->f.
    if "ph" in q:
        add(q.replace("ph", "f", 1))
    elif "f" in q:
        add(q.replace("f", "ph", 1))
    # 5) Doubled-vowel collapse (saiyaara -> saiyara).
    m = re.search(r"(aa|ee|oo)", q)
    if m:
        add(q[:m.start()] + m.group(0)[0] + q[m.end():])
    return out[:cap]


def fmt_time(hhmm: str) -> str:
    """'22:00' → '10 PM'; '22:30' → '10:30 PM'; '00:00' → '12 AM'."""
    try:
        h, m = (int(x) for x in str(hhmm).split(":"))
    except Exception:  # noqa: BLE001
        return str(hhmm)
    suffix = "AM" if h < 12 else "PM"
    h12 = h % 12 or 12
    return f"{h12}:{m:02d} {suffix}" if m else f"{h12} {suffix}"


# ---------------------------------------------------------------------------
# Voice rules — a tiny deterministic store the server owns.
# A rule: {title, title_key, after_time 'HH:MM', version, artist}.
# Written by voice inside an intent_lock call; fired by later calls whose
# title matches and whose device time is at/after after_time.
# ---------------------------------------------------------------------------

RULES_PATH = Path(__file__).resolve().parent.parent / "intent_rules.json"
_RULES_LOCK = threading.Lock()


def skeleton(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (text or "").lower())


def load_rules() -> List[Dict[str, Any]]:
    try:
        data = json.loads(RULES_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:  # noqa: BLE001 — missing/corrupt store = no rules
        return []


def _write_store(entries: List[Dict[str, Any]]) -> None:
    tmp = RULES_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(entries, indent=1), encoding="utf-8")
    tmp.replace(RULES_PATH)


def save_rule(rule: Dict[str, Any]) -> None:
    """Insert or replace the rule for this title_key. Atomic write.
    Non-rule entries (track vetoes) in the same store are preserved."""
    with _RULES_LOCK:
        rules = [r for r in load_rules()
                 if r.get("kind") == "veto_track"
                 or r.get("title_key") != rule.get("title_key")]
        rules.append(rule)
        _write_store(rules)


def save_veto(source: str, track_id: str) -> None:
    """Persist a negative entry: this exact track can never win again
    (the reject arg / 'Not This One' tap). Idempotent."""
    with _RULES_LOCK:
        entries = load_rules()
        for e in entries:
            if e.get("kind") == "veto_track" \
                    and str(e.get("source")) == source \
                    and str(e.get("track_id")) == track_id:
                return
        entries.append({"kind": "veto_track", "source": source,
                        "track_id": track_id})
        _write_store(entries)


def load_vetoes() -> List[Dict[str, str]]:
    return [{"source": str(e.get("source") or ""),
             "track_id": str(e.get("track_id") or "")}
            for e in load_rules() if e.get("kind") == "veto_track"]


def _family_bridge(a: str, b: str) -> bool:
    """Family match with one respelling hop: 'Sayaraa' and 'Saiyaara'
    are two edits apart directly, but each is one edit from the
    attested intermediate 'Saiyaraa' — the variant generator knows
    the bridge, so the family test walks through it."""
    if same_title_family(a, b):
        return True
    if any(same_title_family(v, b) for v in query_variants(a)):
        return True
    return any(same_title_family(a, v) for v in query_variants(b))


def _hhmm_minutes(value: Any) -> Optional[int]:
    """'HH:MM' → minutes since midnight; None when not a real time."""
    try:
        h, m = (int(x) for x in str(value).split(":"))
    except Exception:  # noqa: BLE001
        return None
    if not (0 <= h <= 23 and 0 <= m <= 59):
        return None
    return h * 60 + m


# CIRCULAR NIGHT WINDOW (Council C4, P-CLOCK-1 — typed design
# parameter): a rule set for the evening (after_time >= 18:00) is a
# wind-down rule. It stays active past midnight until 05:00, because
# the household awake at 00:30 is in the SAME night — a raw
# same-day string compare silently killed the rule at 00:00. The
# 05:00 end is printed in the rule_active text wherever the rule is
# reported, so the window is a visible design choice, never silent
# magic. Morning rules keep plain same-day semantics.
NIGHT_WINDOW_END = "05:00"


def match_rule(query_text: str, now_hhmm: str, similarity_fn) -> Optional[Dict[str, Any]]:
    """The latest rule whose title matches the query and whose time has
    come. Title match = skeleton equality, the spelling family
    (same_title_family — a rule written for 'Saiyaara' must fire for
    the heard 'Sayaraa'; their PanPhon similarity is only 0.66, so
    the 0.85 phonetic bar alone orphaned the rule), or the caller's
    phonetic similarity ≥ 0.85 (the same bar as the B1 rescue)."""
    qk = skeleton(query_text)
    best: Optional[Dict[str, Any]] = None
    for rule in load_rules():
        if rule.get("kind") == "veto_track":
            continue
        _after = str(rule.get("after_time") or "99:99")
        _after_min = _hhmm_minutes(_after)
        _now_min = _hhmm_minutes(now_hhmm)
        if _after_min is not None and _now_min is not None:
            if _after_min >= 18 * 60:
                if not (_now_min >= _after_min
                        or _now_min < 5 * 60):
                    continue
            elif _now_min < _after_min:
                continue
        elif now_hhmm < _after:
            continue
        if qk and qk == rule.get("title_key"):
            best = rule
        elif _family_bridge(query_text, str(rule.get("title") or "")):
            best = rule
        elif similarity_fn is not None:
            try:
                if similarity_fn(str(rule.get("title") or ""), query_text) >= 0.85:
                    best = rule
            except Exception:  # noqa: BLE001
                continue
    return best


_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def sanitize_rule(raw: Any) -> Tuple[Optional[Dict[str, Any]], List[str]]:
    """Validate a host-supplied rule object (the wire validator is lite,
    so the tool self-validates — same discipline as Layer C). Returns
    (rule or None, ignored notes)."""
    if raw is None:
        return None, []
    if not isinstance(raw, dict):
        return None, ["rule:not-an-object"]
    ignored: List[str] = []
    after = str(raw.get("after_time") or "").strip()
    if not _TIME_RE.match(after):
        ignored.append("rule.after_time")
        after = ""
    version = str(raw.get("version") or "").strip()[:40]
    if not version:
        ignored.append("rule.version")
    artist = str(raw.get("artist") or "").strip()[:80]
    if not after or not version:
        return None, ignored
    clean = {"after_time": after, "version": version, "artist": artist}
    # dsp.preset (SYNTHESIS §2.7): the server stores/echoes the preset
    # opaquely — the card owns every DSP number; the brain never
    # invents parameters, and neither does this store.
    dsp = raw.get("dsp")
    if dsp is not None:
        preset = str(dsp.get("preset") or "") if isinstance(dsp, dict) \
            else ""
        if preset in ("warmth", "warmth_vinyl", "none"):
            clean["dsp"] = {"preset": preset}
        else:
            ignored.append("rule.dsp.preset")
    return clean, ignored
