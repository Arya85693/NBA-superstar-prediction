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
    df: pd.DataFrame | None = None,
) -> bool:
    """
    Returns True if all rows satisfy PRICE_FLOOR <= price <= PRICE_CEILING
    and (player_id, game_id, game_date) keys are unique when a frame is available.
    If ``prices`` is omitted, loads ``csv_path`` or OUTPUT_CSV.
    """
    frame = df
    series = prices
    path = csv_path or OUTPUT_CSV
    if frame is None and series is None:
        frame = pd.read_csv(path)
    if series is None:
        assert frame is not None
        series = frame["price_after_game"]

    below = int((series < PRICE_FLOOR).sum())
    above = int((series > PRICE_CEILING).sum())
    src = str(path)
    print(
        f"validate_prices: n={len(series)}  "
        f"min={series.min():.4f}  max={series.max():.4f}  "
        f"allowed=[{PRICE_FLOOR}, {PRICE_CEILING}]  "
        f"below_floor={below}  above_ceiling={above}  ({src})"
    )
    ok = below == 0 and above == 0

    if frame is not None:
        needed = {"player_id", "game_id", "game_date"}
        if needed.issubset(frame.columns):
            keys = frame.loc[:, ["player_id", "game_id", "game_date"]].copy()
            keys["game_id"] = pd.to_numeric(keys["game_id"], errors="coerce")
            keys["game_date"] = pd.to_datetime(keys["game_date"], errors="coerce").dt.strftime(
                "%Y-%m-%d"
            )
            dupes = int(keys.duplicated().sum())
            print(f"validate_prices: duplicate_pk_rows={dupes}")
            if dupes:
                ok = False

    return ok


if __name__ == "__main__":
    ok = run_validation()
    sys.exit(0 if ok else 1)
