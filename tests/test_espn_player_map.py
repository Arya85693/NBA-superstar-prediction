"""ESPN athlete id -> existing player id mapping. No network, no Supabase."""
from datetime import date

import pandas as pd
import pytest

import espn_player_map as epm
from espn_player_map import Athlete, Candidate, EspnPlayerMapper, MapRow

NOW = pd.Timestamp("2026-11-11")
OLD = pd.Timestamp("2026-04-12")


def cand(pid, name, last=NOW, rows=50, dob=None, team=""):
    return Candidate(
        pid,
        name,
        {epm.normalize_name(name)},
        last,
        rows,
        date.fromisoformat(dob) if dob else None,
        team,
    )


def mapper(*cands, mapping=None, **kw):
    return EspnPlayerMapper(mapping or {}, list(cands), **kw)


def test_exact_name_match_keeps_existing_id():
    m = mapper(cand(2544, "LeBron James"))
    assert m.resolve("1966", "LeBron James") == 2544
    assert m.pending["1966"].matched_by == "name"


def test_accents_and_suffixes_are_ignored():
    m = mapper(cand(203999, "Nikola Jokić"), cand(1631095, "Jabari Smith Jr."), cand(1628398, "Kevin Porter"))
    assert m.resolve("3112335", "Nikola Jokic") == 203999
    assert m.resolve("4432639", "Jabari Smith") == 1631095
    assert m.resolve("4066234", "Kevin Porter Jr.") == 1628398


def test_suffix_merge_prefers_latest_game_like_canon_player_ids():
    """'James Harden Jr.' and 'James Harden' normalise alike; the id with the latest game wins."""
    m = mapper(cand(201935, "James Harden", last=pd.Timestamp("2018-11-01")), cand(999001, "James Harden", last=NOW))
    assert m.resolve("3992", "James Harden Jr.") == 999001
    assert any("ambiguous" in note for note in m.report.review)


def test_birth_date_breaks_a_same_name_tie():
    m = mapper(
        cand(1, "Marcus Williams", dob="1995-06-01", last=NOW),
        cand(2, "Marcus Williams", dob="2004-02-10", last=NOW),
    )
    assert m.resolve("777", "Marcus Williams", "2004-02-11") == 2  # within one day
    assert m.pending["777"].matched_by == "name+dob"


def test_birth_date_conflict_with_retired_namesake_creates_new_player():
    m = mapper(
        cand(1500, "Marcus Williams", dob="1985-06-01", last=pd.Timestamp("2019-03-01")),
        cand(2544, "LeBron James", last=NOW),
    )
    assert m.resolve("5000001", "Marcus Williams", "2006-01-01") == 9_000_000_000 + 5000001
    assert m.pending["5000001"].matched_by == "new"


def test_birth_date_conflict_on_active_exact_name_still_matches_but_is_flagged():
    """One feed has a wrong birth date (seen for Zach Edey): keep the active player's id."""
    m = mapper(cand(1641744, "Zach Edey", dob="2002-05-14", last=NOW))
    assert m.resolve("4600663", "Zach Edey", "2002-03-14") == 1641744
    assert any("birth dates differ" in note for note in m.report.review)


def test_new_player_gets_offset_id():
    m = mapper(cand(2544, "LeBron James"))
    assert m.resolve("5175737", "Yaxel Lendeborg") == 9_005_175_737
    assert epm.new_player_id("5175737") == 9_005_175_737
    assert m.report.new == [("5175737", "Yaxel Lendeborg", 9_005_175_737)]


def test_new_id_colliding_with_an_existing_player_fails():
    m = mapper(cand(9_000_000_123, "Someone Else"))
    with pytest.raises(RuntimeError, match="already used"):
        m.resolve("123", "Brand New")


def test_name_variants_spacing_and_word_order():
    m = mapper(cand(38017733, "A.J. Green"), cand(1057275769, "Hansen Yang"))
    assert m.resolve("4397475", "AJ Green") == 38017733
    assert m.resolve("5217746", "Yang Hansen") == 1057275769
    assert m.pending["4397475"].matched_by == "name-variant"


def test_last_name_plus_birth_date():
    m = mapper(cand(1629651, "Nicolas Claxton", dob="1999-04-17"))
    assert m.resolve("4278067", "Nic Claxton", "1999-04-17") == 1629651
    assert m.pending["4278067"].matched_by == "lastname+dob"


def test_stale_exact_name_loses_to_the_id_still_playing():
    """BALLDONTLIE kept its own id for 'Airious Bailey'; that is the id the market trades now."""
    m = mapper(
        cand(1642846, "Ace Bailey", last=OLD, team="UTA"),
        cand(1057260888, "Airious Bailey", last=NOW, team="UTA"),
    )
    assert m.resolve("4873138", "Ace Bailey", None, "UTA") == 1057260888
    assert m.pending["4873138"].matched_by == "team+lastname"
    assert any(note.startswith("ESPN 4873138") and "REVIEW" in note for note in m.report.review)


def test_recent_exact_name_is_not_overridden():
    m = mapper(
        cand(1631114, "Jalen Williams", last=NOW, team="OKC"),
        cand(1631119, "Jaylin Williams", last=NOW, team="OKC"),
    )
    assert m.resolve("4593803", "Jalen Williams", None, "OKC") == 1631114


def test_batch_gives_each_id_to_its_exact_name_owner():
    """Jalen has not played lately, so alone he would reach for Jaylin's (recent) id.
    Resolved together, Jaylin's exact claim wins and Jalen gets his own id."""
    m = mapper(
        cand(1631114, "Jalen Williams", last=OLD, team="OKC"),
        cand(1631119, "Jaylin Williams", last=NOW, team="OKC"),
    )
    ids = m.resolve_many(
        [Athlete("4593803", "Jalen Williams", None, "OKC"), Athlete("4432823", "Jaylin Williams", None, "OKC")],
    )
    assert ids == {"4593803": 1631114, "4432823": 1631119}


