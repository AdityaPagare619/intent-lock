#!/usr/bin/env python3
"""Sublocal grammar regression tests — Lane E1a (multilingual depth).

Stdlib-only, no server needed: imports the real kernel module and
asserts on the compiled operator/veto evidence for the grammar in
services/omnibeat-mcp-server/src/sublocal_grammar.json.

What this pins down:
  1. The JSON loads under the file's own schema, with no duplicate
     string inside any (locale, operator) and no candidate shadowing
     a live operator.
  2. Locale depth after the 2026-10-23 expansion (entries =
     operator tokens + phrases + candidates): ta-IN >= 12 operator
     entries, es-US >= 14 total entries, hi-IN grew by >= 6 entries
     over the v1.0.0 set.
  3. Every promoted token actually FIRES: detect_operators reports it
     with the right operator + locale, and the new veto markers
     (vendaam, illai, nunca) eliminate their version nouns through
     detect_vetoes.
  4. Candidates stay inert (verify: true fires nothing) — venum and
     jamas must produce no operator and no veto.
  5. Pre-existing behaviour is untouched: vendam / nahi still veto.

Usage:  python3 scripts/test_sublocal_grammar.py
Exit code 0 = all green.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "services" / "omnibeat-mcp-server" / "src"
sys.path.insert(0, str(SRC))

import engines.intent_lock as IL  # noqa: E402

GRAMMAR = json.loads((SRC / "sublocal_grammar.json").read_text(encoding="utf-8"))

FAILURES = []


def check(name: str, cond: bool, detail: str = "") -> None:
    print(("PASS  " if cond else "FAIL  ") + name + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        FAILURES.append(name)


def ops_fired(utterance: str):
    return {(o["op"], o["token"]): o["locale"] for o in IL.detect_operators(utterance)}


# --- 1. schema + duplicate hygiene -------------------------------------
for loc_name, loc in GRAMMAR["locales"].items():
    seen = {}
    for op, od in (loc.get("operators") or {}).items():
        for kind in ("tokens", "phrases"):
            for v in od.get(kind) or []:
                check(f"{loc_name} no dup {op}:{v}", (op, v) not in seen)
                seen[(op, v)] = kind
    for c in loc.get("candidates") or []:
        check(f"{loc_name} candidate fields {c.get('token')}",
              all(k in c for k in ("note", "operator", "phrase", "token", "verify")))
        check(f"{loc_name} candidate not shadowing {c['token']}",
              (c["operator"], c["token"]) not in seen)

def entry_count(loc_name: str, operators_only: bool = False) -> int:
    loc = GRAMMAR["locales"][loc_name]
    n = sum(len(od.get(k) or [])
            for od in (loc.get("operators") or {}).values()
            for k in ("tokens", "phrases"))
    if not operators_only:
        n += len(loc.get("candidates") or [])
    return n

# --- 2. depth targets ----------------------------------------------------
check("ta-IN operator entries >= 12", entry_count("ta-IN", True) >= 12,
      f"got {entry_count('ta-IN', True)}")
check("es-US total entries >= 14", entry_count("es-US") >= 14,
      f"got {entry_count('es-US')}")
check("hi-IN total entries >= 20", entry_count("hi-IN") >= 20,
      f"got {entry_count('hi-IN')}")

# --- 3. promoted tokens fire with correct operator + locale --------------
EXPECT_OPS = [
    # (utterance, op, token, locale)
    ("saiyaara live vendaam", "HARD_VETO", "vendaam", "ta-IN"),
    ("saiyaara lofi illai", "HARD_VETO", "illai", "ta-IN"),
    ("saiyaara live illa", "HARD_VETO", "illa", "ta-IN"),
    ("asal saiyaara venum", "CANONICAL_ORIGIN", "asal", "ta-IN"),
    ("pazhaiya saiyaara", "CANONICAL_ORIGIN", "pazhaiya", "ta-IN"),
    ("saiyaara padam", "CONTEXT_ANCHOR", "padam", "ta-IN"),
    ("saiyaara matum", "EXACT_LOCK", "matum", "ta-IN"),
    ("saiyaara mattum", "EXACT_LOCK", "mattum", "ta-IN"),
    ("saiyaara remix nunca", "HARD_VETO", "nunca", "es-US"),
    ("pon la primera de saiyaara", "CANONICAL_ORIGIN", "primera", "es-US"),
    ("pon la version original de saiyaara", "CANONICAL_ORIGIN", "la version original", "es-US"),
    ("la original de saiyaara", "CANONICAL_ORIGIN", "la original", "es-US"),
    ("el original de saiyaara", "CANONICAL_ORIGIN", "el original", "es-US"),
    ("saiyaara solamente", "EXACT_LOCK", "solamente", "es-US"),
    ("la clasica de saiyaara", "CANONICAL_ORIGIN", "clasica", "es-US"),
    ("purana saiyaara bajao", "CANONICAL_ORIGIN", "purana", "hi-IN"),
    ("purani saiyaara bajao", "CANONICAL_ORIGIN", "purani", "hi-IN"),
    ("saiyaara film wali lagao", "CANONICAL_ORIGIN", "film wali", "hi-IN"),
    ("saiyaara film wala lagao", "CANONICAL_ORIGIN", "film wala", "hi-IN"),
    ("saiyaara wahi chahiye", "EXACT_LOCK", "wahi", "hi-IN"),
]
for utt, op, tok, loc in EXPECT_OPS:
    fired = ops_fired(utt)
    check(f"fires {op} '{tok}' [{loc}] in '{utt}'",
          fired.get((op, tok)) == loc, f"got {fired}")

# --- 3b. new veto markers eliminate through detect_vetoes ----------------
EXPECT_VETOES = [
    # (utterance, vetoed tag, marker)
    ("saiyaara live vendaam", "live", "vendaam"),
    ("saiyaara lofi illai", "lofi", "illai"),
    ("saiyaara remix nunca", "remix", "nunca"),
]
for utt, tag, marker in EXPECT_VETOES:
    vetoes = IL.detect_vetoes(utt)
    hit = [v for v in vetoes if v["tag"] == tag and v["marker"] == marker]
    check(f"veto {tag} via '{marker}' in '{utt}'", bool(hit), f"got {vetoes}")

# --- 4. candidates stay inert ---------------------------------------------
check("candidate 'venum' fires nothing",
      IL.detect_operators("saiyaara venum") == [] and IL.detect_vetoes("saiyaara remix venum") == [])
check("candidate 'jamas' fires nothing",
      IL.detect_operators("saiyaara jamas") == [] and IL.detect_vetoes("saiyaara remix jamas") == [])
check("candidate 'venda' fires nothing",
      IL.detect_vetoes("saiyaara remix venda") == [])

# --- 5. pre-existing behaviour intact --------------------------------------
v = IL.detect_vetoes("saiyaara remix vendam")
check("vendam still vetoes remix", any(x["tag"] == "remix" and x["marker"] == "vendam" for x in v))
v = IL.detect_vetoes("saiyaara remix nahi")
check("nahi still vetoes remix", any(x["tag"] == "remix" and x["marker"] == "nahi" for x in v))
check("hero selector intact",
      IL.detect_selectors("Play the original Saiyaara from Ek Tha Tiger")[2] is True)

print()
if FAILURES:
    print(f"{len(FAILURES)} FAILURE(S)")
    sys.exit(1)
print("ALL GREEN")
