"""CHAOS_CATALOG_30 — structured mock catalog for the chaos-and-provider-mock.

HONESTY FIRST: every entry is mock data (``mock: True``). Real song titles and
artists are used as fixtures so the phonetic pipeline is exercised on authentic
phoneme patterns; artists marked ``[MOCK]`` are invented for collision variants
the real world doesn't conveniently hand us. No real audio is ever fetched.

Source of truth for the *shape* is Kabir's ``packages/polyglot-phonetic-judo/
data/chaos_catalog_30.md`` (+ ``src/catalog.ts``); this file is the Python
mirror the :9000 service serves. If they disagree, catalog.ts wins — file a
drift note in archive/build-record/services/chaos-and-provider-mock/DECISIONS.md, don't silently diverge.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

Track = Dict[str, Any]


def _t(
    id: str,
    title: str,
    artist: str,
    version: str,
    version_note: Optional[str],
    year: Optional[int],
    locales: List[str],
    popularity: int,
    upsell_risk: bool = False,
    duration_sec: Optional[int] = None,
    providers: Optional[List[str]] = None,
) -> Track:
    return {
        "id": id,
        "title": title,
        "artist": artist,
        "version": version,  # studio|live|karaoke|tribute|remix|lofi|acoustic|unplugged
        "versionNote": version_note,
        "year": year,
        "localeTags": locales,
        "popularity": popularity,  # 0-100, documented judgment, tiebreak only
        "providers": providers or ["youtube_mock", "deezer_mock"],
        "isrc": f"IN-MOCK-{id.upper().replace('-', '')}",
        "durationSec": duration_sec,
        "upsellRisk": upsell_risk,  # chaos payload: carries a fake PAYWALL_UPSELL flag
        "mock": True,
        "hookUrl": f"/audio_hooks/{id}.wav",
    }


CHAOS_CATALOG_30: List[Track] = [
    # --- Bhojpuri cluster: the flagship collision (UC-1) ---
    _t("bb-001", "Lollipop Lagelu", "Pawan Singh", "studio", "Bhojpuri Original",
       2011, ["IN-BR", "IN-UP"], 96, duration_sec=212),
    _t("bb-002", "Lollipop Lagelu", "Pawan Singh", "live", "Live at Patna",
       2015, ["IN-BR"], 41),
    _t("bb-003", "Lollipop Lagelu", "Karaoke Kings", "karaoke", "Karaoke Version",
       None, ["IN-BR"], 12),
    # --- Western "Lollipop" collisions ---
    _t("wx-001", "Lollipop", "Mika", "studio", None,
       2007, ["UK", "US"], 87),
    _t("wx-002", "Lollipop", "Lil Wayne ft. Static Major", "studio", None,
       2008, ["US"], 85),
    # --- "Raja Ji": 4 versions, one name (UC-2: the same-name standoff) ---
    _t("rj-001", "Raja Ji", "[MOCK] Anand Mohan", "studio", "Bhojpuri Original",
       None, ["IN-BR", "IN-UP"], 88),
    _t("rj-002", "Raja Ji", "[MOCK] DJ Chhotu", "remix", "90s Remix",
       None, ["IN-UP"], 52),
    _t("rj-003", "Raja Ji", "[MOCK] lofi bhojpur", "lofi", "Lo-Fi Flip",
       None, ["IN-BR"], 47),
    _t("rj-004", "Raja Ji", "[MOCK] DJ Bhojpuria", "remix", "DJ Bhojpuri Mix",
       None, ["IN-BR"], 39, upsell_risk=True),
    # --- "Tere Bina": three eras, one phrase ---
    _t("tb-001", "Tere Bina", "A.R. Rahman", "studio", "Guru 2007",
       2007, ["IN"], 90),
    _t("tb-002", "Tere Bina Zindagi Se", "Kishore Kumar, Lata Mangeshkar",
       "studio", "Aandhi 1975", 1975, ["IN"], 84),
    _t("tb-003", "Tere Bina", "[MOCK] Cafe Coverwala", "unplugged",
       "Unplugged Cover", None, ["IN"], 33),
    # --- Punjabi cluster ---
    _t("pb-001", "Kala Chashma", "Amar Arshi", "studio", "1990 Original",
       1990, ["IN-PB"], 78),
    _t("pb-002", "Kala Chashma", "Badshah, Neha Kakkar, Amar Arshi", "studio",
       "Baar Baar Dekho 2016", 2016, ["IN"], 93),
    _t("pb-003", "Mundian To Bach Ke", "Panjabi MC", "studio", "2002 Original",
       2002, ["IN-PB", "UK"], 89),
    _t("pb-004", "Mundian To Bach Ke", "Panjabi MC", "live", "Live Birmingham",
       None, ["UK"], 28),
    _t("pb-005", "Tunak Tunak Tun", "Daler Mehndi", "studio", "1998 Original",
       1998, ["IN-PB"], 91),
    # --- Hindi film cluster ---
    _t("hf-001", "Chaiyya Chaiyya", "A.R. Rahman", "studio", "Dil Se 1998",
       1998, ["IN"], 89),
    _t("hf-002", "Jai Ho", "A.R. Rahman", "studio", "Slumdog Millionaire 2008",
       2008, ["IN"], 94),
    _t("hf-003", "Mujhe Tum Yaad Aana", "[MOCK] Arijit Vibe", "studio", None,
       None, ["IN"], 61),
    # --- Latin / Spanglish cluster ---
    _t("lt-001", "Despacito", "Luis Fonsi ft. Daddy Yankee", "studio",
       "2017 Original", 2017, ["ES-PR"], 98),
    _t("lt-002", "Despacito", "Karaoke Kings", "karaoke", "Karaoke Version",
       None, ["ES"], 11, upsell_risk=True),
    _t("lt-003", "Danza Kuduro", "Don Omar ft. Lucenzo", "studio",
       "2010 Original", 2010, ["ES"], 90),
    _t("lt-004", "Gasolina", "Daddy Yankee", "studio", "2004 Original",
       2004, ["ES-PR"], 88),
    _t("lt-005", "Bailando", "Enrique Iglesias", "studio", "2014 Original",
       2014, ["ES"], 86),
    _t("lt-006", "Waka Waka (Esto es África)", "Shakira", "studio",
       "2010 Original", 2010, ["ES-CO"], 92),
    _t("lt-007", "Ai Se Eu Te Pego", "Michel Teló", "studio", "2011 Original",
       2011, ["PT-BR"], 85),
    _t("lt-008", "Taki Taki", "DJ Snake ft. Selena Gomez, Ozuna, Cardi B",
       "studio", "2018 Original", 2018, ["ES", "US"], 89),
    # --- K-pop cluster ---
    _t("kp-001", "Gangnam Style", "PSY", "studio", "2012 Original",
       2012, ["KR"], 96),
    _t("kp-002", "Dynamite", "BTS", "studio", "2020 Original",
       2020, ["KR"], 95),
]

assert len(CHAOS_CATALOG_30) == 30, f"catalog must hold 30 tracks, got {len(CHAOS_CATALOG_30)}"

BY_ID: Dict[str, Track] = {t["id"]: t for t in CHAOS_CATALOG_30}


def search(q: str, locale: Optional[str] = None, limit: int = 10) -> List[Track]:
    """Naive provider-style search: substring over title+artist, locale prior first."""
    ql = q.strip().lower()
    if not ql:
        return []
    hits = [t for t in CHAOS_CATALOG_30
            if ql in t["title"].lower() or ql in t["artist"].lower()]
    if locale:
        hits.sort(key=lambda t: (locale not in t["localeTags"], -t["popularity"]))
    else:
        hits.sort(key=lambda t: -t["popularity"])
    return hits[:limit]
