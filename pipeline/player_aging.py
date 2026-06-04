"""
Position-aware NBA aging curves for the projection engine.

Research anchors (performance peaks, not salary peaks):
- MDPI Information 2024 (24 seasons, advanced metrics): Guards 29–30, Forwards 27–28,
  Centers 25–26 — https://www.mdpi.com/2078-2489/15/4/242
- Bryant empirical study: league-wide productive prime ~24–27, decline ~29
- Functional data analysis (arXiv:1403.7548): mean peak ~26.3 (position-independent)

We use MDPI position splits as primary peaks; league-wide 27.5 is the fallback when
position is unknown.
"""
from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Literal

PositionGroup = Literal["G", "F", "C"]

# Midpoints of MDPI performance peak bands (years).
PEAK_AGE_BY_GROUP: dict[PositionGroup, float] = {
    "G": 29.5,   # guards 29–30
    "F": 27.5,   # forwards 27–28
    "C": 25.5,   # centers 25–26
}
DEFAULT_PEAK_AGE = 27.5  # league-wide 27–29 band midpoint

# Finer NBA.com labels -> group (still MDPI G/F/C bands).
_POSITION_TO_GROUP: dict[str, PositionGroup] = {
    "G": "G",
    "F": "F",
    "C": "C",
    "PG": "G",
    "SG": "G",
    "SF": "F",
    "PF": "F",
    "GUARD": "G",
    "FORWARD": "F",
    "CENTER": "C",
    "POINT GUARD": "G",
    "SHOOTING GUARD": "G",
    "SMALL FORWARD": "F",
    "POWER FORWARD": "F",
    "FORWARD-CENTER": "F",
    "GUARD-FORWARD": "G",
    "FORWARD-GUARD": "G",
}


@dataclass(frozen=True)
class PlayerProfile:
    player_id: int
    birth_date: date | None
    position_group: PositionGroup | None
    position_raw: str


def normalize_position_group(raw: str | None) -> PositionGroup | None:
    """Map API position strings to G / F / C."""
    if not raw or not str(raw).strip():
        return None
    text = str(raw).strip().upper()
    if text in _POSITION_TO_GROUP:
        return _POSITION_TO_GROUP[text]
    key = text.replace("-", " ")
    if key in _POSITION_TO_GROUP:
        return _POSITION_TO_GROUP[key]
    # BDL-style combined tokens (e.g. "G-F", "F-C")
    if "-" in text:
        parts = text.split("-")
        if parts[0] in ("G", "PG", "SG"):
            return "G"
        if parts[-1] in ("C",):
            return "C"
        return "F"
    if "GUARD" in key:
        return "G"
    if "CENTER" in key and "FORWARD" not in key:
        return "C"
    if "FORWARD" in key:
        return "F"
    return None


def peak_age_for_group(group: PositionGroup | None) -> float:
    if group is None:
        return DEFAULT_PEAK_AGE
    return PEAK_AGE_BY_GROUP[group]


def parse_birth_date(raw: str | None) -> date | None:
    if not raw or not str(raw).strip():
        return None
    s = str(raw).strip()[:10]
    for fmt in ("%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def age_years_on(birth: date, ref: date) -> float:
    """Age in years on ref date (fractional, birthday-aware)."""
    years = ref.year - birth.year
    had_birthday = (ref.month, ref.day) >= (birth.month, birth.day)
    if not had_birthday:
        years -= 1
    # Fraction within the year since last birthday.
    try:
        last_bday = date(ref.year if had_birthday else ref.year - 1, birth.month, birth.day)
    except ValueError:
        last_bday = date(ref.year if had_birthday else ref.year - 1, birth.month, 28)
    try:
        next_bday = date(last_bday.year + 1, birth.month, birth.day)
    except ValueError:
        next_bday = date(last_bday.year + 1, birth.month, 28)
    span = (next_bday - last_bday).days
    if span <= 0:
        return float(years)
    frac = (ref - last_bday).days / span
    return float(years) + max(0.0, min(1.0, frac))


def age_signal(
    age: float | None,
    position_group: PositionGroup | None,
    *,
    scale_years: float = 6.0,
) -> float:
    """
    Normalised development curve in [-1, 1].

    Younger than position peak => positive (room to grow).
    Older than peak => negative (past prime).
    """
    if age is None or age != age or scale_years <= 0:
        return 0.0
    peak = peak_age_for_group(position_group)
    return max(-1.0, min(1.0, (peak - age) / scale_years))


def load_player_profiles_csv(path: Path) -> dict[int, PlayerProfile]:
    if not path.is_file():
        return {}
    out: dict[int, PlayerProfile] = {}
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                pid = int(float(row.get("player_id") or 0))
            except (TypeError, ValueError):
                continue
            if not pid:
                continue
            bd = parse_birth_date(row.get("birth_date"))
            raw_pos = str(row.get("position") or row.get("position_raw") or "").strip()
            group = normalize_position_group(
                row.get("position_group") or raw_pos,
            )
            out[pid] = PlayerProfile(
                player_id=pid,
                birth_date=bd,
                position_group=group,
                position_raw=raw_pos,
            )
    return out


def profile_age_on(profile: PlayerProfile | None, ref: date) -> float | None:
    if profile is None or profile.birth_date is None:
        return None
    return age_years_on(profile.birth_date, ref)
