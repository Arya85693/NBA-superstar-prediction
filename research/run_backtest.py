#!/usr/bin/env python3
"""
CLI entry point for the Hoops Stock Market research backtest framework.

Usage (from repo root):
  pip install -r requirements.txt -r research/requirements.txt
  python pipeline/run_pipeline.py --fetch-balldontlie --active   # if data missing
  python research/run_backtest.py
  python research/run_backtest.py --config research/config/default.yaml
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

RESEARCH_ROOT = Path(__file__).resolve().parent
if str(RESEARCH_ROOT) not in sys.path:
    sys.path.insert(0, str(RESEARCH_ROOT))

from backtests.runner import main  # noqa: E402


def cli() -> None:
    parser = argparse.ArgumentParser(
        description="Run historical backtest for Hoops Stock Market pricing signals",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=None,
        help="Path to YAML config (default: research/config/default.yaml)",
    )
    args = parser.parse_args()
    results = main(args.config)
    print("\n=== Backtest complete ===")
    print(f"Outputs:  {results['output_dir']}")
    print(f"Report:   {results['report_dir']}/BACKTEST_REPORT.md")
    ss = results.get("signal_summary")
    if ss is not None and not ss.empty:
        best = ss.sort_values("spearman_mean", ascending=False).iloc[0]
        print(
            f"Best signal: {best['signal_name']} "
            f"(Spearman rho={best['spearman_mean']:.4f})"
        )


if __name__ == "__main__":
    cli()
