"""
Fetch per-game player box scores from ESPN and write data/raw_game_logs.csv in the
same "NBA shape" ``balldontlie_fetch`` produces (the 31 columns
``data_cleaning.clean_game_logs`` needs).

ESPN's site API is public and needs no key. It is undocumented, so every payload
is checked: a missing stat key or an unexpected structure raises
``EspnShapeError`` instead of writing bad rows.

Endpoints
---------
- scoreboard  ``/scoreboard?dates=YYYYMMDD``  events for one US/Eastern day
- summary     ``/summary?event=<id>``          box score per team / athlete
- teams       ``/teams`` and ``/teams/<id>/roster``  active rosters (+ birth dates)

Rules
-----
- Only games whose status is ``post`` **and** ``completed`` are ingested. In-progress
  rows are never written.
- Regular season (type 2), play-in (type 5) and playoffs (type 3). Play-in is
  labelled "Regular Season" because that is what BALLDONTLIE (``postseason=false``)
  wrote. Preseason (type 1) and All-Star games are skipped.
- Incremental refresh re-fetches from (latest cached current-season ``GAME_DATE``
  − 1 day) through today (US/Eastern). On those dates an incoming final row
  replaces the cached row for the same ``PLAYER_ID`` + ``GAME_DATE`` (heals
  partial rows and picks up stat corrections). Other dates are untouched.
- ESPN athlete ids are mapped onto the existing market player ids with
  ``espn_player_map`` (never changes an existing id).

Request count
-------------
Incremental (every 15 min): ~3 scoreboard calls + one summary per final game in
the window (typically 10-30 requests).
Cold start, per season: 1 call for the season window + one scoreboard per day
(~270, late Sept - late June) + one summary per game (~1,230 regular season +
~90 play-in/playoffs) ≈ 1,600 requests, ~10 min at the default 0.3 s pause.
The automated window (prior + current season) is ≈ 3,200 requests. Rosters for
birth dates add 31 requests when unmapped players appear.

Environment
-----------
- ``ESPN_REQUEST_PAUSE_SECONDS`` — pause before each HTTP call (default ``0.3``).
- ``ESPN_SITE_BASE_URL`` — default ``https://site.api.espn.com/apis/site/v2/sports/basketball/nba``.
- ``PIPELINE_FULL_FETCH=1`` — ignore the cache and re-download the window.
"""
from __future__ import annotations

import gzip
import http.client
import json
import os
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zlib
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Iterable

import pandas as pd

_PIPELINE_DIR = Path(__file__).resolve().parent
if str(_PIPELINE_DIR) not in sys.path:
    sys.path.insert(0, str(_PIPELINE_DIR))

import season_window as sw  # noqa: E402
from espn_player_map import Athlete, EspnPlayerMapper  # noqa: E402

ROOT = sw.ROOT
DATA_DIR = sw.DATA_DIR
RAW_GAME_LOGS_CSV = DATA_DIR / "raw_game_logs.csv"

DEFAULT_BASE_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba"
# Same API on ESPN's second host; used when a box score 404s on the primary one.
FALLBACK_SUMMARY_BASE_URL = "https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba"
# ESPN occasionally 404s a box score that exists (seen in CI for a final playoff game).
SUMMARY_NOT_FOUND_ATTEMPTS = 3
# A run may skip at most this many unfetchable box scores (or 5% of finals, if larger)
# before failing; skipped games keep their stored rows and are reported.
MAX_SKIPPED_SUMMARIES = 3
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)
MAX_ATTEMPTS = 5

RAW_COLUMNS = [
    "PLAYER_ID", "PLAYER_NAME", "TEAM_ID", "TEAM_ABBREVIATION", "GAME_ID", "GAME_DATE",
    "SEASON", "SEASON_TYPE", "MATCHUP", "WL", "MIN", "FGM", "FGA", "FG_PCT", "FG3M",
    "FG3A", "FG3_PCT", "FTM", "FTA", "FT_PCT", "OREB", "DREB", "REB", "PF", "AST",
    "STL", "BLK", "TOV", "PTS", "PLUS_MINUS", "FANTASY_PTS",
]
ESPN_ID_COL = "ESPN_PLAYER_ID"

