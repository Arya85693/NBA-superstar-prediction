"""Incremental player_profiles sync — CI should not refetch full roster."""
import csv
from pathlib import Path

import build_player_profiles as bpp


def _write_active(path: Path, rows: list[tuple[int, str]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["player_id", "player_name"])
        w.writerows(rows)


def _write_profiles(path: Path, rows: list[tuple[int, str, str, str]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(
            f,
            fieldnames=bpp.FIELDNAMES,
        )
        w.writeheader()
        for pid, name, group, bd in rows:
            w.writerow(
                {
                    "player_id": pid,
                    "player_name": name,
                    "position": "Guard",
                    "position_group": group,
                    "birth_date": bd,
                },
            )


def test_sync_missing_skips_when_roster_already_on_file(tmp_path: Path):
    active = tmp_path / "active.csv"
    profiles = tmp_path / "profiles.csv"
    _write_active(active, [(1, "Alice"), (2, "Bob")])
    _write_profiles(
        profiles,
        [
            (1, "Alice", "G", "2000-01-01"),
            (2, "Bob", "F", "1998-06-15"),
        ],
    )

    fetched = bpp.sync_missing_profiles(
        active_csv=active,
        out_csv=profiles,
        pause_seconds=0.0,
    )

    assert fetched == 0
    assert profiles.is_file()


def test_ensure_profiles_csv_only_skips_fetch(tmp_path: Path, monkeypatch):
    profiles = tmp_path / "profiles.csv"
    _write_profiles(profiles, [(1, "Alice", "G", "2000-01-01")])

    def boom(*args, **kwargs):
        raise AssertionError("nba_api fetch should not run in CSV-only mode")

    monkeypatch.setattr(bpp, "sync_missing_profiles", boom)

    out = bpp.ensure_profiles_for_active(
        active_csv=tmp_path / "missing_active.csv",
        out_csv=profiles,
        fetch=False,
    )

    assert out == profiles


def test_sync_missing_detects_new_active_player(tmp_path: Path, monkeypatch):
    active = tmp_path / "active.csv"
    profiles = tmp_path / "profiles.csv"
    _write_active(active, [(1, "Alice"), (99, "Rookie")])
    _write_profiles(profiles, [(1, "Alice", "G", "2000-01-01")])

    def fake_fetch(pid: int):
        assert pid == 99
        return "Guard", "2004-05-05"

    monkeypatch.setattr(bpp, "_fetch_nba_profile", fake_fetch)

    fetched = bpp.sync_missing_profiles(
        active_csv=active,
        out_csv=profiles,
        pause_seconds=0.0,
    )

    assert fetched == 1
    with profiles.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    by_id = {int(r["player_id"]): r for r in rows}
    assert 99 in by_id
    assert by_id[99]["birth_date"] == "2004-05-05"
