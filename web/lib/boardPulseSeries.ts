import type { MarketAnalytics } from "./marketAnalytics";

/**
 * Indexed curve from largest repricing moves in the current snapshot.
 * Visual pulse only - not historical board total.
 */
export function buildRepricingPulseSeries(
  analytics: MarketAnalytics,
): number[] | null {
  const movers = [
    ...analytics.topGainers,
    ...analytics.topLosers,
  ].filter((m) => m.change_pct != null && Number.isFinite(m.change_pct));

  if (movers.length < 3) return null;

  let level = 100;
  return movers.slice(0, 14).map((m) => {
    level *= 1 + (m.change_pct / 100) * 0.2;
    return level;
  });
}
