"""
Upload data/player_game_prices.csv and data/active_players.csv to Supabase.

Requires (environment variables — never commit these):
  SUPABASE_URL              Project URL (same as NEXT_PUBLIC_SUPABASE_URL)
  SUPABASE_SERVICE_ROLE_KEY Secret service_role key (Dashboard → API Keys → legacy)

Run from repo root after the pipeline has produced CSVs:
  pip install -r requirements.txt
  python pipeline/sync_prices_to_supabase.py

Apply supabase/prices_tables.sql in the Supabase SQL Editor once before the first sync.
"""

from __future__ import annotations

import csv
import os
import sys
from pathlib import Path

import pandas as pd
from supabase import create_client

REPO_ROOT = Path(__file__).resolve().parent.parent
_PIPELINE_DIR = Path(__file__).resolve().parent
if str(_PIPELINE_DIR) not in sys.path:
    sys.path.insert(0, str(_PIPELINE_DIR))
from ticker_assign import assign_player_tickers  # noqa: E402
PRICES_CSV = REPO_ROOT / "data" / "player_game_prices.csv"
ACTIVE_CSV = REPO_ROOT / "data" / "active_players.csv"

BATCH = 1000


def _row_from_prices_csv(row: dict[str, str]) -> dict:
    def fnum(key: str, default: str = "0") -> float:
        v = (row.get(key) or default).strip()
        if v == "" or v.lower() == "nan":
            return 0.0
        try:
            return float(v)
        except ValueError:
            return 0.0

    def opt_float(key: str) -> float | None:
        v = (row.get(key) or "").strip()
        if v == "" or v.lower() == "nan":
            return None
        try:
            return float(v)
        except ValueError:
            return None

    return {
        "player_id": int(float(row["player_id"])),
        "player_name": (row.get("player_name") or "")[:512],
        "team_abbr": (row.get("team_abbr") or "")[:16],
        "game_id": str(row.get("game_id") or "")[:64],
        "game_date": str(row.get("game_date") or "")[:32],
        "season": (row.get("season") or "")[:32],
        "minutes": fnum("minutes"),
        "game_score": fnum("game_score"),
        "price_after_game": fnum("price_after_game"),
        "prior_season_avg_game_score": opt_float("prior_season_avg_game_score"),
    }


def main() -> None:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print(
            "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.",
            file=sys.stderr,
        )
        sys.exit(1)

    if not PRICES_CSV.is_file():
        print(f"Missing {PRICES_CSV}", file=sys.stderr)
        sys.exit(1)
    if not ACTIVE_CSV.is_file():
        print(f"Missing {ACTIVE_CSV}", file=sys.stderr)
        sys.exit(1)

    client = create_client(url, key)

    print("Truncating remote price tables…")
    client.rpc("truncate_prices_for_reload", {}).execute()

    batch: list[dict] = []
    total = 0
    with PRICES_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            batch.append(_row_from_prices_csv(row))
            if len(batch) >= BATCH:
                client.table("player_game_prices").insert(batch).execute()
                total += len(batch)
                print(f"  inserted {total} price rows…")
                batch.clear()
    if batch:
        client.table("player_game_prices").insert(batch).execute()
        total += len(batch)
        print(f"  inserted {total} price rows (final).")

    active_batch: list[dict] = []
    active_ids_ordered: list[int] = []
    with ACTIVE_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        for row in reader:
            if not row:
                continue
            try:
                pid = int(float(row[0]))
            except (ValueError, IndexError):
                continue
            active_ids_ordered.append(pid)
            active_batch.append({"player_id": pid})
            if len(active_batch) >= BATCH:
                client.table("active_players").insert(active_batch).execute()
                active_batch.clear()
    if active_batch:
        client.table("active_players").insert(active_batch).execute()

    active_set = set(active_ids_ordered)

    print("Computing max_dataset_season + played_player_ids + player_board …")

    def season_start_year(season: str) -> int:
        s = str(season).strip()
        if not s:
            return -1
        head = s.split("-", 1)[0]
        try:
            return int(head)
        except ValueError:
            return -1

    df = pd.read_csv(
        PRICES_CSV,
        usecols=["season", "minutes", "player_id", "player_name", "game_date", "game_id"],
        dtype={"season": str},
        low_memory=False,
    )
    df["minutes"] = pd.to_numeric(df["minutes"], errors="coerce").fillna(0.0)
    df["player_id"] = pd.to_numeric(df["player_id"], errors="coerce")
    df = df.dropna(subset=["player_id", "season"])
    seasons = df["season"].dropna().unique()
    max_season: str | None = None
    best_y = -1
    for sea in seasons:
        sea_s = str(sea).strip()
        if not sea_s:
            continue
        y = season_start_year(sea_s)
        if max_season is None or y > best_y:
            best_y = y
            max_season = sea_s
        elif y == best_y and sea_s > max_season:
            max_season = sea_s

    played_ids: list[int] = []
    if max_season is not None:
        sub = df[(df["season"] == max_season) & (df["minutes"] > 0)]
        played_ids = sorted(int(x) for x in sub["player_id"].unique().tolist())

    if max_season is not None:
        client.table("prices_snapshot_meta").update(
            {
                "max_dataset_season": max_season,
                "played_player_ids": played_ids,
            },
        ).eq("id", 1).execute()
    else:
        print("  (warning: could not infer max_dataset_season — run supabase/prices_meta_snapshot.sql and re-sync.)")

    # --- player_board: one row per active player, ticker matches web/lib/playerTicker.ts
    dft = df[df["player_id"].isin(active_set)].copy()
    dft["player_id"] = pd.to_numeric(dft["player_id"], errors="coerce")
    dft["game_id"] = pd.to_numeric(dft["game_id"], errors="coerce").fillna(0).astype("int64")
    dft["game_date"] = pd.to_datetime(dft["game_date"], errors="coerce")
    dft = dft.dropna(subset=["player_id", "game_date"])
    dft = dft.sort_values(["player_id", "game_date", "game_id"])
    latest_rows = dft.groupby("player_id", as_index=False).last()
    minimal = [
        {"player_id": int(r["player_id"]), "player_name": str(r["player_name"] or "")}
        for _, r in latest_rows.iterrows()
    ]
    tick_map = assign_player_tickers(minimal)
    board_batch: list[dict] = []
    for _, r in latest_rows.iterrows():
        pid = int(r["player_id"])
        tic = tick_map.get(pid)
        if not tic:
            continue
        board_batch.append(
            {
                "player_id": pid,
                "ticker": tic,
                "player_name": str(r["player_name"] or "")[:512],
            },
        )
        if len(board_batch) >= BATCH:
            client.table("player_board").insert(board_batch).execute()
            board_batch.clear()
    if board_batch:
        client.table("player_board").insert(board_batch).execute()
    print(f"  player_board: {len(tick_map)} tickers.")

    print("Bumping prices_snapshot_meta.revision …")
    client.rpc("bump_prices_revision", {}).execute()
    print("Done. Set PRICES_SOURCE=supabase on Vercel and redeploy.")


if __name__ == "__main__":
    main()
