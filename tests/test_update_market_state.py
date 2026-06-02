"""Driver assembly — row building + backward compatibility (no I/O)."""
from datetime import date

import pandas as pd

from projection_engine import GameStat
from sentiment_engine import SentimentInput
from team_context_engine import TeamContextInput
from update_market_state import (
    build_player_market_row,
    compute_team_win_pct,
    injury_signal_active,
)


def _row(
    prev=None,
    games=None,
    trades=None,
    fv=100.0,
    team_input=None,
    sentiment_input=None,
    prev_sentiment_score=None,
):
    return build_player_market_row(
        player_id=2544,
        player_name="Test Player",
        team_abbr="LAL",
        fair_value=fv,
        prev_market_price=prev,
        season_games=games or [GameStat(15.0, 30.0) for _ in range(6)],
        prior_season_avg_game_score=14.0,
        demand_trades=trades,
        as_of_date="2026-01-01",
        team_context_input=team_input,
        sentiment_input=sentiment_input,
        prev_sentiment_score=prev_sentiment_score,
    )


def test_row_has_all_required_fields():
    row = _row()
    required = {
        "player_id", "player_name", "team_abbr", "fair_value", "market_price",
        "prev_market_price", "premium_pct", "change", "change_pct",
        "projection_score", "projection_adjustment", "sentiment_score",
        "sentiment_adjustment", "team_context_score", "team_context_adjustment",
        "demand_score", "demand_adjustment", "net_demand", "recent_buy_volume",
        "recent_sell_volume", "demand_weight", "move_capped", "premium_capped",
        "explanation", "as_of_date",
    }
    assert required.issubset(row.keys())


def test_backward_compatible_zero_user_defaults():
    # No trades + flat performance => demand levers all zero (pre-traction state).
    row = _row(trades=None)
    assert row["demand_score"] == 0.0
    assert row["demand_adjustment"] == 0.0
    assert row["net_demand"] == 0.0
    assert row["sentiment_score"] == 0.0
    assert row["team_context_score"] == 0.0


def test_cold_start_market_price_close_to_fair_value():
    row = _row(prev=None)
    assert abs(row["market_price"] - row["fair_value"]) <= row["fair_value"] * 0.15 + 1e-6


def test_demand_flows_through_to_row():
    trades = [{"side": "buy", "shares": 5000, "age_days": 0.0}]
    row = _row(prev=100.0, trades=trades)
    assert row["recent_buy_volume"] == 5000.0
    assert row["demand_score"] > 0.0
    assert row["market_price"] >= 100.0


def test_explanation_json_roundtrips():
    import json

    row = _row()
    s = json.dumps(row["explanation"])
    back = json.loads(s)
    assert back["fair_value"] == row["fair_value"]


def test_team_context_flows_through_to_row():
    # A winning team should lift Market Price above an identical losing team.
    winner = _row(prev=100.0, team_input=TeamContextInput(team_win_pct=0.80))
    loser = _row(prev=100.0, team_input=TeamContextInput(team_win_pct=0.20))
    assert winner["team_context_score"] > 0.0
    assert loser["team_context_score"] < 0.0
    assert winner["team_context_adjustment"] > 0.0
    assert loser["team_context_adjustment"] < 0.0
    assert winner["market_price"] > loser["market_price"]


def test_team_context_none_is_neutral():
    row = _row(prev=100.0, team_input=None)
    assert row["team_context_score"] == 0.0
    assert row["team_context_adjustment"] == 0.0


def test_compute_team_win_pct_from_results():
    # LAL: 3-1 (.750), BOS: 1-3 (.250) across 4 shared games.
    rows = []
    for gid, (lal, bos) in enumerate(
        [("W", "L"), ("W", "L"), ("L", "W"), ("W", "L")], start=1
    ):
        rows.append({"team_abbr": "LAL", "game_id": gid, "season": "2025-26", "result": lal})
        rows.append({"team_abbr": "BOS", "game_id": gid, "season": "2025-26", "result": bos})
    df = pd.DataFrame(rows)
    wp = compute_team_win_pct(df)
    assert wp["LAL"] == 0.75
    assert wp["BOS"] == 0.25


