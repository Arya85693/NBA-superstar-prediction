"""
Collect raw NBA data for the player stock market pipeline.

Writes two datasets under data/:
  - raw_season_player_stats.csv — league per-season aggregates (LeagueDashPlayerStats)
  - raw_game_logs.csv — every player-game row for pricing after each game (LeagueGameLog, player scope)
"""
from pathlib import Path

import pandas as pd
import time
from nba_api.stats.endpoints import leaguedashplayerstats, leaguegamelog

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

# Season id "2025-26" is requested with start year 2025. Bump DEFAULT_END_SEASON_START_YEAR
# each off-season so pulls stay current for a live-style pipeline.
# Default range (2018→present): ~8 seasons — enough for rolling stats / volatility without pre-modern
# NBA style or excessive API time; override collect_*(..., start_year=...) if you need deeper history.
DEFAULT_START_SEASON_START_YEAR = 2018
DEFAULT_END_SEASON_START_YEAR = 2025  # includes 2024-25, 2025-26 at current defaults


def _season_string(start_year: int) -> str:
    return f"{start_year}-{str(start_year + 1)[-2:]}"


def collect_season_player_stats(
    start_year: int = DEFAULT_START_SEASON_START_YEAR,
    end_year: int = DEFAULT_END_SEASON_START_YEAR,
) -> pd.DataFrame:
    """Per-season league player totals / per-game averages (one row per player-season)."""
    frames = []
    for year in range(start_year, end_year + 1):
        season = _season_string(year)
        print(f"Fetching season player stats for {season}...")
        try:
            data = leaguedashplayerstats.LeagueDashPlayerStats(
                season=season,
                per_mode_detailed="PerGame",
            )
            df = data.get_data_frames()[0]
            df["SEASON"] = season
            frames.append(df)
            time.sleep(1)
        except Exception as e:
            print(f"Error with season player stats {season}: {e}")

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
            try:
                data = leaguegamelog.LeagueGameLog(
                    season=season,
                    season_type_all_star=season_type,
                    player_or_team_abbreviation="P",
                )
                df = data.get_data_frames()[0]
                df["SEASON"] = season
                df["SEASON_TYPE"] = season_type
                frames.append(df)
                time.sleep(1)
            except Exception as e:
                print(f"Error with game logs {season} ({season_type}): {e}")

    if not frames:
        return pd.DataFrame()
    merged = pd.concat(frames, ignore_index=True)
    return merged.drop_duplicates(subset=["PLAYER_ID", "GAME_ID"], keep="last")


if __name__ == "__main__":
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    season_df = collect_season_player_stats()
    out_season = DATA_DIR / "raw_season_player_stats.csv"
    season_df.to_csv(out_season, index=False)
    print(f"Saved {season_df.shape} -> {out_season.relative_to(ROOT)}")

    games_df = collect_player_game_logs()
    out_games = DATA_DIR / "raw_game_logs.csv"
    games_df.to_csv(out_games, index=False)
    print(f"Saved {games_df.shape} -> {out_games.relative_to(ROOT)}")