# ESPN team id -> (NBA.com abbreviation, NBA.com team id). Static: franchises keep ids.
ESPN_TEAMS: dict[str, tuple[str, int]] = {
    "1": ("ATL", 1610612737),
    "2": ("BOS", 1610612738),
    "17": ("BKN", 1610612751),
    "30": ("CHA", 1610612766),
    "4": ("CHI", 1610612741),
    "5": ("CLE", 1610612739),
    "6": ("DAL", 1610612742),
    "7": ("DEN", 1610612743),
    "8": ("DET", 1610612765),
    "9": ("GSW", 1610612744),
    "10": ("HOU", 1610612745),
    "11": ("IND", 1610612754),
    "12": ("LAC", 1610612746),
    "13": ("LAL", 1610612747),
    "29": ("MEM", 1610612763),
    "14": ("MIA", 1610612748),
    "15": ("MIL", 1610612749),
    "16": ("MIN", 1610612750),
    "3": ("NOP", 1610612740),
    "18": ("NYK", 1610612752),
    "25": ("OKC", 1610612760),
    "19": ("ORL", 1610612753),
    "20": ("PHI", 1610612755),
    "21": ("PHX", 1610612756),
    "22": ("POR", 1610612757),
    "23": ("SAC", 1610612758),
    "24": ("SAS", 1610612759),
    "28": ("TOR", 1610612761),
    "26": ("UTA", 1610612762),
    "27": ("WAS", 1610612764),
}
# ESPN abbreviations that differ from NBA.com's.
ESPN_ABBR_FIX = {"GS": "GSW", "NO": "NOP", "NY": "NYK", "SA": "SAS", "UTAH": "UTA", "WSH": "WAS"}
_NBA_BY_ABBR = {abbr: (abbr, tid) for abbr, tid in ESPN_TEAMS.values()}

# ESPN season.type -> SEASON_TYPE. Play-in (5) stays "Regular Season" to match
# BALLDONTLIE, which marks play-in games postseason=false.
SEASON_TYPES = {2: "Regular Season", 3: "Playoffs", 5: "Regular Season"}

REQUIRED_STAT_KEYS = (
    "minutes",
    "points",
    "fieldGoalsMade-fieldGoalsAttempted",
    "threePointFieldGoalsMade-threePointFieldGoalsAttempted",
    "freeThrowsMade-freeThrowsAttempted",
    "rebounds",
    "assists",
    "turnovers",
    "steals",
    "blocks",
    "offensiveRebounds",
    "defensiveRebounds",
    "fouls",
    "plusMinus",
)


class EspnShapeError(RuntimeError):
    """ESPN returned a payload this parser does not understand."""


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _base_url() -> str:
    return (os.environ.get("ESPN_SITE_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")


def _decode_body(raw: bytes, encoding: str) -> bytes:
    enc = (encoding or "").lower()
    if enc == "gzip" or raw[:2] == b"\x1f\x8b":
        return gzip.decompress(raw)
    if enc == "deflate":
        return zlib.decompress(raw)
    return raw


_RETRYABLE = (
    urllib.error.URLError,
    http.client.HTTPException,
    ConnectionError,
    socket.timeout,
    TimeoutError,
    EOFError,
    zlib.error,
    json.JSONDecodeError,
)


class EspnHttpError(RuntimeError):
    """An HTTP error status from ESPN after retries (``code`` is the status)."""

    def __init__(self, code: int, url: str, body: str) -> None:
        super().__init__(f"ESPN HTTP {code} for {url}: {body}")
        self.code = code
        self.url = url


def _error_body(e: urllib.error.HTTPError) -> str:
    """First bytes of an error response, gunzipped when needed (ESPN gzips 404 pages)."""
    try:
        raw_body = e.read() or b""
    except Exception:  # noqa: BLE001
        return ""
    try:
        raw_body = gzip.decompress(raw_body)
    except (OSError, EOFError, zlib.error):
        pass
    return raw_body[:300].decode("utf-8", errors="replace")


def _request_json(
    path: str,
    params: dict[str, str] | None = None,
    *,
    base: str | None = None,
    retry_not_found: bool = False,
    attempts: int = MAX_ATTEMPTS,
) -> dict[str, Any]:
    """
    GET {base}{path}?{params} with pacing and retries (network errors, 429, 5xx;
    404 too when ``retry_not_found``).
    """
    qs = urllib.parse.urlencode(params or {})
    url = f"{(base or _base_url()).rstrip('/')}{path}" + (f"?{qs}" if qs else "")
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
            "Accept-Encoding": "gzip",
        },
        method="GET",
    )
    for attempt in range(1, attempts + 1):
        time.sleep(_env_float("ESPN_REQUEST_PAUSE_SECONDS", 0.3))
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = _decode_body(resp.read(), resp.headers.get("Content-Encoding", ""))
            payload = json.loads(body.decode("utf-8"))
            if not isinstance(payload, dict):
                raise EspnShapeError(f"ESPN {path}: expected a JSON object, got {type(payload).__name__}")
            return payload
        except urllib.error.HTTPError as e:
            retryable = e.code == 429 or e.code >= 500 or (retry_not_found and e.code == 404)
            if not retryable or attempt == attempts:
                raise EspnHttpError(e.code, url, _error_body(e)) from e
            wait = 2.0**attempt
            print(f"ESPN HTTP {e.code} for {path}; retry {attempt}/{attempts - 1} in {wait:.0f}s…")
            time.sleep(wait)
        except _RETRYABLE as e:
            if attempt == attempts:
                raise RuntimeError(f"ESPN request failed after {attempts} attempts: {url} ({e})") from e
            wait = 2.0**attempt
            print(f"ESPN network error ({type(e).__name__}: {e}); retry {attempt}/{attempts - 1} in {wait:.0f}s…")
            time.sleep(wait)
    raise AssertionError("unreachable")


