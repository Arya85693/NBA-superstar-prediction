import type { ChartRange } from "./marketChart";
import { CHART_RANGE_DAYS } from "./marketChart";
import type { PriceRow } from "./types";

export type ProductionGamePoint = {
  date: string;
  gameScore: number;
  fairValue: number;
  minutes: number;
};

function parseDay(iso: string): number {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).getTime();
}

/** Per-game production (GmSc) with fair value on the same night — game days only. */
export function buildProductionGamePoints(
  history: PriceRow[],
  range: ChartRange,
  endDate?: string | null,
): ProductionGamePoint[] {
  if (history.length === 0) return [];

  const played = history.filter(
    (r) => (r.minutes ?? 0) > 0 && Number.isFinite(r.game_score),
  );
  if (played.length === 0) return [];

  const sorted = [...played].sort(
    (a, b) => parseDay(a.game_date) - parseDay(b.game_date),
  );
  const endIso =
    endDate?.slice(0, 10) ??
    sorted[sorted.length - 1]!.game_date.slice(0, 10);
  const endMs = parseDay(endIso);
  const startMs = endMs - CHART_RANGE_DAYS[range] * 86_400_000;

  return sorted
    .filter((r) => {
      const ms = parseDay(r.game_date);
      return ms >= startMs && ms <= endMs;
    })
    .map((r) => ({
      date: r.game_date.slice(0, 10),
      gameScore: r.game_score,
      fairValue: r.price_after_game,
      minutes: r.minutes ?? 0,
    }));
}
