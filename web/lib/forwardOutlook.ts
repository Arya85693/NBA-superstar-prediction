import type { MarketRow } from "./types";

/** Normalise to [0, 1]. */
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Minutes trajectory (matches backtest: strongest forward-Δ predictor).
 * Rewards rotation minutes and rising recent usage.
 */
export function minutesOutlookScore(row: MarketRow): number {
  const season = clamp01(row.season_avg_minutes / 32);
  const recent = clamp01(row.recent_avg_minutes / 32);
  const trend =
    row.season_avg_minutes > 0
      ? clamp01((row.recent_avg_minutes - row.season_avg_minutes + 6) / 12)
      : 0;
  return 0.45 * season + 0.4 * recent + 0.15 * trend;
}

/**
 * Forward-improvement outlook in [0, 1], aligned with historical backtest levers:
 * projection + minutes trend dominate; high fair-value names are penalised (mean reversion).
 */
export function computeForwardOutlookScore(row: MarketRow): number {
  const proj = row.projection_score ?? 0;
  const projN = clamp01((proj + 1) / 2);

  const minsN = minutesOutlookScore(row);

  const fv = row.fair_value;
  const levelPenalty =
    fv > 0 ? clamp01((fv - 95) / 55) * 0.12 : 0;

  const mkt = row.change_pct;
  const cycleN =
    mkt != null && !Number.isNaN(mkt) ? clamp01((mkt + 4) / 8) * 0.08 : 0;

  const prem = row.premium_pct;
  const lagN =
    prem != null && prem < -2 && proj > 0.05 ? 0.05 : 0;

  const raw =
    0.48 * projN + 0.38 * minsN + cycleN + lagN - levelPenalty;

  return clamp01(raw);
}

export function formatOutlookScore(score: number): string {
  return `${Math.round(score * 100)}`;
}
