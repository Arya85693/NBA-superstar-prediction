"""
Projection engine — estimates a player's *expected future value* relative to
their current Fair Value, as a normalised score in ``[-1, 1]``.

Positive  => recent signals point above the player's established baseline
            (improving role / form), so the market should pay a premium.
Negative  => declining form / shrinking role, so a discount is justified.
Zero      => not enough signal, or perfectly in line with baseline.

Inputs are intentionally box-score level so this runs from the same data the
Fair Value engine already produces. Each sub-signal is reported in the result
so the Market Price explanation can attribute the move.

This module is deliberately small and pure; upgrade paths (development curves,
opponent strength, role-change detection, injury return) plug in as additional
sub-signals without changing callers.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Sequence

from player_aging import PositionGroup, age_signal as _position_age_signal

ROOT_TAG = "projection"

# --- Tunables (game-score points / minutes that map to a full-strength signal)
RECENT_GAMES = 5
LONG_GAMES = 10
W_RECENT_TREND = 0.45      # recent form vs season baseline
W_LONG_FORM = 0.30         # last-10 form vs prior-season anchor
W_MINUTES_TREND = 0.25     # opportunity (minutes) trending up/down
GS_SCALE = 8.0             # game-score delta for a ~full signal
MIN_SCALE = 8.0            # minutes delta for a ~full signal

# Position-aware development curve (see player_aging.py for research peaks).
# Weight is modest so form/minutes still dominate short-horizon projection.
AGE_WEIGHT = 0.12
AGE_SCALE_YEARS = 6.0      # years from peak to saturate the age signal


@dataclass
class GameStat:
    """Minimal per-game view the projection engine needs."""
    game_score: float
    minutes: float


@dataclass
class ProjectionResult:
    score: float                       # clamped to [-1, 1]
    signals: dict[str, float] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)


def _safe_mean(values: Sequence[float]) -> float | None:
    vals = [v for v in values if v == v]  # drop NaN
    if not vals:
        return None
    return sum(vals) / len(vals)


def _tanh_norm(delta: float, scale: float) -> float:
    """Map an unbounded delta to (-1, 1) smoothly; tanh keeps extremes bounded."""
    if scale <= 0:
        return 0.0
    return math.tanh(delta / scale)


def compute_projection(
    games: Sequence[GameStat],
    prior_season_avg_game_score: float | None = None,
    age: float | None = None,
    position_group: PositionGroup | None = None,
) -> ProjectionResult:
    """
    Build a projection score from a player's most recent games (oldest -> newest).

    Safe by construction: with no games it returns a neutral score of 0.0 so the
    Market Price engine simply leans on Fair Value.
    """
    signals: dict[str, float] = {
        "recent_trend": 0.0,
        "long_form": 0.0,
        "minutes_trend": 0.0,
        "age": 0.0,
    }
    notes: list[str] = []

    if not games:
        return ProjectionResult(score=0.0, signals=signals, notes=["no recent games"])

    gs = [g.game_score for g in games]
    mins = [g.minutes for g in games]

    season_mean_gs = _safe_mean(gs)
    recent_gs = _safe_mean(gs[-RECENT_GAMES:])
    long_gs = _safe_mean(gs[-LONG_GAMES:])

    # 1) Recent form vs the player's own season-to-date baseline.
    if recent_gs is not None and season_mean_gs is not None:
        signals["recent_trend"] = _tanh_norm(recent_gs - season_mean_gs, GS_SCALE)

    # 2) Last-10 form vs prior-season reputation anchor (reverts hype to history).
    anchor = prior_season_avg_game_score
    if long_gs is not None and anchor is not None and anchor == anchor:
        signals["long_form"] = _tanh_norm(long_gs - anchor, GS_SCALE)
    elif long_gs is not None and season_mean_gs is not None:
        # No prior season: compare long form to season baseline at half strength.
        signals["long_form"] = 0.5 * _tanh_norm(long_gs - season_mean_gs, GS_SCALE)

    # 3) Opportunity: are minutes trending up vs the season?
    season_mean_min = _safe_mean(mins)
    recent_min = _safe_mean(mins[-RECENT_GAMES:])
    if recent_min is not None and season_mean_min is not None:
        signals["minutes_trend"] = _tanh_norm(recent_min - season_mean_min, MIN_SCALE)

    # 4) Age / development curve (position-specific peak; see player_aging.py).
    if AGE_WEIGHT > 0:
        signals["age"] = _position_age_signal(
            age, position_group, scale_years=AGE_SCALE_YEARS,
        )

    raw = (
        W_RECENT_TREND * signals["recent_trend"]
        + W_LONG_FORM * signals["long_form"]
        + W_MINUTES_TREND * signals["minutes_trend"]
        + AGE_WEIGHT * signals["age"]
    )
    score = max(-1.0, min(1.0, raw))

    if signals["age"] > 0.2:
        notes.append("younger than position prime — upside to growth curve")
    elif signals["age"] < -0.2:
        notes.append("past position prime — limited growth runway")

    if signals["recent_trend"] > 0.15:
        notes.append("recent form above season average")
    elif signals["recent_trend"] < -0.15:
        notes.append("recent form below season average")
    if signals["minutes_trend"] > 0.15:
        notes.append("minutes trending up")
    elif signals["minutes_trend"] < -0.15:
        notes.append("minutes trending down")

    return ProjectionResult(score=score, signals=signals, notes=notes)
