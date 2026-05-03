"""
Invariant checks for player_game_prices output.

Run after price_engine: ``python pipeline/validate_prices.py`` from the repo root.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

from price_engine import OUTPUT_CSV, PRICE_CEILING, PRICE_FLOOR


def run_validation(
    prices: pd.Series | None = None,
    *,
    csv_path: Path | None = None,
) -> bool:
    """
    Returns True if all rows satisfy PRICE_FLOOR <= price <= PRICE_CEILING.
    If ``prices`` is omitted, loads ``csv_path`` or OUTPUT_CSV.
    """
    series = prices
    if series is None:
        path = csv_path or OUTPUT_CSV
        df = pd.read_csv(path)
        series = df["price_after_game"]

    below = int((series < PRICE_FLOOR).sum())
    above = int((series > PRICE_CEILING).sum())
    src = str(csv_path or OUTPUT_CSV)
    print(
        f"validate_prices: n={len(series)}  "
        f"min={series.min():.4f}  max={series.max():.4f}  "
        f"allowed=[{PRICE_FLOOR}, {PRICE_CEILING}]  "
        f"below_floor={below}  above_ceiling={above}  ({src})"
    )
    return below == 0 and above == 0


if __name__ == "__main__":
    ok = run_validation()
    sys.exit(0 if ok else 1)