def fetch_scoreboard(day: date) -> dict[str, Any]:
    return _request_json("/scoreboard", {"dates": day.strftime("%Y%m%d")})


def fetch_summary(event_id: str) -> dict[str, Any]:
    """Box score for one game: primary host (404s retried), then ESPN's second host."""
    params = {"event": str(event_id)}
    try:
        return _request_json(
            "/summary", params, retry_not_found=True, attempts=SUMMARY_NOT_FOUND_ATTEMPTS,
        )
    except EspnHttpError as e:
        if e.code != 404:
            raise
        print(f"ESPN summary {event_id}: 404 on primary host; trying {FALLBACK_SUMMARY_BASE_URL}")
        return _request_json(
            "/summary", params, base=FALLBACK_SUMMARY_BASE_URL,
            retry_not_found=True, attempts=SUMMARY_NOT_FOUND_ATTEMPTS,
        )


# ---------------------------------------------------------------------------
# Time helpers
# ---------------------------------------------------------------------------

def _eastern_offset(utc_dt: datetime) -> timedelta:
    """US/Eastern offset without tzdata: DST from 2nd Sun Mar 07:00 UTC to 1st Sun Nov 06:00 UTC."""
    y = utc_dt.year
    march = datetime(y, 3, 8, 7, tzinfo=timezone.utc)
    dst_start = march + timedelta(days=(6 - march.weekday()) % 7)
    nov = datetime(y, 11, 1, 6, tzinfo=timezone.utc)
    dst_end = nov + timedelta(days=(6 - nov.weekday()) % 7)
    return timedelta(hours=-4) if dst_start <= utc_dt < dst_end else timedelta(hours=-5)


def to_eastern(utc_dt: datetime) -> datetime:
    if utc_dt.tzinfo is None:
        utc_dt = utc_dt.replace(tzinfo=timezone.utc)
    try:
        from zoneinfo import ZoneInfo

        return utc_dt.astimezone(ZoneInfo("America/New_York"))
    except Exception:  # noqa: BLE001 - zoneinfo/tzdata missing on some hosts
        utc = utc_dt.astimezone(timezone.utc)
        return utc + _eastern_offset(utc)


def parse_espn_datetime(raw: str) -> datetime:
    s = str(raw or "").strip()
    if not s:
        raise EspnShapeError("ESPN event has no date")
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError as e:
        raise EspnShapeError(f"Unrecognised ESPN date {raw!r}") from e
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def eastern_date(raw_utc: str) -> str:
    return to_eastern(parse_espn_datetime(raw_utc)).strftime("%Y-%m-%d")


def today_eastern(now: datetime | None = None) -> date:
    return to_eastern(now or datetime.now(timezone.utc)).date()


def season_label(espn_season_year: Any) -> str:
    """ESPN names a season by its end year: 2027 -> "2026-27"."""
    try:
        end_year = int(espn_season_year)
    except (TypeError, ValueError) as e:
        raise EspnShapeError(f"Bad ESPN season year {espn_season_year!r}") from e
    return sw.season_string(end_year - 1)


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------

def _require(obj: Any, key: str, where: str) -> Any:
    if not isinstance(obj, dict) or key not in obj:
        raise EspnShapeError(f"ESPN payload shape changed: missing '{key}' in {where}")
    return obj[key]


def nba_team(espn_team: dict[str, Any]) -> tuple[str, int]:
    """(NBA abbreviation, NBA team id) for an ESPN team object."""
    tid = str(espn_team.get("id") or "")
    if tid in ESPN_TEAMS:
        return ESPN_TEAMS[tid]
    abbr = str(espn_team.get("abbreviation") or "").upper()
    abbr = ESPN_ABBR_FIX.get(abbr, abbr)
    if abbr in _NBA_BY_ABBR:
        return _NBA_BY_ABBR[abbr]
    raise EspnShapeError(f"Unknown ESPN team id={tid!r} abbreviation={espn_team.get('abbreviation')!r}")


def event_status(event_or_header: dict[str, Any]) -> tuple[str, bool]:
    """(state, completed) from a scoreboard event or a summary header."""
    comps = _require(event_or_header, "competitions", "event")
    if not comps:
        raise EspnShapeError("ESPN event has no competitions")
    status_type = (comps[0].get("status") or {}).get("type") or event_or_header.get("status", {}).get("type")
    if not isinstance(status_type, dict) or "state" not in status_type:
        raise EspnShapeError("ESPN event status.type.state missing")
    return str(status_type.get("state")), bool(status_type.get("completed"))


def is_final(event_or_header: dict[str, Any]) -> bool:
    state, completed = event_status(event_or_header)
    return state == "post" and completed


def is_all_star(event: dict[str, Any]) -> bool:
    comps = event.get("competitions") or [{}]
    abbr = str(((comps[0] or {}).get("type") or {}).get("abbreviation") or "").upper()
    return abbr == "ALLSTAR"


