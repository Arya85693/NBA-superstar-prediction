"""Point-in-time signal extraction (research-only; imports production engines read-only)."""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import pandas as pd

_PIPELINE = Path(__file__).resolve().parent.parent / "pipeline"
if str(_PIPELINE) not in sys.path:
    sys.path.insert(0, str(_PIPELINE))

from market_config import DEFAULT_CONFIG  # noqa: E402
from market_engine import compute_market_price  # noqa: E402
from player_aging import PlayerProfile, profile_age_on  # noqa: E402
from projection_engine import GameStat, compute_projection  # noqa: E402

from config import BacktestConfig  # noqa: E402


def _safe_pct_change(current: float, previous: float | None) -> float | None:
    if previous is None or previous <= 0 or previous != previous:
        return None
    return (current - previous) / previous


def projection_at_index(
    season_slice: pd.DataFrame,
    idx: int,
    prior_anchor: float | None,
    player_profile: PlayerProfile | None = None,
) -> tuple[float, dict[str, float]]:
    """Projection score using only games 0..idx inclusive (no lookahead)."""
    sub = season_slice.iloc[: idx + 1]
    games = [
        GameStat(game_score=float(r.game_score), minutes=float(r.minutes))
        for r in sub.itertuples(index=False)
    ]
    row = season_slice.iloc[idx]
    ref = pd.to_datetime(row["game_date"]).date()
    age = profile_age_on(player_profile, ref)
    result = compute_projection(
        games,
        prior_season_avg_game_score=prior_anchor,
        age=age,
        position_group=player_profile.position_group if player_profile else None,
    )
    return float(result.score), dict(result.signals)


def simulated_market_price(
    fair_value: float,
    projection_score: float,
    prev_market: float | None,
) -> float:
    """
    Research replay of Layer 2 with projection only (sentiment/team/demand neutral).
    Uses production compute_market_price — does not alter production code paths.
    """
    from projection_engine import ProjectionResult

    proj = ProjectionResult(score=projection_score)
    result = compute_market_price(
        fair_value=fair_value,
        prev_market_price=prev_market,
        projection=proj,
        sentiment=None,
        team_context=None,
        demand=None,
        config=DEFAULT_CONFIG,
    )
    return float(result.market_price)


def enrich_season_signals(
    season_df: pd.DataFrame,
    config: BacktestConfig,
    player_profile: PlayerProfile | None = None,
) -> pd.DataFrame:
    """
    Add signal columns to one player-season block (sorted by game_date).
    """
    g = season_df.sort_values("game_date", kind="mergesort").reset_index(drop=True)
    n = len(g)
    if n == 0:
        return g

    prior_anchor = g["prior_season_avg_game_score"].iloc[-1]
    prior_val = float(prior_anchor) if pd.notna(prior_anchor) else None

    proj_scores: list[float] = []
    proj_recent: list[float] = []
    proj_long: list[float] = []
    proj_minutes: list[float] = []
    price_mom: list[float | None] = []
    sim_market: list[float] = []
    prev_price: float | None = None
    prev_market: float | None = None

    for i in range(n):
        fv = float(g.loc[i, "price_after_game"])
        if config.signals.include_price_momentum:
            price_mom.append(_safe_pct_change(fv, prev_price))
        else:
            price_mom.append(None)
        prev_price = fv

        if config.signals.include_projection:
            score, sigs = projection_at_index(g, i, prior_val, player_profile)
            proj_scores.append(score)
            proj_recent.append(sigs.get("recent_trend", 0.0))
            proj_long.append(sigs.get("long_form", 0.0))
            proj_minutes.append(sigs.get("minutes_trend", 0.0))
        else:
            proj_scores.append(0.0)
            proj_recent.append(0.0)
            proj_long.append(0.0)
            proj_minutes.append(0.0)

        if config.signals.simulate_market_layer:
            pm = prev_market if config.signals.market_prev_carry_forward else None
            mp = simulated_market_price(fv, proj_scores[-1], pm)
            sim_market.append(mp)
            prev_market = mp
        else:
            sim_market.append(fv)

    g = g.copy()
    g["signal_fair_value"] = g["price_after_game"]
    g["signal_price_momentum_pct"] = price_mom
    g["signal_projection"] = proj_scores
    g["signal_proj_recent_trend"] = proj_recent
    g["signal_proj_long_form"] = proj_long
    g["signal_proj_minutes_trend"] = proj_minutes
    g["signal_simulated_market"] = sim_market
    g["signal_premium_pct"] = (
        (g["signal_simulated_market"] - g["signal_fair_value"]) / g["signal_fair_value"].clip(lower=1e-6)
    )
    return g


def attach_forward_outcomes(
    season_df: pd.DataFrame,
    config: BacktestConfig,
) -> pd.DataFrame:
    """Label each row with forward game_score performance (no leakage)."""
    h = config.horizon.forward_games
    min_g = config.horizon.min_season_games_before_signal
    min_min = config.horizon.min_minutes_per_forward_game

    g = season_df.sort_values("game_date", kind="mergesort").reset_index(drop=True)
    n = len(g)
    forward_mean: list[float | None] = []
    forward_delta: list[float | None] = []
    forward_price_delta: list[float | None] = []
    evaluable: list[bool] = []

    for i in range(n):
        if i < min_g - 1:
            forward_mean.append(None)
            forward_delta.append(None)
            forward_price_delta.append(None)
            evaluable.append(False)
            continue

        end = i + 1 + h
        if end > n:
            forward_mean.append(None)
            forward_delta.append(None)
            forward_price_delta.append(None)
            evaluable.append(False)
            continue

        fwd = g.iloc[i + 1 : end]
        if config.horizon.require_same_season_forward:
            if (fwd["season"] != g.loc[i, "season"]).any():
                forward_mean.append(None)
                forward_delta.append(None)
                forward_price_delta.append(None)
                evaluable.append(False)
                continue

        played = fwd[fwd["minutes"].fillna(0) >= min_min]
        if len(played) < h:
            forward_mean.append(None)
            forward_delta.append(None)
            forward_price_delta.append(None)
            evaluable.append(False)
            continue

        fmean = float(played["game_score"].mean())
        baseline = float(g.iloc[: i + 1]["game_score"].mean())
        forward_mean.append(fmean)
        forward_delta.append(fmean - baseline)
        fprice = float(played["price_after_game"].iloc[-1])
        forward_price_delta.append(fprice - float(g.loc[i, "price_after_game"]))
        evaluable.append(True)

    out = g.copy()
    out["forward_mean_game_score"] = forward_mean
    out["forward_delta_game_score"] = forward_delta
    out["forward_fair_value_delta"] = forward_price_delta
    out["evaluable"] = evaluable
    return out
