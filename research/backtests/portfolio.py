"""Historical long-only portfolio simulation vs baselines."""
from __future__ import annotations

import pandas as pd

from config import BacktestConfig


def simulate_long_only_portfolio(
    panel: pd.DataFrame,
    signal_col: str,
    config: BacktestConfig,
) -> pd.DataFrame:
    """
    Rebalance every N league-wide "event days" (dates with evaluable rows).
    Return proxy P&L using forward_delta_game_score as performance units.
    """
    pcfg = config.portfolio
    df = panel[panel["evaluable"]].copy()
    if df.empty:
        return pd.DataFrame()

    dates = sorted(df["game_date"].unique())
    if not dates:
        return pd.DataFrame()

    capital = pcfg.initial_capital
    rows: list[dict] = []
    step = max(1, pcfg.rebalance_every_games)

    for i in range(0, len(dates), step):
        as_of = dates[i]
        day = df[df["game_date"] == as_of]
        if len(day) < pcfg.top_n_holdings:
            continue

        ranked = day.sort_values(signal_col, ascending=False, na_position="last")
        picks = ranked.head(pcfg.top_n_holdings)
        alloc = capital / pcfg.top_n_holdings
        period_return = float(picks["forward_delta_game_score"].mean())
        # Scale: treat 1 GmSc point ≈ $500 notional alpha (research proxy only)
        pnl = period_return * alloc * 0.02
        capital += pnl

        rows.append(
            {
                "rebalance_date": as_of,
                "signal": signal_col,
                "holdings": pcfg.top_n_holdings,
                "mean_forward_delta_gs": period_return,
                "period_pnl_proxy": pnl,
                "equity": capital,
            }
        )

    return pd.DataFrame(rows)


def compare_portfolio_strategies(
    panel: pd.DataFrame,
    signal_columns: list[str],
    config: BacktestConfig,
) -> pd.DataFrame:
    summaries = []
    for col in signal_columns:
        if col not in panel.columns:
            continue
        curve = simulate_long_only_portfolio(panel, col, config)
        if curve.empty:
            continue
        initial = config.portfolio.initial_capital
        final = float(curve["equity"].iloc[-1])
        summaries.append(
            {
                "strategy": col,
                "rebalances": len(curve),
                "final_equity": final,
                "total_return_pct": (final / initial - 1.0) * 100.0,
                "avg_period_forward_delta": float(curve["mean_forward_delta_gs"].mean()),
            }
        )
    if not summaries:
        return pd.DataFrame()
    return pd.DataFrame(summaries).sort_values("total_return_pct", ascending=False)
