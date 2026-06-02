import type { MarketDailySnapshot } from "./marketHistory";
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

export type ChartDataSource = "ticks" | "daily" | "games";

const MAX_CHART_POINTS = 400;

function parseInstant(iso: string): number {
  return new Date(iso).getTime();
}

function chartEndIso(endAt?: string | null, endGameDate?: string | null): string {
  const candidates: string[] = [];
  if (endAt) {
    const t = parseInstant(endAt);
    if (Number.isFinite(t)) {
      candidates.push(new Date(t).toISOString().slice(0, 10));
    }
  }
  if (endGameDate) candidates.push(endGameDate.slice(0, 10));
  candidates.push(new Date().toISOString().slice(0, 10));
  return candidates.sort().at(-1) ?? new Date().toISOString().slice(0, 10);
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

function toChartPoint(
  date: string,
  marketPrice: number,
  fairValue: number,
  hadGame = false,
  gs: number | null = null,
): MarketChartPoint {
  return { date, marketPrice, fairValue, gs, hadGame };
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
  const endMs = endAt
    ? parseInstant(endAt)
    : parseInstant(sorted[sorted.length - 1]!.recorded_at);
  if (!Number.isFinite(endMs)) return [];

  const startMs = endMs - CHART_RANGE_DAYS[range] * 86_400_000;
  const inWindow = sorted.filter((t) => {
    const ms = parseInstant(t.recorded_at);
    return ms >= startMs && ms <= endMs;
  });
  if (inWindow.length === 0) return [];

  const sampled = downsample(inWindow, MAX_CHART_POINTS);
  return sampled.map((t) =>
    toChartPoint(t.recorded_at, t.market_price, t.fair_value),
  );
}

/** One point per pipeline day when intraday ticks are sparse. */
export function buildChartPointsFromDaily(
  daily: MarketDailySnapshot[],
  range: ChartRange,
  endAt?: string | null,
): MarketChartPoint[] {
  if (daily.length === 0) return [];

  const sorted = [...daily].sort((a, b) => a.as_of_date.localeCompare(b.as_of_date));
  const endDate = chartEndIso(endAt, sorted[sorted.length - 1]!.as_of_date);
  const endMs = parseInstant(`${endDate}T23:59:59Z`);
  const startMs = endMs - CHART_RANGE_DAYS[range] * 86_400_000;

  const inWindow = sorted.filter((d) => {
    const ms = parseInstant(`${d.as_of_date}T12:00:00Z`);
    return ms >= startMs && ms <= endMs;
  });
  if (inWindow.length === 0) return [];

  const sampled = downsample(inWindow, MAX_CHART_POINTS);
  return sampled.map((d) =>
    toChartPoint(
      `${d.as_of_date}T12:00:00Z`,
      d.market_price,
      d.fair_value,
    ),
  );
}

/**
 * Fallback: Fair Value steps on game days; Market Price carried forward and
 * updated to the live quote through the chart end date (not only last game).
 */
export function buildChartPointsFromGames(
  history: PriceRow[],
  range: ChartRange,
  endDate?: string | null,
  currentMarket?: {
    marketPrice: number;
    fairValue: number;
    recordedAt?: string | null;
  },
): MarketChartPoint[] {
  if (history.length === 0) return [];

  const sorted = [...history].sort(
    (a, b) => new Date(a.game_date).getTime() - new Date(b.game_date).getTime(),
  );
  const lastGameDate = sorted[sorted.length - 1]!.game_date;
  const endIso = chartEndIso(currentMarket?.recordedAt, endDate ?? lastGameDate);
  const end = new Date(`${endIso}T23:59:59Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - CHART_RANGE_DAYS[range]);

  const byDate = new Map<string, PriceRow>();
  for (const row of sorted) byDate.set(row.game_date, row);

  const out: MarketChartPoint[] = [];
  let lastFair: number | null = null;
  let lastMarket: number | null = null;

  for (
    const cursor = new Date(start);
    cursor.getTime() <= end.getTime();
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const iso = cursor.toISOString().slice(0, 10);
    const gameRow = byDate.get(iso);
    if (gameRow) {
      lastFair = gameRow.price_after_game;
      lastMarket = gameRow.price_after_game;
    }
    if (lastFair == null) continue;

    const market =
      lastMarket != null && lastMarket > 0 ? lastMarket : lastFair;
    out.push(
      toChartPoint(
        iso,
        market,
        lastFair,
        Boolean(gameRow),
        gameRow?.game_score ?? null,
      ),
    );
  }

  if (currentMarket && currentMarket.marketPrice > 0) {
    const stamp =
      currentMarket.recordedAt ?? `${endIso}T23:59:59Z`;
    const last = out[out.length - 1];
    if (
      last &&
      Math.abs(last.marketPrice - currentMarket.marketPrice) > 0.0005
    ) {
      if (stamp.slice(0, 10) === last.date.slice(0, 10)) {
        last.marketPrice = currentMarket.marketPrice;
        last.fairValue = currentMarket.fairValue;
      } else {
        out.push(
          toChartPoint(
            stamp,
            currentMarket.marketPrice,
            currentMarket.fairValue,
          ),
        );
      }
    }
  }

  return downsample(out, MAX_CHART_POINTS);
}

function augmentTicksWithLiveQuote(
  tickPoints: MarketChartPoint[],
  opts?: {
    endAt?: string | null;
    currentMarket?: {
      marketPrice: number;
      fairValue: number;
      recordedAt?: string | null;
    };
  },
): MarketChartPoint[] {
  const cm = opts?.currentMarket;
  if (!cm || cm.marketPrice <= 0 || tickPoints.length === 0) return tickPoints;

  const last = tickPoints[tickPoints.length - 1]!;
  const stamp = opts?.endAt ?? cm.recordedAt ?? new Date().toISOString();
  if (parseInstant(stamp) <= parseInstant(last.date)) return tickPoints;
  if (Math.abs(last.marketPrice - cm.marketPrice) < 0.0005) return tickPoints;

  return [
    ...tickPoints,
    toChartPoint(stamp, cm.marketPrice, cm.fairValue),
  ];
}

/** Prefer ticks, then daily rollup, then game steps extended to the live quote. */
export function buildMarketChartPoints(
  ticks: MarketTick[],
  daily: MarketDailySnapshot[],
  history: PriceRow[],
  range: ChartRange,
  opts?: {
    endAt?: string | null;
    endGameDate?: string | null;
    currentMarket?: {
      marketPrice: number;
      fairValue: number;
      recordedAt?: string | null;
    };
  },
): { points: MarketChartPoint[]; source: ChartDataSource } {
  let tickPoints = buildChartPointsFromTicks(ticks, range, opts?.endAt);
  tickPoints = augmentTicksWithLiveQuote(tickPoints, opts);
  if (tickPoints.length >= 2) {
    return { points: tickPoints, source: "ticks" };
  }

  let dailyPoints = buildChartPointsFromDaily(daily, range, opts?.endAt);
  dailyPoints = augmentTicksWithLiveQuote(dailyPoints, opts);
  if (dailyPoints.length >= 2) {
    return { points: dailyPoints, source: "daily" };
  }

  const gamePoints = buildChartPointsFromGames(
    history,
    range,
    chartEndIso(opts?.endAt, opts?.endGameDate),
    opts?.currentMarket,
  );
  return { points: gamePoints, source: "games" };
}
