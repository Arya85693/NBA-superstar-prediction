"""Projection engine — score in [-1, 1], safe defaults, attributable signals."""
import projection_engine as proj
from projection_engine import GameStat, compute_projection


def _games(scores, minutes=None):
    minutes = minutes or [28.0] * len(scores)
    return [GameStat(game_score=s, minutes=m) for s, m in zip(scores, minutes)]


def test_no_games_is_neutral():
    r = compute_projection([])
    assert r.score == 0.0


def test_score_always_in_range():
    hot = compute_projection(_games([40, 42, 45, 48, 50]), prior_season_avg_game_score=5.0)
    cold = compute_projection(_games([1, 0, -2, -3, -5]), prior_season_avg_game_score=20.0)
    assert -1.0 <= hot.score <= 1.0
    assert -1.0 <= cold.score <= 1.0


def test_recent_surge_is_positive():
    # Season baseline low, last 5 games hot -> positive projection.
    scores = [5, 5, 5, 5, 5, 25, 26, 27, 28, 29]
    r = compute_projection(_games(scores), prior_season_avg_game_score=6.0)
    assert r.score > 0.1
    assert r.signals["recent_trend"] > 0


def test_recent_slump_is_negative():
    scores = [25, 25, 25, 25, 25, 4, 3, 2, 1, 0]
    r = compute_projection(_games(scores), prior_season_avg_game_score=24.0)
    assert r.score < -0.1


def test_minutes_trend_contributes():
    scores = [15] * 10
    rising = compute_projection(_games(scores, [10] * 5 + [34] * 5))
    assert rising.signals["minutes_trend"] > 0


def test_age_lever_boosts_young_center():
    base = compute_projection(_games([15] * 6))
    young = compute_projection(
        _games([15] * 6), age=22.0, position_group="C",
    )
    assert young.score > base.score
    assert young.signals["age"] > 0.4
    assert proj.AGE_WEIGHT > 0


def test_age_lever_neutral_at_position_prime():
    at_peak = compute_projection(
        _games([15] * 6), age=29.5, position_group="G",
    )
    assert abs(at_peak.signals["age"]) < 0.05
