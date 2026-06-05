"""
Central configuration for the Market Price layer.

The platform has TWO pricing layers:

1. **Fair Value** (``pipeline/price_engine.py``) — the statistically justified
   basketball value of a player. Objective, updates only after games.

2. **Market Price** (this package) — the actual displayed / tradable price.
   Fair Value plus explainable premiums/discounts from projection, sentiment,
   team context and user demand, with mean reversion, movement caps and decay.

Every tunable lives here so the model is auditable in one place and can be
re-priced without touching engine logic. Each "score" is normalised to
``[-1, 1]`` and each "weight" is the maximum fraction of Fair Value that lever
may push the Market Price target.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MarketConfig:
    # --- Lever weights: max |adjustment| as a fraction of Fair Value -----------
    projection_weight: float = 0.09       # ±9% — forward expectations move price more
    sentiment_weight: float = 0.04        # ±4%
    team_context_weight: float = 0.03     # ±3%
    demand_weight: float = 0.05           # ±5%

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
    # Injury signal only applies while basketball is actually being played. If the
    # most recent league game (or a given player's last game) is older than this
    # many days, "Out" is treated as offseason/stale noise and ignored — so the
    # injury lever doesn't discount ~everyone in July or eliminated players in the
    # playoffs. News sentiment is unaffected (offseason trades/signings are real).
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
    """Return (max_move_per_cycle, reversion_rate) for this update cycle."""
    if event_mode:
        return config.event_max_move_per_cycle, config.event_reversion_rate
    return config.max_move_per_cycle, config.reversion_rate


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
