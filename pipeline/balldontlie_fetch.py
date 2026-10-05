"""
Fetch per-game player box scores from BALLDONTLIE and write data/raw_game_logs.csv
in the same column layout as nba_api LeagueGameLog (for data_cleaning.clean_game_logs).

Requirements
------------
- **All-Star tier or higher** for `GET /nba/v1/stats` (game player stats). Free tier does
  not include this endpoint.
- `BALLDONTLIE_API_KEY` in the environment (GitHub Actions: repository secret).

Important
---------
- `PLAYER_ID`, `TEAM_ID`, and `GAME_ID` on a fresh BALLDONTLIE pull are BALLDONTLIE
  ids, not stats.nba.com ids. Cached raw logs may still use the older NBA.com ids.
  `--fetch-balldontlie --active` rewrites the roster (and any newly fetched rows)
  onto the player ids already in the price file, matched by name, so the market
  join is not empty.

Environment
-----------
- `BALLDONTLIE_API_KEY` — required.
- `BALLDONTLIE_BASE_URL` — default `https://api.balldontlie.io`.
- `BALLDONTLIE_REQUEST_PAUSE_SECONDS` — pause between HTTP calls (default `1.05` for
  All-Star ~60 req/min; increase if you see 429).
- `BALLDONTLIE_PER_PAGE` — max 100 (default `100`).

API reference: https://nba.balldontlie.io/
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

import pandas as pd

import season_window as sw

ROOT = sw.ROOT
DATA_DIR = sw.DATA_DIR


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _api_key() -> str:
    key = (os.environ.get("BALLDONTLIE_API_KEY") or "").strip()
    if not key:
        raise RuntimeError(
            "Set BALLDONTLIE_API_KEY (All-Star+ required for game player stats).",
        )
    return key


def _base_url() -> str:
    return (os.environ.get("BALLDONTLIE_BASE_URL") or "https://api.balldontlie.io").rstrip(
        "/",
    )


def _pause() -> None:
    time.sleep(_env_float("BALLDONTLIE_REQUEST_PAUSE_SECONDS", 1.05))


def _encode_params(pairs: list[tuple[str, str]]) -> str:
    return urllib.parse.urlencode(pairs, doseq=True)


def _request_json(path: str, query_pairs: list[tuple[str, str]]) -> dict[str, Any]:
    """GET {base}{path}?{query}; Authorization header = raw API key."""
    base = _base_url()
    qs = _encode_params(query_pairs)
    url = f"{base}{path}?{qs}" if qs else f"{base}{path}"
    req = urllib.request.Request(
        url,
        headers={"Authorization": _api_key(), "Accept": "application/json"},
        method="GET",
    )
    _pause()
    max_attempts = 5
    for attempt in range(1, max_attempts + 1):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            if e.code == 429 and attempt < max_attempts:
                wait = 2.0 * attempt
                print(f"Rate limited (429); sleeping {wait:.0f}s then retry {attempt}/{max_attempts}…")
                time.sleep(wait)
                continue
            raise RuntimeError(f"BALLDONTLIE HTTP {e.code}: {body[:500]}") from e
        except urllib.error.URLError as e:
            if attempt < max_attempts:
                wait = 3.0 * attempt
                print(f"Network error ({e}); sleeping {wait:.0f}s then retry {attempt}/{max_attempts}…")
                time.sleep(wait)
                continue
            raise
    raise RuntimeError("unreachable")


def fetch_teams_map() -> dict[int, str]:
    """BDL team id -> three-letter abbreviation."""
    data = _request_json("/nba/v1/teams", [])
    teams = data.get("data") or []
    out: dict[int, str] = {}
    for t in teams:
        tid = int(t["id"])
        out[tid] = str(t.get("abbreviation") or "")
    return out


def _parse_minutes(raw: Any) -> float:
    if raw is None:
        return 0.0
    s = str(raw).strip()
    if not s or s.upper() in ("DNP", "NA", "N/A", "—", "-"):
        return 0.0
    if ":" in s:
        parts = s.split(":")
        try:
            m = int(parts[0])
            sec = int(parts[1]) if len(parts) > 1 else 0
            return float(m) + sec / 60.0
        except ValueError:
            return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def _season_label_from_game_season(y: Any) -> str:
    """BDL `game.season` is the calendar start year of the NBA season (e.g. 2024 -> 2024-25)."""
    try:
        start_y = int(y)
    except (TypeError, ValueError):
        return ""
    return f"{start_y}-{str(start_y + 1)[-2:]}"


def _wl_for_row(
    team_id: int,
    game: dict[str, Any],
) -> str:
    ht = game.get("home_team_id")
    vt = game.get("visitor_team_id")
    hs = game.get("home_team_score")
    vs = game.get("visitor_team_score")
    if ht is None or vt is None or hs is None or vs is None:
        return ""
    try:
        tid = int(team_id)
        hs_i, vs_i = int(hs), int(vs)
    except (TypeError, ValueError):
        return ""
    if tid == int(ht):
        if hs_i > vs_i:
            return "W"
        if hs_i < vs_i:
            return "L"
    elif tid == int(vt):
        if vs_i > hs_i:
            return "W"
        if vs_i < hs_i:
            return "L"
    return ""


def _matchup(team_abbr: str, team_id: int, game: dict[str, Any], teams_map: dict[int, str]) -> str:
    ht = game.get("home_team_id")
    vt = game.get("visitor_team_id")
    if ht is None or vt is None:
        return team_abbr
    try:
        tid, hid, vid = int(team_id), int(ht), int(vt)
    except (TypeError, ValueError):
        return team_abbr
    h_abbr = teams_map.get(hid, "?")
    v_abbr = teams_map.get(vid, "?")
    if tid == hid:
        return f"{team_abbr} vs. {v_abbr}"
    if tid == vid:
        return f"{team_abbr} @ {h_abbr}"
    return f"{team_abbr}"


def _stat_row_to_nba_shape(
    row: dict[str, Any],
    teams_map: dict[int, str],
) -> dict[str, Any]:
    player = row.get("player") or {}
    team = row.get("team") or {}
    game = row.get("game") or {}

    pid = int(player.get("id") or 0)
    tid = int(team.get("id") or 0)
    gid = int(game.get("id") or 0)
    team_abbr = str(team.get("abbreviation") or teams_map.get(tid, ""))
    first = str(player.get("first_name") or "").strip()
    last = str(player.get("last_name") or "").strip()
    name = f"{first} {last}".strip() or "?"

    season_str = _season_label_from_game_season(game.get("season"))
    postseason = bool(game.get("postseason"))
    season_type = "Playoffs" if postseason else "Regular Season"

    fgm = int(row.get("fgm") or 0)
    fga = int(row.get("fga") or 0)
    fg3m = int(row.get("fg3m") or 0)
    fg3a = int(row.get("fg3a") or 0)
    ftm = int(row.get("ftm") or 0)
    fta = int(row.get("fta") or 0)
    oreb = int(row.get("oreb") or 0)
    dreb = int(row.get("dreb") or 0)
    reb = int(row.get("reb") or 0)
    ast = int(row.get("ast") or 0)
    stl = int(row.get("stl") or 0)
    blk = int(row.get("blk") or 0)
    tov = int(row.get("turnover") or 0)
    pf = int(row.get("pf") or 0)
    pts = int(row.get("pts") or 0)

    fg_pct = float(row["fg_pct"]) if row.get("fg_pct") is not None else (fgm / fga if fga else 0.0)
    fg3_pct = (
        float(row["fg3_pct"]) if row.get("fg3_pct") is not None else (fg3m / fg3a if fg3a else 0.0)
    )
    ft_pct = float(row["ft_pct"]) if row.get("ft_pct") is not None else (ftm / fta if fta else 0.0)

    pm = row.get("plus_minus")
    try:
        plus_minus = int(pm) if pm is not None and str(pm) != "" else 0
    except (TypeError, ValueError):
        plus_minus = 0

    minutes = _parse_minutes(row.get("min"))

    return {
        "PLAYER_ID": pid,
        "PLAYER_NAME": name,
        "TEAM_ID": tid,
        "TEAM_ABBREVIATION": team_abbr,
        "GAME_ID": str(gid),
        "GAME_DATE": str(game.get("date") or ""),
        "SEASON": season_str,
        "SEASON_TYPE": season_type,
        "MATCHUP": _matchup(team_abbr, tid, game, teams_map),
        "WL": _wl_for_row(tid, game),
        "MIN": minutes,
        "FGM": fgm,
        "FGA": fga,
        "FG_PCT": fg_pct,
        "FG3M": fg3m,
        "FG3A": fg3a,
        "FG3_PCT": fg3_pct,
        "FTM": ftm,
        "FTA": fta,
        "FT_PCT": ft_pct,
        "OREB": oreb,
        "DREB": dreb,
        "REB": reb,
        "PF": pf,
        "AST": ast,
        "STL": stl,
        "BLK": blk,
        "TOV": tov,
        "PTS": pts,
        "PLUS_MINUS": plus_minus,
        "FANTASY_PTS": 0.0,
    }


RAW_GAME_LOGS_CSV = DATA_DIR / "raw_game_logs.csv"
# One row per player-game (season_type must not keep duplicates — Supabase PK is
# player_id + game_id + game_date without season_type).
_DEDUPE_COLS = ["PLAYER_ID", "GAME_ID"]


def load_existing_raw_logs(path: Path | None = None) -> pd.DataFrame:
    """Load cached raw logs if present (empty DataFrame otherwise)."""
    csv_path = path or RAW_GAME_LOGS_CSV
    if not csv_path.is_file():
        return pd.DataFrame()
    try:
        return pd.read_csv(csv_path, low_memory=False)
    except (OSError, pd.errors.EmptyDataError, ValueError):
        return pd.DataFrame()


def merge_raw_logs(*frames: pd.DataFrame) -> pd.DataFrame:
    """Concatenate raw log frames and drop duplicate player-game rows."""
    parts = [f for f in frames if f is not None and not f.empty]
    if not parts:
        return pd.DataFrame()
    merged = pd.concat(parts, ignore_index=True)
    return merged.drop_duplicates(subset=_DEDUPE_COLS, keep="last")


def canon_player_ids(
    df: pd.DataFrame,
    id_col: str,
    name_col: str,
    date_col: str | None = None,
) -> tuple[set[int], dict[str, int]]:
    """
    Ids present in ``df``, plus one preferred id per normalised name.

    When several ids share a name, keep the one with the latest date, then the
    most rows. That picks the current player when a suffix-stripped name also
    matches an older player still in the history.
    """
    from espn_injuries import normalize_name

    if df.empty or id_col not in df.columns or name_col not in df.columns:
        return set(), {}

    work = pd.DataFrame(
        {
            "pid": pd.to_numeric(df[id_col], errors="coerce"),
            "name": df[name_col].map(lambda v: normalize_name("" if pd.isna(v) else str(v))),
        },
    )
    if date_col and date_col in df.columns:
        work["when"] = pd.to_datetime(df[date_col], errors="coerce")
    else:
        work["when"] = pd.NaT
    work = work.dropna(subset=["pid"])
    if work.empty:
        return set(), {}
    work["pid"] = work["pid"].astype("int64")
    id_set = {int(pid) for pid in work["pid"].tolist()}
    named = work[work["name"] != ""]
    if named.empty:
        return id_set, {}
    agg = named.groupby(["name", "pid"], as_index=False).agg(
        when=("when", "max"),
        n=("pid", "size"),
    )
    agg = agg.sort_values(["when", "n", "pid"], na_position="first")
    name_to_id: dict[str, int] = {}
    for name, pid in zip(agg["name"].tolist(), agg["pid"].tolist(), strict=True):
        name_to_id[str(name)] = int(pid)
    return id_set, name_to_id


def align_id_column(
    df: pd.DataFrame,
    id_col: str,
    name_col: str,
    canon_ids: set[int],
    name_to_id: dict[str, int],
) -> tuple[pd.DataFrame, dict[str, int]]:
    """
    Rewrite ``id_col`` onto ``canon_ids``.

    The row's name selects the canon id first: NBA.com and BALLDONTLIE ids can
    collide numerically for different players. Without a name match, an id
    already in the canon is kept; anything else keeps its original id.
    """
    from espn_injuries import normalize_name

    stats = {"already": 0, "remapped": 0, "unmatched": 0}
    if df.empty or id_col not in df.columns:
        return df.copy(), stats

    out = df.copy()
    raw_ids = pd.to_numeric(out[id_col], errors="coerce").tolist()
    if name_col in out.columns:
        raw_names = out[name_col].tolist()
    else:
        raw_names = [""] * len(out)

    aligned: list[int] = []
    for value, raw_name in zip(raw_ids, raw_names, strict=True):
        pid = int(value) if pd.notna(value) else 0
        key = normalize_name("" if pd.isna(raw_name) else str(raw_name))
        mapped = name_to_id.get(key) if key else None
        if mapped:
            aligned.append(int(mapped))
            stats["already" if int(mapped) == pid else "remapped"] += 1
        elif pid and pid in canon_ids:
            aligned.append(pid)
            stats["already"] += 1
        else:
            aligned.append(pid)
            stats["unmatched"] += 1
    out[id_col] = aligned
    return out, stats


def align_incoming_logs(incoming: pd.DataFrame, existing: pd.DataFrame) -> pd.DataFrame:
    """Map newly fetched BALLDONTLIE rows onto the player ids already in the cache."""
    needed = {"PLAYER_ID", "PLAYER_NAME"}
    if (
        incoming.empty
        or existing.empty
        or not needed.issubset(incoming.columns)
        or not needed.issubset(existing.columns)
    ):
        return incoming
    date_col = "GAME_DATE" if "GAME_DATE" in existing.columns else None
    canon_ids, name_to_id = canon_player_ids(existing, "PLAYER_ID", "PLAYER_NAME", date_col)
    aligned, stats = align_id_column(
        incoming, "PLAYER_ID", "PLAYER_NAME", canon_ids, name_to_id,
    )
    total = stats["already"] + stats["remapped"] + stats["unmatched"]
    if stats["remapped"]:
        print(
            "BALLDONTLIE: rewrote incoming player ids onto cached ids "
            f"(remapped {stats['remapped']} rows, already {stats['already']}, "
            f"unmatched {stats['unmatched']}).",
        )
    elif total and stats["already"] == 0:
        print(
            "BALLDONTLIE: incoming player ids are not in the cache and "
            "names did not match — new rows keep their own ids.",
        )

    # Cached and fresh rows number games differently (stats.nba.com "0022500001"
    # vs BALLDONTLIE ints), so PLAYER_ID + GAME_ID dedupe misses the overlap on
    # the anchor date. A player plays at most one game per day.
    if "GAME_DATE" in aligned.columns and "GAME_DATE" in existing.columns:
        def day_keys(frame: pd.DataFrame) -> pd.Series:
            day = pd.to_datetime(frame["GAME_DATE"], errors="coerce").dt.strftime("%Y-%m-%d")
            pid = pd.to_numeric(frame["PLAYER_ID"], errors="coerce").astype("Int64").astype(str)
            return pid + "|" + day.fillna("")

        seen = set(day_keys(existing).tolist())
        dup = day_keys(aligned).isin(seen)
        if dup.any():
            print(f"BALLDONTLIE: dropped {int(dup.sum())} incoming rows already cached for that player and date.")
            aligned = aligned[~dup]
    return aligned


def align_active_players_to_prices(
    active: pd.DataFrame,
    prices_csv: Path,
) -> tuple[pd.DataFrame, dict[str, int]]:
    """Point the active roster at the player ids used in ``player_game_prices.csv``."""
    prices = pd.read_csv(
        prices_csv,
        usecols=lambda c: c in {"player_id", "player_name", "game_date"},
        dtype={"player_name": str},
        low_memory=False,
    )
    canon_ids, name_to_id = canon_player_ids(
        prices, "player_id", "player_name", "game_date",
    )
    return align_id_column(active, "player_id", "player_name", canon_ids, name_to_id)


def _max_game_date_label(df: pd.DataFrame, season: str) -> str | None:
    if df.empty or "GAME_DATE" not in df.columns or "SEASON" not in df.columns:
        return None
    sub = df[df["SEASON"].astype(str) == season].copy()
    if sub.empty:
        return None
    dates = pd.to_datetime(sub["GAME_DATE"], errors="coerce").dropna()
    if dates.empty:
        return None
    return dates.max().strftime("%Y-%m-%d")


def _season_has_rows(df: pd.DataFrame, season: str) -> bool:
    if df.empty or "SEASON" not in df.columns:
        return False
    return bool((df["SEASON"].astype(str) == season).any())


def _force_full_fetch() -> bool:
    raw = (os.environ.get("PIPELINE_FULL_FETCH") or "").strip().lower()
    return raw in ("1", "true", "yes", "on")


def refresh_raw_game_logs(
    start_year: int | None = None,
    end_year: int | None = None,
    out_path: Path | None = None,
    *,
    force_full: bool = False,
) -> pd.DataFrame:
    """
    Merge cached raw logs with new BALLDONTLIE rows.

    Default (CI): keep prior season from cache, fetch only current-season games
    on/after the latest cached date via ``start_date``. Set ``force_full`` or
    ``PIPELINE_FULL_FETCH=1`` for a full re-download.
    """
    if start_year is None or end_year is None:
        start_year, end_year = sw.automated_window_season_years()

    out = out_path or RAW_GAME_LOGS_CSV
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    existing = load_existing_raw_logs(out)
    full = force_full or _force_full_fetch()

    if full or existing.empty:
        print("BALLDONTLIE: full fetch (no cache or forced).")
        merged = collect_player_game_logs(start_year=start_year, end_year=end_year)
        merged.to_csv(out, index=False)
        return merged

    fetched: list[pd.DataFrame] = []
    prior_season = sw.season_string(start_year)
    current_season = sw.season_string(end_year)

    if start_year != end_year and not _season_has_rows(existing, prior_season):
        print(f"BALLDONTLIE: prior season {prior_season} missing from cache — full fetch.")
        fetched.append(collect_player_game_logs(start_year=start_year, end_year=start_year))

    anchor = _max_game_date_label(existing, current_season)
    if anchor:
        print(f"BALLDONTLIE: incremental current season from {anchor} ({current_season}).")
        fetched.append(
            collect_player_game_logs(
                start_year=end_year,
                end_year=end_year,
                start_date=anchor,
            ),
        )
    else:
        print(f"BALLDONTLIE: no {current_season} in cache — full fetch current season.")
        fetched.append(collect_player_game_logs(start_year=end_year, end_year=end_year))

    # Cached logs may use NBA.com ids while a new pull uses BALLDONTLIE ids.
    # Rewrite matches onto the cached id so one player stays one market row.
    aligned = [align_incoming_logs(frame, existing) for frame in fetched]
    merged = merge_raw_logs(existing, *aligned)
    merged.to_csv(out, index=False)
    try:
        shown = out.relative_to(ROOT)
    except ValueError:
        shown = out
    print(f"BALLDONTLIE: merged cache -> {len(merged)} rows at {shown}")
    return merged


def collect_player_game_logs(
    start_year: int | None = None,
    end_year: int | None = None,
    *,
    start_date: str | None = None,
) -> pd.DataFrame:
    """
    Pull all player-game stats for each season start year in [start_year, end_year]
    (inclusive), regular season and playoffs (BDL includes both; `SEASON_TYPE` is derived
    from `game.postseason`).
    """
    if start_year is None or end_year is None:
        start_year, end_year = sw.automated_window_season_years()

    teams_map = fetch_teams_map()
    per_page = max(1, min(100, _env_int("BALLDONTLIE_PER_PAGE", 100)))

    out_rows: list[dict[str, Any]] = []
    for y in range(start_year, end_year + 1):
        print(
            f"BALLDONTLIE: fetching stats for season start year {y} "
            f"({sw.describe_season_window(y, y)}) …",
        )
        cursor: int | None = None
        page = 0
        max_pages = 200_000
        while True:
            page += 1
            if page > max_pages:
                raise RuntimeError(f"BALLDONTLIE pagination exceeded {max_pages} pages for season {y}.")
            sent_cursor = cursor
            pairs: list[tuple[str, str]] = [
                ("seasons[]", str(y)),
                ("per_page", str(per_page)),
                ("period", "0"),
            ]
            if start_date:
                pairs.append(("start_date", start_date))
            if cursor is not None:
                pairs.append(("cursor", str(cursor)))

            payload = _request_json("/nba/v1/stats", pairs)
            batch = payload.get("data") or []
            meta = payload.get("meta") or {}
            next_c = meta.get("next_cursor")

            for row in batch:
                out_rows.append(_stat_row_to_nba_shape(row, teams_map))

            print(f"  page {page}: +{len(batch)} rows (total {len(out_rows)})")

            if not batch:
                break
            if next_c is None:
                break
            try:
                new_c = int(next_c)
            except (TypeError, ValueError):
                break
            if sent_cursor is not None and new_c == sent_cursor:
                print("  pagination stopped: next_cursor did not advance")
                break
            cursor = new_c

    if not out_rows:
        return pd.DataFrame()

    merged = pd.DataFrame(out_rows)
    return merged.drop_duplicates(
        subset=["PLAYER_ID", "GAME_ID", "SEASON_TYPE"],
        keep="last",
    )


def save_active_players_bdl(
    out_path: Path | None = None,
    prices_csv: Path | None = None,
) -> Path:
    """
    Paginate `GET /nba/v1/players/active` into data/active_players.csv.

    When a price file exists, roster ids are rewritten to the ids in that file
    (matched by name) so the market join is not empty across id systems.
    """
    path = out_path or (DATA_DIR / "active_players.csv")
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    rows: list[dict[str, int | str]] = []
    cursor: int | None = None
    per_page = max(1, min(100, _env_int("BALLDONTLIE_PER_PAGE", 100)))
    page = 0
    while True:
        page += 1
        if page > 50_000:
            raise RuntimeError("BALLDONTLIE active players pagination exceeded 50000 pages.")
        sent_cursor = cursor
        pairs: list[tuple[str, str]] = [("per_page", str(per_page))]
        if cursor is not None:
            pairs.append(("cursor", str(cursor)))
        payload = _request_json("/nba/v1/players/active", pairs)
        batch = payload.get("data") or []
        meta = payload.get("meta") or {}
        for p in batch:
            pid = int(p.get("id") or 0)
            if not pid:
                continue
            fn = str(p.get("first_name") or "").strip()
            ln = str(p.get("last_name") or "").strip()
            rows.append({"player_id": pid, "player_name": f"{fn} {ln}".strip()})
        print(f"BALLDONTLIE active players page {page}: +{len(batch)} (total {len(rows)})")
        next_c = meta.get("next_cursor")
        if not batch or next_c is None:
            break
        try:
            new_c = int(next_c)
        except (TypeError, ValueError):
            break
        if sent_cursor is not None and new_c == sent_cursor:
            print("BALLDONTLIE active players: pagination stopped (cursor did not advance)")
            break
        cursor = new_c

    df = pd.DataFrame(rows).drop_duplicates(subset=["player_id"]).sort_values("player_id")
    prices_path = prices_csv if prices_csv is not None else (DATA_DIR / "player_game_prices.csv")
    if prices_path.is_file() and not df.empty:
        before = len(df)
        df, stats = align_active_players_to_prices(df, prices_path)
        df = df.drop_duplicates(subset=["player_id"]).sort_values("player_id")
        collapsed = before - len(df)
        print(
            "Active roster aligned to price ids: "
            f"already {stats['already']}, remapped {stats['remapped']}, "
            f"unmatched {stats['unmatched']}.",
        )
        if collapsed:
            print(f"  collapsed {collapsed} roster rows onto a shared price id.")
        matched = stats["already"] + stats["remapped"]
        if matched == 0:
            raise RuntimeError(
                "Active roster shares no players with "
                f"{prices_path.name}. Refusing to publish an empty market.",
            )
    df.to_csv(path, index=False)
    try:
        shown = path.relative_to(ROOT)
    except ValueError:
        shown = path
    print(f"Saved {len(df)} active players -> {shown}")
    return path


if __name__ == "__main__":
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    print("Window:", sw.describe_season_window(*sw.automated_window_season_years()))
    df = collect_player_game_logs()
    out = DATA_DIR / "raw_game_logs.csv"
    df.to_csv(out, index=False)
    print(f"Wrote {df.shape} -> {out.relative_to(ROOT)}")
