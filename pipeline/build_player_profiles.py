"""
Maintain data/player_profiles.csv (birth dates + positions) for the active roster.

Birth dates and positions are stable; age at trade/market time is computed from
birth_date in player_aging.py (see update_market_state.py). CI should NOT
refetch every player each run — commit player_profiles.csv and only sync new
roster ids when active_players.csv changes.

Manual full rebuild (rare):

    python pipeline/build_player_profiles.py --full

Incremental sync (default; used by run_pipeline --active):

    python pipeline/build_player_profiles.py
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

FIELDNAMES = ["player_id", "player_name", "position", "position_group", "birth_date"]


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
        bd = str(bd_raw).strip()[:10]
    return pos, bd


def _read_active_rows(active_csv: Path) -> list[dict[str, str]]:
    if not active_csv.is_file():
        return []
    with active_csv.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _write_profiles_csv(rows: list[dict[str, str | int]], out_csv: Path) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with out_csv.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)


def _load_existing_profile_rows(out_csv: Path) -> dict[int, dict[str, str]]:
    if not out_csv.is_file():
        return {}
    out: dict[int, dict[str, str]] = {}
    with out_csv.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            try:
                pid = int(float(row.get("player_id") or 0))
            except (TypeError, ValueError):
                continue
            if pid:
                out[pid] = dict(row)
    return out


def _needs_fetch(existing: dict[str, str] | None) -> bool:
    if not existing:
        return True
    if not str(existing.get("birth_date") or "").strip():
        return True
    return False


def sync_missing_profiles(
    *,
    active_csv: Path = ACTIVE_CSV,
    out_csv: Path = PROFILES_CSV,
    pause_seconds: float = 0.6,
) -> int:
    """
    Fetch nba_api profiles only for active players missing from player_profiles.csv.
    Returns count of newly fetched rows.
    """
    active = _read_active_rows(active_csv)
    if not active:
        print("player_profiles: no active_players.csv — skip.")
        return 0

    existing = _load_existing_profile_rows(out_csv)
    to_fetch: list[dict[str, str]] = []
    for row in active:
        try:
            pid = int(float(row.get("player_id") or 0))
        except (TypeError, ValueError):
            continue
        if not pid:
            continue
        if _needs_fetch(existing.get(pid)):
            to_fetch.append(row)

    if not to_fetch:
        print(
            f"player_profiles: {len(active)} active players, "
            f"{len(existing)} on file — nothing to fetch.",
        )
        return 0

    print(f"player_profiles: fetching {len(to_fetch)} new/missing (of {len(active)} active)…")
    for i, row in enumerate(to_fetch, start=1):
        try:
            pid = int(float(row.get("player_id") or 0))
        except (TypeError, ValueError):
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
            print(f"  [{i}/{len(to_fetch)}] {name} ({pid}): skip ({exc})")
            time.sleep(pause_seconds)
            continue

        group = normalize_position_group(position_raw) or ""
        existing[pid] = {
            "player_id": str(pid),
            "player_name": name,
            "position": position_raw,
            "position_group": group,
            "birth_date": birth_date,
        }
        if i % 10 == 0 or i == len(to_fetch):
            print(f"  [{i}/{len(to_fetch)}] fetched …")
        time.sleep(pause_seconds)

    # Merge active roster names; keep profiles for inactive ids (history/backtest).
    active_ids: set[int] = set()
    for row in active:
        try:
            active_ids.add(int(float(row.get("player_id") or 0)))
        except (TypeError, ValueError):
            continue

    merged: list[dict[str, str | int]] = []
    for pid in sorted(existing.keys()):
        rec = existing[pid]
        name = str(rec.get("player_name") or "").strip()
        if pid in active_ids:
            for a in active:
                try:
                    apid = int(float(a.get("player_id") or 0))
                except (TypeError, ValueError):
                    continue
                if apid == pid:
                    name = str(a.get("player_name") or name).strip()
                    break
        merged.append(
            {
                "player_id": pid,
                "player_name": name,
                "position": str(rec.get("position") or ""),
                "position_group": str(rec.get("position_group") or ""),
                "birth_date": str(rec.get("birth_date") or ""),
            },
        )

    _write_profiles_csv(merged, out_csv)
    try:
        shown = out_csv.relative_to(ROOT)
    except ValueError:
        shown = out_csv
    print(f"Saved {len(merged)} player profiles -> {shown}")
    return len(to_fetch)


def ensure_profiles_for_active(
    *,
    active_csv: Path = ACTIVE_CSV,
    out_csv: Path = PROFILES_CSV,
    pause_seconds: float = 0.6,
) -> Path | None:
    """Pipeline hook: incremental sync only (fast when CSV is committed)."""
    try:
        sync_missing_profiles(
            active_csv=active_csv,
            out_csv=out_csv,
            pause_seconds=pause_seconds,
        )
        return out_csv if out_csv.is_file() else None
    except FileNotFoundError as exc:
        print(f"Warning: player_profiles sync skipped ({exc}).")
        return None


def build_profiles(
    *,
    active_csv: Path = ACTIVE_CSV,
    out_csv: Path = PROFILES_CSV,
    pause_seconds: float = 0.6,
    limit: int | None = None,
    full: bool = False,
) -> Path:
    """Full rebuild of every active player (slow; manual / first-time setup)."""
    if not full:
        sync_missing_profiles(
            active_csv=active_csv,
            out_csv=out_csv,
            pause_seconds=pause_seconds,
        )
        return out_csv

    if not active_csv.is_file():
        raise FileNotFoundError(f"Missing {active_csv}; refresh with --active first.")

    active = _read_active_rows(active_csv)
    if limit is not None:
        active = active[:limit]

    rows: list[dict[str, str | int]] = []
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

    _write_profiles_csv(rows, out_csv)
    try:
        shown = out_csv.relative_to(ROOT)
    except ValueError:
        shown = out_csv
    print(f"Saved {len(rows)} player profiles (full rebuild) -> {shown}")
    return out_csv


def main() -> None:
    parser = argparse.ArgumentParser(description="Maintain player_profiles.csv.")
    parser.add_argument("--full", action="store_true", help="Refetch every active player (slow).")
    parser.add_argument("--pause", type=float, default=0.6, help="Seconds between nba_api calls.")
    parser.add_argument("--limit", type=int, default=None, help="Max players on --full (debug).")
    args = parser.parse_args()
    build_profiles(
        pause_seconds=args.pause,
        limit=args.limit,
        full=args.full,
    )


if __name__ == "__main__":
    main()
