"""
Sentiment engine — converts news / social signal into a normalised score in
``[-1, 1]`` that nudges Market Price above or below Fair Value.

DORMANT BY DESIGN. There is no news integration yet, so :func:`compute_sentiment`
returns a neutral ``0.0`` and the Market Price engine ignores the lever. The
contract, weighting and explanation plumbing already exist, so wiring a real
provider later (RSS, X/Twitter, injury feeds, an LLM analyst) is additive:
populate :class:`SentimentInput` and return a real score — no caller changes.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class SentimentInput:
    """Future inputs. All optional so today's callers pass nothing."""
    headline_score: float | None = None      # provider polarity in [-1, 1]
    article_count: int = 0
    injury_flag: bool = False                 # legacy boolean (still honored)
    injury_severity: float | None = None      # 0..1 (ESPN status -> severity)
    injury_status: str | None = None          # raw status for explanation/notes
    social_buzz: float | None = None          # normalised mention velocity


@dataclass
class SentimentResult:
    score: float = 0.0
    signals: dict[str, float] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)


def compute_sentiment(data: SentimentInput | None = None) -> SentimentResult:
    """
    Blend available sentiment signals into a single clamped score in [-1, 1].

    ``None`` (or all-empty input) => neutral 0.0. Today the live signal is the
    ESPN injury feed (``injury_severity``); ``headline_score`` / ``social_buzz``
    activate automatically once a news/social provider is wired — no caller
    changes needed.
    """
    if data is None:
        return SentimentResult(score=0.0, notes=["sentiment source not configured"])

    score = 0.0
    signals: dict[str, float] = {}
    notes: list[str] = []

    if data.headline_score is not None and data.headline_score == data.headline_score:
        signals["headline"] = max(-1.0, min(1.0, data.headline_score))
        score += signals["headline"]

    # Injury: prefer a graded severity (Out hits harder than Day-To-Day); fall
    # back to the legacy boolean if only that is supplied.
    severity = None
    if data.injury_severity is not None and data.injury_severity == data.injury_severity:
        severity = max(0.0, min(1.0, data.injury_severity))
    elif data.injury_flag:
        severity = 0.5
    if severity and severity > 0.0:
        signals["injury"] = -severity
        score -= severity
        label = data.injury_status or "injured"
        notes.append(f"injury: {label}")

    if not signals:
        return SentimentResult(score=0.0, notes=["no sentiment inputs"])

    return SentimentResult(
        score=max(-1.0, min(1.0, score)),
        signals=signals,
        notes=notes or ["sentiment applied"],
    )
