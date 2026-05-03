import type { PriceRow } from "@/lib/types";

export function seasonGamesGmAvg(
  history: PriceRow[],
  season: string,
): { avg: number | null; count: number } {
  const rows = history.filter((h) => h.season === season);
  if (rows.length === 0) return { avg: null, count: 0 };
  const sum = rows.reduce((s, h) => s + h.game_score, 0);
  return { avg: sum / rows.length, count: rows.length };
}
