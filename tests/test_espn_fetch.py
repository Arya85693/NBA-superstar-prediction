"""ESPN box-score fetcher: parsing, filtering, incremental merge. No network."""
import copy
import gzip
import io
import json
import urllib.error
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
import pytest

import espn_fetch as ef
from espn_player_map import Candidate, EspnPlayerMapper

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "espn"


def load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.fixture
def final_summary() -> dict:
    return load("summary_final_401909974.json")


@pytest.fixture
def board() -> dict:
    return load("scoreboard_20261111.json")


def event(board: dict, event_id: str) -> dict:
    return next(e for e in board["events"] if e["id"] == event_id)


def row_for(df: pd.DataFrame, name: str) -> pd.Series:
    sub = df[df["PLAYER_NAME"] == name]
    assert len(sub) == 1, name
    return sub.iloc[0]


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------

def test_parse_final_summary_has_every_cleaning_column(final_summary, board):
    df = ef.parse_summary(final_summary, event(board, "401909974"))
    assert list(df.columns[:31]) == ef.RAW_COLUMNS
    assert len(ef.RAW_COLUMNS) == 31
    assert len(df) == 28  # 13 GSW + 15 HOU athletes, DNPs included
    assert set(df["GAME_ID"]) == {"401909974"}
    # 02:30Z on Nov 12 is 21:30 on Nov 11 in New York.
    assert set(df["GAME_DATE"]) == {"2026-11-11"}
    assert set(df["SEASON"]) == {"2026-27"}
    assert set(df["SEASON_TYPE"]) == {"Regular Season"}
    assert (df["FANTASY_PTS"] == 0.0).all()


def test_parse_away_player_exact_numbers(final_summary, board):
    df = ef.parse_summary(final_summary, event(board, "401909974"))
    r = row_for(df, "Draymond Green")
    assert r["ESPN_PLAYER_ID"] == "6589"
    assert r["TEAM_ABBREVIATION"] == "GSW"  # ESPN "GS"
    assert r["TEAM_ID"] == 1610612744
    assert r["MATCHUP"] == "GSW @ HOU"
    assert r["WL"] == "L"
    assert r["MIN"] == 27
    assert (r["PTS"], r["FGM"], r["FGA"], r["FG3M"], r["FG3A"], r["FTM"], r["FTA"]) == (7, 3, 5, 1, 1, 0, 0)
    assert r["FG_PCT"] == pytest.approx(0.6)
    assert r["FG3_PCT"] == pytest.approx(1.0)
    assert r["FT_PCT"] == 0.0  # 0 attempts -> 0, like BALLDONTLIE
    assert (r["OREB"], r["DREB"], r["REB"]) == (3, 2, 5)
    assert (r["AST"], r["STL"], r["BLK"], r["TOV"], r["PF"]) == (7, 0, 1, 1, 2)
    assert r["PLUS_MINUS"] == -20


def test_parse_home_players_exact_numbers(final_summary, board):
    df = ef.parse_summary(final_summary, event(board, "401909974"))
    kd = row_for(df, "Kevin Durant")
    assert (kd["TEAM_ABBREVIATION"], kd["TEAM_ID"], kd["MATCHUP"], kd["WL"]) == (
        "HOU", 1610612745, "HOU vs. GSW", "W",
    )
    assert (kd["MIN"], kd["PTS"], kd["FGM"], kd["FGA"], kd["FG3M"], kd["FG3A"], kd["FTM"], kd["FTA"]) == (
        34, 20, 8, 17, 1, 4, 3, 4,
    )
    assert kd["FT_PCT"] == pytest.approx(0.75)
    assert (kd["OREB"], kd["DREB"], kd["REB"], kd["AST"], kd["TOV"], kd["PF"]) == (0, 4, 4, 5, 2, 2)
    assert kd["PLUS_MINUS"] == 17  # "+17"

    sengun = row_for(df, "Alperen Sengun")
    assert (sengun["MIN"], sengun["PTS"], sengun["FGM"], sengun["FGA"]) == (37, 19, 8, 14)
    assert (sengun["OREB"], sengun["DREB"], sengun["REB"]) == (4, 9, 13)
    assert (sengun["AST"], sengun["STL"], sengun["BLK"], sengun["TOV"], sengun["PF"]) == (9, 1, 1, 2, 4)
    assert sengun["PLUS_MINUS"] == 11
    assert sengun["FG_PCT"] == pytest.approx(0.571)


