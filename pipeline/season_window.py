"""
NBA season window helpers shared by BALLDONTLIE and nba_api fetch paths.

No third-party stats API imports — safe to use from production BALLDONTLIE jobs
without loading `nba_api`.
"""
from __future__ import annotations

from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

# Historical bootstrap remains available via run_pipeline.py --bootstrap-history.
DEFAULT_BOOTSTRAP_START_SEASON_START_YEAR = 2018


def season_string(start_year: int) -> str:
    return f"{start_year}-{str(start_year + 1)[-2:]}"


def inferred_current_season_start_year(today: date | None = None) -> int:
    """
    NBA seasons usually roll in September/October and finish the following June.
    July/August still belong to the most recently completed season for update purposes.
    """
    now = today or date.today()
    return now.year if now.month >= 9 else now.year - 1


def automated_window_season_years(today: date | None = None) -> tuple[int, int]:
    """Prior season + current season (default scheduled fetch window)."""
    current = inferred_current_season_start_year(today)
    return current - 1, current


DEFAULT_START_SEASON_START_YEAR, DEFAULT_END_SEASON_START_YEAR = automated_window_season_years()


def describe_season_window(start_year: int, end_year: int) -> str:
    return ", ".join(season_string(year) for year in range(start_year, end_year + 1))
