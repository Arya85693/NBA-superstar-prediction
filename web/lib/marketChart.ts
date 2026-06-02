import type { MarketTick, PriceRow } from "./types";

export type ChartRange = "1w" | "1m" | "1y";

export const CHART_RANGE_DAYS: Record<ChartRange, number> = {
  "1w": 7,
  "1m": 30,
  "1y": 365,
};

export type MarketChartPoint = {
  /** ISO timestamp (ticks) or YYYY-MM-DD (game fallback). */
  date: string;
  marketPrice: number;
  fairValue: number;
  gs: number | null;
  hadGame: boolean;
};

const MAX_CHART_POINTS = 400;

function parseInstant(iso: string): number {
  return new Date(iso).getTime();
}

function downsample<T>(points: T[], maxPoints: number): T[] {
  if (points.length <= maxPoints) return points;
  const out: T[] = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    out.push(points[Math.round(i * step)]!);
  }
  return out;
}

/** Build chart points from intraday Market Price ticks (stock-style). */
export function buildChartPointsFromTicks(
  ticks: MarketTick[],
  range: ChartRange,
  endAt?: string | null,
): MarketChartPoint[] {
  if (ticks.length === 0) return [];

  const sorted = [...ticks].sort(
    (a, b) => parseInstant(a.recorded_at) - parseInstant(b.recorded_at),
  );
  const endMs = endAt ? parseInstant(endAt) : parseInstant(sorted[sorted.length - 1]!.recorded_at);
  if (!Number.isFinite(endMs)) return [];

  const startMs = endMs - CHART_RANGE_DAYS[range] * 86_400_000;
  const inWindow = sorted.filter((t) => {
    const ms = parseInstant(t.recorded_at);
    return ms >= startMs && ms <= endMs;
  });
  if (inWindow.length === 0) return [];

  const sampled = downsample(inWindow, MAX_CHART_POINTS);
  return sampled.map((t) => ({
    date: t.recorded_at,
    marketPrice: t.market_price,
    fairValue: t.fair_value,
    gs: null,
    hadGame: false,
  }));
}

/**
 * Fallback when tick history is sparse: Fair Value steps on game days, Market
 * Price equals Fair Value (no intraday layer yet).
 */
export function buildChartPointsFromGames(
  history: PriceRow[],
  range: ChartRange,
  endDate?: string | null,
  currentMarket?: { marketPrice: number; fairValue: number; recordedAt?: string | null },
): MarketChartPoint[] {
  if (history.length === 0) return [];

  const sorted = [...history].sort(
    (a, b) => new Date(a.game_date).getTime() - new Date(b.game_date).getTime(),
  );
  const lastGameDate = sorted[sorted.length - 1]!.game_date;
  const end = new Date(`${endDate ?? lastGameDate}T23:59:59Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - CHART_RANGE_DAYS[range]);

  const byDate = new Map<string, PriceRow>();
  for (const row of sorted) byDate.set(row.game_date, row);

  const out: MarketChartPoint[] = [];
  let lastFair: number | null = null;

  for (
    const cursor = new Date(start);
    cursor.getTime() <= end.getTime();
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const iso = cursor.toISOString().slice(0, 10);
    const gameRow = byDate.get(iso);
    if (gameRow) lastFair = gameRow.price_after_game;
    if (lastFair == null) continue;
    out.push({
      date: iso,
      marketPrice: lastFair,
      fairValue: lastFair,
      gs: gameRow?.game_score ?? null,
      hadGame: Boolean(gameRow),
    });
  }

  if (
    currentMarket &&
    currentMarket.marketPrice > 0 &&
    currentMarket.marketPrice !== currentMarket.fairValue
  ) {
    const stamp =
      currentMarket.recordedAt ??
      new Date().toISOString();
    out.push({
      date: stamp,
      marketPrice: currentMarket.marketPrice,
      fairValue: currentMarket.fairValue,
      gs: null,
      hadGame: false,
    });
  }

  return downsample(out, MAX_CHART_POINTS);
}

/** Prefer tick history; fall back to game steps when ticks are too sparse. */
export function buildMarketChartPoints(
  ticks: MarketTick[],
  history: PriceRow[],
  range: ChartRange,
  opts?: {
    endAt?: string | null;
    endGameDate?: string | null;
    currentMarket?: { marketPrice: number; fairValue: number; recordedAt?: string | null };
  },
): { points: MarketChartPoint[]; source: "ticks" | "games" } {
  const tickPoints = buildChartPointsFromTicks(ticks, range, opts?.endAt);
  if (tickPoints.length >= 2) {
    return { points: tickPoints, source: "ticks" };
  }
  return {
    points: buildChartPointsFromGames(
      history,
      range,
      opts?.endGameDate,
      opts?.currentMarket,
    ),
    source: "games",
  };
}
