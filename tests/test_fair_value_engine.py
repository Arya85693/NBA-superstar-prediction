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


def test_surprise_night_increases_effective_alpha():
    mild = pe.effective_alpha(pe.ALPHA, games_in_season=10, surprise_z=0.2)
    hot = pe.effective_alpha(pe.ALPHA, games_in_season=10, surprise_z=2.5)
    assert hot > mild


def test_surprise_game_moves_price_more_than_flat_line():
    import pandas as pd

    base = {
        "player_id": [1, 1],
        "player_name": ["A", "A"],
        "team_abbr": ["LAL", "LAL"],
        "game_date": ["2025-10-01", "2025-10-03"],
        "season": ["2025-26", "2025-26"],
        "game_id": [1, 2],
        "minutes": [32.0, 34.0],
        "game_score": [14.0, 38.0],
    }
    priced = pe.compute_prices(pd.DataFrame(base))
    p1 = float(priced.iloc[0]["price_after_game"])
    p2 = float(priced.iloc[1]["price_after_game"])
    assert p2 - p1 > 4.0


# --- Unified minutes methodology, gradual confidence, DNP handling ---------------

import pandas as pd  # noqa: E402


def _season_rows(pid, season, start_date, game_scores, minutes, first_game_id=1):
    dates = pd.date_range(start_date, periods=len(game_scores), freq="2D")
    return pd.DataFrame(
        {
            "player_id": pid,
            "player_name": f"P{pid}",
            "team_abbr": "LAL",
            "game_date": dates.strftime("%Y-%m-%d"),
            "season": season,
            "game_id": range(first_game_id, first_game_id + len(game_scores)),
            "minutes": minutes,
            "game_score": game_scores,
        }
    )


def test_effective_game_score_uses_per_game_minutes_factor():
    assert pe.effective_game_score(20.0, 34.0) == 20.0
    assert abs(pe.effective_game_score(20.0, 17.0) - 10.0) < 1e-9
    assert pe.effective_game_score(20.0, 60.0) == 20.0 * pe.MAX_MINUTES_FACTOR


def test_played_excludes_dnp_and_nan():
    assert pe.played(12.0)
    assert not pe.played(0.0)
    assert not pe.played(-1.0)
    assert not pe.played(float("nan"))


def test_sample_confidence_is_monotonic_without_cliff():
    values = [pe.sample_confidence(n) for n in range(0, 40)]
    assert values[0] == 0.0
    assert all(b >= a for a, b in zip(values, values[1:]))
    assert values[pe.MIN_PRIOR_GAMES] == 1.0
    # Largest single-game step is 1/25, i.e. no discontinuity at the threshold.
    assert max(b - a for a, b in zip(values, values[1:])) <= 1.0 / pe.MIN_PRIOR_GAMES + 1e-12


def test_ipo_price_is_continuous_across_old_25_game_threshold():
    star = dict(prior_effective_mean=25.0, league_pct=0.95)
    p24 = pe.ipo_price(prior_games=24, **star)
    p25 = pe.ipo_price(prior_games=25, **star)
    p60 = pe.ipo_price(prior_games=60, **star)
    assert p25 == p60
    assert p24 < p25
    # One extra game moves the open by at most 1/25 of the anchor–default gap.
    assert p25 - p24 <= (p25 - pe.DEFAULT_IPO_PRICE) / pe.MIN_PRIOR_GAMES + 1e-9
    assert pe.ipo_price(None, 30, 0.9) == pe.DEFAULT_IPO_PRICE
    assert pe.ipo_price(25.0, 0, 0.9) == pe.DEFAULT_IPO_PRICE


def test_ipo_price_without_league_rank_uses_mapped_mean():
    assert abs(pe.ipo_price(10.0, 30, None) - pe.game_score_to_price(10.0)) < 1e-9


def test_zero_prior_confidence_equals_no_prior_season():
    with_prior = pe.smoothing_target_live(15.0, 30.0, 30.0, 12.0, prior_confidence=0.0)
    no_prior = pe.smoothing_target_live(15.0, 30.0, None, 12.0)
    assert abs(with_prior - no_prior) < 1e-12
    full = pe.smoothing_target_live(15.0, 30.0, 30.0, 12.0, prior_confidence=1.0)
    half = pe.smoothing_target_live(15.0, 30.0, 30.0, 12.0, prior_confidence=0.5)
    assert no_prior < half < full


