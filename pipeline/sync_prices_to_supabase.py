"""
Upload data/player_game_prices.csv and data/active_players.csv to Supabase.

Requires (environment variables — never commit these):
  SUPABASE_URL              Project URL (same as NEXT_PUBLIC_SUPABASE_URL)
  SUPABASE_SERVICE_ROLE_KEY Secret service_role key (Dashboard → API Keys → legacy)

Run from repo root after the pipeline has produced CSVs:
  pip install -r requirements.txt
  python pipeline/sync_prices_to_supabase.py [--defer-revision-bump]

``--defer-revision-bump`` skips ``bump_prices_revision`` so the market step can
publish the Fair Value and Market Price revisions together (CI does this).

Incremental by default when the ESPN fetch left ``data/sync_window.json``: only
rows with ``game_date >= since`` (widened to at least the last
``MIN_WINDOW_DAYS`` days) are upserted, then stale rows inside that window are
deleted, so the site never sees an empty or half-loaded table. Falls back to the
full truncate-and-reload when the marker is missing or says ``full``, when
``--full`` is passed, or when the row count before the window differs between
Supabase and the local file (an earlier sync didn't finish).

Apply supabase/prices_tables.sql in the Supabase SQL Editor once before the first sync.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import httpx
import pandas as pd
from supabase import create_client

REPO_ROOT = Path(__file__).resolve().parent.parent
_PIPELINE_DIR = Path(__file__).resolve().parent
if str(_PIPELINE_DIR) not in sys.path:
    sys.path.insert(0, str(_PIPELINE_DIR))
from ticker_assign import assign_player_tickers  # noqa: E402
PRICES_CSV = REPO_ROOT / "data" / "player_game_prices.csv"
ACTIVE_CSV = REPO_ROOT / "data" / "active_players.csv"
SYNC_WINDOW_JSON = REPO_ROOT / "data" / "sync_window.json"

BATCH = 1000
RETRY_ATTEMPTS = 5
# Incremental syncs always re-send at least this many recent days (cheap: a few
# thousand rows) so a missed run or ESPN stat correction is healed automatically.
MIN_WINDOW_DAYS = 7
PRICE_PK = ("player_id", "game_id", "game_date")


def _execute(request, what: str):
    """
    Run a Supabase request, retrying dropped connections with backoff.

    Every call in this script is safe to repeat (truncate, upserts, meta
    update, revision bump), and a failure after truncate leaves the site empty.
    """
    for attempt in range(1, RETRY_ATTEMPTS + 1):
        try:
            return request.execute()
        except httpx.TransportError as exc:
            if attempt == RETRY_ATTEMPTS:
                raise
            wait = 2**attempt
            print(
                f"  {what}: {type(exc).__name__} ({exc}); "
                f"retry {attempt}/{RETRY_ATTEMPTS - 1} in {wait}s…",
            )
            time.sleep(wait)
    raise AssertionError("unreachable")


def _load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        if not key:
            continue
        os.environ.setdefault(key, value.strip())


def _load_supabase_env_fallbacks() -> None:
    _load_env_file(REPO_ROOT / "web" / ".env.local")

    if not os.environ.get("SUPABASE_URL"):
        public_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        if public_url:
            os.environ["SUPABASE_URL"] = public_url


def _normalize_game_id(raw: str) -> str:
    s = (raw or "").strip()
    if not s or s.lower() == "nan":
        return ""
    try:
        return str(int(float(s)))
    except ValueError:
        return s[:64]


def _normalize_game_date(raw: str) -> str:
    """Match Postgres `date` — collapse datetime strings to YYYY-MM-DD."""
    s = (raw or "").strip()
    if not s or s.lower() == "nan":
        return ""
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        return s[:10]
    ts = pd.to_datetime(s, errors="coerce")
    if pd.isna(ts):
        return s[:32]
    return ts.strftime("%Y-%m-%d")


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
        "game_id": _normalize_game_id(row.get("game_id") or ""),
        "game_date": _normalize_game_date(row.get("game_date") or ""),
        "season": (row.get("season") or "")[:32],
        "minutes": fnum("minutes"),
        "game_score": fnum("game_score"),
        "price_after_game": fnum("price_after_game"),
        "prior_season_avg_game_score": opt_float("prior_season_avg_game_score"),
    }


def _insert_price_batches(client, rows: list[dict]) -> int:
    """Insert price rows in batches. Caller must pass PK-unique rows."""
    total = 0
    for i in range(0, len(rows), BATCH):
        batch = rows[i : i + BATCH]
        _execute(
            client.table("player_game_prices").upsert(
                batch,
                on_conflict="player_id,game_id,game_date",
            ),
            f"price rows {i}-{i + len(batch)}",
        )
        total += len(batch)
        print(f"  upserted {total} price rows…")
    return total


def load_sync_window(path: Path, today: date | None = None) -> tuple[str | None, str]:
    """
    (since ISO date, reason) for an incremental sync, or (None, reason) for a full one.
    ``since`` is widened to at least ``MIN_WINDOW_DAYS`` before ``today``.
    """
    if not path.is_file():
        return None, "no sync window from the fetch step"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        return None, f"unreadable sync window ({exc})"
    if payload.get("mode") != "incremental":
        return None, str(payload.get("reason") or "fetch requested a full reload")
    try:
        since = date.fromisoformat(str(payload["since"]))
    except (KeyError, ValueError):
        return None, "sync window without a valid 'since'"
    floor = (today or datetime.now(timezone.utc).date()) - timedelta(days=MIN_WINDOW_DAYS)
    return min(since, floor).isoformat(), str(payload.get("reason") or "incremental fetch")


def plan_incremental(
    price_rows: list[dict],
    remote_keys: set[tuple[int, str, str]],
    since: str,
) -> tuple[list[dict], set[tuple[int, str, str]]]:
    """Rows to upsert (game_date >= since) and remote keys in that window to delete."""
    window = [r for r in price_rows if r["game_date"] >= since]
    local_keys = {(r["player_id"], r["game_id"], r["game_date"]) for r in window}
    stale = {k for k in remote_keys if k[2] >= since and k not in local_keys}
    return window, stale


def _remote_count_before(client, since: str) -> int:
    resp = _execute(
        client.table("player_game_prices")
        .select("player_id", count="exact")
        .lt("game_date", since)
        .limit(1),
        "count rows before window",
    )
    return int(resp.count or 0)


def _remote_window_keys(client, since: str) -> set[tuple[int, str, str]]:
    keys: set[tuple[int, str, str]] = set()
    start = 0
    while True:
        resp = _execute(
            client.table("player_game_prices")
            .select("player_id,game_id,game_date")
            .gte("game_date", since)
            .order("player_id")
            .order("game_date")
            .order("game_id")
            .range(start, start + BATCH - 1),
            "read window keys",
        )
        data = resp.data or []
        for r in data:
            keys.add((int(r["player_id"]), str(r["game_id"]), str(r["game_date"])[:10]))
        if len(data) < BATCH:
            return keys
        start += BATCH


def _delete_price_keys(client, keys: set[tuple[int, str, str]]) -> None:
    for pid, gid, gdate in sorted(keys):
        _execute(
            client.table("player_game_prices")
            .delete()
            .eq("player_id", pid)
            .eq("game_id", gid)
            .eq("game_date", gdate),
            f"delete stale row {pid}/{gid}/{gdate}",
        )


def _prune_table(client, table: str, keep_ids: set[int]) -> int:
    """Delete rows whose player_id is not in ``keep_ids`` (after the new rows are in)."""
    resp = _execute(client.table(table).select("player_id").limit(10000), f"read {table} ids")
    extra = sorted({int(r["player_id"]) for r in (resp.data or [])} - keep_ids)
    for i in range(0, len(extra), 200):
        _execute(
            client.table(table).delete().in_("player_id", extra[i : i + 200]),
            f"prune {table}",
        )
    return len(extra)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument(
        "--defer-revision-bump",
        action="store_true",
        help="Leave prices_snapshot_meta.revision for update_market_state.py to publish.",
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help="Truncate and reload every table even when an incremental window is available.",
    )
    args = parser.parse_args()

    _load_supabase_env_fallbacks()
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print(
            "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment or web/.env.local.",
            file=sys.stderr,
        )
        sys.exit(1)

    if not PRICES_CSV.is_file():
        print(f"Missing {PRICES_CSV}", file=sys.stderr)
        sys.exit(1)
    if not ACTIVE_CSV.is_file():
        print(f"Missing {ACTIVE_CSV}", file=sys.stderr)
        sys.exit(1)

    price_rows: list[dict] = []
    price_ids: set[int] = set()
    seen_keys: set[tuple[int, str, str]] = set()
    skipped_dupes = 0
    skipped_invalid = 0
    with PRICES_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            parsed = _row_from_prices_csv(row)
            if not parsed["game_id"] or not parsed["game_date"]:
                skipped_invalid += 1
                continue
            pk = (parsed["player_id"], parsed["game_id"], parsed["game_date"])
            if pk in seen_keys:
                skipped_dupes += 1
                continue
            seen_keys.add(pk)
            price_rows.append(parsed)
            price_ids.add(parsed["player_id"])

    nonpositive = sum(1 for r in price_rows if r["price_after_game"] <= 0)
    if nonpositive:
        print(
            f"Refusing to sync: {nonpositive} rows have a missing or non-positive "
            "Fair Value. The remote market was left unchanged.",
            file=sys.stderr,
        )
        sys.exit(1)

    active_ids_ordered: list[int] = []
    seen_active: set[int] = set()
    with ACTIVE_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        next(reader, None)
        for row in reader:
            if not row:
                continue
            try:
                pid = int(float(row[0]))
            except (ValueError, IndexError):
                continue
            if pid in seen_active:
                continue
            seen_active.add(pid)
            active_ids_ordered.append(pid)

    active_set = set(active_ids_ordered)
    overlap = price_ids & active_set
    if price_ids and active_set and not overlap:
        print(
            "Refusing to sync: active roster and price file share no player ids "
            f"({len(active_set)} active, {len(price_ids)} priced). "
            "The remote market was left unchanged.",
            file=sys.stderr,
        )
        sys.exit(1)
    print(f"Active roster matches {len(overlap)} players in the price file.")

    client = create_client(url, key)

    if skipped_dupes or skipped_invalid:
        print(
            f"  skipped {skipped_dupes} duplicate PK rows, "
            f"{skipped_invalid} invalid game_id/date rows"
        )

    since, reason = (None, "--full") if args.full else load_sync_window(SYNC_WINDOW_JSON)
    if since is not None:
        local_before = sum(1 for r in price_rows if r["game_date"] < since)
        remote_before = _remote_count_before(client, since)
        if remote_before != local_before:
            print(
                f"Rows before {since} differ (Supabase {remote_before}, local {local_before}); "
                "doing a full reload.",
            )
            since, reason = None, "row count mismatch before the window"

    incremental = since is not None
    if incremental:
        print(f"Incremental sync from {since} ({reason}).")
        window_rows, stale = plan_incremental(price_rows, _remote_window_keys(client, since), since)
        total = _insert_price_batches(client, window_rows)
        _delete_price_keys(client, stale)
        print(f"  upserted {total} price rows, removed {len(stale)} stale rows (final).")
    else:
        print(f"Full reload ({reason}). Truncating remote price tables…")
        _execute(client.rpc("truncate_prices_for_reload", {}), "truncate")
        total = _insert_price_batches(client, price_rows)
        print(f"  upserted {total} price rows (final).")

    active_batch: list[dict] = []
    for pid in active_ids_ordered:
        active_batch.append({"player_id": pid})
        if len(active_batch) >= BATCH:
            _execute(
                client.table("active_players").upsert(active_batch, on_conflict="player_id"),
                "active_players",
            )
            active_batch.clear()
    if active_batch:
        _execute(
            client.table("active_players").upsert(active_batch, on_conflict="player_id"),
            "active_players",
        )
    if incremental:
        pruned = _prune_table(client, "active_players", active_set)
        if pruned:
            print(f"  active_players: removed {pruned} players no longer active.")

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
        _execute(
            client.table("prices_snapshot_meta").update(
                {
                    "max_dataset_season": max_season,
                    "played_player_ids": played_ids,
                },
            ).eq("id", 1),
            "prices_snapshot_meta",
        )
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
            _execute(
                client.table("player_board").upsert(board_batch, on_conflict="player_id"),
                "player_board",
            )
            board_batch.clear()
    if board_batch:
        _execute(
            client.table("player_board").upsert(board_batch, on_conflict="player_id"),
            "player_board",
        )
    if incremental:
        _prune_table(client, "player_board", set(tick_map))
    print(f"  player_board: {len(tick_map)} tickers.")

    if args.defer_revision_bump:
        print("Deferring prices revision bump to update_market_state.py.")
        return
    print("Bumping prices_snapshot_meta.revision …")
    _execute(client.rpc("bump_prices_revision", {}), "bump_prices_revision")
    print("Done. Set PRICES_SOURCE=supabase on Vercel and redeploy.")


if __name__ == "__main__":
    main()
