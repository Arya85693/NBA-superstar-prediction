"""update_market_state <-> live market (lease, Fair Value state export, live override)."""
from __future__ import annotations

from datetime import date

import pandas as pd

from update_market_state import (
    acquire_market_lease,
    apply_live_fair_values,
    fv_state_rows,
    sync_fv_states,
)


class _Resp:
    def __init__(self, data):
        self.data = data


class _Call:
    def __init__(self, result=None, exc=None, log=None, name=""):
        self._result, self._exc, self._log, self._name = result, exc, log, name

    def upsert(self, rows, on_conflict=None):
        self._log.append((self._name, len(rows), on_conflict))
        return self

    def execute(self):
        if self._exc:
            raise self._exc
        return _Resp(self._result)


class FakeClient:
    def __init__(self, rpc_result=None, rpc_exc=None, table_exc=None):
        self.rpc_result, self.rpc_exc, self.table_exc = rpc_result, rpc_exc, table_exc
        self.log: list = []

    def rpc(self, name, params):
        self.log.append((name, params))
        return _Call(self.rpc_result, self.rpc_exc, self.log, name)

    def table(self, name):
        return _Call(None, self.table_exc, self.log, name)


def test_live_fair_value_overrides_only_unsettled_games() -> None:
    inputs = {1: {"fair_value": 100.0}, 2: {"fair_value": 80.0}, 3: {"fair_value": 60.0}}
    last = {1: date(2026, 11, 11), 2: date(2026, 11, 12), 3: date(2026, 11, 11)}
    live = [
        {"player_id": 1, "game_date": "2026-11-12", "live_fair_value": 104.5},  # live tonight
        {"player_id": 2, "game_date": "2026-11-12", "live_fair_value": 90.0},   # already ingested
        {"player_id": 3, "game_date": "2026-11-12", "live_fair_value": 0},      # invalid FV
        {"player_id": 9, "game_date": "2026-11-12", "live_fair_value": 70.0},   # not active
    ]
    assert apply_live_fair_values(inputs, live, last) == 1
    assert inputs[1]["fair_value"] == 104.5
    assert inputs[2]["fair_value"] == 80.0
    assert inputs[3]["fair_value"] == 60.0


def test_fv_state_rows_filters_to_active_players() -> None:
    df = pd.DataFrame([
        {"player_id": 1, "season": "2026-27", "game_date": "2026-11-01", "minutes": 30,
         "game_score": 15.0, "price_after_game": 101.0},
        {"player_id": 2, "season": "2026-27", "game_date": "2026-11-01", "minutes": 20,
         "game_score": 8.0, "price_after_game": 70.0},
    ])
    rows = fv_state_rows(df, {1}, "2026-11-12T00:00:00+00:00")
    assert [r["player_id"] for r in rows] == [1]
    assert rows[0]["fair_value"] == 101.0 and rows[0]["updated_at"].startswith("2026-11-12")


def test_lease_and_sync_degrade_when_migration_missing() -> None:
    missing = Exception("PGRST202 Could not find the function")
    assert acquire_market_lease(FakeClient(rpc_exc=missing)) is None
    assert sync_fv_states(FakeClient(table_exc=Exception("PGRST205 relation")), [{"player_id": 1}]) is False


def test_lease_reports_holder_conflict() -> None:
    assert acquire_market_lease(FakeClient(rpc_result=True)) is True
    assert acquire_market_lease(FakeClient(rpc_result=False)) is False


def test_sync_fv_states_batches_upserts() -> None:
    client = FakeClient()
    assert sync_fv_states(client, [{"player_id": i} for i in range(1200)]) is True
    assert [n for _, n, _ in client.log] == [500, 500, 200]
    assert all(conflict == "player_id" for *_, conflict in client.log)
