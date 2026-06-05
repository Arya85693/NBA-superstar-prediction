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


def test_max_game_date_label_for_season():
    df = pd.DataFrame(
        [
            _row(1, "a", "2024-25", "2024-11-01"),
            _row(2, "b", "2025-26", "2026-06-03"),
        ],
    )
    assert bdl._max_game_date_label(df, "2025-26") == "2026-06-03"
    assert bdl._max_game_date_label(df, "2023-24") is None


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
