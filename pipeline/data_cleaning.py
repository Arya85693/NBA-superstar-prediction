"""
Clean raw NBA exports for modeling and downstream pricing.

Reads:
  data/raw_season_player_stats.csv
  data/raw_game_logs.csv

Writes:
  data/cleaned_season_player_stats.csv
  data/cleaned_game_logs.csv

Full history keeps everyone who appears in the raw export (no minutes cutoff). For the
live "market", restrict to current players via pipeline/active_players.py → data/active_players.csv.
"""
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"


def clean_season_player_stats() -> pd.DataFrame:
    path = DATA_DIR / "raw_season_player_stats.csv"
    if not path.exists():
        legacy = DATA_DIR / "raw_player_stats.csv"
        if legacy.exists():
            path = legacy
            print("Using legacy raw_player_stats.csv; run data_collection.py for raw_season_player_stats.csv")
    if not path.exists():
        print("Skipping season stats: no raw season CSV found (run data_collection.py).")
        return pd.DataFrame()
    df = pd.read_csv(path)

    cols_to_keep = [
        "PLAYER_ID",
        "PLAYER_NAME",
        "SEASON",
        "TEAM_ID",
        "AGE",
        "GP",
        "MIN",
        "PTS",
        "AST",
        "REB",
        "STL",
        "BLK",
        "TOV",
        "FG_PCT",
        "FG3_PCT",
        "FT_PCT",
        "PLUS_MINUS",
    ]
    df = df[cols_to_keep]
    df = df.rename(
        columns={
            "PLAYER_ID": "player_id",
            "PLAYER_NAME": "player_name",
            "SEASON": "season",
            "TEAM_ID": "team_id",
            "AGE": "age",
            "GP": "games_played",
            "MIN": "minutes_per_game",
            "PTS": "points_per_game",
            "AST": "assists_per_game",
            "REB": "rebounds_per_game",
            "STL": "steals_per_game",
            "BLK": "blocks_per_game",
            "TOV": "turnovers_per_game",
            "FG_PCT": "fg_pct",
            "FG3_PCT": "fg3_pct",
            "FT_PCT": "ft_pct",
            "PLUS_MINUS": "plus_minus",
        }
    )
    df = df.dropna()
    df = df.sort_values(by=["player_id", "season"])

    out = DATA_DIR / "cleaned_season_player_stats.csv"
    df.to_csv(out, index=False)
    print("cleaned_season_player_stats:", df.shape, "->", out.relative_to(ROOT))
    return df


def clean_game_logs() -> pd.DataFrame:
    path = DATA_DIR / "raw_game_logs.csv"
    if not path.exists():
        print("Skipping game logs: raw_game_logs.csv not found (run data_collection.py).")
        return pd.DataFrame()
    df = pd.read_csv(path)

    if "SEASON_TYPE" not in df.columns:
        df["SEASON_TYPE"] = "Regular Season"

    cols_to_keep = [
        "PLAYER_ID",
        "PLAYER_NAME",
        "TEAM_ID",
        "TEAM_ABBREVIATION",
        "GAME_ID",
        "GAME_DATE",
        "SEASON",
        "SEASON_TYPE",
        "MATCHUP",
        "WL",
        "MIN",
        "FGM",
        "FGA",
        "FG_PCT",
        "FG3M",
        "FG3A",
        "FG3_PCT",
        "FTM",
        "FTA",
        "FT_PCT",
        "OREB",
        "DREB",
        "REB",
        "PF",
        "AST",
        "STL",
        "BLK",
        "TOV",
        "PTS",
        "PLUS_MINUS",
        "FANTASY_PTS",
    ]
    df = df[cols_to_keep]
    df = df.rename(
        columns={
            "PLAYER_ID": "player_id",
            "PLAYER_NAME": "player_name",
            "TEAM_ID": "team_id",
            "TEAM_ABBREVIATION": "team_abbr",
            "GAME_ID": "game_id",
            "GAME_DATE": "game_date",
            "SEASON": "season",
            "SEASON_TYPE": "season_type",
            "MATCHUP": "matchup",
            "WL": "result",
            "MIN": "minutes",
            "FGM": "fgm",
            "FGA": "fga",
            "FG_PCT": "fg_pct",
            "FG3M": "fg3m",
            "FG3A": "fg3a",
            "FG3_PCT": "fg3_pct",
            "FTM": "ftm",
            "FTA": "fta",
            "FT_PCT": "ft_pct",
            "OREB": "offensive_rebounds",
            "DREB": "defensive_rebounds",
            "REB": "rebounds",
            "PF": "personal_fouls",
            "AST": "assists",
            "STL": "steals",
            "BLK": "blocks",
            "TOV": "turnovers",
            "PTS": "points",
            "PLUS_MINUS": "plus_minus",
            "FANTASY_PTS": "fantasy_pts",
        }
    )
    df["game_date"] = pd.to_datetime(df["game_date"], errors="coerce")
    df = df.dropna(subset=["game_date", "player_id", "game_id"])
    df = df.sort_values(by=["player_id", "game_date", "game_id"])

    out = DATA_DIR / "cleaned_game_logs.csv"
    df.to_csv(out, index=False)
    print("cleaned_game_logs:", df.shape, "->", out.relative_to(ROOT))
    return df


if __name__ == "__main__":
    clean_season_player_stats()
    clean_game_logs()
