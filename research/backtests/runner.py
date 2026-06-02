"""
Historical backtest runner — builds point-in-time panel and runs all analyses.
"""
from __future__ import annotations

import json
import sys
from dataclasses import asdict
from pathlib import Path
from typing import Any

import pandas as pd

RESEARCH_ROOT = Path(__file__).resolve().parent.parent
if str(RESEARCH_ROOT) not in sys.path:
    sys.path.insert(0, str(RESEARCH_ROOT))

from analysis.metrics import (  # noqa: E402
    biggest_misses_analysis,
    component_attribution,
    evaluate_all_signals,
    overvalued_players,
    price_level_vs_forward_correlation,
    top_risers_analysis,
    undervalued_players,
)
from baselines import (  # noqa: E402
    add_baseline_columns,
    list_baseline_names,
    list_model_signals,
    signal_column,
)
from config import BacktestConfig, load_config  # noqa: E402
from data_loader import load_evaluation_frame  # noqa: E402
from signals import attach_forward_outcomes, enrich_season_signals  # noqa: E402

from backtests.portfolio import compare_portfolio_strategies  # noqa: E402


def build_panel(raw: pd.DataFrame, config: BacktestConfig) -> pd.DataFrame:
    """Full evaluation panel with signals, baselines, and forward labels."""
    chunks: list[pd.DataFrame] = []

    for (_, season), season_group in raw.groupby(["player_id", "season"], sort=False):
        if len(season_group) < config.universe.min_games_per_player_season:
            continue
        enriched = enrich_season_signals(season_group, config)
        labeled = attach_forward_outcomes(enriched, config)
        chunks.append(labeled)

    if not chunks:
        return pd.DataFrame()

    panel = pd.concat(chunks, ignore_index=True)
    panel = add_baseline_columns(panel, config)
    return panel


def run_backtest(config: BacktestConfig) -> dict[str, Any]:
    """Execute full research pipeline; write artifacts to outputs/ and reports/."""
    out_dir = config.output_dir()
    report_dir = config.reports_dir()
    out_dir.mkdir(parents=True, exist_ok=True)
    report_dir.mkdir(parents=True, exist_ok=True)

    raw, data_meta = load_evaluation_frame(config)
    panel = build_panel(raw, config)

    if panel.empty:
        raise RuntimeError(
            "Backtest panel is empty. Check season filters, min_games_per_player_season, "
            "and that price/game data exists."
        )

    eval_panel = panel[panel["evaluable"]].copy()
    primary_signal = "signal_projection"
    if config.signals.simulate_market_layer:
        primary_signal = "signal_simulated_market"

    baseline_cols = [signal_column(b) for b in list_baseline_names()]
    model_cols = [c for c in list_model_signals() if c in panel.columns]
    all_signal_cols = list(dict.fromkeys(baseline_cols + model_cols))

    signal_summary = evaluate_all_signals(eval_panel, all_signal_cols)
    price_questions = price_level_vs_forward_correlation(eval_panel)
    attribution = component_attribution(eval_panel)

    risers = top_risers_analysis(eval_panel, primary_signal)
    misses = biggest_misses_analysis(eval_panel, primary_signal)
    underval = undervalued_players(eval_panel)
    overval = overvalued_players(eval_panel)

    portfolio_summary = pd.DataFrame()
    if config.portfolio.enabled:
        portfolio_summary = compare_portfolio_strategies(
            eval_panel,
            all_signal_cols[:12],
            config,
        )

    results: dict[str, Any] = {
        "config_name": config.name,
        "data_meta": data_meta,
        "panel_rows": len(panel),
        "evaluable_rows": len(eval_panel),
        "price_level_questions": price_questions,
        "primary_signal": primary_signal,
    }

    if config.outputs.write_csv:
        panel.to_csv(out_dir / "evaluation_panel.csv", index=False)
        signal_summary.to_csv(out_dir / "signal_evaluation_summary.csv", index=False)
        attribution.to_csv(out_dir / "component_attribution.csv", index=False)
        risers.to_csv(out_dir / "top_risers.csv", index=False)
        misses.to_csv(out_dir / "biggest_misses.csv", index=False)
        underval.to_csv(out_dir / "undervalued_players.csv", index=False)
        overval.to_csv(out_dir / "overvalued_players.csv", index=False)
        if not portfolio_summary.empty:
            portfolio_summary.to_csv(out_dir / "portfolio_simulation_summary.csv", index=False)
        with (out_dir / "run_metadata.json").open("w", encoding="utf-8") as f:
            json.dump(
                {
                    **results,
                    "horizon_forward_games": config.horizon.forward_games,
                },
                f,
                indent=2,
                default=str,
            )

    if config.outputs.write_markdown:
        from analysis.reporting import write_markdown_report  # noqa: E402

        write_markdown_report(
            report_dir / "BACKTEST_REPORT.md",
            config=config,
            data_meta=data_meta,
            signal_summary=signal_summary,
            price_questions=price_questions,
            attribution=attribution,
            risers=risers,
            misses=misses,
            underval=underval,
            overval=overval,
            portfolio_summary=portfolio_summary,
            results=results,
        )

    if config.outputs.write_plots:
        try:
            from analysis.visualize import generate_plots  # noqa: E402

            generate_plots(eval_panel, signal_summary, out_dir)
        except ImportError as e:
            results["plot_warning"] = str(e)

    results["signal_summary"] = signal_summary
    results["portfolio_summary"] = portfolio_summary
    results["output_dir"] = str(out_dir)
    results["report_dir"] = str(report_dir)
    return results


def main(config_path: Path | None = None) -> dict[str, Any]:
    config = load_config(config_path)
    if not config.outputs.run_id:
        from config import _default_run_id  # noqa: E402

        config.outputs.run_id = _default_run_id()
    return run_backtest(config)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run Hoops Stock Market historical backtest")
    parser.add_argument("--config", type=Path, default=None, help="YAML config path")
    args = parser.parse_args()
    res = main(args.config)
    print(f"Done. Outputs: {res['output_dir']}")
    print(f"Report: {res['report_dir']}/BACKTEST_REPORT.md")
