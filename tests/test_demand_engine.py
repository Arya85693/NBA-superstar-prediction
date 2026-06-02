"""Demand engine — defaults to ZERO with no users, scales with real flow."""
import math

from demand_engine import (
    DemandWindow,
    build_demand_window,
    compute_demand,
    recency_weight,
)
from market_config import DEFAULT_CONFIG, MarketConfig


def test_no_demand_defaults_to_zero():
    r = compute_demand(None)
    assert r.demand_score == 0.0
    assert r.net_demand == 0.0
    assert r.recent_buy_volume == 0.0
    assert r.recent_sell_volume == 0.0


def test_empty_window_is_zero():
    r = compute_demand(DemandWindow())
    assert r.demand_score == 0.0


def test_net_buying_is_positive_bounded():
    r = compute_demand(DemandWindow(recent_buy_volume=10_000, recent_sell_volume=0))
    assert 0.0 < r.demand_score <= 1.0


def test_net_selling_is_negative_bounded():
    r = compute_demand(DemandWindow(recent_buy_volume=0, recent_sell_volume=10_000))
    assert -1.0 <= r.demand_score < 0.0


def test_balanced_flow_nets_to_zero():
    r = compute_demand(DemandWindow(recent_buy_volume=500, recent_sell_volume=500))
    assert abs(r.demand_score) < 1e-9


def test_recency_weight_decays_over_window():
    assert recency_weight(0, 7) == 1.0
    assert recency_weight(7, 7) == 0.0
    assert recency_weight(8, 7) == 0.0
    assert 0.0 < recency_weight(3.5, 7) < 1.0


def test_build_window_recency_weights_and_ignores_old_trades():
    trades = [
        {"side": "buy", "shares": 100, "age_days": 0.0},   # full weight
        {"side": "buy", "shares": 100, "age_days": 7.0},   # zero weight (edge)
        {"side": "sell", "shares": 40, "age_days": 1.0},   # partial weight
        {"side": "buy", "shares": 100, "age_days": 30.0},  # outside window
    ]
    win = build_demand_window(trades, DEFAULT_CONFIG)
    assert win.recent_buy_volume == 100.0  # only the age 0 buy counted fully
    assert 0.0 < win.recent_sell_volume < 40.0
    # one (anon) user, net well below the cap -> capped_net == raw net
    assert win.net_demand == win.recent_buy_volume - win.recent_sell_volume


# --- Anti-manipulation: per-user net cap + distinct-user counting -------------

def test_single_user_net_is_capped():
    cap = DEFAULT_CONFIG.demand_user_cap_shares
    trades = [{"side": "buy", "shares": 100_000, "age_days": 0.0, "user": "whale"}]
    win = build_demand_window(trades, DEFAULT_CONFIG)
    # raw volume is preserved for transparency, but scoring uses the capped net
    assert win.recent_buy_volume == 100_000.0
    assert win.net_demand == cap
    assert win.distinct_users == 1


def test_many_users_each_capped_then_summed():
    cap = DEFAULT_CONFIG.demand_user_cap_shares
    # 4 distinct users each buying far above the cap -> 4 * cap, not 4 * size
    trades = [
        {"side": "buy", "shares": 5_000, "age_days": 0.0, "user": f"u{i}"}
        for i in range(4)
    ]
    win = build_demand_window(trades, DEFAULT_CONFIG)
    assert win.distinct_users == 4
    assert win.net_demand == 4 * cap


def test_whale_cannot_outpush_a_small_crowd():
    cfg = DEFAULT_CONFIG
    whale = [{"side": "buy", "shares": 1_000_000, "age_days": 0.0, "user": "whale"}]
    crowd = [
        {"side": "buy", "shares": cfg.demand_user_cap_shares, "age_days": 0.0, "user": f"u{i}"}
        for i in range(3)
    ]
    whale_score = compute_demand(build_demand_window(whale, cfg), cfg).demand_score
    crowd_score = compute_demand(build_demand_window(crowd, cfg), cfg).demand_score
    assert crowd_score > whale_score


def test_user_cap_config_changes_ceiling():
    cfg = MarketConfig(demand_user_cap_shares=50.0)
    trades = [{"side": "buy", "shares": 10_000, "age_days": 0.0, "user": "whale"}]
    win = build_demand_window(trades, cfg)
    assert win.net_demand == 50.0


def test_distinct_users_flows_to_result():
    trades = [
        {"side": "buy", "shares": 10, "age_days": 0.0, "user": "a"},
        {"side": "sell", "shares": 10, "age_days": 0.0, "user": "b"},
    ]
    r = compute_demand(build_demand_window(trades, DEFAULT_CONFIG), DEFAULT_CONFIG)
    assert r.distinct_users == 2
    # equal-and-opposite distinct users net to ~zero
    assert math.isclose(r.net_demand, 0.0, abs_tol=1e-9)
