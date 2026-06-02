"""Generate research-grade Markdown reports from backtest results."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

from config import BacktestConfig


def _fmt(x: float, digits: int = 4) -> str:
    if x != x:
        return "N/A"
    return f"{x:.{digits}f}"


def _interpret_spearman(rho: float) -> str:
    if rho != rho:
        return "insufficient data"
    ar = abs(rho)
    if ar < 0.05:
        return "negligible"
    if ar < 0.15:
        return "weak"
    if ar < 0.30:
        return "moderate"
    return "strong"


def write_markdown_report(
    path: Path,
    *,
    config: BacktestConfig,
    data_meta: dict[str, str],
    signal_summary: pd.DataFrame,
    price_questions: dict[str, float],
    attribution: pd.DataFrame,
    risers: pd.DataFrame,
    misses: pd.DataFrame,
    underval: pd.DataFrame,
    overval: pd.DataFrame,
    portfolio_summary: pd.DataFrame,
    results: dict[str, Any],
) -> None:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines: list[str] = [
        "# Hoops Stock Market — Historical Backtest Report",
        "",
        f"**Generated:** {now}  ",
        f"**Config:** `{config.name}`  ",
        f"**Forward horizon:** {config.horizon.forward_games} games  ",
        f"**Evaluable observations:** {results.get('evaluable_rows', 'N/A')}",
        "",
        "## Executive summary",
        "",
    ]

    primary = results.get("primary_signal", "signal_projection")
    primary_row = signal_summary[signal_summary["signal_name"] == primary]
    if not primary_row.empty:
        rho = float(primary_row.iloc[0]["spearman_mean"])
        spread = float(primary_row.iloc[0]["quintile_spread"])
        lines.extend(
            [
                f"The primary model signal (`{primary}`) shows **{_interpret_spearman(rho)}** "
                f"cross-sectional rank correlation with forward game-score improvement "
                f"(mean Spearman ρ = {_fmt(rho)}). Top-vs-bottom quintile forward ΔGmSc spread: "
                f"**{_fmt(spread, 2)}** points.",
                "",
            ]
        )
    else:
        lines.append("_Primary signal not found in evaluation summary._\n")

    lines.extend(
        [
            "### Research questions (price level)",
            "",
            "| Question | Metric | Value |",
            "|----------|--------|-------|",
            f"| Do higher-priced players score better in the next {config.horizon.forward_games} games? "
            f"| Spearman(price, forward mean GmSc) | "
            f"{_fmt(price_questions.get('spearman_price_vs_forward_gs', float('nan')))} |",
            f"| Do price increases predict improvement? "
            f"| Spearman(momentum, forward ΔGmSc) | "
            f"{_fmt(price_questions.get('spearman_momentum_vs_forward_delta', float('nan')))} |",
            "",
            "## Data provenance",
            "",
            "| Field | Value |",
            "|-------|-------|",
        ]
    )
    for k, v in data_meta.items():
        lines.append(f"| {k} | {v} |")

    lines.extend(["", "## Signal & baseline comparison", ""])
    if signal_summary.empty:
        lines.append("_No signal evaluations._")
    else:
        cols = [
            "signal_name",
            "n_observations",
            "spearman_mean",
            "spearman_median",
            "direction_accuracy_pct",
            "quintile_spread",
        ]
        lines.append("| " + " | ".join(cols) + " |")
        lines.append("|" + "|".join(["---"] * len(cols)) + "|")
        for _, row in signal_summary.sort_values("spearman_mean", ascending=False).iterrows():
            lines.append(
                "| "
                + " | ".join(
                    [
                        str(row["signal_name"]),
                        str(int(row["n_observations"])),
                        _fmt(float(row["spearman_mean"])),
                        _fmt(float(row["spearman_median"])),
                        _fmt(float(row["direction_accuracy_pct"]), 1),
                        _fmt(float(row["quintile_spread"]), 2),
                    ]
                )
                + " |"
            )

    lines.extend(["", "## Component attribution (pricing system)", ""])
    if attribution.empty:
        lines.append("_No component breakdown._")
    else:
        for _, row in attribution.sort_values("spearman_mean", ascending=False).iterrows():
            lines.append(
                f"- **{row['signal_name']}**: ρ={_fmt(float(row['spearman_mean']))}, "
                f"quintile spread={_fmt(float(row['quintile_spread']), 2)}"
            )

    lines.extend(["", "## Portfolio simulation (long-only proxy)", ""])
    if portfolio_summary.empty:
        lines.append("_Portfolio simulation disabled or no rebalance events._")
    else:
        lines.append("| Strategy | Rebalances | Total return % | Avg period forward Δ |")
        lines.append("|----------|------------|----------------|----------------------|")
        for _, row in portfolio_summary.iterrows():
            lines.append(
                f"| {row['strategy']} | {int(row['rebalances'])} | "
                f"{_fmt(float(row['total_return_pct']), 2)}% | "
                f"{_fmt(float(row['avg_period_forward_delta']), 2)} |"
            )

    lines.extend(["", "## Top risers (model called breakout)", ""])
    lines.extend(_df_preview_md(risers, 15))

    lines.extend(["", "## Biggest misses (high signal, poor forward)", ""])
    lines.extend(_df_preview_md(misses, 15))

    lines.extend(["", "## Undervalued (low price, strong forward)", ""])
    lines.extend(_df_preview_md(underval, 10))

    lines.extend(["", "## Overvalued (high price, weak forward)", ""])
    lines.extend(_df_preview_md(overval, 10))

    lines.extend(
        [
            "",
            "## Methodology notes",
            "",
            "- Point-in-time signals: only games played **on or before** the signal date are used.",
            f"- Forward outcome: mean Hollinger game score over the next **{config.horizon.forward_games}** "
            "games (same season), minus season-to-date average at signal time.",
            "- Market layer replay uses production `compute_market_price` with **projection only** "
            "(sentiment, team context, demand neutral) — historical news/trades are not time-traveled.",
            "- Portfolio simulation is a **research proxy** (GmSc-linked P&L), not the production paper-trading engine.",
            "",
            "## Limitations",
            "",
            "- All-Star+ universe (BALLDONTLIE sample) — not full NBA.",
            "- No injury/news history in backtest; live sentiment lever untested historically.",
            "- Demand lever requires user trades; backtest defaults demand to neutral.",
            "- Correlation ≠ causation; in-sample metrics can overstate edge.",
            "",
        ]
    )

    path.write_text("\n".join(lines), encoding="utf-8")


def _df_preview_md(df: pd.DataFrame, n: int) -> list[str]:
    if df is None or df.empty:
        return ["_None in this run._"]
    preview = df.head(n)
    headers = list(preview.columns)
    out = ["| " + " | ".join(headers) + " |", "|" + "|".join(["---"] * len(headers)) + "|"]
    for _, row in preview.iterrows():
        out.append("| " + " | ".join(str(row[c])[:40] for c in headers) + " |")
    return out
