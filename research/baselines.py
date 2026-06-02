"""Baseline ranking systems for comparison against model signals."""
from __future__ import annotations

import numpy as np
import pandas as pd

from config import BacktestConfig

BASELINE_COLUMNS: dict[str, str] = {
    "prior_season_anchor": "prior_season_avg_game_score",
    "season_to_date_gs": "_season_avg_gs_at_t",
    "recent_5_game_gs": "_recent_5_gs_at_t",
    "fair_value_level": "signal_fair_value",
    "price_momentum": "signal_price_momentum_pct",
    "projection_engine": "signal_projection",
    "simulated_market": "signal_simulated_market",
    "random_control": "_random_baseline",
}


def add_baseline_columns(panel: pd.DataFrame, config: BacktestConfig) -> pd.DataFrame:
    """Derive baseline features that only use information at or before time T."""
    df = panel.sort_values(
        ["player_id", "season", "game_date"], kind="mergesort"
    ).copy()
    rng = np.random.default_rng(config.random_seed)
    key = ["player_id", "season"]
    df["_season_avg_gs_at_t"] = df.groupby(key)["game_score"].transform(
        lambda s: s.expanding().mean()
    )
    df["_recent_5_gs_at_t"] = df.groupby(key)["game_score"].transform(
        lambda s: s.rolling(5, min_periods=1).mean()
    )
    df["_random_baseline"] = rng.random(len(df))
    return df


def list_baseline_names() -> list[str]:
    return list(BASELINE_COLUMNS.keys())


def list_model_signals() -> list[str]:
    return [
        "signal_fair_value",
        "signal_price_momentum_pct",
        "signal_projection",
        "signal_simulated_market",
        "signal_proj_recent_trend",
        "signal_proj_long_form",
        "signal_proj_minutes_trend",
        "signal_premium_pct",
    ]


def signal_column(name: str) -> str:
    if name in BASELINE_COLUMNS:
        return BASELINE_COLUMNS[name]
    if name.startswith("signal_"):
        return name
    return BASELINE_COLUMNS.get(name, name)
