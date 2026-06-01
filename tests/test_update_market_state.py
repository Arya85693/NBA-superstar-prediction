"""Driver assembly — row building + backward compatibility (no I/O)."""
from projection_engine import GameStat
from update_market_state import build_player_market_row


def _row(prev=None, games=None, trades=None, fv=100.0):
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
