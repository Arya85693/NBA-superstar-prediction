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
    injury_flag: bool = False
    social_buzz: float | None = None          # normalised mention velocity


@dataclass
class SentimentResult:
    score: float = 0.0
    signals: dict[str, float] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)


def compute_sentiment(data: SentimentInput | None = None) -> SentimentResult:
    """
    Neutral until a news/sentiment source is connected.

    When wired, blend ``headline_score``, injury flags and social buzz into a
    single clamped score here; everything downstream already consumes it.
    """
    if data is None:
        return SentimentResult(score=0.0, notes=["sentiment source not configured"])

    # Placeholder pass-through so the architecture is testable today.
    score = 0.0
    signals: dict[str, float] = {}
    if data.headline_score is not None and data.headline_score == data.headline_score:
        signals["headline"] = max(-1.0, min(1.0, data.headline_score))
        score = signals["headline"]
    if data.injury_flag:
        signals["injury"] = -0.5
        score = max(-1.0, min(1.0, score - 0.5))

    return SentimentResult(
        score=max(-1.0, min(1.0, score)),
        signals=signals,
        notes=["sentiment placeholder (no live feed)"],
    )
