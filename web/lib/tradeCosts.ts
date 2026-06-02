/**
 * Trading friction — a bid/ask spread around the Market Price.
 *
 * Market Price (Layer 2) is the *mid*. Buys fill slightly ABOVE the mid and
 * sells slightly BELOW it, by HALF_SPREAD on each side. This is the standard
 * market-maker spread, and it exists to remove the risk-free arbitrage that a
 * deterministic mean-reverting price would otherwise allow:
 *
 *   Without a spread, anyone could buy every player trading at a discount to
 *   Fair Value and sell every player at a premium, pocketing the reversion with
 *   no risk. A round trip now costs ~2 * HALF_SPREAD, which exceeds the gain
 *   from typical reversion back toward Fair Value — so the free money is gone.
 *
 * The spread is applied SERVER-SIDE in the trade route (so it can't be
 * bypassed); these helpers also render the quote in the UI.
 */

/** Half-spread applied on each side of the mid. 1.5% => ~3% round trip. */
export const HALF_SPREAD = 0.015;

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/** Price a BUY fills at (above mid). */
export function buyPrice(mid: number): number {
  return round4(mid * (1 + HALF_SPREAD));
}

/** Price a SELL fills at (below mid), never negative. */
export function sellPrice(mid: number): number {
  return Math.max(0, round4(mid * (1 - HALF_SPREAD)));
}

/** Execution price for a given side. */
export function fillPrice(mid: number, side: "buy" | "sell"): number {
  return side === "buy" ? buyPrice(mid) : sellPrice(mid);
}

/** Round-trip spread as a percentage (e.g. 3 for 3%). */
export function roundTripSpreadPct(): number {
  return HALF_SPREAD * 2 * 100;
}
