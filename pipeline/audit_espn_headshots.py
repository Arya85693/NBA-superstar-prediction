"""
Audit ESPN headshot coverage for the active player list.

Uses the same public ESPN search API as the web app. Prints players with no
match (or optional broken image URL).

Usage (from repo root):
    python pipeline/audit_espn_headshots.py
    python pipeline/audit_espn_headshots.py --limit 25
    python pipeline/audit_espn_headshots.py --verify-url   # HEAD check each URL
    python pipeline/audit_espn_headshots.py --csv data/headshot_audit.csv
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
ACTIVE_CSV = DATA / "active_players.csv"
PRICES_CSV = DATA / "player_game_prices.csv"
ESPN_SEARCH = "https://site.api.espn.com/apis/common/v3/search"
USER_AGENT = "HoopsStockMarket/1.0 (headshot audit)"


def normalize_name(name: str) -> str:
    s = re.sub(r"[^a-z ]", " ", str(name).lower())
    return re.sub(r"\s+", " ", s).strip()


def load_team_by_player() -> dict[int, str]:
    if not PRICES_CSV.is_file():
        return {}
    df = pd.read_csv(
        PRICES_CSV,
        usecols=["player_id", "team_abbr", "game_date"],
        dtype={"player_id": int, "team_abbr": str, "game_date": str},
    )
    if df.empty:
        return {}
    df = df.sort_values(["player_id", "game_date"])
    latest = df.groupby("player_id", sort=False).tail(1)
    return {
        int(r.player_id): str(r.team_abbr or "").strip().upper()
        for r in latest.itertuples(index=False)
        if str(r.team_abbr or "").strip()
    }


def espn_search(player_name: str) -> list[dict]:
    qs = urllib.parse.urlencode(
        {"query": player_name.strip(), "limit": "8", "type": "player"},
    )
    req = urllib.request.Request(
        f"{ESPN_SEARCH}?{qs}",
        headers={"User-Agent": USER_AGENT},
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        payload = json.loads(resp.read())
    return payload.get("items") or []


def pick_match(
    items: list[dict],
    player_name: str,
    team_abbr: str | None,
) -> dict | None:
    target = normalize_name(player_name)
    nba = [
        item
        for item in items
        if item.get("league") == "nba"
        and (item.get("headshot") or {}).get("href")
        and normalize_name(item.get("displayName") or "") == target
    ]
    if not nba:
        return None

    abbr = (team_abbr or "").upper()
    if abbr:
        for item in nba:
            for rel in item.get("teamRelationships") or []:
                core = rel.get("core") or {}
                if str(core.get("abbreviation") or "").upper() == abbr:
                    return item
    return nba[0]


def url_ok(url: str) -> bool:
    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=15) as resp:
            return 200 <= resp.status < 400
    except Exception:
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit ESPN headshots for active players.")
    parser.add_argument("--limit", type=int, default=0, help="Max players to check (0 = all)")
    parser.add_argument("--pause", type=float, default=0.12, help="Seconds between ESPN calls")
    parser.add_argument("--verify-url", action="store_true", help="HEAD-check each headshot URL")
    parser.add_argument("--csv", type=Path, default=None, help="Write full results CSV")
    args = parser.parse_args()

    if not ACTIVE_CSV.is_file():
        print(f"Missing {ACTIVE_CSV}. Run the pipeline with --active first.", file=sys.stderr)
        return 1

    active = pd.read_csv(ACTIVE_CSV, dtype={"player_id": int, "player_name": str})
    teams = load_team_by_player()
    if args.limit > 0:
        active = active.head(args.limit)

    rows: list[dict] = []
    missing: list[dict] = []

    total = len(active)
    print(f"Checking {total} active players against ESPN search …")

    for i, row in enumerate(active.itertuples(index=False), start=1):
        pid = int(row.player_id)
        name = str(row.player_name).strip()
        team = teams.get(pid)

        status = "ok"
        url: str | None = None
        note = ""

        try:
            items = espn_search(name)
            match = pick_match(items, name, team)
            url = (match.get("headshot") or {}).get("href") if match else None
            if not url:
                status = "missing"
                note = "no ESPN NBA match"
            elif args.verify_url and not url_ok(url):
                status = "broken"
                note = "URL did not return 200"
        except Exception as exc:  # noqa: BLE001
            status = "error"
            note = str(exc)[:120]

        rec = {
            "player_id": pid,
            "player_name": name,
            "team_abbr": team or "",
            "status": status,
            "headshot_url": url or "",
            "note": note,
        }
        rows.append(rec)
        if status != "ok":
            missing.append(rec)

        if i % 25 == 0 or i == total:
            print(f"  … {i}/{total}")

        if args.pause > 0 and i < total:
            time.sleep(args.pause)

    ok = sum(1 for r in rows if r["status"] == "ok")
    print()
    print(f"OK:      {ok}/{total}")
    print(f"Missing: {sum(1 for r in rows if r['status'] == 'missing')}")
    print(f"Broken:  {sum(1 for r in rows if r['status'] == 'broken')}")
    print(f"Errors:  {sum(1 for r in rows if r['status'] == 'error')}")

    if missing:
        print("\nPlayers without a headshot:")
        for r in missing:
            team = f" ({r['team_abbr']})" if r["team_abbr"] else ""
            extra = f" — {r['note']}" if r["note"] else ""
            print(f"  {r['player_id']:>6}  {r['player_name']}{team}{extra}")
    else:
        print("\nAll checked players have an ESPN headshot URL.")

    if args.csv:
        out = pd.DataFrame(rows)
        args.csv.parent.mkdir(parents=True, exist_ok=True)
        out.to_csv(args.csv, index=False)
        print(f"\nWrote {args.csv.relative_to(ROOT)}")

    return 0 if not missing else 2


if __name__ == "__main__":
    raise SystemExit(main())
