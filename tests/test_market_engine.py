"""Market Price engine — reversion, caps, premium band, explainability."""
import math

from demand_engine import DemandWindow, compute_demand
from market_config import MarketConfig
from market_engine import compute_market_price
from projection_engine import GameStat, compute_projection
from sentiment_engine import compute_sentiment
from team_context_engine import compute_team_context

CFG = MarketConfig()


def test_cold_start_seeds_at_fair_value_when_neutral():
    r = compute_market_price(100.0, None)
    # No levers -> market price IPOs exactly at fair value.
    assert abs(r.market_price - 100.0) < 1e-9
    assert r.change_pct is None
    assert any("Fair Value" in d for d in r.drivers)


def test_neutral_levers_revert_toward_fair_value():
    # Previous price above fair value, nothing pushing it -> drifts down toward FV.
    r = compute_market_price(100.0, 120.0)
    assert 100.0 <= r.market_price < 120.0
    # Exactly reversion_rate of the gap, within the move cap.
    expected = 120.0 + CFG.reversion_rate * (100.0 - 120.0)
    assert abs(r.market_price - expected) < 1e-6


def test_market_price_never_leaves_premium_band():
    # Crank demand hard; premium must still clamp to max_premium.
    demand = compute_demand(DemandWindow(recent_buy_volume=1e9, recent_sell_volume=0), CFG)
    # Run many cycles to let it push as far as possible.
    price = 100.0
    for _ in range(50):
        r = compute_market_price(100.0, price, demand=demand, config=CFG)
        price = r.market_price
    assert price <= 100.0 * (1.0 + CFG.max_premium) + 1e-6


def test_per_cycle_move_is_capped():
    # Fair Value jumps far above the previous market price (e.g. a huge game).
    # Reversion would overshoot the per-cycle cap, so the move must be limited.
    r = compute_market_price(200.0, 100.0, config=CFG)
    assert r.market_price <= 100.0 * (1.0 + CFG.max_move_per_cycle) + 1e-6
    assert r.move_capped is True


def test_event_mode_allows_larger_single_cycle_move():
    normal = compute_market_price(200.0, 100.0, config=CFG, event_mode=False)
    event = compute_market_price(200.0, 100.0, config=CFG, event_mode=True)
    assert event.market_price > normal.market_price
    assert event.market_price <= 100.0 * (1.0 + CFG.event_max_move_per_cycle) + 1e-6
    assert any("Game-night" in d for d in event.drivers)


def test_absolute_price_clamp():
    r = compute_market_price(10_000.0, None, config=CFG)
    assert r.market_price <= CFG.price_ceiling
    r2 = compute_market_price(-50.0, None, config=CFG)
    assert r2.market_price >= CFG.price_floor


def test_explanation_is_serialisable_and_attributes_levers():
    games = [GameStat(g, 30.0) for g in [5, 5, 5, 5, 5, 25, 26, 27, 28, 29]]
    proj = compute_projection(games, prior_season_avg_game_score=6.0)
    r = compute_market_price(
        100.0, 100.0,
        projection=proj,
        sentiment=compute_sentiment(None),
        team_context=compute_team_context(None),
        demand=compute_demand(None, CFG),
        config=CFG,
    )
    exp = r.explanation()
    assert set(["fair_value", "market_price", "levers", "drivers"]).issubset(exp.keys())
    assert "projection" in exp["levers"]
    # Positive projection should push market price above fair value here.
    assert r.market_price > 100.0
    assert any("Projection" in d for d in r.drivers)


def test_no_random_movement_is_deterministic():
    a = compute_market_price(100.0, 110.0)
    b = compute_market_price(100.0, 110.0)
    assert a.market_price == b.market_price


def test_premium_capped_flag_set_when_levers_exceed_band():
    # Force raw premium beyond the band using a config with tiny band.
    cfg = MarketConfig(max_premium=0.01, demand_weight=0.5)
    demand = compute_demand(DemandWindow(recent_buy_volume=1e9, recent_sell_volume=0), cfg)
    r = compute_market_price(100.0, None, demand=demand, config=cfg)
    assert r.premium_capped is True
    assert math.isclose(r.premium_pct, cfg.max_premium, rel_tol=1e-6)
