"""Demand engine — defaults to ZERO with no users, scales with real flow."""
from demand_engine import (
    DemandWindow,
    build_demand_window,
    compute_demand,
    recency_weight,
)
from market_config import DEFAULT_CONFIG


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
    assert win.net_demand == win.recent_buy_volume - win.recent_sell_volume