def test_parse_dnp_rows_are_zero_minute_rows(final_summary, board):
    df = ef.parse_summary(final_summary, event(board, "401909974"))
    adams = row_for(df, "Steven Adams")
    assert adams["MIN"] == 0
    stats = ["FGM", "FGA", "FG3M", "FG3A", "FTM", "FTA", "OREB", "DREB", "REB", "PF", "AST", "STL", "BLK", "TOV", "PTS", "PLUS_MINUS"]
    assert all(adams[c] == 0 for c in stats)
    assert adams["FG_PCT"] == 0.0
    assert adams["WL"] == "W"


def test_parse_looks_up_stats_by_key_not_position(final_summary, board):
    """Reverse the key order (and every athlete's stats with it): output must not change."""
    shuffled = copy.deepcopy(final_summary)
    for team in shuffled["boxscore"]["players"]:
        block = team["statistics"][0]
        block["keys"] = list(reversed(block["keys"]))
        for ath in block["athletes"]:
            ath["stats"] = list(reversed(ath["stats"]))
    ev = event(board, "401909974")
    pd.testing.assert_frame_equal(ef.parse_summary(final_summary, ev), ef.parse_summary(shuffled, ev))


def test_parse_missing_stat_key_fails_loudly(final_summary):
    broken = copy.deepcopy(final_summary)
    block = broken["boxscore"]["players"][0]["statistics"][0]
    i = block["keys"].index("offensiveRebounds")
    block["keys"][i] = "offReb"
    with pytest.raises(ef.EspnShapeError, match="offensiveRebounds"):
        ef.parse_summary(broken)


def test_parse_missing_boxscore_fails_loudly(final_summary):
    broken = copy.deepcopy(final_summary)
    del broken["boxscore"]
    with pytest.raises(ef.EspnShapeError):
        ef.parse_summary(broken)


def test_in_progress_summary_writes_nothing():
    live = load("summary_live_401909976.json")
    assert live["header"]["competitions"][0]["status"]["type"]["state"] == "in"
    assert ef.parse_summary(live).empty


def test_season_types(final_summary):
    playoffs = copy.deepcopy(final_summary)
    playoffs["header"]["season"]["type"] = 3
    assert set(ef.parse_summary(playoffs)["SEASON_TYPE"]) == {"Playoffs"}
    play_in = copy.deepcopy(final_summary)
    play_in["header"]["season"]["type"] = 5
    # BALLDONTLIE marked play-in games postseason=false.
    assert set(ef.parse_summary(play_in)["SEASON_TYPE"]) == {"Regular Season"}
    preseason = copy.deepcopy(final_summary)
    preseason["header"]["season"]["type"] = 1
    assert ef.parse_summary(preseason).empty


def test_skip_reason_filters_preseason_all_star_and_live(board):
    ev = event(board, "401909974")
    assert ef.skip_reason(ev) is None
    pre = copy.deepcopy(ev)
    pre["season"]["type"] = 1
    assert ef.skip_reason(pre) == "season type 1"
    star = copy.deepcopy(ev)
    star["competitions"][0]["type"] = {"id": "4", "abbreviation": "ALLSTAR"}
    assert ef.skip_reason(star) == "all-star"
    live = load("scoreboard_20261112_live.json")
    reasons = {e["id"]: ef.skip_reason(e) for e in live["events"]}
    assert reasons == {
        "401909976": "not final (in)",
        "401909977": "not final (in)",
        "401909978": "not final (pre)",
        "401909979": "not final (pre)",
    }


