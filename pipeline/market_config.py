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
    projection_weight: float = 0.06       # ±6% of fair value
    sentiment_weight: float = 0.04        # ±4%
    team_context_weight: float = 0.03     # ±3%
    demand_weight: float = 0.05           # ±5%

    # --- Premium / movement guards (anti-manipulation) -------------------------
    # Market Price may never sit more than this fraction away from Fair Value.
    max_premium: float = 0.15             # ±15% band around fair value
    # Market Price may not move more than this fraction in a single update cycle.
    max_move_per_cycle: float = 0.08      # ±8% per cycle
    # Fraction of the gap to the target closed each cycle (mean reversion speed).
    # 0 = frozen, 1 = jump straight to target. Lower = smoother / slower drift.
    reversion_rate: float = 0.34

    # --- Demand window ---------------------------------------------------------
    # Trades within this many days feed recent buy/sell volume.
    demand_window_days: int = 7
    # Net shares (buys - sells) that map to a ~full-strength demand signal.
    demand_scale_shares: float = 500.0

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
        ):
            v = getattr(self, name)
            if not (0.0 <= v <= 1.0):
                raise ValueError(f"{name} must be in [0, 1], got {v}")
        if not (0.0 <= self.reversion_rate <= 1.0):
            raise ValueError("reversion_rate must be in [0, 1]")
        if self.price_ceiling <= self.price_floor:
            raise ValueError("price_ceiling must exceed price_floor")


# Default singleton used across the pipeline. Construct a custom MarketConfig
# in tests or experiments to re-price without editing engine code.
DEFAULT_CONFIG = MarketConfig()


def clamp(value: float, low: float, high: float) -> float:
    """Clamp ``value`` into ``[low, high]`` (NaN-safe -> low)."""
    if value != value:  # NaN
        return low
    return max(low, min(high, value))
