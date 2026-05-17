"""
Run the NBA stock pipeline in the correct order (from repo root):

  python pipeline/run_pipeline.py              # use existing raw CSVs
  python pipeline/run_pipeline.py --fetch      # refresh prior + current season (nba_api), then build
  python pipeline/run_pipeline.py --fetch-balldontlie  # game logs (BALLDONTLIE_API_KEY; add --active for BDL ids)
  python pipeline/run_pipeline.py --fetch-balldontlie --active  # recommended: BDL game logs + BDL active list
  python pipeline/run_pipeline.py --fetch --bootstrap-history
  python pipeline/run_pipeline.py --active     # refresh active_players (nba static, or BDL if combined with --fetch-balldontlie)

Steps: raw (optional) -> data_cleaning -> game_score -> price_engine + validate_prices.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd


def main() -> None:
    parser = argparse.ArgumentParser(description="Run cleaning through prices in order.")
    fetch_group = parser.add_mutually_exclusive_group()
    fetch_group.add_argument(
        "--fetch",
        action="store_true",
        help="Re-download raw_game_logs.csv from nba_api before rebuilding prices.",
    )
    fetch_group.add_argument(
        "--fetch-balldontlie",
        action="store_true",
        help=(
            "Re-download raw_game_logs.csv from BALLDONTLIE (All-Star+). "
            "Set BALLDONTLIE_API_KEY. Player/team/game ids are BDL ids, not stats.nba.com."
        ),
    )
    parser.add_argument(
        "--active",
        action="store_true",
        help="After prices, refresh data/active_players.csv (current NBA player list).",
    )
    parser.add_argument(
        "--start-year",
        type=int,
        help="First season start year to fetch (e.g. 2024 for 2024-25).",
    )
    parser.add_argument(
        "--end-year",
        type=int,
        help="Last season start year to fetch (e.g. 2025 for 2025-26).",
    )
    parser.add_argument(
        "--bootstrap-history",
        action="store_true",
        help="Fetch the full historical window instead of the lighter prior+current-season window.",
    )
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent

    if args.fetch or args.fetch_balldontlie:
        import season_window as sw

        if args.start_year is None and args.end_year is None:
            if args.bootstrap_history:
                start_year = sw.DEFAULT_BOOTSTRAP_START_SEASON_START_YEAR
                end_year = sw.inferred_current_season_start_year()
            else:
                start_year, end_year = sw.automated_window_season_years()
        elif args.start_year is None or args.end_year is None:
            parser.error("--start-year and --end-year must be provided together.")
        else:
            start_year, end_year = args.start_year, args.end_year

        if start_year > end_year:
            parser.error("--start-year must be <= --end-year.")

        sw.DATA_DIR.mkdir(parents=True, exist_ok=True)
        print(
            "Fetch window:",
            sw.describe_season_window(start_year, end_year),
        )

        if args.fetch_balldontlie:
            import balldontlie_fetch as bdl

            print("Fetching raw game logs (BALLDONTLIE)…")
            games_df = bdl.collect_player_game_logs(start_year=start_year, end_year=end_year)
            out_games = sw.DATA_DIR / "raw_game_logs.csv"
            games_df.to_csv(out_games, index=False)
            print(f"Saved {games_df.shape} -> {out_games.relative_to(root)}")
        else:
            import data_collection as dc

            print("Fetching raw game logs (nba_api)...")
            games_df = dc.collect_player_game_logs(start_year=start_year, end_year=end_year)
            out_games = sw.DATA_DIR / "raw_game_logs.csv"
            games_df.to_csv(out_games, index=False)
            print(f"Saved {games_df.shape} -> {out_games.relative_to(root)}")

    import data_cleaning

    print("Cleaning game logs...")
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

    if args.fetch_balldontlie and not args.active:
        print(
            "Note: active_players.csv was not refreshed. For BALLDONTLIE ids, use "
            "`--fetch-balldontlie --active` so the tradable list matches BDL player_id.",
        )

    if args.active:
        if args.fetch_balldontlie:
            import balldontlie_fetch as bdl

            bdl.save_active_players_bdl()
        else:
            import active_players

            active_players.save_active_players()

    print("Pipeline finished OK.")


if __name__ == "__main__":
    main()