def skip_reason(event: dict[str, Any]) -> str | None:
    """Why a scoreboard event is not ingested (None = ingest)."""
    if is_all_star(event):
        return "all-star"
    season = event.get("season") or {}
    stype = season.get("type")
    try:
        stype = int(stype)
    except (TypeError, ValueError):
        stype = None
    if stype is not None and stype not in SEASON_TYPES:
        return f"season type {stype}"
    if not is_final(event):
        state, _ = event_status(event)
        return f"not final ({state})"
    return None


def _int_stat(raw: str, key: str, where: str) -> int:
    s = str(raw).strip()
    if s in ("", "-", "--"):
        return 0
    if s.startswith("+"):
        s = s[1:]
    try:
        return int(s)
    except ValueError:
        try:
            return int(round(float(s)))
        except ValueError as e:
            raise EspnShapeError(f"{where}: stat {key}={raw!r} is not a number") from e


def _made_attempted(raw: str, key: str, where: str) -> tuple[int, int]:
    s = str(raw).strip()
    if s in ("", "-", "--"):
        return 0, 0
    parts = s.split("-")
    if len(parts) != 2:
        raise EspnShapeError(f"{where}: stat {key}={raw!r} is not 'made-attempted'")
    return _int_stat(parts[0], key, where), _int_stat(parts[1], key, where)


def _pct(made: int, attempted: int) -> float:
    return round(made / attempted, 3) if attempted else 0.0


def parse_summary(summary: dict[str, Any], event: dict[str, Any] | None = None) -> pd.DataFrame:
    """
    One row per athlete in a final game's box score (RAW_COLUMNS + ESPN_PLAYER_ID).

    ``PLAYER_ID`` is left empty — fill it with :func:`apply_player_map`. Raises
    ``EspnShapeError`` on unknown payload shapes; returns an empty frame for games
    that are not final, preseason or All-Star.
    """
    header = _require(summary, "header", "summary")
    if event is not None and skip_reason(event):
        return pd.DataFrame(columns=[*RAW_COLUMNS, ESPN_ID_COL])
    if not is_final(header):
        return pd.DataFrame(columns=[*RAW_COLUMNS, ESPN_ID_COL])
    if is_all_star(header):
        return pd.DataFrame(columns=[*RAW_COLUMNS, ESPN_ID_COL])

    game_id = str(_require(header, "id", "summary.header"))
    season = _require(header, "season", "summary.header")
    try:
        stype = int(season.get("type"))
    except (TypeError, ValueError) as e:
        raise EspnShapeError(f"game {game_id}: season.type missing") from e
    if stype not in SEASON_TYPES:
        return pd.DataFrame(columns=[*RAW_COLUMNS, ESPN_ID_COL])
    season_str = season_label(season.get("year"))
    season_type = SEASON_TYPES[stype]

    comp = header["competitions"][0]
    game_date = eastern_date((event or {}).get("date") or comp.get("date") or "")

    competitors = _require(comp, "competitors", f"game {game_id} header")
    if len(competitors) != 2:
        raise EspnShapeError(f"game {game_id}: expected 2 competitors, got {len(competitors)}")
    teams: dict[int, dict[str, Any]] = {}
    for c in competitors:
        abbr, nba_id = nba_team(_require(c, "team", f"game {game_id} competitor"))
        teams[nba_id] = {
            "abbr": abbr,
            "home": str(c.get("homeAway")) == "home",
            "winner": c.get("winner"),
        }
    if sum(1 for t in teams.values() if t["home"]) != 1:
        raise EspnShapeError(f"game {game_id}: could not tell home from away")

    box = _require(summary, "boxscore", f"game {game_id}")
    players = _require(box, "players", f"game {game_id} boxscore")
    if not isinstance(players, list) or len(players) != 2:
        raise EspnShapeError(f"game {game_id}: expected boxscore.players for 2 teams")

    rows: list[dict[str, Any]] = []
    for team_block in players:
        abbr, nba_id = nba_team(_require(team_block, "team", f"game {game_id} boxscore.players[]"))
        if nba_id not in teams:
            raise EspnShapeError(f"game {game_id}: box score team {abbr} is not a competitor")
        me = teams[nba_id]
        opp = next(t for tid, t in teams.items() if tid != nba_id)
        matchup = f"{abbr} vs. {opp['abbr']}" if me["home"] else f"{abbr} @ {opp['abbr']}"
        wl = "W" if me["winner"] is True else ("L" if opp["winner"] is True else "")

        stats_blocks = _require(team_block, "statistics", f"game {game_id} {abbr}")
        if not stats_blocks:
            raise EspnShapeError(f"game {game_id} {abbr}: empty statistics")
        block = stats_blocks[0]
        keys = list(_require(block, "keys", f"game {game_id} {abbr} statistics[0]"))
        missing = [k for k in REQUIRED_STAT_KEYS if k not in keys]
        if missing:
            raise EspnShapeError(f"game {game_id} {abbr}: ESPN stat keys changed, missing {missing}")
        col = {k: keys.index(k) for k in REQUIRED_STAT_KEYS}

        for ath in _require(block, "athletes", f"game {game_id} {abbr} statistics[0]"):
            info = _require(ath, "athlete", f"game {game_id} {abbr} athlete")
            espn_id = str(_require(info, "id", f"game {game_id} {abbr} athlete")).strip()
            name = str(info.get("displayName") or info.get("shortName") or "").strip()
            where = f"game {game_id} {abbr} {name or espn_id}"
            stats = ath.get("stats") or []
            dnp = bool(ath.get("didNotPlay")) or not stats
            if not dnp and len(stats) != len(keys):
                raise EspnShapeError(f"{where}: {len(stats)} stats for {len(keys)} keys")

            def stat(k: str) -> str:
                return "" if dnp else stats[col[k]]

            fgm, fga = _made_attempted(stat(REQUIRED_STAT_KEYS[2]), "FG", where)
            fg3m, fg3a = _made_attempted(stat(REQUIRED_STAT_KEYS[3]), "3PT", where)
            ftm, fta = _made_attempted(stat(REQUIRED_STAT_KEYS[4]), "FT", where)
            rows.append(
                {
                    "PLAYER_ID": pd.NA,
                    "PLAYER_NAME": name,
                    "TEAM_ID": nba_id,
                    "TEAM_ABBREVIATION": abbr,
                    "GAME_ID": game_id,
                    "GAME_DATE": game_date,
                    "SEASON": season_str,
                    "SEASON_TYPE": season_type,
                    "MATCHUP": matchup,
                    "WL": wl,
                    "MIN": _int_stat(stat("minutes"), "minutes", where),
                    "FGM": fgm,
                    "FGA": fga,
                    "FG_PCT": _pct(fgm, fga),
                    "FG3M": fg3m,
                    "FG3A": fg3a,
                    "FG3_PCT": _pct(fg3m, fg3a),
                    "FTM": ftm,
                    "FTA": fta,
                    "FT_PCT": _pct(ftm, fta),
                    "OREB": _int_stat(stat("offensiveRebounds"), "OREB", where),
                    "DREB": _int_stat(stat("defensiveRebounds"), "DREB", where),
                    "REB": _int_stat(stat("rebounds"), "REB", where),
                    "PF": _int_stat(stat("fouls"), "PF", where),
                    "AST": _int_stat(stat("assists"), "AST", where),
                    "STL": _int_stat(stat("steals"), "STL", where),
                    "BLK": _int_stat(stat("blocks"), "BLK", where),
                    "TOV": _int_stat(stat("turnovers"), "TOV", where),
                    "PTS": _int_stat(stat("points"), "PTS", where),
                    "PLUS_MINUS": _int_stat(stat("plusMinus"), "+/-", where),
                    "FANTASY_PTS": 0.0,
                    ESPN_ID_COL: espn_id,
                },
            )
    return pd.DataFrame(rows, columns=[*RAW_COLUMNS, ESPN_ID_COL])


