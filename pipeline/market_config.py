"""
Central configuration for the Market Price layer.

The platform has TWO pricing layers:

1. **Fair Value** (``pipeline/price_engine.py``) — the statistically justified
   basketball value of a player. Objective, updates only after games.

2. **Market Price** (this package) — the actual displayed / tradable price.
   An anchor (Fair Value × availability) plus bounded premiums from news
   sentiment and user demand, with time-scaled mean reversion and movement caps.

Every tunable lives here so the model is auditable in one place and can be
re-priced without touching engine logic. Each "score" is normalised to
``[-1, 1]`` and each "weight" is the maximum fraction of Fair Value that lever
may push the Market Price target.

Projection and team context are still computed and stored (Radar / outlook),
but carry weight 0 in the price: both are derived from the same box scores that
already drive Fair Value, and the backtest shows the projection score is
negatively related to the next Fair Value move (see docs/MARKET_PRICING_ENGINE.md).
"""
from __future__ import annotations

from dataclasses import dataclass

# Stored in every explanation; a change marks a methodology boundary so the first
# cycle under a new model does not treat the restatement as a game-night event.
PRICING_MODEL_VERSION = "2026-10-fv2-mkt2"


@dataclass(frozen=True)
class MarketConfig:
    # --- Lever weights: max |adjustment| as a fraction of Fair Value -----------
    projection_weight: float = 0.0        # diagnostic only (would double-count box scores)
    sentiment_weight: float = 0.04        # ±4% — news headlines only
    team_context_weight: float = 0.0      # diagnostic only (would double-count box scores)
    demand_weight: float = 0.05           # ±5%

    # --- Availability (injury) adjustment on the Fair Value anchor -------------
    # anchor = FV × (1 − availability_max_discount × severity), severity from the
    # ESPN status map. 0.04 keeps the previous maximum injury impact (it used to
    # flow through the 4% sentiment weight).
    availability_max_discount: float = 0.04

    # --- Cycle timing ----------------------------------------------------------
    # Reversion and movement caps are defined per nominal cycle and scaled by the
    # elapsed fraction of one (capped at 1), so re-runs cannot compound movement.
    nominal_cycle_minutes: float = 30.0

    # --- Premium / movement guards (anti-manipulation) -------------------------
    # Market Price may never sit more than this fraction away from Fair Value.
    max_premium: float = 0.20             # ±20% band around fair value
    # Market Price may not move more than this fraction in a single update cycle.
    max_move_per_cycle: float = 0.10      # ±10% per normal cycle
    # Fraction of the gap to the target closed each cycle (mean reversion speed).
    # 0 = frozen, 1 = jump straight to target. Lower = smoother / slower drift.
    reversion_rate: float = 0.45
    # Game-night cycle (fair value just moved from new stats): faster catch-up.
    event_max_move_per_cycle: float = 0.18   # ±18% when a new game lands
    event_reversion_rate: float = 0.70
    # Fair-value move vs last published state that triggers event mode.
    event_fair_value_jump_threshold: float = 0.02

    # --- Demand window ---------------------------------------------------------
    # Trades within this many days feed recent buy/sell volume.
    demand_window_days: int = 7
    # Net shares (buys - sells) that map to a ~full-strength demand signal.
    demand_scale_shares: float = 500.0
    # Anti-manipulation: the most net (recency-weighted) shares ANY single user
    # can contribute to a player's demand signal. One whale (or a Sybil spinning
    # one account) is capped here, so moving the price meaningfully requires many
    # distinct users leaning the same way — not one account trading in size.
    demand_user_cap_shares: float = 150.0

    # --- News sentiment shaping (Tier 1: stability + confidence) ---------------
    # Headlines decay by half every this many days, so today's news outweighs
    # stale news and a player's sentiment fades toward 0 as coverage ages.
    sentiment_news_half_life_days: float = 3.0
    # Number of matched headlines for full confidence. Fewer articles scale the
    # news signal down (1 of N), so a single lucky/unlucky headline can't swing
    # the price as hard as several corroborating ones.
    sentiment_full_confidence_articles: int = 3
    # Cross-cycle smoothing (EMA): new sentiment = alpha*fresh + (1-alpha)*prev.
    # Lower = steadier (price won't whipsaw on one new article each cycle).
    sentiment_smoothing: float = 0.60
    # Availability only applies while basketball is actually being played. If the
    # most recent league game is older than this many days, injury listings are
    # treated as offseason noise and ignored. A listed player who has not played
    # recently keeps the discount: Fair Value carries forward while they are out,
    # so the absence is not already priced. News sentiment is unaffected.
    injury_active_window_days: int = 10

    # --- Absolute price clamp (shared with Fair Value engine ceiling) ----------
    price_floor: float = 0.0
    price_ceiling: float = 240.0

    def __post_init__(self) -> None:
        for name in (
            "projection_weight",
            "sentiment_weight",
            "team_context_weight",
            "demand_weight",
            "max_premium",
            "max_move_per_cycle",
            "event_max_move_per_cycle",
            "availability_max_discount",
        ):
            v = getattr(self, name)
            if not (0.0 <= v <= 1.0):
                raise ValueError(f"{name} must be in [0, 1], got {v}")
        if not (0.0 <= self.reversion_rate <= 1.0):
            raise ValueError("reversion_rate must be in [0, 1]")
        if not (0.0 <= self.event_reversion_rate <= 1.0):
            raise ValueError("event_reversion_rate must be in [0, 1]")
        if self.event_fair_value_jump_threshold <= 0.0:
            raise ValueError("event_fair_value_jump_threshold must be > 0")
        if not (0.0 <= self.sentiment_smoothing <= 1.0):
            raise ValueError("sentiment_smoothing must be in [0, 1]")
        if self.sentiment_news_half_life_days <= 0.0:
            raise ValueError("sentiment_news_half_life_days must be > 0")
        if self.sentiment_full_confidence_articles < 1:
            raise ValueError("sentiment_full_confidence_articles must be >= 1")
        if self.injury_active_window_days < 1:
            raise ValueError("injury_active_window_days must be >= 1")
        if self.demand_user_cap_shares <= 0.0:
            raise ValueError("demand_user_cap_shares must be > 0")
        if self.nominal_cycle_minutes <= 0.0:
            raise ValueError("nominal_cycle_minutes must be > 0")
        if self.price_ceiling <= self.price_floor:
            raise ValueError("price_ceiling must exceed price_floor")


