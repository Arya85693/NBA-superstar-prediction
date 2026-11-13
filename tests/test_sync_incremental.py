"""Incremental price sync: window marker, upsert/delete plan, and the fetch-side marker."""
from __future__ import annotations

import json
from datetime import date

import espn_fetch as ef
import sync_prices_to_supabase as sync

TODAY = date(2026, 11, 13)


def _write(tmp_path, payload) -> object:
    p = tmp_path / "sync_window.json"
    p.write_text(json.dumps(payload) if not isinstance(payload, str) else payload, encoding="utf-8")
    return p


def test_window_is_widened_to_the_minimum_days(tmp_path):
    p = _write(tmp_path, {"mode": "incremental", "since": "2026-11-12", "reason": "incremental fetch"})
    since, reason = sync.load_sync_window(p, today=TODAY)
    assert since == "2026-11-06"  # 7 days back, not just the fetch window
    assert reason == "incremental fetch"


def test_older_fetch_window_is_kept(tmp_path):
    p = _write(tmp_path, {"mode": "incremental", "since": "2026-10-20"})
    assert sync.load_sync_window(p, today=TODAY)[0] == "2026-10-20"


def test_full_reload_cases(tmp_path):
    assert sync.load_sync_window(tmp_path / "missing.json", today=TODAY)[0] is None
    assert sync.load_sync_window(_write(tmp_path, "{not json"), today=TODAY)[0] is None
    full = _write(tmp_path, {"mode": "full", "reason": "re-fetch from 2026-04-12"})
    assert sync.load_sync_window(full, today=TODAY) == (None, "re-fetch from 2026-04-12")
    bad = _write(tmp_path, {"mode": "incremental", "since": "yesterday"})
    assert sync.load_sync_window(bad, today=TODAY)[0] is None


def _row(pid, gid, gdate, price=100.0):
    return {"player_id": pid, "game_id": gid, "game_date": gdate, "price_after_game": price}


def test_plan_upserts_window_and_deletes_replaced_keys():
    rows = [
        _row(1, "401", "2026-11-01"),        # before the window: never re-sent
        _row(1, "402", "2026-11-08"),
        _row(2, "401909975", "2026-11-12"),  # ESPN id replaced a BALLDONTLIE row
    ]
    remote = {
        (1, "401", "2026-11-01"),
        (1, "402", "2026-11-08"),
        (2, "21718091", "2026-11-12"),       # stale: same player + date, old game id
        (3, "999", "2026-10-30"),            # outside the window: untouched
    }
    window, stale = sync.plan_incremental(rows, remote, "2026-11-06")
    assert [r["game_id"] for r in window] == ["402", "401909975"]
    assert stale == {(2, "21718091", "2026-11-12")}


def test_plan_with_nothing_new_is_a_no_op_delete():
    rows = [_row(1, "402", "2026-11-08")]
    window, stale = sync.plan_incremental(rows, {(1, "402", "2026-11-08")}, "2026-11-06")
    assert len(window) == 1 and stale == set()


def test_fetch_writes_incremental_marker(tmp_path):
    p = tmp_path / "sync_window.json"
    ef.write_sync_window(p, full=False, since=date(2026, 11, 11), reason="incremental fetch")
    assert json.loads(p.read_text()) == {
        "mode": "incremental", "reason": "incremental fetch", "since": "2026-11-11",
    }
    assert sync.load_sync_window(p, today=date(2026, 11, 12))[0] == "2026-11-05"


def test_fetch_writes_full_marker_for_repairs(tmp_path):
    p = tmp_path / "sync_window.json"
    ef.write_sync_window(p, full=True, since=date(2026, 4, 12), reason="re-fetch from 2026-04-12")
    assert json.loads(p.read_text())["mode"] == "full"
    assert sync.load_sync_window(p, today=TODAY)[0] is None
