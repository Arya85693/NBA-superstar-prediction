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


def compute_team_context(data: TeamContextInput | None = None) -> TeamContextResult:
    """Neutral until team/standings/schedule data is connected."""
    if data is None:
        return TeamContextResult(
            score=0.0, notes=["team context source not configured"]
        )

    signals: dict[str, float] = {}
    score = 0.0
    if data.opportunity_delta is not None and data.opportunity_delta == data.opportunity_delta:
        signals["opportunity"] = max(-1.0, min(1.0, data.opportunity_delta))
        score += 0.6 * signals["opportunity"]
    if data.team_win_pct is not None and data.team_win_pct == data.team_win_pct:
        # Center around .500; +/- up to ~0.4 contribution.
        signals["team_success"] = max(-1.0, min(1.0, (data.team_win_pct - 0.5) * 2.0))
        score += 0.4 * signals["team_success"]

    return TeamContextResult(
        score=max(-1.0, min(1.0, score)),
        signals=signals,
        notes=["team context placeholder (no live feed)"],
    )
