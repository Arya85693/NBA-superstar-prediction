"""
Build data/player_profiles.csv (birth dates + positions) for active roster.

Uses stats.nba.com player ids (same numeric ids as BALLDONTLIE in this project).
Run after refreshing active_players.csv:

    python pipeline/build_player_profiles.py

Optional: --pause SECONDS between nba_api calls (default 0.6).
"""
from __future__ import annotations

import argparse
import csv
import sys
import time
from pathlib import Path

_PIPELINE = Path(__file__).resolve().parent
if str(_PIPELINE) not in sys.path:
    sys.path.insert(0, str(_PIPELINE))

from player_aging import (  # noqa: E402
    normalize_position_group,
    parse_birth_date,
)

ROOT = _PIPELINE.parent
DATA_DIR = ROOT / "data"
ACTIVE_CSV = DATA_DIR / "active_players.csv"
PROFILES_CSV = DATA_DIR / "player_profiles.csv"


def _fetch_nba_profile(player_id: int) -> tuple[str, str | None]:
    from nba_api.stats.endpoints import commonplayerinfo

    info = commonplayerinfo.CommonPlayerInfo(player_id=player_id)
    df = info.get_data_frames()[0]
    if df.empty:
        return "", None
    row = df.iloc[0]
    pos = str(row.get("POSITION") or "").strip()
    bd_raw = row.get("BIRTHDATE")
    bd = None
    if bd_raw is not None and str(bd_raw).strip():
        bd = str(bd_raw).strip()[:10]  # 2004-01-04T00:00:00 -> 2004-01-04
    return pos, bd


def build_profiles(
    *,
    active_csv: Path = ACTIVE_CSV,
    out_csv: Path = PROFILES_CSV,
    pause_seconds: float = 0.6,
    limit: int | None = None,
) -> Path:
    if not active_csv.is_file():
        raise FileNotFoundError(f"Missing {active_csv}; refresh with --active first.")

    rows: list[dict[str, str | int]] = []
    with active_csv.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        active = list(reader)

    if limit is not None:
        active = active[:limit]

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    total = len(active)
    for i, row in enumerate(active, start=1):
        try:
            pid = int(float(row.get("player_id") or 0))
        except (TypeError, ValueError):
            continue
        if not pid:
            continue
        name = str(row.get("player_name") or "").strip()
        position_raw = ""
        birth_date = ""
        try:
            position_raw, bd = _fetch_nba_profile(pid)
            if bd:
                parsed = parse_birth_date(bd)
                birth_date = parsed.isoformat() if parsed else bd
        except Exception as exc:
            print(f"  [{i}/{total}] {name} ({pid}): skip ({exc})")
            time.sleep(pause_seconds)
            continue

        group = normalize_position_group(position_raw) or ""
        rows.append(
            {
                "player_id": pid,
                "player_name": name,
                "position": position_raw,
                "position_group": group,
                "birth_date": birth_date,
            },
        )
        if i % 25 == 0 or i == total:
            print(f"  [{i}/{total}] profiles fetched …")
        time.sleep(pause_seconds)

    fieldnames = ["player_id", "player_name", "position", "position_group", "birth_date"]
    with out_csv.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Saved {len(rows)} player profiles -> {out_csv.relative_to(ROOT)}")
    return out_csv


def main() -> None:
    parser = argparse.ArgumentParser(description="Build player_profiles.csv from nba_api.")
    parser.add_argument("--pause", type=float, default=0.6, help="Seconds between API calls.")
    parser.add_argument("--limit", type=int, default=None, help="Max players (debug).")
    args = parser.parse_args()
    build_profiles(pause_seconds=args.pause, limit=args.limit)


if __name__ == "__main__":
    main()