def collect_dates(
    days: Iterable[date],
    *,
    scoreboard: Callable[[date], dict[str, Any]] | None = None,
    summary: Callable[[str], dict[str, Any]] | None = None,
) -> pd.DataFrame:
    """Box-score rows (unmapped) for every final, in-scope game on ``days``."""
    get_board = scoreboard or fetch_scoreboard
    get_summary = summary or fetch_summary
    frames: list[pd.DataFrame] = []
    seen_events: set[str] = set()
    skipped: list[tuple[date, str, str]] = []  # (day, event_id, error)
    attempted = 0
    for day in days:
        board = get_board(day)
        events = board.get("events")
        if events is None:
            raise EspnShapeError(f"ESPN scoreboard {day}: missing 'events'")
        final_n = skipped_live = 0
        for event in events:
            event_id = str(_require(event, "id", f"scoreboard {day} event"))
            if event_id in seen_events:
                continue
            reason = skip_reason(event)
            if reason:
                if reason.startswith("not final"):
                    skipped_live += 1
                continue
            seen_events.add(event_id)
            attempted += 1
            try:
                summary_json = get_summary(event_id)
            except (EspnHttpError, RuntimeError) as e:
                # Stored rows for this game (if any) stay as they are; reported below.
                skipped.append((day, event_id, str(e)[:160]))
                print(f"ESPN {day.isoformat()}: WARNING could not fetch box score {event_id}: {str(e)[:160]}")
                continue
            frame = parse_summary(summary_json, event)
            if not frame.empty:
                frames.append(frame)
                final_n += 1
        note = f", {skipped_live} not final (skipped)" if skipped_live else ""
        print(f"ESPN {day.isoformat()}: {len(events)} events, {final_n} final ingested{note}")
    if skipped:
        limit = max(MAX_SKIPPED_SUMMARIES, int(0.05 * attempted))
        listing = "; ".join(f"{d.isoformat()} event {eid}" for d, eid, _ in skipped)
        if len(skipped) > limit:
            raise RuntimeError(
                f"ESPN: {len(skipped)} of {attempted} box scores could not be fetched "
                f"(limit {limit}); refusing to continue: {listing}",
            )
        print(
            f"ESPN: WARNING skipped {len(skipped)} unfetchable box score(s), stored rows kept: "
            f"{listing}. A later run (or --espn-refetch-from) picks them up.",
        )
    if not frames:
        return pd.DataFrame(columns=[*RAW_COLUMNS, ESPN_ID_COL])
    return pd.concat(frames, ignore_index=True)