def test_dnp_rows_carry_fair_value_forward_and_do_not_count_as_games():
    played_only = _season_rows(1, "2025-26", "2025-10-01", [12.0, 14.0, 13.0], [30.0, 31.0, 29.0])
    with_dnp = pd.concat(
        [
            played_only.iloc[:2],
            pd.DataFrame(
                {
                    "player_id": [1], "player_name": ["P1"], "team_abbr": ["LAL"],
                    "game_date": ["2025-10-04"], "season": ["2025-26"],
                    "game_id": [99], "minutes": [0.0], "game_score": [0.0],
                }
            ),
            played_only.iloc[2:],
        ],
        ignore_index=True,
    )
    a = pe.compute_prices(played_only).set_index("game_id")["price_after_game"]
    b = pe.compute_prices(with_dnp).set_index("game_id")["price_after_game"]
    assert b.loc[99] == b.loc[2]
    for gid in (1, 2, 3):
        assert abs(a.loc[gid] - b.loc[gid]) < 1e-12


def test_dnp_rows_do_not_dilute_prior_season_anchor():
    prior = _season_rows(1, "2024-25", "2024-11-01", [20.0] * 30, [34.0] * 30)
    prior_dnp = pd.concat(
        [prior, _season_rows(1, "2024-25", "2025-03-15", [0.0] * 10, [0.0] * 10, first_game_id=500)],
        ignore_index=True,
    )
    cur = _season_rows(1, "2025-26", "2025-10-20", [20.0], [34.0], first_game_id=1000)
    a = pe.compute_prices(pd.concat([prior, cur], ignore_index=True))
    b = pe.compute_prices(pd.concat([prior_dnp, cur], ignore_index=True))
    ia = a[a.season == "2025-26"]["season_open_anchor"].iloc[0]
    ib = b[b.season == "2025-26"]["season_open_anchor"].iloc[0]
    assert ia == ib


def test_short_prior_season_opens_between_rookie_default_and_full_anchor():
    def ipo_for(prior_games):
        prior = _season_rows(1, "2024-25", "2024-11-01", [22.0] * prior_games, [34.0] * prior_games)
        cur = _season_rows(1, "2025-26", "2025-10-20", [22.0], [34.0], first_game_id=1000)
        out = pe.compute_prices(pd.concat([prior, cur], ignore_index=True))
        return out[out.season == "2025-26"]["season_open_anchor"].iloc[0]

    ipo10, ipo24, ipo25 = ipo_for(10), ipo_for(24), ipo_for(25)
    assert pe.DEFAULT_IPO_PRICE < ipo10 < ipo24 < ipo25


def test_compute_prices_is_deterministic():
    df = pd.concat(
        [
            _season_rows(1, "2024-25", "2024-11-01", [10.0, 18.0, 25.0] * 10, [28.0, 33.0, 36.0] * 10),
            _season_rows(1, "2025-26", "2025-10-20", [5.0, 30.0, 0.0, 12.0], [20.0, 38.0, 0.0, 26.0], first_game_id=1000),
            _season_rows(2, "2025-26", "2025-10-20", [8.0, 9.0], [15.0, 18.0], first_game_id=2000),
        ],
        ignore_index=True,
    )
    a = pe.compute_prices(df)["price_after_game"].tolist()
    b = pe.compute_prices(df.sample(frac=1.0, random_state=3))["price_after_game"]
    assert a == pe.compute_prices(df)["price_after_game"].tolist()
    assert sorted(a) == sorted(b.tolist())


def test_validation_rejects_zero_and_missing_fair_value():
    from validate_prices import run_validation

    assert run_validation(pd.Series([50.0, 120.0]), csv_path="mem")
    assert not run_validation(pd.Series([50.0, 0.0]), csv_path="mem")
    assert not run_validation(pd.Series([50.0, float("nan")]), csv_path="mem")
