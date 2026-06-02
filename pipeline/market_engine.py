"""
Market Price engine — the heart of Layer 2.

Given a player's **Fair Value** (Layer 1) and the four explainable levers
(projection, sentiment, team context, demand), plus the player's **previous
Market Price**, it produces the new Market Price with:

  * a Fair-Value-anchored target (FV adjusted by the levers),
  * mean reversion toward that target (smooth, gradual drift),
  * a per-cycle movement cap (anti-pump / anti-manipulation),
  * a hard premium band around Fair Value (price can't detach from value),
  * an absolute price clamp.

Crucially, **every dollar of movement is attributable**: the result carries the
contribution of each lever and a human-readable list of drivers. There is no
random component anywhere.

Cold start: when there is no previous Market Price, the engine seeds Market
Price at the Fair-Value-anchored target (i.e. it IPOs at fair value plus the
explainable premium), so day one is sensible and stable.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from demand_engine import DemandResult, compute_demand
from market_config import DEFAULT_CONFIG, MarketConfig, clamp
from projection_engine import ProjectionResult
from sentiment_engine import SentimentResult
from team_context_engine import TeamContextResult


@dataclass
class LeverContribution:
    name: str
    score: float            # normalised [-1, 1]
    weight: float           # max fraction of fair value
    adjustment_pct: float   # score * weight (signed fraction of fair value)


@dataclass
class MarketPriceResult:
    fair_value: float
    market_price: float
    prev_market_price: float
    premium_pct: float                    # (market - fair) / fair
    target_price: float                   # fair-value-anchored target before reversion
    change: float                         # market - prev
    change_pct: float | None              # vs prev market price
    move_capped: bool
    premium_capped: bool
    levers: dict[str, LeverContribution] = field(default_factory=dict)
    drivers: list[str] = field(default_factory=list)

    def explanation(self) -> dict[str, Any]:
        """JSON-serialisable breakdown stored alongside the price."""
        return {
            "fair_value": round(self.fair_value, 4),
            "market_price": round(self.market_price, 4),
            "prev_market_price": round(self.prev_market_price, 4),
            "premium_pct": round(self.premium_pct, 6),
            "target_price": round(self.target_price, 4),
            "change": round(self.change, 4),
            "change_pct": (
                round(self.change_pct, 6) if self.change_pct is not None else None
            ),
            "move_capped": self.move_capped,
            "premium_capped": self.premium_capped,
            "levers": {
                k: {
                    "score": round(v.score, 4),
                    "weight": v.weight,
                    "adjustment_pct": round(v.adjustment_pct, 6),
                }
                for k, v in self.levers.items()
            },
            "drivers": self.drivers,
        }


def _driver_line(label: str, adjustment_pct: float, reason: str | None) -> str | None:
    """Human-readable driver, e.g. 'Projection +2.1% — recent form above average'."""
    if abs(adjustment_pct) < 0.0005:  # < 0.05% is noise; don't narrate it
        return None
    sign = "+" if adjustment_pct >= 0 else "−"
    base = f"{label} {sign}{abs(adjustment_pct) * 100:.1f}%"
    return f"{base} — {reason}" if reason else base


def compute_market_price(
    fair_value: float,
    prev_market_price: float | None,
    *,
    projection: ProjectionResult | None = None,
    sentiment: SentimentResult | None = None,
    team_context: TeamContextResult | None = None,
    demand: DemandResult | None = None,
    config: MarketConfig = DEFAULT_CONFIG,
) -> MarketPriceResult:
    """
    Compute the new Market Price for one player. All lever args are optional and
    default to neutral (score 0), so the minimal call ``compute_market_price(fv,
    prev)`` simply mean-reverts Market Price toward Fair Value.
    """
    fv = clamp(float(fair_value), config.price_floor, config.price_ceiling)

    proj_score = projection.score if projection else 0.0
    sent_score = sentiment.score if sentiment else 0.0
    team_score = team_context.score if team_context else 0.0
    dem = demand if demand is not None else compute_demand(None, config)

    levers = {
        "projection": LeverContribution(
            "projection", proj_score, config.projection_weight,
            proj_score * config.projection_weight,
        ),
        "sentiment": LeverContribution(
            "sentiment", sent_score, config.sentiment_weight,
            sent_score * config.sentiment_weight,
        ),
        "team_context": LeverContribution(
            "team_context", team_score, config.team_context_weight,
            team_score * config.team_context_weight,
        ),
        "demand": LeverContribution(
            "demand", dem.demand_score, dem.demand_weight,
            dem.demand_score * dem.demand_weight,
        ),
    }

    # Total premium fraction, hard-bounded to the configured band.
    raw_premium = sum(l.adjustment_pct for l in levers.values())
    premium = clamp(raw_premium, -config.max_premium, config.max_premium)
    premium_capped = abs(raw_premium) > config.max_premium + 1e-12

    target_price = clamp(fv * (1.0 + premium), config.price_floor, config.price_ceiling)

    # Cold start: seed at the target (fair value + explainable premium).
    if prev_market_price is None or prev_market_price <= 0:
        seeded = clamp(target_price, config.price_floor, config.price_ceiling)
        result = MarketPriceResult(
            fair_value=fv,
            market_price=seeded,
            prev_market_price=seeded,
            premium_pct=(seeded - fv) / fv if fv > 0 else 0.0,
            target_price=target_price,
            change=0.0,
            change_pct=None,
            move_capped=False,
            premium_capped=premium_capped,
            levers=levers,
        )
        result.drivers = _build_drivers(result, projection, sentiment, dem, seeded=True)
        return result

    prev = clamp(float(prev_market_price), config.price_floor, config.price_ceiling)

    # Mean reversion: close a fraction of the gap toward the target each cycle.
    reverted = prev + config.reversion_rate * (target_price - prev)

    # Per-cycle movement cap relative to previous price (anti-pump / anti-dump).
    # This is the FINAL, binding per-cycle constraint: price never moves more than
    # max_move_per_cycle in one cycle, even if Fair Value jumped. The premium band
    # is already enforced via `target_price`, so when Fair Value moves sharply the
    # Market Price catches up smoothly over several cycles (rate-limited here)
    # rather than gapping — and converges into the band because the target sits
    # inside it.
    max_up = prev * (1.0 + config.max_move_per_cycle)
    max_down = prev * (1.0 - config.max_move_per_cycle)
    capped = clamp(reverted, max_down, max_up)
    move_capped = abs(reverted - capped) > 1e-9

    # Absolute price clamp (shared ceiling with the Fair Value engine).
    new_price = clamp(capped, config.price_floor, config.price_ceiling)

    change = new_price - prev
    change_pct = (change / prev) if prev > 0 else None

    result = MarketPriceResult(
        fair_value=fv,
        market_price=new_price,
        prev_market_price=prev,
        premium_pct=(new_price - fv) / fv if fv > 0 else 0.0,
        target_price=target_price,
        change=change,
        change_pct=change_pct,
        move_capped=move_capped,
        premium_capped=premium_capped,
        levers=levers,
    )
    result.drivers = _build_drivers(result, projection, sentiment, dem, seeded=False)
    return result


def _build_drivers(
    result: MarketPriceResult,
    projection: ProjectionResult | None,
    sentiment: SentimentResult | None,
    demand: DemandResult,
    *,
    seeded: bool,
) -> list[str]:
    drivers: list[str] = []

    proj_reason = None
    if projection and projection.notes:
        proj_reason = projection.notes[0]
    line = _driver_line("Projection", result.levers["projection"].adjustment_pct, proj_reason)
    if line:
        drivers.append(line)

    dem_reason = None
    if demand.net_demand > 0:
        dem_reason = "net buying from users"
    elif demand.net_demand < 0:
        dem_reason = "net selling from users"
    line = _driver_line("Demand", result.levers["demand"].adjustment_pct, dem_reason)
    if line:
        drivers.append(line)

    sent_reason = None
    if sentiment and sentiment.notes:
        # Skip placeholder notes; use the first real driver (headline / injury).
        sent_reason = next(
            (n for n in sentiment.notes if not n.startswith(("sentiment", "no "))),
            None,
        )
    line = _driver_line("Sentiment", result.levers["sentiment"].adjustment_pct, sent_reason)
    if line:
        drivers.append(line)
    line = _driver_line("Team context", result.levers["team_context"].adjustment_pct, None)
    if line:
        drivers.append(line)

    if result.premium_capped:
        drivers.append("Premium capped at the configured band vs Fair Value.")
    if result.move_capped:
        drivers.append("Move limited by the per-cycle movement cap.")

    if seeded:
        drivers.insert(0, "Listed at Fair Value plus current model premium.")
    elif not drivers:
        # No lever moved it: it is simply reverting toward / sitting at Fair Value.
        if abs(result.change) < 0.005:
            drivers.append("Holding at Fair Value — no new performance, news, or demand.")
        else:
            direction = "up toward" if result.change > 0 else "down toward"
            drivers.append(f"Drifting {direction} Fair Value (mean reversion).")

    return drivers
