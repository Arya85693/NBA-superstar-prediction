"""
Demand engine — turns recent user trading activity into a normalised demand
score in ``[-1, 1]`` so Market Price can lean toward where users are actually
buying/selling.

The platform has few or no users today, so this is built to default cleanly to
ZERO: with no trades every field is 0 and Market Price falls back to Fair Value
plus the other levers. The moment real trades arrive the same code path turns
them into signal — no redesign, no migration.

Design notes
------------
- ``net_demand`` is signed shares (buys positive, sells negative) inside the
  configured lookback window.
- ``demand_score`` squashes net demand through ``tanh`` so a handful of trades
  nudge price while whales cannot pump it past the cap (see MarketConfig).
- Volume is *recency weighted*: a trade today counts more than one a week ago,
  which makes the lever decay naturally over calendar time even when a player
  does not play — satisfying "Market Price keeps updating between games".
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from market_config import DEFAULT_CONFIG, MarketConfig


@dataclass
class DemandWindow:
    """Aggregated trade flow for one player over the lookback window."""
    recent_buy_volume: float = 0.0
    recent_sell_volume: float = 0.0
    # Per-user-capped net used for scoring. ``None`` => fall back to the raw
    # ``recent_buy_volume - recent_sell_volume`` (so DemandWindow built by hand
    # in tests still behaves like before). ``build_demand_window`` sets this to
    # the sum of each distinct user's capped net flow (anti-manipulation).
    capped_net: float | None = None
    # Number of distinct users with any flow in the window (for explainability).
    distinct_users: int = 0

    @property
    def net_demand(self) -> float:
        if self.capped_net is not None:
            return self.capped_net
        return self.recent_buy_volume - self.recent_sell_volume


@dataclass
class DemandResult:
    demand_score: float                 # clamped [-1, 1]
    net_demand: float
    recent_buy_volume: float
    recent_sell_volume: float
    demand_weight: float                # the configured lever weight (for explainability)
    distinct_users: int = 0


def compute_demand(
    window: DemandWindow | None = None,
    config: MarketConfig = DEFAULT_CONFIG,
) -> DemandResult:
    """
    Convert a demand window into a clamped score. ``None`` / empty window =>
    a fully neutral result (score 0), which is the expected pre-traction state.
    """
    if window is None:
        window = DemandWindow()

    net = window.net_demand
    scale = config.demand_scale_shares
    score = math.tanh(net / scale) if scale > 0 else 0.0
    score = max(-1.0, min(1.0, score))

    return DemandResult(
        demand_score=score,
        net_demand=net,
        recent_buy_volume=window.recent_buy_volume,
        recent_sell_volume=window.recent_sell_volume,
        demand_weight=config.demand_weight,
        distinct_users=window.distinct_users,
    )


def recency_weight(age_days: float, window_days: int) -> float:
    """
    Linear decay weight in [0, 1] for a trade ``age_days`` old. A trade right now
    weighs ~1.0; one at the edge of the window weighs ~0. Older than the window
    contributes nothing. This is what makes demand fade day-over-day.
    """
    if window_days <= 0:
        return 0.0
    if age_days < 0:
        age_days = 0.0
    if age_days >= window_days:
        return 0.0
    return 1.0 - (age_days / float(window_days))


def build_demand_window(
    trades: list[dict],
    config: MarketConfig = DEFAULT_CONFIG,
) -> DemandWindow:
    """
    Aggregate raw trade rows into a recency-weighted DemandWindow.

    Each trade dict needs ``side`` ('buy'|'sell'), ``shares`` (number) and
    ``age_days`` (float, how long ago the fill happened). ``user`` (any hashable,
    e.g. portfolio_id) identifies who placed the trade; rows missing it are
    grouped under one anonymous bucket.

    Anti-manipulation: each *user's* recency-weighted net flow (buys - sells) is
    clamped to ``±demand_user_cap_shares`` before being summed into the signal,
    so one account trading in size (or a Sybil) cannot move the price the way a
    crowd of distinct users leaning the same way can. ``recent_buy_volume`` /
    ``recent_sell_volume`` stay as the raw (uncapped) totals for transparency;
    only ``capped_net`` (what scoring uses) is capped.

    Unknown/old rows are ignored. Empty input -> empty window (score 0).
    """
    win = DemandWindow()
    # per-user weighted buy/sell volume
    by_user: dict[object, list[float]] = {}
    for t in trades:
        side = str(t.get("side") or "").lower()
        try:
            shares = float(t.get("shares") or 0.0)
        except (TypeError, ValueError):
            continue
        if shares <= 0:
            continue
        try:
            age = float(t.get("age_days") if t.get("age_days") is not None else 0.0)
        except (TypeError, ValueError):
            age = 0.0
        w = recency_weight(age, config.demand_window_days)
        if w <= 0:
            continue
        weighted = shares * w
        user = t.get("user")
        if user is None:
            user = "__anon__"
        bucket = by_user.setdefault(user, [0.0, 0.0])  # [buy, sell]
        if side == "buy":
            bucket[0] += weighted
            win.recent_buy_volume += weighted
        elif side == "sell":
            bucket[1] += weighted
            win.recent_sell_volume += weighted

    cap = config.demand_user_cap_shares
    capped_net = 0.0
    distinct = 0
    for buy_vol, sell_vol in by_user.values():
        if buy_vol <= 0.0 and sell_vol <= 0.0:
            continue
        distinct += 1
        user_net = buy_vol - sell_vol
        capped_net += max(-cap, min(cap, user_net))

    win.capped_net = capped_net
    win.distinct_users = distinct
    return win
