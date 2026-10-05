"""Incremental BALLDONTLIE raw log merge."""
import pandas as pd

import balldontlie_fetch as bdl


def _row(pid: int, gid: str, season: str, date: str) -> dict:
    return {
        "PLAYER_ID": pid,
        "GAME_ID": gid,
        "SEASON_TYPE": "Regular Season",
        "SEASON": season,
        "GAME_DATE": date,
    }


def test_merge_raw_logs_dedupes_player_game():
    a = pd.DataFrame([_row(1, "g1", "2024-25", "2024-10-01")])
    b = pd.DataFrame([_row(1, "g1", "2024-25", "2024-10-01"), _row(2, "g2", "2024-25", "2024-10-02")])
    merged = bdl.merge_raw_logs(a, b)
    assert len(merged) == 2


def test_merge_raw_logs_collapses_season_type_variants():
    """Same player+game must not survive twice — Supabase PK omits season_type."""
    a = pd.DataFrame([_row(1, "g1", "2024-25", "2024-10-01")])
    b = pd.DataFrame([_row(1, "g1", "2024-25", "2024-10-01")])
    b.loc[0, "SEASON_TYPE"] = "Playoffs"
    merged = bdl.merge_raw_logs(a, b)
    assert len(merged) == 1
    assert merged.iloc[0]["SEASON_TYPE"] == "Playoffs"


def test_max_game_date_label_for_season():
    df = pd.DataFrame(
        [
            _row(1, "a", "2024-25", "2024-11-01"),
            _row(2, "b", "2025-26", "2026-06-03"),
        ],
    )
    assert bdl._max_game_date_label(df, "2025-26") == "2026-06-03"
    assert bdl._max_game_date_label(df, "2023-24") is None


def test_align_active_roster_rewrites_foreign_ids_by_name(tmp_path):
    """BALLDONTLIE roster ids must join to whatever ids the price file already uses."""
    prices = tmp_path / "prices.csv"
    pd.DataFrame(
        [
            {"player_id": 2544, "player_name": "LeBron James", "game_date": "2026-04-10"},
            {"player_id": 201142, "player_name": "Kevin Durant", "game_date": "2026-04-12"},
            {"player_id": 1628973, "player_name": "Jalen Brunson", "game_date": "2026-01-02"},
            {"player_id": 201935, "player_name": "James Harden", "game_date": "2018-11-01"},
            {"player_id": 999001, "player_name": "James Harden", "game_date": "2026-04-01"},
        ],
    ).to_csv(prices, index=False)

    active = pd.DataFrame(
        [
            {"player_id": 237, "player_name": "LeBron James"},
            {"player_id": 140, "player_name": "Kevin Durant"},
            {"player_id": 201142, "player_name": "Kevin Durant"},
            {"player_id": 70, "player_name": "Jalen Brunson"},
            {"player_id": 15, "player_name": "James Harden Jr."},
            {"player_id": 5000, "player_name": "Brand New Rookie"},
        ],
    )
    aligned, stats = bdl.align_active_players_to_prices(active, prices)

    by_name = dict(zip(aligned["player_name"], aligned["player_id"], strict=True))
    assert by_name["LeBron James"] == 2544
    assert by_name["Kevin Durant"] == 201142
    assert by_name["Jalen Brunson"] == 1628973
    # Suffix-stripped duplicate: keep the id with the latest game.
    assert by_name["James Harden Jr."] == 999001
    assert by_name["Brand New Rookie"] == 5000
    assert stats["remapped"] == 4
    assert stats["already"] == 1
    assert stats["unmatched"] == 1


def test_align_incoming_logs_keeps_cached_player_id():
    existing = pd.DataFrame(
        [
            {
                "PLAYER_ID": 2544,
                "PLAYER_NAME": "LeBron James",
                "GAME_ID": "1",
                "GAME_DATE": "2026-04-10",
            },
        ],
    )
    incoming = pd.DataFrame(
        [
            {
                "PLAYER_ID": 237,
                "PLAYER_NAME": "LeBron James",
                "GAME_ID": "99",
                "GAME_DATE": "2026-10-22",
            },
            {
                "PLAYER_ID": 2544,
                "PLAYER_NAME": "LeBron James",
                "GAME_ID": "100",
                "GAME_DATE": "2026-10-24",
            },
        ],
    )
    aligned = bdl.align_incoming_logs(incoming, existing)
    assert aligned["PLAYER_ID"].tolist() == [2544, 2544]


def test_align_prefers_name_over_colliding_numeric_id(tmp_path):
    """A BALLDONTLIE id equal to an unrelated NBA.com id must not steal its prices."""
    prices = tmp_path / "prices.csv"
    pd.DataFrame(
        [
            {"player_id": 2544, "player_name": "LeBron James", "game_date": "2026-04-10"},
            {"player_id": 1628464, "player_name": "Daniel Theis", "game_date": "2026-04-10"},
        ],
    ).to_csv(prices, index=False)
    active = pd.DataFrame([{"player_id": 2544, "player_name": "Daniel Theis"}])
    aligned, _ = bdl.align_active_players_to_prices(active, prices)
    assert aligned["player_id"].tolist() == [1628464]


def test_align_incoming_logs_drops_same_player_same_day():
    """Cached NBA.com game ids differ from BALLDONTLIE ones; dedupe by player + date."""
    existing = pd.DataFrame(
        [
            {
                "PLAYER_ID": 2544,
                "PLAYER_NAME": "LeBron James",
                "GAME_ID": "0022501200",
                "GAME_DATE": "2026-04-12",
            },
        ],
    )
    incoming = pd.DataFrame(
        [
            {
                "PLAYER_ID": 237,
                "PLAYER_NAME": "LeBron James",
                "GAME_ID": "18447001",
                "GAME_DATE": "2026-04-12T00:00:00",
            },
            {
                "PLAYER_ID": 237,
                "PLAYER_NAME": "LeBron James",
                "GAME_ID": "18447050",
                "GAME_DATE": "2026-04-14",
            },
        ],
    )
    aligned = bdl.align_incoming_logs(incoming, existing)
    assert aligned["GAME_ID"].tolist() == ["18447050"]
    assert aligned["PLAYER_ID"].tolist() == [2544]


def test_refresh_incremental_uses_start_date(monkeypatch, tmp_path):
    cache = tmp_path / "raw.csv"
    existing = pd.DataFrame([_row(1, "old", "2025-26", "2026-06-01")])
    existing.to_csv(cache, index=False)

    calls: list[dict] = []

    def fake_collect(start_year=None, end_year=None, *, start_date=None):
        calls.append(
            {"start_year": start_year, "end_year": end_year, "start_date": start_date},
        )
        return pd.DataFrame([_row(2, "new", "2025-26", "2026-06-04")])

    monkeypatch.setattr(bdl, "collect_player_game_logs", fake_collect)
    monkeypatch.setattr(bdl.sw, "automated_window_season_years", lambda today=None: (2024, 2025))
    monkeypatch.setattr(bdl.sw, "season_string", lambda y: f"{y}-{str(y + 1)[-2:]}")

    out = bdl.refresh_raw_game_logs(2024, 2025, out_path=cache, force_full=False)

    assert len(out) == 2
    assert any(c.get("start_date") == "2026-06-01" for c in calls)