def test_compute_team_win_pct_dedupes_players_in_same_game():
    # Two LAL players in the same game must not double-count the team's result.
    rows = [
        {"team_abbr": "LAL", "game_id": 1, "season": "2025-26", "result": "W"},
        {"team_abbr": "LAL", "game_id": 1, "season": "2025-26", "result": "W"},
        {"team_abbr": "LAL", "game_id": 2, "season": "2025-26", "result": "L"},
    ]
    df = pd.DataFrame(rows)
    wp = compute_team_win_pct(df)
    assert wp["LAL"] == 0.5


def test_compute_team_win_pct_missing_columns_returns_empty():
    df = pd.DataFrame({"team_abbr": ["LAL"], "season": ["2025-26"]})
    assert compute_team_win_pct(df) == {}


def test_injury_active_in_season():
    # League played 2 days ago, player played 1 day ago => injury applies.
    assert injury_signal_active(
        player_last_game=date(2026, 1, 9),
        ref_game_date=date(2026, 1, 10),
        as_of=date(2026, 1, 12),
        window_days=10,
    )


def test_injury_suppressed_in_offseason():
    # Last league game was ~2 months ago => offseason => no injury discount.
    assert not injury_signal_active(
        player_last_game=date(2026, 6, 1),
        ref_game_date=date(2026, 6, 1),
        as_of=date(2026, 8, 1),
        window_days=10,
    )


def test_injury_suppressed_for_inactive_player():
    # League is active (game yesterday) but this player hasn't played in weeks.
    assert not injury_signal_active(
        player_last_game=date(2026, 1, 1),
        ref_game_date=date(2026, 2, 1),
        as_of=date(2026, 2, 2),
        window_days=10,
    )


def test_injury_gate_none_inputs_are_inactive():
    assert not injury_signal_active(None, date(2026, 1, 1), date(2026, 1, 2), 10)
    assert not injury_signal_active(date(2026, 1, 1), None, date(2026, 1, 2), 10)


def test_injury_sentiment_flows_through_to_row():
    healthy = _row(prev=100.0, sentiment_input=None)
    injured = _row(
        prev=100.0,
        sentiment_input=SentimentInput(injury_severity=0.8, injury_status="Out"),
    )
    assert injured["sentiment_score"] < 0.0
    assert injured["sentiment_adjustment"] < 0.0
    assert injured["market_price"] < healthy["market_price"]


def test_no_injury_sentiment_is_neutral():
    row = _row(prev=100.0, sentiment_input=None)
    assert row["sentiment_score"] == 0.0
    assert row["sentiment_adjustment"] == 0.0


def test_sentiment_smoothing_blends_with_prev():
    # Fresh sentiment 0.0, prev -0.8, default smoothing 0.5 => -0.4 stored.
    row = _row(prev=100.0, sentiment_input=None, prev_sentiment_score=-0.8)
    assert abs(row["sentiment_score"] - (-0.4)) < 1e-6


def test_sentiment_smoothing_dampens_a_spike():
    # A fresh strong negative, but prior was neutral => stored is dampened.
    si = SentimentInput(headline_score=-1.0, article_count=3)
    raw = _row(prev=100.0, sentiment_input=si)
    smoothed = _row(prev=100.0, sentiment_input=si, prev_sentiment_score=0.0)
    assert smoothed["sentiment_score"] > raw["sentiment_score"]  # closer to 0


def test_news_headline_appears_in_explanation_drivers():
    si = SentimentInput(headline_score=0.9, article_count=3, top_headline="Star drops 40")
    row = _row(prev=100.0, sentiment_input=si)
    drivers = row["explanation"]["drivers"]
    assert any("Star drops 40" in d for d in drivers)


def test_confidence_dampens_single_article_in_row():
    one = _row(prev=100.0, sentiment_input=SentimentInput(headline_score=0.9, article_count=1))
    many = _row(prev=100.0, sentiment_input=SentimentInput(headline_score=0.9, article_count=3))
    assert one["sentiment_score"] < many["sentiment_score"]
