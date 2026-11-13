/**
 * One Market Price tick for one player: TypeScript port of the stepping half of
 * pipeline/market_engine.compute_market_price (reversion, time-scaled caps,
 * premium band, absolute clamp). Pure, no I/O.
 *
 * The *inputs* to the target (availability factor and lever adjustments for
 * news sentiment and user demand) are computed by the Python market step every
 * pipeline cycle and stored in player_market_state.explanation. The tick only
 * re-anchors that target to the current Fair Value (live in-game Fair Value while
 * a game is on) and moves price toward it in small, time-scaled steps.
 */

// --- pipeline/market_config.py (MarketConfig defaults) ------------------------
export const MARKET_CONFIG = {
  nominalCycleMinutes: 30.0,
  maxPremium: 0.2,
  maxMovePerCycle: 0.1,
  reversionRate: 0.45,
  eventMaxMovePerCycle: 0.18,
  eventReversionRate: 0.7,
  eventFairValueJumpThreshold: 0.02,
  priceFloor: 0.0,
  priceCeiling: 240.0,
} as const;

/** Moves smaller than this (dollars) are not written. */
export const MIN_WRITE_DELTA = 0.005;

export type MarketStateRow = {
  player_id: number;
  market_price: number;
  prev_market_price: number;
  fair_value: number;
  updated_at: string;
  explanation: Record<string, unknown> | null;
};

export type LiveInfo = {
  live_fair_value: number;
  base_fair_value: number;
  game_state: string;
  progress: number;
  espn_event_id: string;
};

export type TickRow = {
  player_id: number;
  expected_updated_at: string;
  market_price: number;
  fair_value: number;
  premium_pct: number;
  change: number;
  change_pct: number | null;
  move_capped: boolean;
  explanation_patch: Record<string, unknown>;
};

function clamp(v: number, lo: number, hi: number): number {
  if (Number.isNaN(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/** market_config.elapsed_cycle_fraction */
export function elapsedCycleFraction(elapsedMinutes: number | null): number {
  if (elapsedMinutes == null || Number.isNaN(elapsedMinutes)) return 1.0;
  return clamp(elapsedMinutes / MARKET_CONFIG.nominalCycleMinutes, 0.0, 1.0);
}

/** market_config.scaled_cycle_limits -> [maxUpPct, maxDownPct, reversion] */
export function scaledCycleLimits(moveCap: number, reversion: number, fraction: number) {
  const f = clamp(fraction, 0.0, 1.0);
  return [
    (1.0 + moveCap) ** f - 1.0,
    1.0 - (1.0 - moveCap) ** f,
    1.0 - (1.0 - reversion) ** f,
  ] as const;
}

/** Availability factor and summed lever premium the Python step stored. */
export function targetInputs(explanation: Record<string, unknown> | null): {
  availabilityFactor: number;
  rawPremium: number;
} {
  const exp = explanation ?? {};
  const availability = (exp.availability ?? {}) as Record<string, unknown>;
  const levers = (exp.levers ?? {}) as Record<string, Record<string, unknown>>;
  let rawPremium = 0;
  for (const lever of Object.values(levers)) {
    rawPremium += num(lever?.adjustment_pct, 0);
  }
  return { availabilityFactor: clamp(num(availability.factor, 1), 0, 1), rawPremium };
}

/** Target price anchored to `fairValue` (market_engine.compute_market_price). */
export function targetPrice(fairValue: number, availabilityFactor: number, rawPremium: number) {
  const c = MARKET_CONFIG;
  const fv = clamp(fairValue, c.priceFloor, c.priceCeiling);
  const premium = clamp(rawPremium, -c.maxPremium, c.maxPremium);
  let target = fv * availabilityFactor * (1.0 + premium);
  target = clamp(target, fv * (1.0 - c.maxPremium), fv * (1.0 + c.maxPremium));
  return clamp(target, c.priceFloor, c.priceCeiling);
}

export function isEventMode(fairValue: number, prevFairValue: number, live: LiveInfo | null) {
  if (live && live.game_state === "in") return true;
  if (!(prevFairValue > 0)) return false;
  return Math.abs(fairValue - prevFairValue) / prevFairValue >=
    MARKET_CONFIG.eventFairValueJumpThreshold;
}

/**
 * Plan one tick for one player. Returns null when nothing would change by at
 * least MIN_WRITE_DELTA (or the row can't be priced: no price yet / no Fair Value).
 */
export function planTick(
  state: MarketStateRow,
  officialFairValue: number | null,
  live: LiveInfo | null,
  now: Date,
): TickRow | null {
  const c = MARKET_CONFIG;
  const prev = num(state.market_price, 0);
  if (!(prev > 0)) return null; // cold start is the Python step's job

  const fvEff = live ? live.live_fair_value : (officialFairValue ?? num(state.fair_value, 0));
  if (!(fvEff > 0)) return null;

  const { availabilityFactor, rawPremium } = targetInputs(state.explanation);
  const target = targetPrice(fvEff, availabilityFactor, rawPremium);

  const updatedMs = Date.parse(state.updated_at);
  const elapsedMin = Number.isFinite(updatedMs) ? Math.max(0, (now.getTime() - updatedMs) / 60000) : null;
  const frac = elapsedCycleFraction(elapsedMin);

  const eventMode = isEventMode(fvEff, num(state.fair_value, 0), live);
  const [moveCap, reversion] = eventMode
    ? [c.eventMaxMovePerCycle, c.eventReversionRate]
    : [c.maxMovePerCycle, c.reversionRate];
  const [maxUpPct, maxDownPct, rev] = scaledCycleLimits(moveCap, reversion, frac);

  const reverted = prev + rev * (target - prev);
  const capped = clamp(reverted, prev * (1.0 - maxDownPct), prev * (1.0 + maxUpPct));
  const moveCapped = Math.abs(reverted - capped) > 1e-9;
  const newPrice = round(clamp(capped, c.priceFloor, c.priceCeiling), 4);

  const fvRounded = round(fvEff, 4);
  const priceMoved = Math.abs(newPrice - prev) >= MIN_WRITE_DELTA;
  const fvMoved = Math.abs(fvRounded - num(state.fair_value, 0)) >= MIN_WRITE_DELTA;
  if (!priceMoved && !fvMoved) return null;

  const prevMarket = num(state.prev_market_price, prev);
  const change = round(newPrice - prevMarket, 4);
  const premiumPct = round((newPrice - fvEff) / fvEff, 6);

  return {
    player_id: state.player_id,
    expected_updated_at: state.updated_at,
    market_price: newPrice,
    fair_value: fvRounded,
    premium_pct: premiumPct,
    change,
    change_pct: prevMarket > 0 ? round(change / prevMarket, 6) : null,
    move_capped: moveCapped,
    explanation_patch: {
      market_price: newPrice,
      fair_value: fvRounded,
      premium_pct: premiumPct,
      target_price: round(target, 4),
      tick: {
        at: now.toISOString(),
        elapsed_cycle_fraction: round(frac, 4),
        event_mode: eventMode,
        fair_value_source: live ? "live" : "official",
        live: live
          ? {
              espn_event_id: live.espn_event_id,
              game_state: live.game_state,
              progress: round(live.progress, 4),
              base_fair_value: round(live.base_fair_value, 4),
            }
          : null,
      },
    },
  };
}
