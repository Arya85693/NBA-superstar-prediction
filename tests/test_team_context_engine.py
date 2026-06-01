"""Team context engine — win pct / seed / opportunity -> bounded score."""
from team_context_engine import TeamContextInput, compute_team_context


def test_none_is_neutral():
    assert compute_team_context(None).score == 0.0


def test_empty_input_is_neutral():
    assert compute_team_context(TeamContextInput()).score == 0.0


def test_winning_team_is_positive():
    res = compute_team_context(TeamContextInput(team_win_pct=0.75))
    assert res.score > 0.0
    assert "team_success" in res.signals


def test_losing_team_is_negative():
    res = compute_team_context(TeamContextInput(team_win_pct=0.25))
    assert res.score < 0.0


def test_five_hundred_team_is_neutral():
    res = compute_team_context(TeamContextInput(team_win_pct=0.5))
    assert abs(res.score) < 1e-9


def test_score_is_clamped():
    # Even an absurd input stays bounded.
    res = compute_team_context(TeamContextInput(team_win_pct=5.0))
    assert -1.0 <= res.score <= 1.0


def test_playoff_seed_better_is_positive():
    top = compute_team_context(TeamContextInput(playoff_seed=1)).score
    bottom = compute_team_context(TeamContextInput(playoff_seed=15)).score
    assert top > 0.0
    assert bottom < 0.0
    assert top > bottom


def test_win_pct_and_seed_compound():
    win_only = compute_team_context(TeamContextInput(team_win_pct=0.75)).score
    both = compute_team_context(
        TeamContextInput(team_win_pct=0.75, playoff_seed=1)
    ).score
    assert both > win_only