# ---------------------------------------------------------------------------
# Player ids
# ---------------------------------------------------------------------------

_ROSTER_CACHE: list[dict[str, str]] | None = None


def fetch_roster_athletes(*, refresh: bool = False) -> list[dict[str, str]]:
    """Every athlete on an ESPN NBA roster: espn_id, name, dob (YYYY-MM-DD or ''), team.

    Cached for the process (31 requests), so the raw-log refresh and the roster
    refresh in one pipeline run share a single pull.
    """
    global _ROSTER_CACHE
    if _ROSTER_CACHE is not None and not refresh:
        return list(_ROSTER_CACHE)
    payload = _request_json("/teams")
    try:
        teams = payload["sports"][0]["leagues"][0]["teams"]
    except (KeyError, IndexError, TypeError) as e:
        raise EspnShapeError("ESPN /teams payload shape changed (sports[0].leagues[0].teams)") from e
    out: list[dict[str, str]] = []
    for item in teams:
        team = _require(item, "team", "ESPN /teams entry")
        tid = str(_require(team, "id", "ESPN team"))
        abbr, _ = nba_team(team)
        roster = _request_json(f"/teams/{tid}/roster")
        athletes = _require(roster, "athletes", f"ESPN roster {abbr}")
        for a in athletes:
            out.append(
                {
                    "espn_id": str(_require(a, "id", f"ESPN roster {abbr} athlete")),
                    "name": str(a.get("displayName") or a.get("fullName") or "").strip(),
                    "dob": str(a.get("dateOfBirth") or "")[:10],
                    "team": abbr,
                },
            )
    print(f"ESPN rosters: {len(out)} athletes on {len(teams)} teams.")
    _ROSTER_CACHE = list(out)
    return out


def apply_player_map(
    frame: pd.DataFrame,
    mapper: EspnPlayerMapper,
    *,
    roster: list[dict[str, str]] | None = None,
) -> pd.DataFrame:
    """
    Fill PLAYER_ID from ESPN_PLAYER_ID and drop the ESPN id column.

    Unmapped athletes are resolved in one batch together with ``roster`` (ESPN
    rosters: birth dates for confirmation, and every rostered player competes
    for its exact-name id, so a near-name never steals it).
    """
    if frame.empty:
        return frame.drop(columns=[ESPN_ID_COL], errors="ignore")
    latest = frame.drop_duplicates(ESPN_ID_COL, keep="last").set_index(ESPN_ID_COL)
    roster_by_id = {a["espn_id"]: a for a in roster or []}
    batch = [
        Athlete(
            eid,
            str(row["PLAYER_NAME"]),
            (roster_by_id.get(eid) or {}).get("dob") or None,
            str(row["TEAM_ABBREVIATION"]),
        )
        for eid, row in latest.iterrows()
    ]
    batch += [
        Athlete(a["espn_id"], a["name"], a["dob"] or None, a["team"])
        for a in roster or []
        if a["espn_id"] not in latest.index
    ]
    ids = mapper.resolve_many(batch)
    out = frame.copy()
    out["PLAYER_ID"] = out[ESPN_ID_COL].map(ids).astype("int64")
    return out.drop(columns=[ESPN_ID_COL])


def _roster_if_needed(mapper: EspnPlayerMapper, espn_ids: Iterable[str]) -> list[dict[str, str]]:
    """ESPN rosters (31 requests), fetched only when some athletes are unmapped."""
    if not mapper.unknown(espn_ids):
        return []
    try:
        return fetch_roster_athletes()
    except Exception as exc:  # noqa: BLE001 - name matching still works without birth dates
        print(f"WARNING: ESPN rosters unavailable for birth-date checks ({exc}); matching by name only.")
        return []


# ---------------------------------------------------------------------------
# Cache merge + refresh
# ---------------------------------------------------------------------------

def load_existing_raw_logs(path: Path | None = None) -> pd.DataFrame:
    csv_path = path or RAW_GAME_LOGS_CSV
    if not csv_path.is_file():
        return pd.DataFrame()
    try:
        return pd.read_csv(csv_path, low_memory=False)
    except (OSError, pd.errors.EmptyDataError, ValueError):
        return pd.DataFrame()


def _day_keys(frame: pd.DataFrame) -> pd.Series:
    day = pd.to_datetime(frame["GAME_DATE"], errors="coerce").dt.strftime("%Y-%m-%d")
    pid = pd.to_numeric(frame["PLAYER_ID"], errors="coerce").astype("Int64").astype(str)
    return pid + "|" + day.fillna("")