def test_post_but_not_completed_is_not_final(board):
    ev = copy.deepcopy(event(board, "401909974"))
    ev["competitions"][0]["status"]["type"]["completed"] = False
    assert not ef.is_final(ev)


def test_team_abbreviation_mapping():
    for espn, nba in {"GS": "GSW", "NO": "NOP", "NY": "NYK", "SA": "SAS", "UTAH": "UTA", "WSH": "WAS"}.items():
        assert ef.nba_team({"id": "unknown", "abbreviation": espn})[0] == nba
    assert ef.nba_team({"id": "2", "abbreviation": "BOS"}) == ("BOS", 1610612738)
    assert len({tid for _, tid in ef.ESPN_TEAMS.values()}) == 30
    teams = load("teams.json")["sports"][0]["leagues"][0]["teams"]
    assert {ef.nba_team(t["team"])[0] for t in teams} == {a for a, _ in ef.ESPN_TEAMS.values()}
    with pytest.raises(ef.EspnShapeError):
        ef.nba_team({"id": "99", "abbreviation": "XYZ"})


def test_eastern_dates_and_season_label():
    assert ef.eastern_date("2026-11-12T02:30Z") == "2026-11-11"
    assert ef.eastern_date("2026-11-12T05:30Z") == "2026-11-12"  # EST (-5) after DST ends
    assert ef.eastern_date("2026-07-01T03:30Z") == "2026-06-30"  # EDT (-4)
    assert ef.season_label(2027) == "2026-27"
    assert ef.today_eastern(datetime(2026, 11, 12, 3, 0, tzinfo=timezone.utc)) == date(2026, 11, 11)


def test_eastern_offset_fallback_matches_zoneinfo():
    """The no-tzdata fallback must agree with zoneinfo around both DST switches."""
    from zoneinfo import ZoneInfo

    ny = ZoneInfo("America/New_York")
    for raw in ("2026-03-08T06:59Z", "2026-03-08T07:00Z", "2026-11-01T05:59Z", "2026-11-01T06:00Z", "2027-01-15T12:00Z"):
        dt = ef.parse_espn_datetime(raw)
        assert ef._eastern_offset(dt) == dt.astimezone(ny).utcoffset(), raw


# ---------------------------------------------------------------------------
# Collecting a date: only final games, summaries only for final events
# ---------------------------------------------------------------------------

def test_collect_dates_skips_live_games_without_fetching_them(final_summary, board):
    live_board = load("scoreboard_20261112_live.json")
    asked: list[str] = []

    def summary(event_id: str) -> dict:
        asked.append(event_id)
        if event_id == "401909974":
            return final_summary
        raise AssertionError(f"summary requested for {event_id}")

    boards = {
        date(2026, 11, 11): {"events": [event(board, "401909974")]},
        date(2026, 11, 12): live_board,
    }
    df = ef.collect_dates(boards.keys(), scoreboard=boards.__getitem__, summary=summary)
    assert asked == ["401909974"]
    assert set(df["GAME_ID"]) == {"401909974"}


def test_collect_dates_ignores_a_summary_that_is_not_final_yet(final_summary, board):
    """Scoreboard says final but the summary still says live: write nothing."""
    stale = copy.deepcopy(final_summary)
    stale["header"]["competitions"][0]["status"]["type"].update(state="in", completed=False)
    df = ef.collect_dates(
        [date(2026, 11, 11)],
        scoreboard=lambda d: {"events": [event(board, "401909974")]},
        summary=lambda eid: stale,
    )
    assert df.empty


def test_collect_dates_requires_events_key():
    with pytest.raises(ef.EspnShapeError):
        ef.collect_dates([date(2026, 11, 11)], scoreboard=lambda d: {}, summary=lambda e: {})


# ---------------------------------------------------------------------------
# Merge: replace same player + date, leave other dates untouched
# ---------------------------------------------------------------------------

def _raw(pid, date_, gid, pts, name="P", season="2026-27"):
    return {
        "PLAYER_ID": pid, "PLAYER_NAME": name, "GAME_ID": gid, "GAME_DATE": date_,
        "SEASON": season, "SEASON_TYPE": "Regular Season", "PTS": pts,
    }