def test_one_player_id_never_goes_to_two_espn_ids():
    m = mapper(cand(2544, "LeBron James"))
    ids = m.resolve_many([Athlete("1966", "LeBron James"), Athlete("9999", "LeBron James")])
    assert len(set(ids.values())) == 2
    assert 2544 in ids.values()
    assert m.resolve("1966", "LeBron James") == 2544  # stable on repeat


def test_persisted_mapping_owns_its_id():
    m = mapper(cand(2544, "LeBron James"), mapping={"1966": MapRow("1966", 2544, "LeBron James", "name")})
    assert m.resolve("1966") == 2544
    assert m.resolve("4000", "LeBron James") == 9_000_004_000
    assert any("already belongs to ESPN 1966" in n for n in m.report.review)


def test_duplicate_player_id_in_stored_map_is_rejected():
    rows = {"1": MapRow("1", 5, "A"), "2": MapRow("2", 5, "B")}
    with pytest.raises(RuntimeError, match="one player id per ESPN id"):
        EspnPlayerMapper(rows, [])


def test_weak_prefix_match_needs_a_recent_candidate():
    stale = mapper(cand(10, "Cameron Smith", last=pd.Timestamp("2019-01-01")), cand(11, "Other Player", last=NOW))
    assert stale.resolve("50", "Cam Smith") == 9_000_000_050
    live = mapper(cand(10, "Cameron Smith", last=NOW))
    assert live.resolve("50", "Cam Smith") == 10
    assert live.pending["50"].matched_by == "name-prefix"


def test_csv_round_trip_and_reload(tmp_path):
    path = tmp_path / "espn_player_map.csv"
    m = mapper(cand(2544, "LeBron James"), csv_path=path)
    m.resolve("1966", "LeBron James")
    m.resolve("5175737", "Yaxel Lendeborg")
    assert m.persist() == 2
    assert m.persist() == 0
    df = pd.read_csv(path)
    assert list(df.columns) == epm.MAP_COLUMNS
    assert dict(zip(df["espn_id"].astype(str), df["player_id"])) == {"1966": 2544, "5175737": 9_005_175_737}

    again = EspnPlayerMapper.from_sources(
        pd.DataFrame(),
        map_csv=path,
        active_csv=tmp_path / "none.csv",
        profiles_csv=tmp_path / "none.csv",
        prices_csv=tmp_path / "none.csv",
        use_supabase=False,
    )
    assert again.lookup("1966") == 2544
    assert again.unknown(["1966", "42"]) == {"42"}


def test_build_candidates_from_logs_profiles_and_roster():
    raw = pd.DataFrame(
        [
            {"PLAYER_ID": 2544, "PLAYER_NAME": "LeBron James", "GAME_DATE": "2026-11-10", "TEAM_ABBREVIATION": "LAL"},
            {"PLAYER_ID": 2544, "PLAYER_NAME": "LeBron James", "GAME_DATE": "2026-11-08", "TEAM_ABBREVIATION": "LAL"},
        ],
    )
    active = pd.DataFrame([{"player_id": 1642846, "player_name": "Ace Bailey"}])
    profiles = pd.DataFrame([{"player_id": 2544, "player_name": "LeBron James", "birth_date": "1984-12-30"}])
    by_id = {c.player_id: c for c in epm.build_candidates(raw, active, profiles)}
    assert by_id[2544].rows == 2
    assert by_id[2544].last_date == pd.Timestamp("2026-11-10")
    assert by_id[2544].birth_date == date(1984, 12, 30)
    assert by_id[2544].team == "LAL"
    assert by_id[1642846].last_date is None
    m = EspnPlayerMapper({}, list(by_id.values()))
    assert m.resolve("1966", "LeBron James", "1984-12-30T08:00Z") == 2544
    assert m.pending["1966"].matched_by == "name+dob"


def test_first_run_guard_refuses_a_stale_pool(monkeypatch):
    monkeypatch.delenv("ESPN_MAP_ALLOW_COLD_START", raising=False)
    stale = mapper(cand(2544, "LeBron James", last=OLD))
    with pytest.raises(RuntimeError, match="ESPN_MAP_ALLOW_COLD_START"):
        stale.assert_safe_first_run(date(2026, 11, 12))
    mapper(cand(2544, "LeBron James", last=NOW)).assert_safe_first_run(date(2026, 11, 12))
    mapper(cand(2544, "LeBron James", last=OLD), mapping={"1": MapRow("1", 9)}).assert_safe_first_run(date(2026, 11, 12))
    monkeypatch.setenv("ESPN_MAP_ALLOW_COLD_START", "1")
    stale.assert_safe_first_run(date(2026, 11, 12))


class _FakeTable:
    def __init__(self, store):
        self.store = store

    def upsert(self, rows, on_conflict=None):
        assert on_conflict == "espn_id"
        self.store.extend(rows)
        return self

    def execute(self):
        return type("Resp", (), {"data": []})()


class _FakeClient:
    def __init__(self):
        self.rows = []

    def table(self, name):
        assert name == "espn_player_map"
        return _FakeTable(self.rows)


def test_persist_upserts_new_rows_to_supabase(tmp_path):
    client = _FakeClient()
    m = mapper(cand(2544, "LeBron James"), csv_path=tmp_path / "map.csv", supabase_client=client)
    m.resolve("1966", "LeBron James")
    m.persist()
    assert [(r["espn_id"], r["player_id"], r["matched_by"]) for r in client.rows] == [("1966", 2544, "name")]