def merge_replacing(existing: pd.DataFrame, incoming: pd.DataFrame) -> pd.DataFrame:
    """
    Cached rows + incoming final rows; an incoming row replaces any cached row for
    the same PLAYER_ID + GAME_DATE (a player plays at most one game per day, and
    cached GAME_IDs come from other sources so they cannot be compared).
    """
    if incoming is None or incoming.empty:
        return existing.copy()
    if existing is None or existing.empty:
        return incoming.reset_index(drop=True)
    replaced = _day_keys(existing).isin(set(_day_keys(incoming).tolist()))
    if replaced.any():
        print(f"ESPN: replaced {int(replaced.sum())} cached rows with final ESPN rows (same player + date).")
    merged = pd.concat([existing[~replaced], incoming], ignore_index=True)
    gid = merged["GAME_ID"].astype(str)
    key = pd.to_numeric(merged["PLAYER_ID"], errors="coerce").astype("Int64").astype(str) + "|" + gid
    return merged[~key.duplicated(keep="last")].reset_index(drop=True)


def _max_game_date(df: pd.DataFrame, season: str) -> date | None:
    if df.empty or "GAME_DATE" not in df.columns or "SEASON" not in df.columns:
        return None
    sub = df[df["SEASON"].astype(str) == season]
    dates = pd.to_datetime(sub["GAME_DATE"], errors="coerce").dropna()
    return None if dates.empty else dates.max().date()


def _season_has_rows(df: pd.DataFrame, season: str) -> bool:
    return not df.empty and "SEASON" in df.columns and bool((df["SEASON"].astype(str) == season).any())


def _force_full_fetch() -> bool:
    return (os.environ.get("PIPELINE_FULL_FETCH") or "").strip().lower() in ("1", "true", "yes", "on")


SYNC_WINDOW_JSON = DATA_DIR / "sync_window.json"


def write_sync_window(path: Path, *, full: bool, since: date | None, reason: str) -> None:
    """
    Tell sync_prices_to_supabase.py which rows this run could have changed.

    ``full`` (cold start, forced full fetch, ``--espn-refetch-from`` repair): the
    whole table must be reloaded. Otherwise only rows with ``game_date >= since``
    can differ from the last sync: the price engine walks forward in time, so new
    or replaced games never change Fair Value for earlier games.
    """
    payload = {"mode": "full" if full or since is None else "incremental", "reason": reason}
    if payload["mode"] == "incremental":
        payload["since"] = since.isoformat()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


def _refetch_from_env() -> date | None:
    """``ESPN_REFETCH_FROM=YYYY-MM-DD`` (empty/unset = normal incremental run)."""
    raw = (os.environ.get("ESPN_REFETCH_FROM") or "").strip()
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError as exc:
        raise ValueError(f"ESPN_REFETCH_FROM must be YYYY-MM-DD, got {raw!r}") from exc


def season_dates(start_year: int, today: date) -> list[date]:
    """
    Every day in ESPN's window for the season starting in ``start_year`` (up to
    today). The window comes from the scoreboard's ``leagues[0].season`` for a
    mid-season date, so shortened/shifted seasons (2019-20, 2020-21) are covered.
    """
    probe = fetch_scoreboard(date(start_year, 12, 25))
    try:
        season = probe["leagues"][0]["season"]
        start = eastern_date(season["startDate"])
        end = eastern_date(season["endDate"])
        if int(season["year"]) != start_year + 1:
            raise EspnShapeError(f"scoreboard season {season['year']} != {start_year + 1}")
        first = datetime.strptime(start, "%Y-%m-%d").date()
        last = datetime.strptime(end, "%Y-%m-%d").date()
    except (KeyError, IndexError, TypeError, ValueError, EspnShapeError) as exc:
        print(f"ESPN: season window lookup failed ({exc}); using Oct 1 - Jun 30.")
        first, last = date(start_year, 10, 1), date(start_year + 1, 6, 30)
    last = min(last, today)
    return [first + timedelta(days=i) for i in range((last - first).days + 1)]


def date_range(first: date, last: date) -> list[date]:
    return [first + timedelta(days=i) for i in range(max(0, (last - first).days + 1))]