def test_merge_replacing_swaps_same_player_and_date():
    existing = pd.DataFrame(
        [
            _raw(2544, "2026-11-10T00:00:00", 18447001, 4),  # partial BALLDONTLIE row
            _raw(2544, "2026-11-08", 18447000, 30),
            _raw(201142, "2026-11-10", 18447001, 25),
        ],
    )
    incoming = pd.DataFrame([_raw(2544, "2026-11-10", "401909900", 27)])
    merged = ef.merge_replacing(existing, incoming)
    lebron = merged[merged["PLAYER_ID"] == 2544].sort_values("GAME_DATE")
    assert lebron["PTS"].tolist() == [30, 27]
    assert lebron["GAME_ID"].astype(str).tolist() == ["18447000", "401909900"]
    assert merged[merged["PLAYER_ID"] == 201142]["PTS"].tolist() == [25]
    assert len(merged) == 3


def test_merge_replacing_without_incoming_keeps_cache():
    existing = pd.DataFrame([_raw(1, "2026-11-10", 5, 10)])
    pd.testing.assert_frame_equal(ef.merge_replacing(existing, pd.DataFrame()), existing)


def _mapper_for(summary: dict) -> EspnPlayerMapper:
    """Every athlete in the fixture already mapped (to its ESPN id + 1)."""
    from espn_player_map import MapRow

    rows = {}
    for team in summary["boxscore"]["players"]:
        for ath in team["statistics"][0]["athletes"]:
            eid = ath["athlete"]["id"]
            rows[eid] = MapRow(eid, int(eid) + 1, ath["athlete"]["displayName"], "test")
    return EspnPlayerMapper(rows, [])


def test_refresh_incremental_refetches_from_day_before_latest(tmp_path, monkeypatch, final_summary, board):
    cache = tmp_path / "raw.csv"
    durant_pid = 3202 + 1
    pd.DataFrame(
        [
            _raw(durant_pid, "2026-11-11", 18440000, 3, "Kevin Durant"),  # partial row, healed below
            _raw(durant_pid, "2026-11-08", 18439000, 31, "Kevin Durant"),  # older date: untouched
            _raw(77, "2026-04-12", 22501200, 12, "Old Season", season="2025-26"),
        ],
    ).to_csv(cache, index=False)

    asked_days: list[date] = []

    def fake_board(d: date) -> dict:
        asked_days.append(d)
        return {"events": [event(board, "401909974")]} if d == date(2026, 11, 11) else {"events": []}

    monkeypatch.setattr(ef, "fetch_scoreboard", fake_board)
    monkeypatch.setattr(ef, "fetch_summary", lambda eid: final_summary)
    out = ef.refresh_raw_game_logs(
        2025, 2026, out_path=cache, today=date(2026, 11, 12), mapper=_mapper_for(final_summary),
    )

    assert asked_days == [date(2026, 11, 10), date(2026, 11, 11), date(2026, 11, 12)]
    kd = out[out["PLAYER_ID"] == durant_pid].sort_values("GAME_DATE")
    assert kd["PTS"].tolist() == [31, 20]
    assert kd["GAME_ID"].astype(str).tolist() == ["18439000", "401909974"]
    assert (out["PLAYER_ID"] == 77).sum() == 1
    assert len(out) == 3 + 28 - 1  # 3 cached + 28 ESPN - 1 replaced
    assert ef.ESPN_ID_COL not in out.columns
    on_disk = pd.read_csv(cache)
    assert len(on_disk) == len(out)
    assert set(ef.RAW_COLUMNS) <= set(on_disk.columns)


REFETCH_TODAY = date(2026, 11, 21)


