"""
Availability adjustment — the injury part of Layer 2.

An injury listing is not a statement about how well a player plays (that is
Fair Value) but about whether he will play, so it scales the Fair Value
**anchor** instead of being mixed into news sentiment:

    anchor = fair_value × availability_factor
    availability_factor = 1 − max_discount × severity

``severity`` comes from the ESPN status map in ``espn_injuries.STATUS_SEVERITY``
(Out For Season 1.0 … Day-To-Day 0.25). Pure and deterministic; no I/O.
"""
from __future__ import annotations

from dataclasses import dataclass

from market_config import DEFAULT_CONFIG, MarketConfig


@dataclass(frozen=True)
class AvailabilityResult:
    factor: float = 1.0                 # multiplier on Fair Value, in [1 − max, 1]
    severity: float = 0.0               # 0..1
    status: str | None = None           # raw ESPN status (explanation only)

    @property
    def adjustment_pct(self) -> float:
        return self.factor - 1.0


def compute_availability(
    severity: float | None,
    status: str | None = None,
    config: MarketConfig = DEFAULT_CONFIG,
) -> AvailabilityResult:
    """``None`` / NaN / non-positive severity => fully available (factor 1)."""
    if severity is None or severity != severity or severity <= 0.0:
        return AvailabilityResult()
    s = min(1.0, float(severity))
    return AvailabilityResult(
        factor=1.0 - config.availability_max_discount * s,
        severity=s,
        status=status,
    )
