"""
Team context engine — captures value that comes from a player's *situation*
rather than their box score: team success, playoff positioning, opportunity
shifts (trades / injuries to teammates), rotation changes and schedule quality.

DORMANT BY DESIGN. Returns a neutral ``0.0`` today. The lever, weighting and
explanation hooks exist so that adding standings / depth-chart / schedule feeds
later is purely additive — populate :class:`TeamContextInput` and return a real
score with no caller changes.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class TeamContextInput:
    """Future inputs. All optional so today's callers pass nothing."""
    team_win_pct: float | None = None         # 0..1
    playoff_seed: int | None = None           # 1..15, lower is better
    opportunity_delta: float | None = None    # role change in [-1, 1]
    schedule_strength: float | None = None    # in [-1, 1], + = easier ahead


@dataclass
class TeamContextResult:
    score: float = 0.0
    signals: dict[str, float] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)


# Sub-signal weights (bounded; final score is clamped to [-1, 1]).
W_TEAM_SUCCESS = 0.6     # regular-season win pct vs .500
W_PLAYOFF_SEED = 0.25    # conference seed (lower = better)
W_OPPORTUNITY = 0.5      # role/opportunity change (dormant until provided)


def compute_team_context(data: TeamContextInput | None = None) -> TeamContextResult:
    """
    Turn a team's situation into a score in [-1, 1].

    ``None`` (or all-empty input) => neutral 0.0, so a player whose team data is
    missing simply leans on Fair Value. Today we feed ``team_win_pct`` (derived
    from ingested game results); ``playoff_seed`` / ``opportunity_delta`` activate
    automatically once those inputs are supplied.
    """
    if data is None:
        return TeamContextResult(
            score=0.0, notes=["team context source not configured"]
        )

    signals: dict[str, float] = {}
    notes: list[str] = []
    score = 0.0

    if data.team_win_pct is not None and data.team_win_pct == data.team_win_pct:
        # Center on .500: a .700 team => +0.4, a .300 team => -0.4.
        ts = max(-1.0, min(1.0, (data.team_win_pct - 0.5) * 2.0))
        signals["team_success"] = ts
        score += W_TEAM_SUCCESS * ts
        if ts > 0.1:
            notes.append("team winning above .500")
        elif ts < -0.1:
            notes.append("team below .500")

    if data.playoff_seed is not None:
        # Seed 1 => +1, seed 8 => 0, seed 15 => -1 (lower seed is better).
        ps = max(-1.0, min(1.0, (8.0 - float(data.playoff_seed)) / 7.0))
        signals["playoff"] = ps
        score += W_PLAYOFF_SEED * ps

    if data.opportunity_delta is not None and data.opportunity_delta == data.opportunity_delta:
        op = max(-1.0, min(1.0, data.opportunity_delta))
        signals["opportunity"] = op
        score += W_OPPORTUNITY * op

    if not signals:
        return TeamContextResult(score=0.0, notes=["no team context inputs"])

    return TeamContextResult(
        score=max(-1.0, min(1.0, score)),
        signals=signals,
        notes=notes or ["team context applied"],
    )