def _refetch_setup(tmp_path, monkeypatch, final_summary, board):
    """
    Partial row on 2026-11-11 (the fixture game's ET date), latest cached game on
    11-20: the normal incremental window (11-19..11-21) would never revisit 11-11.
    """
    cache = tmp_path / "raw.csv"
    durant_pid = 3202 + 1
    pd.DataFrame(
        [
            _raw(durant_pid, "2026-11-11", 18439000, 3, "Kevin Durant"),  # partial BALLDONTLIE-era row
            _raw(durant_pid, "2026-11-20", 18440000, 25, "Kevin Durant"),
            _raw(77, "2026-04-12", 22501200, 12, "Old Season", season="2025-26"),
        ],
    ).to_csv(cache, index=False)
    asked: list[date] = []

    def fake_board(d: date) -> dict:
        asked.append(d)
        return {"events": [event(board, "401909974")]} if d == date(2026, 11, 11) else {"events": []}

    monkeypatch.setattr(ef, "fetch_scoreboard", fake_board)
    monkeypatch.setattr(ef, "fetch_summary", lambda eid: final_summary)
    return cache, durant_pid, asked


def _durant_on(out: pd.DataFrame, pid: int, day: str) -> list:
    rows = out[(out["PLAYER_ID"] == pid) & (out["GAME_DATE"].astype(str).str[:10] == day)]
    return rows["PTS"].tolist()


def test_incremental_alone_never_heals_old_partial_rows(tmp_path, monkeypatch, final_summary, board):
    cache, durant_pid, asked = _refetch_setup(tmp_path, monkeypatch, final_summary, board)
    out = ef.refresh_raw_game_logs(
        2025, 2026, out_path=cache, today=REFETCH_TODAY, mapper=_mapper_for(final_summary),
    )
    assert asked == [date(2026, 11, d) for d in (19, 20, 21)]
    assert _durant_on(out, durant_pid, "2026-11-11") == [3]  # still the partial line


def test_refetch_from_replaces_old_partial_rows(tmp_path, monkeypatch, final_summary, board):
    cache, durant_pid, asked = _refetch_setup(tmp_path, monkeypatch, final_summary, board)
    out = ef.refresh_raw_game_logs(
        2025, 2026, out_path=cache, today=REFETCH_TODAY,
        mapper=_mapper_for(final_summary), refetch_from=date(2026, 11, 10),
    )
    # Every day from the re-fetch date through today (incremental window deduped in).
    assert asked == [date(2026, 11, d) for d in range(10, 22)]
    assert _durant_on(out, durant_pid, "2026-11-11") == [20]  # healed: final line
    assert _durant_on(out, durant_pid, "2026-11-20") == [25]  # no ESPN game that day: kept
    assert (out["PLAYER_ID"] == 77).sum() == 1  # outside the range: untouched


def test_refetch_from_env_var(tmp_path, monkeypatch, final_summary, board):
    cache, durant_pid, asked = _refetch_setup(tmp_path, monkeypatch, final_summary, board)
    monkeypatch.setenv("ESPN_REFETCH_FROM", "2026-11-11")
    out = ef.refresh_raw_game_logs(
        2025, 2026, out_path=cache, today=REFETCH_TODAY, mapper=_mapper_for(final_summary),
    )
    assert asked[0] == date(2026, 11, 11)
    assert _durant_on(out, durant_pid, "2026-11-11") == [20]
    monkeypatch.setenv("ESPN_REFETCH_FROM", "11/11/2026")
    with pytest.raises(ValueError, match="YYYY-MM-DD"):
        ef.refresh_raw_game_logs(2025, 2026, out_path=cache, today=REFETCH_TODAY,
                                 mapper=_mapper_for(final_summary))


def test_refresh_cold_start_fetches_whole_season(tmp_path, monkeypatch):
    cache = tmp_path / "raw.csv"
    asked: list[date] = []

    def fake_board(d: date) -> dict:
        asked.append(d)
        return {
            "leagues": [{"season": {"year": 2027, "startDate": "2026-09-30T07:00Z", "endDate": "2027-06-26T06:59Z"}}],
            "events": [],
        }

    monkeypatch.setattr(ef, "fetch_scoreboard", fake_board)
    ef.refresh_raw_game_logs(2026, 2026, out_path=cache, today=date(2026, 10, 5), mapper=EspnPlayerMapper({}, []))
    # One probe for the season window, then every day from Sept 30 to today.
    assert asked[0] == date(2026, 12, 25)
    assert asked[1:] == [date(2026, 9, 30) + timedelta(days=i) for i in range(6)]


