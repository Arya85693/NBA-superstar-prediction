"""
Collect raw NBA data for the player stock market pipeline.

Writes two datasets under data/:
  - raw_season_player_stats.csv — league per-season aggregates (LeagueDashPlayerStats)
  - raw_game_logs.csv — every player-game row for pricing after each game (LeagueGameLog, player scope)
"""
from __future__ import annotations

import os
import time
from datetime import date
from pathlib import Path
from typing import Callable

import pandas as pd
from nba_api.stats.endpoints import leaguedashplayerstats, leaguegamelog

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

# Default scheduled fetch window = current season + prior season.
# Historical bootstrap remains available explicitly via run_pipeline.py --bootstrap-history.
DEFAULT_BOOTSTRAP_START_SEASON_START_YEAR = 2018

NBA_API_TIMEOUT_SECONDS = int(os.environ.get("NBA_API_TIMEOUT_SECONDS", "90"))
NBA_API_MAX_ATTEMPTS = int(os.environ.get("NBA_API_MAX_ATTEMPTS", "3"))
NBA_API_REQUEST_PAUSE_SECONDS = float(os.environ.get("NBA_API_REQUEST_PAUSE_SECONDS", "1"))
NBA_API_RETRY_BACKOFF_SECONDS = float(os.environ.get("NBA_API_RETRY_BACKOFF_SECONDS", "5"))


def _season_string(start_year: int) -> str:
    return f"{start_year}-{str(start_year + 1)[-2:]}"


def inferred_current_season_start_year(today: date | None = None) -> int:
    """
    NBA seasons usually roll in September/October and finish the following June.
    July/August still belong to the most recently completed season for update purposes.
    """
    now = today or date.today()
    return now.year if now.month >= 9 else now.year - 1


def automated_window_season_years(today: date | None = None) -> tuple[int, int]:
    current = inferred_current_season_start_year(today)
    return current - 1, current


DEFAULT_START_SEASON_START_YEAR, DEFAULT_END_SEASON_START_YEAR = automated_window_season_years()


def describe_season_window(start_year: int, end_year: int) -> str:
    return ", ".join(_season_string(year) for year in range(start_year, end_year + 1))


def _fetch_with_retries(
    label: str,
    factory: Callable[[int], pd.DataFrame],
) -> pd.DataFrame | None:
    for attempt in range(1, NBA_API_MAX_ATTEMPTS + 1):
        try:
            df = factory(NBA_API_TIMEOUT_SECONDS)
            print(f"Fetched {label}: {df.shape}")
            time.sleep(NBA_API_REQUEST_PAUSE_SECONDS)
            return df
        except Exception as e:
            print(
                f"Error with {label} (attempt {attempt}/{NBA_API_MAX_ATTEMPTS}): {e}",
            )
            if attempt < NBA_API_MAX_ATTEMPTS:
                sleep_s = NBA_API_RETRY_BACKOFF_SECONDS * attempt
                print(f"Retrying {label} in {sleep_s:.0f}s...")
                time.sleep(sleep_s)
    return None


def collect_season_player_stats(
    start_year: int = DEFAULT_START_SEASON_START_YEAR,
    end_year: int = DEFAULT_END_SEASON_START_YEAR,
) -> pd.DataFrame:
    """Per-season league player totals / per-game averages (one row per player-season)."""
    frames = []
    for year in range(start_year, end_year + 1):
        season = _season_string(year)
        print(f"Fetching season player stats for {season}...")
        df = _fetch_with_retries(
            f"season player stats {season}",
            lambda timeout: leaguedashplayerstats.LeagueDashPlayerStats(
                season=season,
                per_mode_detailed="PerGame",
                timeout=timeout,
            ).get_data_frames()[0],
        )
        if df is None or df.empty:
            continue
        df["SEASON"] = season
        frames.append(df)

    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


def collect_player_game_logs(
    start_year: int = DEFAULT_START_SEASON_START_YEAR,
    end_year: int = DEFAULT_END_SEASON_START_YEAR,
) -> pd.DataFrame:
    """Every regular-season and playoff appearance (one row per player per game)."""
    frames = []
    season_types = ("Regular Season", "Playoffs")
    for year in range(start_year, end_year + 1):
        season = _season_string(year)
        for season_type in season_types:
            print(f"Fetching player game logs for {season} ({season_type})...")
            df = _fetch_with_retries(
                f"game logs {season} ({season_type})",
                lambda timeout: leaguegamelog.LeagueGameLog(
                    season=season,
                    season_type_all_star=season_type,
                    player_or_team_abbreviation="P",
                    timeout=timeout,
                ).get_data_frames()[0],
            )
            if df is None or df.empty:
                continue
            df["SEASON"] = season
            df["SEASON_TYPE"] = season_type
            frames.append(df)

    if not frames:
        return pd.DataFrame()
    merged = pd.concat(frames, ignore_index=True)
    return merged.drop_duplicates(
        subset=["PLAYER_ID", "GAME_ID", "SEASON_TYPE"],
        keep="last",
    )


if __name__ == "__main__":
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    print(
        "Default fetch window:",
        describe_season_window(
            DEFAULT_START_SEASON_START_YEAR,
            DEFAULT_END_SEASON_START_YEAR,
        ),
    )

    season_df = collect_season_player_stats()
    out_season = DATA_DIR / "raw_season_player_stats.csv"
    season_df.to_csv(out_season, index=False)
    print(f"Saved {season_df.shape} -> {out_season.relative_to(ROOT)}")

    games_df = collect_player_game_logs()
    out_games = DATA_DIR / "raw_game_logs.csv"
    games_df.to_csv(out_games, index=False)
    print(f"Saved {games_df.shape} -> {out_games.relative_to(ROOT)}")