# Default singleton used across the pipeline. Construct a custom MarketConfig
# in tests or experiments to re-price without editing engine code.
DEFAULT_CONFIG = MarketConfig()


def cycle_limits(
    config: MarketConfig,
    *,
    event_mode: bool,
) -> tuple[float, float]:
    """Return (max_move_per_cycle, reversion_rate) for one full nominal cycle."""
    if event_mode:
        return config.event_max_move_per_cycle, config.event_reversion_rate
    return config.max_move_per_cycle, config.reversion_rate


def elapsed_cycle_fraction(
    elapsed_minutes: float | None,
    config: MarketConfig = DEFAULT_CONFIG,
) -> float:
    """
    Fraction of one nominal cycle since the last published state, in ``[0, 1]``.
    Unknown elapsed time counts as one full cycle (the pre-existing behaviour).
    """
    if elapsed_minutes is None or elapsed_minutes != elapsed_minutes:
        return 1.0
    return max(0.0, min(1.0, float(elapsed_minutes) / config.nominal_cycle_minutes))


def scaled_cycle_limits(
    move_cap: float,
    reversion: float,
    fraction: float,
) -> tuple[float, float, float]:
    """
    Scale one-cycle limits to a fraction ``f`` of a cycle so that running twice at
    ``f = 0.5`` is equivalent to running once at ``f = 1``:

    * reversion ``1 − (1 − λ)^f`` (remaining gap shrinks geometrically),
    * up cap ``(1 + cap)^f − 1`` and down cap ``1 − (1 − cap)^f`` (caps compound).

    Returns ``(max_up_pct, max_down_pct, reversion)``.
    """
    f = max(0.0, min(1.0, fraction))
    return (
        (1.0 + move_cap) ** f - 1.0,
        1.0 - (1.0 - move_cap) ** f,
        1.0 - (1.0 - reversion) ** f,
    )


def is_game_night_event(
    fair_value: float,
    prev_fair_value: float | None,
    *,
    threshold: float = DEFAULT_CONFIG.event_fair_value_jump_threshold,
) -> bool:
    """True when fair value moved enough to imply a fresh game was ingested."""
    if prev_fair_value is None or prev_fair_value <= 0:
        return False
    jump = abs(fair_value - prev_fair_value) / prev_fair_value
    return jump >= threshold


def clamp(value: float, low: float, high: float) -> float:
    """Clamp ``value`` into ``[low, high]`` (NaN-safe -> low)."""
    if value != value:  # NaN
        return low
    return max(low, min(high, value))