# ---------------------------------------------------------------------------
# Rosters / active players
# ---------------------------------------------------------------------------

def _fake_roster_api(path: str, params=None) -> dict:
    if path == "/teams":
        teams = load("teams.json")
        teams["sports"][0]["leagues"][0]["teams"] = [
            t for t in teams["sports"][0]["leagues"][0]["teams"] if t["team"]["id"] == "9"
        ]
        return teams
    if path == "/teams/9/roster":
        return load("roster_9_gs.json")
    raise AssertionError(path)


def test_fetch_roster_athletes_reads_birth_dates(monkeypatch):
    monkeypatch.setattr(ef, "_request_json", _fake_roster_api)
    monkeypatch.setattr(ef, "_ROSTER_CACHE", None)
    athletes = ef.fetch_roster_athletes(refresh=True)
    curry = next(a for a in athletes if a["name"] == "Stephen Curry")
    assert curry == {"espn_id": "3975", "name": "Stephen Curry", "dob": "1988-03-14", "team": "GSW"}
    assert len(athletes) == 18


def test_save_active_players_maps_onto_existing_ids(tmp_path, monkeypatch):
    monkeypatch.setattr(ef, "_request_json", _fake_roster_api)
    monkeypatch.setattr(ef, "_ROSTER_CACHE", None)
    prices = tmp_path / "prices.csv"
    pd.DataFrame(
        [
            {"player_id": 201939, "player_name": "Stephen Curry", "game_date": "2026-11-10"},
            {"player_id": 203110, "player_name": "Draymond Green", "game_date": "2026-11-10"},
        ],
    ).to_csv(prices, index=False)
    mapper = EspnPlayerMapper(
        {},
        [
            Candidate(201939, "Stephen Curry", {"stephen curry"}, pd.Timestamp("2026-11-10"), 50),
            Candidate(203110, "Draymond Green", {"draymond green"}, pd.Timestamp("2026-11-10"), 50),
        ],
        csv_path=tmp_path / "map.csv",
    )
    out = ef.save_active_players_espn(tmp_path / "active.csv", prices, mapper=mapper)
    df = pd.read_csv(out)
    assert list(df.columns) == ["player_id", "player_name"]
    ids = dict(zip(df["player_name"], df["player_id"]))
    assert ids["Stephen Curry"] == 201939
    assert ids["Draymond Green"] == 203110
    assert ids["Charles Bassey"] == 9_000_000_000 + 4397886
    assert len(df) == 18
    assert (tmp_path / "map.csv").is_file()


def test_save_active_players_refuses_roster_without_prices(tmp_path, monkeypatch):
    monkeypatch.setattr(ef, "_request_json", _fake_roster_api)
    monkeypatch.setattr(ef, "_ROSTER_CACHE", None)
    prices = tmp_path / "prices.csv"
    pd.DataFrame([{"player_id": 1, "player_name": "Nobody", "game_date": "2026-11-10"}]).to_csv(prices, index=False)
    with pytest.raises(RuntimeError, match="empty market"):
        ef.save_active_players_espn(tmp_path / "active.csv", prices, mapper=EspnPlayerMapper({}, []))
    assert not (tmp_path / "active.csv").exists()


# ---------------------------------------------------------------------------
# HTTP retries
# ---------------------------------------------------------------------------

