"""
Market layer end-to-end (no network): time-scaled cycles, availability, failure
handling, coherent publication, and the adversarial scenarios.

``update_market_state.main`` runs against a fake Supabase client and temp CSVs;
ESPN / RSS fetchers are stubbed. Everything is deterministic.
"""
from __future__ import annotations

import math
import sys
import types
from datetime import date, datetime, timedelta, timezone

import pandas as pd
import pytest

import price_engine as pe
import update_market_state as ums
from availability import compute_availability
from demand_engine import build_demand_window, compute_demand
from market_config import (
    PRICING_MODEL_VERSION,
    MarketConfig,
    elapsed_cycle_fraction,
    scaled_cycle_limits,
)
from market_engine import compute_market_price

CFG = MarketConfig()


# ---------------------------------------------------------------------------
# Fake Supabase client
# ---------------------------------------------------------------------------
class _Resp:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, client, table):
        self.client, self.table, self.op, self.payload = client, table, "select", None
        self._range = None

    def select(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def range(self, a, b):
        self._range = (a, b)
        return self

    def eq(self, *_a, **_k):
        return self

    def upsert(self, rows, on_conflict=None):
        self.op, self.payload = "upsert", rows
        return self

    def insert(self, rows):
        self.op, self.payload = "insert", rows
        return self

    def update(self, values):
        self.op, self.payload = "update", values
        return self

    def execute(self):
        c = self.client
        if self.op == "select":
            err = c.read_errors.get(self.table)
            if err:
                raise err
            rows = c.tables.get(self.table, [])
            a, b = self._range or (0, len(rows) - 1)
            return _Resp(rows[a : b + 1])
        c.writes.append((self.op, self.table, len(self.payload)))
        if self.table == "player_market_state" and self.op == "upsert":
            by_id = {r["player_id"]: r for r in c.tables.get(self.table, [])}
            for r in self.payload:
                by_id[r["player_id"]] = dict(r)
            c.tables[self.table] = sorted(by_id.values(), key=lambda r: r["player_id"])
        elif self.table == "player_market_ticks" and self.op == "insert":
            c.tables.setdefault(self.table, []).extend(self.payload)
        return _Resp(self.payload)


class _Rpc:
    def __init__(self, client, name, params):
        self.client, self.name, self.params = client, name, params

    def execute(self):
        err = self.client.rpc_errors.get(self.name)
        if err:
            raise err
        self.client.rpcs.append(self.name)
        return _Resp(None)


class FakeClient:
    def __init__(self):
        self.tables: dict[str, list[dict]] = {}
        self.read_errors: dict[str, Exception] = {}
        self.rpc_errors: dict[str, Exception] = {}
        self.writes: list[tuple[str, str, int]] = []
        self.rpcs: list[str] = []

    def table(self, name):
        return _Query(self, name)

    def rpc(self, name, params):
        return _Rpc(self, name, params)


def _prices_csv(path, players, last_game: date):
    """players: {pid: [fair values over consecutive games]}"""
    rows = []
    for pid, fvs in players.items():
        for i, fv in enumerate(fvs):
            rows.append(
                {
                    "player_id": pid,
                    "player_name": f"Player {pid}",
                    "team_abbr": "LAL",
                    "game_date": (last_game - timedelta(days=2 * (len(fvs) - 1 - i))).isoformat(),
                    "season": "2025-26",
                    "minutes": 30.0,
                    "game_score": 15.0,
                    "price_after_game": fv,
                    "prior_season_avg_game_score": 14.0,
                    "game_id": pid * 1000 + i,
                    "result": "W",
                }
            )
    pd.DataFrame(rows).to_csv(path, index=False)


@pytest.fixture
def env(tmp_path, monkeypatch):
    """Point update_market_state at temp files and a fake Supabase client."""
    client = FakeClient()
    monkeypatch.setattr(ums, "PRICES_CSV", tmp_path / "prices.csv")
    monkeypatch.setattr(ums, "ACTIVE_CSV", tmp_path / "active.csv")
    monkeypatch.setattr(ums, "PROFILES_CSV", tmp_path / "profiles.csv")
    monkeypatch.setattr(ums, "MARKET_STATE_CSV", tmp_path / "state.csv")
    monkeypatch.setattr(ums, "MARKET_TICKS_CSV", tmp_path / "ticks.csv")
    monkeypatch.setattr(ums, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(ums, "fetch_injuries", lambda: client.injuries)
    monkeypatch.setattr(ums, "fetch_news_sentiment", lambda _names: {})
    monkeypatch.setattr(ums, "_supabase_env", lambda: ("http://fake", "key"))
    fake_mod = types.ModuleType("supabase")
    fake_mod.create_client = lambda _u, _k: client
    monkeypatch.setitem(sys.modules, "supabase", fake_mod)
    client.injuries = {}
    client.tmp = tmp_path
    return client


def _state(client) -> dict[int, dict]:
    return {r["player_id"]: r for r in client.tables.get("player_market_state", [])}


def _set_prev(client, pid, price, fv, minutes_ago, version=PRICING_MODEL_VERSION, sentiment=0.0):
    ts = (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat()
    rows = [r for r in client.tables.get("player_market_state", []) if r["player_id"] != pid]
    rows.append(
        {
            "player_id": pid,
            "market_price": price,
            "fair_value": fv,
            "sentiment_score": sentiment,
            "updated_at": ts,
            "explanation": {"pricing_model_version": version} if version else {},
        }
    )
    client.tables["player_market_state"] = sorted(rows, key=lambda r: r["player_id"])


# ---------------------------------------------------------------------------
# Time scaling
# ---------------------------------------------------------------------------
def test_elapsed_fraction_bounds():
    assert elapsed_cycle_fraction(None) == 1.0
    assert elapsed_cycle_fraction(float("nan")) == 1.0
    assert elapsed_cycle_fraction(0.0) == 0.0
    assert elapsed_cycle_fraction(15.0) == 0.5
    assert elapsed_cycle_fraction(600.0) == 1.0
    assert elapsed_cycle_fraction(-5.0) == 0.0


def test_full_fraction_matches_unscaled_limits():
    up, down, rev = scaled_cycle_limits(0.10, 0.45, 1.0)
    assert math.isclose(up, 0.10) and math.isclose(down, 0.10) and math.isclose(rev, 0.45)


def test_two_half_cycles_equal_one_full_cycle_reversion():
    full = compute_market_price(100.0, 110.0, elapsed_fraction=1.0).market_price
    half = compute_market_price(100.0, 110.0, elapsed_fraction=0.5).market_price
    twice = compute_market_price(100.0, half, elapsed_fraction=0.5).market_price
    assert math.isclose(full, twice, rel_tol=1e-12)


def test_two_half_cycles_equal_one_full_cycle_when_capped():
    full = compute_market_price(200.0, 100.0, elapsed_fraction=1.0)
    half = compute_market_price(200.0, 100.0, elapsed_fraction=0.5)
    twice = compute_market_price(200.0, half.market_price, elapsed_fraction=0.5)
    assert full.move_capped and half.move_capped and twice.move_capped
    assert math.isclose(full.market_price, twice.market_price, rel_tol=1e-12)


def test_zero_elapsed_leaves_price_unchanged():
    r = compute_market_price(150.0, 100.0, elapsed_fraction=0.0, event_mode=True)
    assert r.market_price == 100.0
    assert r.change == 0.0


# ---------------------------------------------------------------------------
# Availability
# ---------------------------------------------------------------------------
def test_availability_keeps_severity_semantics_and_max_discount():
    assert compute_availability(None).factor == 1.0
    assert compute_availability(0.0).factor == 1.0
    assert compute_availability(float("nan")).factor == 1.0
    assert math.isclose(compute_availability(1.0).factor, 1.0 - CFG.availability_max_discount)
    assert math.isclose(compute_availability(0.25).factor, 1.0 - 0.04 * 0.25)
    assert compute_availability(5.0).factor == compute_availability(1.0).factor


def test_availability_lowers_anchor_but_premium_is_vs_fair_value():
    r = compute_market_price(100.0, None, availability=compute_availability(1.0, "Out"))
    assert math.isclose(r.anchor_price, 96.0)
    assert math.isclose(r.market_price, 96.0)
    assert math.isclose(r.premium_pct, -0.04)
    assert r.fair_value == 100.0


# ---------------------------------------------------------------------------
# Pure helpers used by main()
# ---------------------------------------------------------------------------
def test_is_valid_fair_value():
    assert ums.is_valid_fair_value(61.8)
    for bad in (0, 0.0, -1, None, "x", float("nan"), float("inf")):
        assert not ums.is_valid_fair_value(bad)


def test_event_mode_suppressed_across_model_versions():
    assert ums.resolve_event_mode(110.0, 100.0, PRICING_MODEL_VERSION)
    assert not ums.resolve_event_mode(110.0, 100.0, None)
    assert not ums.resolve_event_mode(110.0, 100.0, "older-model")
    assert not ums.resolve_event_mode(100.5, 100.0, PRICING_MODEL_VERSION)


def test_parse_prev_state_rows_reads_version_from_json_or_dict():
    rows = [
        {"player_id": 1, "market_price": 90, "explanation": {"pricing_model_version": "a"}},
        {"player_id": 2, "market_price": 80, "explanation": '{"pricing_model_version": "b"}'},
        {"player_id": 3, "market_price": 70, "explanation": None},
        {"player_id": None, "market_price": 70},
    ]
    out = ums.parse_prev_state_rows(rows)
    assert out[1]["model_version"] == "a"
    assert out[2]["model_version"] == "b"
    assert out[3]["model_version"] is None
    assert set(out) == {1, 2, 3}


def test_missing_relation_detection():
    assert ums.is_missing_relation_error(Exception("{'code': '42P01', 'message': 'x'}"))
    assert ums.is_missing_relation_error(Exception("PGRST205 Could not find the table"))
    assert not ums.is_missing_relation_error(Exception("timeout"))
    assert not ums.is_missing_relation_error(Exception("JWT expired"))


def test_publish_uses_combined_rpc_when_installed():
    c = FakeClient()
    assert ums.publish_revisions(c) == "publish_pricing_revision"
    assert c.rpcs == ["publish_pricing_revision"]


def test_publish_falls_back_when_rpc_missing():
    c = FakeClient()
    c.rpc_errors["publish_pricing_revision"] = Exception("PGRST202 Could not find the function")
    ums.publish_revisions(c)
    assert c.rpcs == ["bump_prices_revision", "bump_market_revision"]


def test_publish_does_not_mask_real_errors():
    c = FakeClient()
    c.rpc_errors["publish_pricing_revision"] = Exception("connection reset")
    with pytest.raises(Exception, match="connection reset"):
        ums.publish_revisions(c)
    assert c.rpcs == []


# ---------------------------------------------------------------------------
# main() pipeline behaviour
# ---------------------------------------------------------------------------
def _run(env, players, last_game=None):
    _prices_csv(env.tmp / "prices.csv", players, last_game or date.today() - timedelta(days=1))
    pd.DataFrame({"player_id": list(players)}).to_csv(env.tmp / "active.csv", index=False)
    env.writes.clear()
    env.rpcs.clear()
    ums.main()
    return _state(env)


def test_pipeline_publishes_once_after_all_writes(env):
    _run(env, {1: [100.0], 2: [120.0]})
    assert env.rpcs == ["publish_pricing_revision"]
    assert [w[1] for w in env.writes] == [
        "player_market_state", "player_market_history", "player_market_ticks",
    ]


def test_pipeline_aborts_without_writes_when_state_read_fails(env):
    env.read_errors["player_market_state"] = Exception("upstream timeout")
    with pytest.raises(SystemExit):
        _run(env, {1: [100.0]})
    assert env.writes == [] and env.rpcs == []


def test_pipeline_aborts_without_writes_when_trades_read_fails(env):
    env.read_errors["trades"] = Exception("upstream timeout")
    with pytest.raises(SystemExit):
        _run(env, {1: [100.0]})
    assert env.writes == [] and env.rpcs == []


def test_pipeline_first_run_with_missing_tables_cold_starts(env):
    env.read_errors["player_market_state"] = Exception("42P01 relation does not exist")
    env.read_errors["trades"] = Exception("42P01 relation does not exist")
    state = _run(env, {1: [100.0]})
    assert state[1]["market_price"] == 100.0


def test_pipeline_writes_updated_at_and_model_version(env):
    state = _run(env, {1: [100.0]})
    assert state[1]["updated_at"]
    assert state[1]["explanation"]["pricing_model_version"] == PRICING_MODEL_VERSION


# ---------------------------------------------------------------------------
# Adversarial scenarios (numbered as in the review brief)
# ---------------------------------------------------------------------------
def _demand_premium(trades, cfg=CFG):
    d = compute_demand(build_demand_window(trades, cfg), cfg)
    return d.demand_score * d.demand_weight


def test_s01_one_user_buying_huge_size_is_capped():
    whale = [{"side": "buy", "shares": 1_000_000, "age_days": 0.0, "user": "w"}]
    small = [{"side": "buy", "shares": CFG.demand_user_cap_shares, "age_days": 0.0, "user": "w"}]
    assert math.isclose(_demand_premium(whale), _demand_premium(small))
    assert _demand_premium(whale) < CFG.demand_weight * 0.3


def test_s02_many_users_buying_simultaneously_is_bounded():
    crowd = [{"side": "buy", "shares": 200, "age_days": 0.0, "user": i} for i in range(50)]
    p = _demand_premium(crowd)
    assert 0.0 < p <= CFG.demand_weight
    r = compute_market_price(
        100.0, 100.0, demand=compute_demand(build_demand_window(crowd, CFG), CFG),
    )
    assert r.market_price <= 100.0 * (1 + CFG.max_move_per_cycle) + 1e-9


def test_s03_buy_then_sell_nets_out():
    trades = [
        {"side": "buy", "shares": 100, "age_days": 0.1, "user": "u"},
        {"side": "sell", "shares": 100, "age_days": 0.1, "user": "u"},
    ]
    assert _demand_premium(trades) == 0.0


def test_s04_sybil_accounts_bounded_by_demand_weight():
    sybils = [{"side": "buy", "shares": 10_000, "age_days": 0.0, "user": i} for i in range(1000)]
    assert _demand_premium(sybils) <= CFG.demand_weight + 1e-12
    price = 100.0
    d = compute_demand(build_demand_window(sybils, CFG), CFG)
    for _ in range(100):
        price = compute_market_price(100.0, price, demand=d).market_price
    assert price <= 100.0 * (1 + CFG.demand_weight) + 1e-6


def test_s05_demand_disappears_after_window():
    old = [{"side": "buy", "shares": 500, "age_days": CFG.demand_window_days, "user": "u"}]
    assert _demand_premium(old) == 0.0


def test_s06_no_trading_is_neutral():
    assert _demand_premium([]) == 0.0
    assert compute_market_price(100.0, 100.0).market_price == 100.0


def test_s07_extremely_high_fair_value_is_clamped():
    r = compute_market_price(1e9, 239.0)
    assert r.market_price <= CFG.price_ceiling
    r0 = compute_market_price(1e9, None)
    assert r0.market_price <= CFG.price_ceiling


def test_s08_extremely_low_fair_value_stays_non_negative():
    r = compute_market_price(0.01, 50.0)
    assert 0.0 <= r.market_price <= 50.0
    assert compute_market_price(-10.0, None).market_price >= CFG.price_floor


def test_s09_fair_value_jump_is_rate_limited():
    r = compute_market_price(150.0, 100.0, event_mode=True)
    assert r.market_price <= 100.0 * (1 + CFG.event_max_move_per_cycle) + 1e-9
    assert r.move_capped


def test_s10_fair_value_fall_is_rate_limited():
    r = compute_market_price(50.0, 100.0, event_mode=True)
    assert r.market_price >= 100.0 * (1 - CFG.event_max_move_per_cycle) - 1e-9
    assert r.move_capped


@pytest.mark.parametrize("prev", [None, 0.0, -5.0])
def test_s11_missing_or_zero_previous_price_cold_starts_at_target(prev):
    r = compute_market_price(100.0, prev)
    assert r.market_price == 100.0
    assert r.change_pct is None


def test_s12_missing_fair_value_player_is_skipped(env):
    _set_prev(env, 2, 90.0, 90.0, minutes_ago=30)
    _prices_csv(env.tmp / "prices.csv", {1: [100.0]}, date.today() - timedelta(days=1))
    df = pd.read_csv(env.tmp / "prices.csv")
    extra = df.iloc[[0]].copy()
    extra["player_id"] = 2
    extra["price_after_game"] = float("nan")
    pd.concat([df, extra]).to_csv(env.tmp / "prices.csv", index=False)
    pd.DataFrame({"player_id": [1, 2]}).to_csv(env.tmp / "active.csv", index=False)
    ums.main()
    state = _state(env)
    assert state[2]["market_price"] == 90.0  # untouched, not dragged toward $0
    assert state[1]["market_price"] == 100.0


def test_s13_zero_fair_value_player_is_skipped(env):
    _set_prev(env, 1, 90.0, 90.0, minutes_ago=30)
    state = _run(env, {1: [0.0], 2: [100.0]})
    assert state[1]["market_price"] == 90.0
    assert 2 in state


def test_s13_zero_fair_value_fails_validation():
    from validate_prices import run_validation

    assert not run_validation(pd.Series([0.0, 100.0]), csv_path="mem")


def test_s14_tiny_previous_price_recovers_without_gapping():
    r = compute_market_price(100.0, 0.01)
    assert math.isclose(r.market_price, 0.01 * (1 + CFG.max_move_per_cycle))
    assert r.market_price > 0.0


def test_s15_long_absence_keeps_fair_value_and_availability_discount():
    # Fair Value: DNP rows carry forward (no decay from not playing).
    rows = pd.DataFrame(
        {
            "player_id": 1, "player_name": "P", "team_abbr": "LAL",
            "game_date": pd.date_range("2025-10-20", periods=12, freq="2D").strftime("%Y-%m-%d"),
            "season": "2025-26", "game_id": range(1, 13),
            "minutes": [32.0] * 4 + [0.0] * 8,
            "game_score": [18.0] * 4 + [0.0] * 8,
        }
    )
    prices = pe.compute_prices(rows)["price_after_game"].tolist()
    assert prices[4:] == [prices[3]] * 8
    # Market: the listing persists while the league is active.
    assert ums.injury_signal_active(date(2025, 11, 1), date(2026, 1, 10), date(2026, 1, 11), 10)
    # ...and the discount converges to exactly max_discount × severity, no more.
    price = 100.0
    avail = compute_availability(0.8, "Out")
    for _ in range(200):
        price = compute_market_price(100.0, price, availability=avail).market_price
    assert math.isclose(price, 100.0 * (1 - 0.04 * 0.8), rel_tol=1e-9)


def test_s16_first_game_of_season_starts_from_ipo():
    prior = pd.DataFrame(
        {
            "player_id": 1, "player_name": "P", "team_abbr": "LAL",
            "game_date": pd.date_range("2024-11-01", periods=30, freq="2D").strftime("%Y-%m-%d"),
            "season": "2024-25", "game_id": range(1, 31),
            "minutes": 34.0, "game_score": 20.0,
        }
    )
    cur = prior.iloc[[0]].copy()
    cur["season"], cur["game_date"], cur["game_id"] = "2025-26", "2025-10-21", 999
    out = pe.compute_prices(pd.concat([prior, cur], ignore_index=True))
    first = out[out.season == "2025-26"].iloc[0]
    ipo = first["season_open_anchor"]
    # One game moves the price from the IPO by at most the early-season EMA step.
    assert abs(first["price_after_game"] - ipo) < 0.25 * abs(pe.PRICE_MAX - pe.PRICE_MIN)


def test_s17_almost_no_history_stays_near_rookie_default():
    assert math.isclose(pe.ipo_price(30.0, 1, 0.99) - pe.DEFAULT_IPO_PRICE,
                        (pe.ipo_price(30.0, 25, 0.99) - pe.DEFAULT_IPO_PRICE) / 25)


def test_s18_large_history_uses_full_anchor():
    assert pe.ipo_price(30.0, 82, 0.99) == pe.ipo_price(30.0, 25, 0.99)
    assert pe.sample_confidence(82) == 1.0


def test_s19_rerunning_same_cycle_does_not_compound(env):
    _set_prev(env, 1, 100.0, 140.0, minutes_ago=30)
    first = _run(env, {1: [140.0]})[1]["market_price"]
    second = _run(env, {1: [140.0]})[1]["market_price"]
    assert first > 100.0
    # Immediate re-run: elapsed ≈ 0 → essentially no further movement.
    assert abs(second - first) < first * 1e-3


def test_s20_action_running_twice_appends_ticks_never_deletes(env):
    _run(env, {1: [100.0]})
    _run(env, {1: [100.0]})
    assert len(env.tables["player_market_ticks"]) == 2
    assert not any(op == "delete" for op, _t, _n in env.writes)


def test_s21_readers_see_one_revision_pair_per_cycle(env):
    # Both cache keys move together, once, after every row has been written.
    _run(env, {1: [100.0], 2: [110.0]})
    assert env.rpcs == ["publish_pricing_revision"]
    assert env.writes[-1][1] == "player_market_ticks"


def test_s22_stale_price_then_new_game_catches_up_without_gap(env):
    _set_prev(env, 1, 100.0, 100.0, minutes_ago=30)
    state = _run(env, {1: [100.0, 112.0]})
    new = state[1]["market_price"]
    assert state[1]["explanation"]["event_mode"] is True
    assert 100.0 < new <= 100.0 * (1 + CFG.event_max_move_per_cycle) + 1e-9


def test_model_change_does_not_trigger_event_mode_or_reuse_old_sentiment(env):
    _set_prev(env, 1, 100.0, 100.0, minutes_ago=30, version=None, sentiment=-0.8)
    state = _run(env, {1: [100.0, 112.0]})
    assert state[1]["explanation"]["event_mode"] is False
    assert state[1]["sentiment_score"] == 0.0
