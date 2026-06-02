"""Rank correlation, accuracy, risers, misses, and valuation diagnostics."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy import stats


@dataclass
class SignalEvaluation:
    signal_name: str
    outcome: str
    n_observations: int
    spearman_mean: float
    spearman_std: float
    spearman_median: float
    pearson_mean: float
    direction_accuracy_pct: float
    top_quintile_forward_delta: float
    bottom_quintile_forward_delta: float
    quintile_spread: float


def _spearman(x: pd.Series, y: pd.Series) -> float | None:
    mask = x.notna() & y.notna()
    if mask.sum() < 5:
        return None
    rho, _ = stats.spearmanr(x[mask], y[mask])
    return float(rho) if rho == rho else None


def evaluate_signal_cross_section(
    panel: pd.DataFrame,
    signal_col: str,
    outcome_col: str = "forward_delta_game_score",
    date_col: str = "game_date",
) -> SignalEvaluation:
    """Average cross-sectional rank correlation by evaluation date."""
    eval_df = panel[panel["evaluable"]].copy()
    rhos: list[float] = []
    pears: list[float] = []
    directions: list[float] = []
    top_q: list[float] = []
    bot_q: list[float] = []

    for _, day_rows in eval_df.groupby(date_col, sort=False):
        if len(day_rows) < 8:
            continue
        s = day_rows[signal_col]
        o = day_rows[outcome_col]
        rho = _spearman(s, o)
        if rho is not None:
            rhos.append(rho)

        mask = s.notna() & o.notna()
        if mask.sum() >= 8:
            xs, ys = s[mask], o[mask]
            r, _ = stats.pearsonr(xs, ys)
            if r == r:
                pears.append(float(r))
            directions.append(float((np.sign(xs) == np.sign(ys)).mean()) * 100.0)

            try:
                q = pd.qcut(xs.rank(method="first"), 5, labels=False, duplicates="drop")
            except ValueError:
                continue
            fwd_by_q = ys.groupby(q).mean()
            if 0 in fwd_by_q.index and 4 in fwd_by_q.index:
                top_q.append(float(fwd_by_q[4]))
                bot_q.append(float(fwd_by_q[0]))

    n = len(eval_df)
    spread = 0.0
    if top_q and bot_q:
        spread = float(np.mean(top_q) - np.mean(bot_q))

    return SignalEvaluation(
        signal_name=signal_col,
        outcome=outcome_col,
        n_observations=n,
        spearman_mean=float(np.mean(rhos)) if rhos else float("nan"),
        spearman_std=float(np.std(rhos)) if rhos else float("nan"),
        spearman_median=float(np.median(rhos)) if rhos else float("nan"),
        pearson_mean=float(np.mean(pears)) if pears else float("nan"),
        direction_accuracy_pct=float(np.mean(directions)) if directions else float("nan"),
        top_quintile_forward_delta=float(np.mean(top_q)) if top_q else float("nan"),
        bottom_quintile_forward_delta=float(np.mean(bot_q)) if bot_q else float("nan"),
        quintile_spread=spread,
    )


def evaluate_all_signals(
    panel: pd.DataFrame,
    signal_columns: list[str],
    outcome_col: str = "forward_delta_game_score",
) -> pd.DataFrame:
    rows = []
    for col in signal_columns:
        if col not in panel.columns:
            continue
        ev = evaluate_signal_cross_section(panel, col, outcome_col=outcome_col)
        rows.append(ev.__dict__)
    return pd.DataFrame(rows)


def top_risers_analysis(
    panel: pd.DataFrame,
    signal_col: str,
    top_pct: float = 0.10,
    min_forward_delta: float = 2.0,
) -> pd.DataFrame:
    """Players in top signal decile who materially improved (breakout candidates)."""
    df = panel[panel["evaluable"]].copy()
    if df.empty:
        return df

    threshold = df[signal_col].quantile(1.0 - top_pct)
    hits = df[
        (df[signal_col] >= threshold)
        & (df["forward_delta_game_score"] >= min_forward_delta)
    ].copy()
    hits = hits.sort_values("forward_delta_game_score", ascending=False)
    cols = [
        "game_date", "player_id", "player_name", "team_abbr", "season",
        signal_col, "signal_fair_value", "forward_delta_game_score",
        "forward_mean_game_score",
    ]
    return hits[[c for c in cols if c in hits.columns]].head(100)


def biggest_misses_analysis(
    panel: pd.DataFrame,
    signal_col: str,
    top_pct: float = 0.10,
    max_forward_delta: float = -2.0,
) -> pd.DataFrame:
    """High signal but poor forward performance (false positives)."""
    df = panel[panel["evaluable"]].copy()
    if df.empty:
        return df

    threshold = df[signal_col].quantile(1.0 - top_pct)
    misses = df[
        (df[signal_col] >= threshold)
        & (df["forward_delta_game_score"] <= max_forward_delta)
    ].copy()
    misses = misses.sort_values("forward_delta_game_score", ascending=True)
    cols = [
        "game_date", "player_id", "player_name", "team_abbr", "season",
        signal_col, "signal_fair_value", "forward_delta_game_score",
    ]
    return misses[[c for c in cols if c in misses.columns]].head(100)


def undervalued_players(
    panel: pd.DataFrame,
    price_col: str = "signal_fair_value",
    bottom_price_pct: float = 0.30,
    min_forward_delta: float = 2.0,
) -> pd.DataFrame:
    """Low price tier but strong forward game_score improvement."""
    df = panel[panel["evaluable"]].copy()
    if df.empty:
        return df

    price_cut = df[price_col].quantile(bottom_price_pct)
    uv = df[
        (df[price_col] <= price_cut)
        & (df["forward_delta_game_score"] >= min_forward_delta)
    ].sort_values("forward_delta_game_score", ascending=False)
    cols = [
        "game_date", "player_id", "player_name", "team_abbr",
        price_col, "forward_delta_game_score", "signal_projection",
    ]
    return uv[[c for c in cols if c in uv.columns]].head(100)


def overvalued_players(
    panel: pd.DataFrame,
    price_col: str = "signal_fair_value",
    top_price_pct: float = 0.70,
    max_forward_delta: float = -1.5,
) -> pd.DataFrame:
    """High price tier but forward underperformance."""
    df = panel[panel["evaluable"]].copy()
    if df.empty:
        return df

    price_cut = df[price_col].quantile(top_price_pct)
    ov = df[
        (df[price_col] >= price_cut)
        & (df["forward_delta_game_score"] <= max_forward_delta)
    ].sort_values("forward_delta_game_score", ascending=True)
    cols = [
        "game_date", "player_id", "player_name", "team_abbr",
        price_col, "forward_delta_game_score", "signal_projection",
    ]
    return ov[[c for c in cols if c in ov.columns]].head(100)


def price_level_vs_forward_correlation(panel: pd.DataFrame) -> dict[str, float]:
    """Answer: do higher-priced players perform better in future games?"""
    df = panel[panel["evaluable"]]
    if df.empty:
        return {"spearman_price_vs_forward_gs": float("nan"), "n": 0}
    rho = _spearman(df["signal_fair_value"], df["forward_mean_game_score"])
    mom = _spearman(df["signal_price_momentum_pct"], df["forward_delta_game_score"])
    return {
        "spearman_price_vs_forward_gs": rho if rho is not None else float("nan"),
        "spearman_momentum_vs_forward_delta": mom if mom is not None else float("nan"),
        "n": int(len(df)),
    }


def component_attribution(panel: pd.DataFrame) -> pd.DataFrame:
    """Which projection sub-signals correlate with forward outcomes?"""
    components = [
        "signal_proj_recent_trend",
        "signal_proj_long_form",
        "signal_proj_minutes_trend",
        "signal_projection",
        "signal_premium_pct",
        "signal_fair_value",
        "signal_price_momentum_pct",
    ]
    return evaluate_all_signals(panel, [c for c in components if c in panel.columns])
