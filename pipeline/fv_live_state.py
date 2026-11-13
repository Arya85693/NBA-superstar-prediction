"""
Per-player Fair Value state for live (in-game) pricing.

``price_engine.compute_prices`` walks every game row and carries a small amount
of state per player-season: the current price, games played, the running sum and
history of effective game scores ``g*``, and the prior-season anchor. That state
is all the engine needs to price *one more game*.

This module:

* extracts that state from ``player_game_prices.csv`` (``build_fv_states``),
* applies one more game exactly as ``compute_prices`` would (``one_step``), and
* projects a partial in-game line to a provisional Fair Value
  (``live_fair_value``).

The Supabase Edge Function ``market-tick`` ports ``one_step`` and
``live_fair_value`` to TypeScript; ``tests/test_fv_live_state.py`` pins both to
``compute_prices`` so the live price can never drift from the batch model. The
Python pipeline remains the source of truth: once the final box score is
ingested, Fair Value comes from ``compute_prices`` again.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

import pandas as pd

from price_engine import (
    ALPHA,
    PRICE_CEILING,
    PRICE_FLOOR,
    effective_alpha,
    effective_game_score,
    minutes_factor,
    played,
    prior_season_label,
    sample_confidence,
    smoothing_target_live,
)

# Fallbacks when a player has no minutes history (projection only, not Fair Value).
DEFAULT_MEAN_MINUTES = 24.0
DEFAULT_GS_PER_MINUTE = 0.30

# A player still on 0 minutes this far into a game is treated as not playing.
DNP_PROGRESS_THRESHOLD = 0.5

REGULATION_MINUTES = 48.0
PERIOD_MINUTES = 12.0


@dataclass(frozen=True)
class FvState:
    """Everything ``compute_prices`` carries per player-season, frozen after the last game."""

    player_id: int
    season: str
    last_game_date: str          # ISO date of the player's latest row (played or DNP)
    fair_value: float            # price_after_game of that row
    games_in_season: int         # played games (minutes > 0) this season
    season_eff_sum: float        # sum of g* this season
    hist_mean: float             # mean of g* this season (0 when none)
    hist_std: float              # surprise_z_score denominator (floored like _season_std)
    hist_n: int                  # number of g* values behind hist_mean / hist_std
    prior_eff: float | None      # prior-season mean g* (None when no prior season)
    prior_conf: float            # sample_confidence(prior-season games)
    mean_minutes: float          # this season's mean minutes (projection only)
    gs_per_minute: float         # this season's raw game_score per minute (projection only)

    def to_row(self) -> dict[str, Any]:
        row = asdict(self)
        for key in ("fair_value", "season_eff_sum", "hist_mean", "hist_std",
                    "prior_conf", "mean_minutes", "gs_per_minute"):
            row[key] = round(float(row[key]), 6)
        if row["prior_eff"] is not None:
            row["prior_eff"] = round(float(row["prior_eff"]), 6)
        return row


def _season_std_from(values: list[float]) -> float:
    """Same as price_engine._season_std: population std, 8 below two samples, floor 3."""
    if len(values) < 2:
        return 8.0
    mean = sum(values) / len(values)
    var = sum((g - mean) ** 2 for g in values) / len(values)
    return max(var**0.5, 3.0)


def build_fv_states(df: pd.DataFrame) -> list[FvState]:
    """
    One state per player from a ``player_game_prices`` frame (all seasons).

    Requires columns: player_id, season, game_date, minutes, game_score,
    price_after_game. Rows must already be in ``compute_prices`` order per player
    (sorted by game_date; ties keep file order).
    """
    need = {"player_id", "season", "game_date", "minutes", "game_score", "price_after_game"}
    missing = need - set(df.columns)
    if missing:
        raise KeyError(f"build_fv_states: missing columns {sorted(missing)}")

    frame = df.copy()
    frame["game_date"] = pd.to_datetime(frame["game_date"], errors="coerce")
    frame = frame.dropna(subset=["game_date", "player_id"])
    frame["season"] = frame["season"].astype(str)
    frame["minutes"] = pd.to_numeric(frame["minutes"], errors="coerce").fillna(0.0)
    frame["game_score"] = pd.to_numeric(frame["game_score"], errors="coerce").fillna(0.0)
    frame["price_after_game"] = pd.to_numeric(frame["price_after_game"], errors="coerce")
    frame = frame.sort_values(["player_id", "game_date"], kind="mergesort")

    states: list[FvState] = []
    for pid, g in frame.groupby("player_id", sort=False):
        last = g.iloc[-1]
        if pd.isna(last["price_after_game"]):
            continue
        season = str(last["season"])

        cur = g[(g["season"] == season) & (g["minutes"] > 0)]
        effs = [effective_game_score(gs, m) for gs, m in zip(cur["game_score"], cur["minutes"])]

        prev_label = prior_season_label(season)
        prior = (
            g[(g["season"] == prev_label) & (g["minutes"] > 0)] if prev_label else g.iloc[0:0]
        )
        prior_effs = [
            effective_game_score(gs, m) for gs, m in zip(prior["game_score"], prior["minutes"])
        ]

        minutes_total = float(cur["minutes"].sum())
        if minutes_total > 0:
            mean_minutes = minutes_total / len(cur)
            gs_per_minute = float(cur["game_score"].sum()) / minutes_total
        elif len(prior) and float(prior["minutes"].sum()) > 0:
            mean_minutes = float(prior["minutes"].mean())
            gs_per_minute = float(prior["game_score"].sum()) / float(prior["minutes"].sum())
        else:
            mean_minutes = DEFAULT_MEAN_MINUTES
            gs_per_minute = DEFAULT_GS_PER_MINUTE

        states.append(
            FvState(
                player_id=int(pid),
                season=season,
                last_game_date=last["game_date"].date().isoformat(),
                fair_value=float(last["price_after_game"]),
                games_in_season=len(effs),
                season_eff_sum=float(sum(effs)),
                hist_mean=float(sum(effs) / len(effs)) if effs else 0.0,
                hist_std=_season_std_from(effs),
                hist_n=len(effs),
                prior_eff=(float(sum(prior_effs) / len(prior_effs)) if prior_effs else None),
                prior_conf=sample_confidence(len(prior_effs)),
                mean_minutes=float(mean_minutes),
                gs_per_minute=float(gs_per_minute),
            )
        )
    return states


def one_step(state: FvState, game_score: float, minutes: float, alpha: float = ALPHA) -> float:
    """Fair Value after one more game, exactly as ``compute_prices`` would compute it."""
    if not played(minutes):
        return state.fair_value
    eff = effective_game_score(game_score, minutes)
    surprise_z = (eff - state.hist_mean) / state.hist_std if state.hist_n > 0 else 0.0
    games = state.games_in_season + 1
    season_avg_eff = (state.season_eff_sum + eff) / games
    alpha_eff = effective_alpha(alpha, games, surprise_z)
    target = smoothing_target_live(
        game_score, minutes, state.prior_eff, season_avg_eff,
        surprise_z=surprise_z, prior_confidence=state.prior_conf,
    )
    price = (1.0 - alpha_eff) * state.fair_value + alpha_eff * target
    return min(PRICE_CEILING, max(PRICE_FLOOR, price))


def game_progress(game_state: str, period: int, clock_seconds: float) -> float:
    """Share of regulation played: 1 when final or in overtime, else elapsed / 48 min."""
    if game_state == "post":
        return 1.0
    if game_state != "in" or period <= 0:
        return 0.0
    if period > 4:
        return 1.0
    elapsed = (period - 1) * PERIOD_MINUTES + (PERIOD_MINUTES - clock_seconds / 60.0)
    return max(0.0, min(1.0, elapsed / REGULATION_MINUTES))


@dataclass(frozen=True)
class LiveFairValue:
    fair_value: float            # provisional Fair Value to price against
    progress: float              # 0..1 share of the game played
    projected_minutes: float
    projected_game_score: float
    full_game_fair_value: float  # one_step on the projected full line


def live_fair_value(
    state: FvState,
    game_score: float,
    minutes: float,
    progress: float,
) -> LiveFairValue:
    """
    Provisional Fair Value from a partial line.

    The rest of the game is projected at the player's season rate
    (``gs_per_minute`` over ``mean_minutes × (1 − progress)`` more minutes), the
    projected full line goes through ``one_step``, and the move is scaled by
    ``progress`` so early-game noise barely moves price and a final line moves it
    exactly as the batch model will. A player on 0 minutes is not priced.
    """
    p = max(0.0, min(1.0, float(progress)))
    if minutes <= 0:
        return LiveFairValue(state.fair_value, p, 0.0, 0.0, state.fair_value)
    remaining = 0.0 if p >= 1.0 else max(0.0, state.mean_minutes * (1.0 - p))
    proj_minutes = minutes + remaining
    proj_gs = game_score + state.gs_per_minute * remaining
    full = one_step(state, proj_gs, proj_minutes)
    provisional = state.fair_value + p * (full - state.fair_value)
    return LiveFairValue(provisional, p, proj_minutes, proj_gs, full)


def minutes_factor_for(minutes: float) -> float:
    """Re-exported for parity tests with the TypeScript port."""
    return minutes_factor(minutes)
