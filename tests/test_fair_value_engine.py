"""Fair Value engine (Layer 1) — preserve the existing pricing behaviour."""
import price_engine as pe


def test_game_score_to_price_anchors():
    # Mapping endpoints from the documented model.
    assert round(pe.game_score_to_price(pe.GS_MAP_LO), 2) == pe.PRICE_MIN
    assert round(pe.game_score_to_price(pe.GS_MAP_HI), 2) == pe.PRICE_MAX


def test_game_score_to_price_clamps_outside_range():
    assert pe.game_score_to_price(-100) == pe.PRICE_MIN
    assert pe.game_score_to_price(1000) == pe.PRICE_MAX


def test_game_score_to_price_midpoint_is_linear():
    mid_gs = (pe.GS_MAP_LO + pe.GS_MAP_HI) / 2
    mid_price = (pe.PRICE_MIN + pe.PRICE_MAX) / 2
    assert abs(pe.game_score_to_price(mid_gs) - mid_price) < 1e-6


def test_minutes_factor_bounds():
    assert pe.minutes_factor(0) == pe.MIN_MINUTES_FACTOR
    assert pe.minutes_factor(float("nan")) == pe.MIN_MINUTES_FACTOR
    # Very high minutes saturate at the configured ceiling.
    assert pe.minutes_factor(60) == pe.MAX_MINUTES_FACTOR
    # Reference minutes => ~1.0 ratio (within clamp band).
    assert pe.MIN_MINUTES_FACTOR <= pe.minutes_factor(pe.MINUTES_REF) <= pe.MAX_MINUTES_FACTOR


def test_rookie_default_ipo_is_about_61_80():
    assert round(pe.ROOKIE_IPO_PRICE, 2) == 61.80


def test_smoothing_target_blend_weights_sum_to_one():
    assert abs(
        pe.WEIGHT_TONIGHT + pe.WEIGHT_PRIOR_YEAR + pe.WEIGHT_SEASON_AVG - 1.0
    ) < 1e-9
