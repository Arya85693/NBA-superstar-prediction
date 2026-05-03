"""
John Hollinger Game Score (GmSc) — the usual analytics “game score” cited as Hollinger’s.

Note: This is not an NBA league-office trademarked stat; it’s the standard box-score
composite published by Basketball Reference and widely reused.

Formula (per game):
  PTS
  + 0.4 * FGM
  - 0.7 * FGA
  - 0.4 * (FTA - FTM)
  + 0.7 * ORB
  + 0.3 * DRB
  + STL
  + 0.7 * AST
  + 0.7 * BLK
  - 0.4 * PF
  - TOV

Reference: https://www.basketball-reference.com/about/glossary.html (GmSc)

Requires cleaned_game_logs columns from data_cleaning with offensive/defensive rebounds
and personal_fouls (re-run data_cleaning.py after pulling raw_game_logs).
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"


def hollinger_game_score(
    points: pd.Series | float,
    fgm: pd.Series | float,
    fga: pd.Series | float,
    ftm: pd.Series | float,
    fta: pd.Series | float,
    offensive_rebounds: pd.Series | float,
    defensive_rebounds: pd.Series | float,
    steals: pd.Series | float,
    assists: pd.Series | float,
    blocks: pd.Series | float,
    personal_fouls: pd.Series | float,
    turnovers: pd.Series | float,
) -> pd.Series | float:
    ft_miss = fta - ftm
    return (
        points
        + 0.4 * fgm
        - 0.7 * fga
        - 0.4 * ft_miss
        + 0.7 * offensive_rebounds
        + 0.3 * defensive_rebounds
        + steals
        + 0.7 * assists
        + 0.7 * blocks
        - 0.4 * personal_fouls
        - turnovers
    )


def add_hollinger_game_score(df: pd.DataFrame, column_name: str = "game_score") -> pd.DataFrame:
    """Mutates a copy of df with a Hollinger Game Score column."""
    out = df.copy()
    out[column_name] = hollinger_game_score(
        out["points"],
        out["fgm"],
        out["fga"],
        out["ftm"],
        out["fta"],
        out["offensive_rebounds"],
        out["defensive_rebounds"],
        out["steals"],
        out["assists"],
        out["blocks"],
        out["personal_fouls"],
        out["turnovers"],
    )
    return out


if __name__ == "__main__":
    src_path = DATA_DIR / "cleaned_game_logs.csv"
    out_path = DATA_DIR / "cleaned_game_logs_with_game_score.csv"
    df = pd.read_csv(src_path)
    df = add_hollinger_game_score(df)
    df.to_csv(out_path, index=False)
    print(f"Wrote {df.shape} -> {out_path.relative_to(ROOT)}")
