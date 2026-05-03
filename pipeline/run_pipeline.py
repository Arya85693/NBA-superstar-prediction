"""
Run the NBA stock pipeline in the correct order (from repo root):

  python pipeline/run_pipeline.py              # use existing raw CSVs
  python pipeline/run_pipeline.py --fetch      # re-download raw from NBA API, then build
  python pipeline/run_pipeline.py --active     # also refresh data/active_players.csv

Steps: raw (optional) -> data_cleaning -> game_score -> price_engine + validate_prices.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd


def main() -> None:
    parser = argparse.ArgumentParser(description="Run cleaning through prices in order.")
    parser.add_argument(
        "--fetch",
        action="store_true",
        help="Re-download raw_season_player_stats.csv and raw_game_logs.csv (nba_api, slow).",
    )
    parser.add_argument(
        "--active",
        action="store_true",
        help="After prices, refresh data/active_players.csv (current NBA player list).",
    )
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent

    if args.fetch:
        import data_collection as dc

        dc.DATA_DIR.mkdir(parents=True, exist_ok=True)
        print("Fetching raw season player stats...")
        season_df = dc.collect_season_player_stats()
        out_season = dc.DATA_DIR / "raw_season_player_stats.csv"
        season_df.to_csv(out_season, index=False)
        print(f"Saved {season_df.shape} -> {out_season.relative_to(root)}")

        print("Fetching raw game logs...")
        games_df = dc.collect_player_game_logs()
        out_games = dc.DATA_DIR / "raw_game_logs.csv"
        games_df.to_csv(out_games, index=False)
        print(f"Saved {games_df.shape} -> {out_games.relative_to(root)}")

    import data_cleaning

    print("Cleaning season stats and game logs...")
    data_cleaning.clean_season_player_stats()
    data_cleaning.clean_game_logs()

    from game_score import DATA_DIR as GS_DIR, add_hollinger_game_score

    print("Adding Hollinger game_score...")
    gl = pd.read_csv(GS_DIR / "cleaned_game_logs.csv")
    gl = add_hollinger_game_score(gl)
    out_gs = GS_DIR / "cleaned_game_logs_with_game_score.csv"
    gl.to_csv(out_gs, index=False)
    print(f"Wrote {gl.shape} -> {out_gs.relative_to(root)}")

    import price_engine as pe

    print("Computing player_game_prices...")
    raw = pd.read_csv(pe.INPUT_CSV)
    out_df = pe.compute_prices(raw)
    keep_cols = [c for c in out_df.columns if not str(c).startswith("_")]
    out_df[keep_cols].to_csv(pe.OUTPUT_CSV, index=False)
    print(f"Wrote {out_df.shape} -> {pe.OUTPUT_CSV.relative_to(root)}")

    from validate_prices import run_validation

    if not run_validation(out_df["price_after_game"], csv_path=pe.OUTPUT_CSV):
        sys.exit(1)

    if args.active:
        import active_players

        active_players.save_active_players()

    print("Pipeline finished OK.")


if __name__ == "__main__":
    main()