class _Resp:
    def __init__(self, payload: dict, gz: bool = True):
        body = json.dumps(payload).encode()
        self._body = gzip.compress(body) if gz else body
        self.headers = {"Content-Encoding": "gzip"} if gz else {}

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def test_request_json_retries_network_errors_and_5xx(monkeypatch):
    monkeypatch.setattr(ef.time, "sleep", lambda s: None)
    calls = {"n": 0}

    def fake_urlopen(req, timeout=None):
        calls["n"] += 1
        assert "Mozilla" in req.get_header("User-agent")
        assert req.get_header("Accept-encoding") == "gzip"
        if calls["n"] == 1:
            raise urllib.error.URLError("connection reset")
        if calls["n"] == 2:
            raise urllib.error.HTTPError(req.full_url, 503, "busy", {}, io.BytesIO(b""))
        return _Resp({"events": []})

    monkeypatch.setattr(ef.urllib.request, "urlopen", fake_urlopen)
    assert ef._request_json("/scoreboard", {"dates": "20261111"}) == {"events": []}
    assert calls["n"] == 3


def test_request_json_does_not_retry_404(monkeypatch):
    monkeypatch.setattr(ef.time, "sleep", lambda s: None)
    calls = {"n": 0}

    def fake_urlopen(req, timeout=None):
        calls["n"] += 1
        raise urllib.error.HTTPError(req.full_url, 404, "missing", {}, io.BytesIO(b"nope"))

    monkeypatch.setattr(ef.urllib.request, "urlopen", fake_urlopen)
    with pytest.raises(RuntimeError, match="HTTP 404"):
        ef._request_json("/summary", {"event": "1"})
    assert calls["n"] == 1


def test_fetch_summary_retries_404_then_uses_second_host(monkeypatch):
    """ESPN 404'd a real final playoff box score in CI; the second host serves it."""
    monkeypatch.setattr(ef.time, "sleep", lambda s: None)
    hosts: list[str] = []

    def fake_urlopen(req, timeout=None):
        host = urllib.parse.urlparse(req.full_url).netloc
        hosts.append(host)
        if host == "site.api.espn.com":
            raise urllib.error.HTTPError(req.full_url, 404, "missing", {}, io.BytesIO(gzip.compress(b"gone")))
        return _Resp({"boxscore": {"players": []}})

    monkeypatch.setattr(ef.urllib.request, "urlopen", fake_urlopen)
    assert ef.fetch_summary("401869391") == {"boxscore": {"players": []}}
    assert hosts == ["site.api.espn.com"] * ef.SUMMARY_NOT_FOUND_ATTEMPTS + ["site.web.api.espn.com"]


def test_http_error_body_is_gunzipped(monkeypatch):
    monkeypatch.setattr(ef.time, "sleep", lambda s: None)

    def fake_urlopen(req, timeout=None):
        raise urllib.error.HTTPError(req.full_url, 404, "x", {}, io.BytesIO(gzip.compress(b"Not Found page")))

    monkeypatch.setattr(ef.urllib.request, "urlopen", fake_urlopen)
    with pytest.raises(ef.EspnHttpError, match="Not Found page") as info:
        ef._request_json("/summary", {"event": "1"})
    assert info.value.code == 404


def _finals(board: dict, ids: list[str]) -> list[dict]:
    base = event(board, "401909974")
    return [{**base, "id": eid} for eid in ids]


def test_collect_dates_skips_one_unfetchable_box_score(board, final_summary):
    events = _finals(board, ["1", "2", "3"])

    def summary(eid: str) -> dict:
        if eid == "2":
            raise ef.EspnHttpError(404, "https://x/summary?event=2", "gone")
        return final_summary

    out = ef.collect_dates([date(2026, 11, 11)], scoreboard=lambda d: {"events": events}, summary=summary)
    one_game = len(ef.parse_summary(final_summary, events[0]))
    assert one_game > 0
    assert len(out) == 2 * one_game  # games 1 and 3 ingested, game 2 skipped


def test_collect_dates_fails_when_many_box_scores_fail(board):
    events = _finals(board, [str(i) for i in range(10)])

    def summary(eid: str) -> dict:
        raise ef.EspnHttpError(404, f"https://x/summary?event={eid}", "gone")

    with pytest.raises(RuntimeError, match="could not be fetched"):
        ef.collect_dates([date(2026, 11, 11)], scoreboard=lambda d: {"events": events}, summary=summary)