def refresh_raw_game_logs(
    start_year: int | None = None,
    end_year: int | None = None,
    out_path: Path | None = None,
    *,
    force_full: bool = False,
    today: date | None = None,
    mapper: EspnPlayerMapper | None = None,
    map_csv: Path | None = None,
    refetch_from: date | None = None,
) -> pd.DataFrame:
    """
    Merge cached raw logs with final ESPN box scores and write ``out_path``.

    ``refetch_from`` / ``ESPN_REFETCH_FROM`` additionally re-downloads every day from
    that date through today and replaces the stored rows for those days (repairs the
    partial in-progress box scores the BALLDONTLIE-era cache kept).

    Incremental by default: re-fetch (latest cached current-season date − 1 day)
    through today (ET). A missing prior season or current season is fetched in full;
    ``force_full`` / ``PIPELINE_FULL_FETCH=1`` re-downloads the whole window.
    """
    if start_year is None or end_year is None:
        start_year, end_year = sw.automated_window_season_years()
    out = out_path or RAW_GAME_LOGS_CSV
    out.parent.mkdir(parents=True, exist_ok=True)
    today = today or today_eastern()
    cached = load_existing_raw_logs(out)
    full = force_full or _force_full_fetch()
    # A forced full fetch rebuilds the file, but the old cache still seeds the id map.
    existing = pd.DataFrame() if full else cached

    days: list[date] = []
    sync_full_reason: str | None = "full fetch" if existing.empty else None
    if existing.empty:
        print("ESPN: full fetch (no cache or forced).")
        for y in range(start_year, end_year + 1):
            days.extend(season_dates(y, today))
    else:
        prior, current = sw.season_string(start_year), sw.season_string(end_year)
        if start_year != end_year and not _season_has_rows(existing, prior):
            print(f"ESPN: prior season {prior} missing from cache — full fetch of that season.")
            days.extend(season_dates(start_year, today))
            sync_full_reason = "prior season fetched in full"
        refetch_from = refetch_from or _refetch_from_env()
        if refetch_from:
            print(f"ESPN: re-fetching every final from {refetch_from} to {today} (replacing stored rows).")
            days.extend(date_range(refetch_from, today))
            sync_full_reason = f"re-fetch from {refetch_from}"
        anchor = _max_game_date(existing, current)
        if anchor:
            first = anchor - timedelta(days=1)
            print(f"ESPN: incremental {current} from {first} (latest cached {anchor}) to {today}.")
            days.extend(date_range(first, today))
        else:
            print(f"ESPN: no {current} rows in cache — full fetch of the current season.")
            days.extend(season_dates(end_year, today))
            sync_full_reason = "current season fetched in full"
    days = sorted(set(days))

    incoming = collect_dates(days)
    if mapper is None:
        mapper = EspnPlayerMapper.from_sources(cached, map_csv=map_csv)
        mapper.assert_safe_first_run(today)
    if not incoming.empty:
        roster = _roster_if_needed(mapper, incoming[ESPN_ID_COL].unique())
        incoming = apply_player_map(incoming, mapper, roster=roster)
    mapper.print_summary()
    mapper.persist()

    merged = merge_replacing(existing, incoming.drop(columns=[ESPN_ID_COL], errors="ignore"))
    merged.to_csv(out, index=False)
    try:
        shown = out.relative_to(ROOT)
    except ValueError:
        shown = out
    print(f"ESPN: +{len(incoming)} final rows; merged cache -> {len(merged)} rows at {shown}")
    if out == RAW_GAME_LOGS_CSV:
        write_sync_window(
            SYNC_WINDOW_JSON,
            full=sync_full_reason is not None,
            since=min(days) if days else None,
            reason=sync_full_reason or "incremental fetch",
        )
    return merged


def save_active_players_espn(
    out_path: Path | None = None,
    prices_csv: Path | None = None,
    *,
    mapper: EspnPlayerMapper | None = None,
    raw_logs_csv: Path | None = None,
    map_csv: Path | None = None,
) -> Path:
    """
    Write data/active_players.csv (player_id, player_name) from ESPN rosters, with
    ESPN ids mapped onto the existing market ids.
    """
    path = out_path or (DATA_DIR / "active_players.csv")
    path.parent.mkdir(parents=True, exist_ok=True)
    athletes = fetch_roster_athletes()
    if not athletes:
        raise EspnShapeError("ESPN rosters returned no athletes; refusing to write an empty roster.")
    if mapper is None:
        existing = load_existing_raw_logs(raw_logs_csv)
        mapper = EspnPlayerMapper.from_sources(existing, map_csv=map_csv, prices_csv=prices_csv)
        mapper.assert_safe_first_run(today_eastern())
    ids = mapper.resolve_many(Athlete(a["espn_id"], a["name"], a["dob"] or None, a["team"]) for a in athletes)
    rows = [{"player_id": ids[a["espn_id"]], "player_name": a["name"]} for a in athletes]
    mapper.print_summary()
    mapper.persist()

    df = pd.DataFrame(rows).drop_duplicates(subset=["player_id"]).sort_values("player_id")
    prices_path = prices_csv if prices_csv is not None else (DATA_DIR / "player_game_prices.csv")
    if prices_path.is_file():
        price_ids = set(
            pd.to_numeric(
                pd.read_csv(prices_path, usecols=["player_id"])["player_id"], errors="coerce",
            ).dropna().astype("int64").tolist(),
        )
        matched = int(df["player_id"].isin(price_ids).sum())
        print(f"Active roster: {matched} of {len(df)} players have prices.")
        if matched == 0:
            raise RuntimeError(
                f"Active roster shares no players with {prices_path.name}. Refusing to publish an empty market.",
            )
    df.to_csv(path, index=False)
    try:
        shown = path.relative_to(ROOT)
    except ValueError:
        shown = path
    print(f"Saved {len(df)} active players -> {shown}")
    return path


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Print ESPN box-score rows for one date (no writes).")
    parser.add_argument("day", help="YYYY-MM-DD (US/Eastern)")
    args = parser.parse_args()
    d = datetime.strptime(args.day, "%Y-%m-%d").date()
    frame = collect_dates([d])
    with pd.option_context("display.max_columns", 40, "display.width", 200):
        print(frame.head(40))
    print(f"{len(frame)} rows")
