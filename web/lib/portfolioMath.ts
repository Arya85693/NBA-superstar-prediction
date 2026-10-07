/**
 * Pure portfolio arithmetic (no I/O, no imports) so it can be unit-tested with
 * `node --test` and shared by server code.
 */

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Where a holding's mark came from, most to least preferred. */
export type MarkSource = "market" | "fair_value" | "cost_basis" | "none";

function positive(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/**
 * Mark a holding at the tradable Market Price mid. Falls back to Fair Value when
 * the market layer is unavailable, then to the holder's average cost — never to
 * $0 just because a quote is missing.
 */
export function resolveMarkPrice(input: {
  marketPrice?: number | null;
  fairValue?: number | null;
  avgCostPerShare?: number | null;
}): { price: number | null; source: MarkSource } {
  if (positive(input.marketPrice)) return { price: input.marketPrice, source: "market" };
  if (positive(input.fairValue)) return { price: input.fairValue, source: "fair_value" };
  if (positive(input.avgCostPerShare)) {
    return { price: input.avgCostPerShare, source: "cost_basis" };
  }
  return { price: null, source: "none" };
}

export function positionMetrics(
  price: number | null,
  shares: number,
  avgCostPerShare: number | null,
): { value: number; costBasis: number | null; unrealizedPnl: number | null } {
  const value = price !== null ? roundMoney(price * shares) : 0;
  const costBasis =
    avgCostPerShare !== null ? roundMoney(avgCostPerShare * shares) : null;
  const unrealizedPnl =
    price !== null && avgCostPerShare !== null
      ? roundMoney((price - avgCostPerShare) * shares)
      : null;
  return { value, costBasis, unrealizedPnl };
}
