/** Client-only keys for “since your last visit” retention. */

export const VISIT_STORAGE_KEY = "hs:last-visit-snapshot";

export type VisitPriceSnapshot = {
  visitedAt: string;
  pricesRevision: number | null;
  /** player_id -> price */
  prices: Record<string, number>;
};

export function readVisitSnapshot(): VisitPriceSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(VISIT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VisitPriceSnapshot;
    if (!parsed?.visitedAt || !parsed.prices) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeVisitSnapshot(snapshot: VisitPriceSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(VISIT_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* quota */
  }
}

export type SinceVisitMove = {
  player_id: number;
  player_name: string;
  ticker: string;
  team_abbr: string;
  changePct: number;
  priorPrice: number;
  currentPrice: number;
};

export function computeSinceVisitMoves(
  prior: VisitPriceSnapshot | null,
  rows: Array<{
    player_id: number;
    player_name: string;
    ticker: string;
    team_abbr: string;
    price_after_game: number;
  }>,
  opts?: { minAbsPct?: number; limit?: number },
): SinceVisitMove[] {
  if (!prior) return [];
  const minAbs = opts?.minAbsPct ?? 0.5;
  const limit = opts?.limit ?? 5;
  const moves: SinceVisitMove[] = [];

  for (const row of rows) {
    const key = String(row.player_id);
    const oldPrice = prior.prices[key];
    if (oldPrice == null || !Number.isFinite(oldPrice)) continue;
    const changePct = ((row.price_after_game - oldPrice) / oldPrice) * 100;
    if (Math.abs(changePct) < minAbs) continue;
    moves.push({
      player_id: row.player_id,
      player_name: row.player_name,
      ticker: row.ticker,
      team_abbr: row.team_abbr,
      changePct,
      priorPrice: oldPrice,
      currentPrice: row.price_after_game,
    });
  }

  moves.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
  return moves.slice(0, limit);
}
