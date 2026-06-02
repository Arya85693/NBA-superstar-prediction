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
    article_count: int = 0                    # # matched headlines (confidence)
    top_headline: str | None = None           # best headline (for explanation)
    injury_flag: bool = False                 # legacy boolean (still honored)
    injury_severity: float | None = None      # 0..1 (ESPN status -> severity)
    injury_status: str | None = None          # raw status for explanation/notes
    social_buzz: float | None = None          # normalised mention velocity


@dataclass
class SentimentResult:
    score: float = 0.0
    signals: dict[str, float] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)


def compute_sentiment(
    data: SentimentInput | None = None,
    full_confidence_articles: int = 3,
) -> SentimentResult:
    """
    Blend available sentiment signals into a single clamped score in [-1, 1].

    ``None`` (or all-empty input) => neutral 0.0. Today the live signals are the
    ESPN injury feed (``injury_severity``) and RSS news (``headline_score``);
    ``social_buzz`` activates automatically once a provider is wired — no caller
    changes needed.

    Confidence: the news headline is scaled by ``min(1, article_count / N)`` so a
    single headline can't swing price as hard as several corroborating ones.
    """
    if data is None:
        return SentimentResult(score=0.0, notes=["sentiment source not configured"])

    score = 0.0
    signals: dict[str, float] = {}
    notes: list[str] = []

    if data.headline_score is not None and data.headline_score == data.headline_score:
        raw = max(-1.0, min(1.0, data.headline_score))
        n = max(0, int(data.article_count))
        confidence = 1.0
        if full_confidence_articles > 1 and n > 0:
            confidence = min(1.0, n / float(full_confidence_articles))
        elif n == 0:
            # Score supplied without a count (e.g. tests / other providers).
            confidence = 1.0
        contribution = raw * confidence
        signals["headline"] = contribution
        score += contribution
        if abs(contribution) >= 0.01:
            tone = "positive" if contribution > 0 else "negative"
            if data.top_headline:
                notes.append(f"news ({tone}): \u201c{data.top_headline}\u201d")
            else:
                notes.append(f"news {tone}")

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
