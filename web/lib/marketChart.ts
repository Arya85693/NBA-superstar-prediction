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

/** Game-day fair value merged with market tick / daily snapshots. */
export type ChartDataSource = "mixed" | "ticks" | "daily" | "games";

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

/** Keep every game-day point; thin intraday / daily snapshots to fit the budget. */
function downsampleHybrid(points: MarketChartPoint[], maxPoints: number): MarketChartPoint[] {
  if (points.length <= maxPoints) return points;

  const games = points.filter((p) => p.hadGame);
  const snapshots = points.filter((p) => !p.hadGame);
  const snapshotBudget = Math.max(8, maxPoints - games.length);

  if (games.length >= maxPoints) {
    return downsample(points, maxPoints);
  }

  const sampledSnapshots =
    snapshots.length <= snapshotBudget
      ? snapshots
      : downsample(snapshots, snapshotBudget);

  return [...games, ...sampledSnapshots].sort(
    (a, b) => parseInstant(a.date) - parseInstant(b.date),
  );
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

function inWindow(ms: number, startMs: number, endMs: number): boolean {
  return ms >= startMs && ms <= endMs;
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
  const inRange = sorted.filter((t) => {
    const ms = parseInstant(t.recorded_at);
    return inWindow(ms, startMs, endMs);
  });
  if (inRange.length === 0) return [];

  const sampled = downsample(inRange, MAX_CHART_POINTS);
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

  const inRange = sorted.filter((d) => {
    const ms = parseInstant(`${d.as_of_date}T12:00:00Z`);
    return inWindow(ms, startMs, endMs);
  });
  if (inRange.length === 0) return [];

  const sampled = downsample(inRange, MAX_CHART_POINTS);
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

  augmentEndPoint(out, currentMarket, endIso, currentMarket?.recordedAt);
  return downsample(out, MAX_CHART_POINTS);
}

/** One point per played game — step spikes on game nights (performance view). */
export function buildGameNightChartPoints(
  history: PriceRow[],
  range: ChartRange,
  endAt?: string | null,
): MarketChartPoint[] {
  if (history.length === 0) return [];

  const played = history.filter(
    (r) =>
      typeof r.game_score === "number" &&
      Number.isFinite(r.game_score) &&
      (r.minutes ?? 0) > 0,
  );
  if (played.length === 0) return [];

  const sorted = [...played].sort(
    (a, b) => new Date(a.game_date).getTime() - new Date(b.game_date).getTime(),
  );
  const endIso = chartEndIso(endAt, sorted[sorted.length - 1]!.game_date);
  const endMs = parseInstant(`${endIso}T23:59:59Z`);
  const startMs = endMs - CHART_RANGE_DAYS[range] * 86_400_000;

  const points = sorted
    .filter((row) => {
      const day = row.game_date.slice(0, 10);
      const ms = parseInstant(`${day}T12:00:00Z`);
      return inWindow(ms, startMs, endMs);
    })
    .map((row) => {
      const day = row.game_date.slice(0, 10);
      const price = row.price_after_game;
      return toChartPoint(
        `${day}T12:00:00Z`,
        price,
        price,
        true,
        row.game_score,
      );
    });

  return downsample(points, MAX_CHART_POINTS);
}

function augmentEndPoint(
  out: MarketChartPoint[],
  currentMarket:
    | { marketPrice: number; fairValue: number; recordedAt?: string | null }
    | undefined,
  endIso: string,
  endAt?: string | null,
): void {
  if (!currentMarket || currentMarket.marketPrice <= 0) return;

  const stamp = endAt ?? currentMarket.recordedAt ?? `${endIso}T23:59:59Z`;
  const last = out[out.length - 1];
  if (!last) return;

  if (Math.abs(last.marketPrice - currentMarket.marketPrice) < 0.0005) return;

  if (stamp.slice(0, 10) === last.date.slice(0, 10)) {
    last.marketPrice = currentMarket.marketPrice;
    last.fairValue = currentMarket.fairValue;
    return;
  }

  if (parseInstant(stamp) <= parseInstant(last.date)) return;

  out.push(
    toChartPoint(
      stamp,
      currentMarket.marketPrice,
      currentMarket.fairValue,
    ),
  );
}

function augmentWithLiveQuote(
  points: MarketChartPoint[],
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
  if (!cm || cm.marketPrice <= 0 || points.length === 0) return points;

  const out = [...points];
  augmentEndPoint(out, cm, chartEndIso(opts?.endAt), opts?.endAt);
  return out;
}

/**
 * Merge ingested game rows (fair value steps) with market ticks / daily rollups
 * so the line shows full season history AND post-game / post-playoff market moves.
 */
export function buildChartPointsHybrid(
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
): MarketChartPoint[] {
  const endMs = parseInstant(
    opts?.endAt ?? `${chartEndIso(opts?.endAt, opts?.endGameDate)}T23:59:59Z`,
  );
  if (!Number.isFinite(endMs)) return [];

  const startMs = endMs - CHART_RANGE_DAYS[range] * 86_400_000;
  const merged: MarketChartPoint[] = [];

  const sortedGames = [...history].sort(
    (a, b) => new Date(a.game_date).getTime() - new Date(b.game_date).getTime(),
  );

  for (const row of sortedGames) {
    const ms = parseInstant(`${row.game_date}T12:00:00Z`);
    if (!inWindow(ms, startMs, endMs)) continue;
    const fv = row.price_after_game;
    merged.push(
      toChartPoint(`${row.game_date}T12:00:00Z`, fv, fv, true, row.game_score),
    );
  }

  const tickDays = new Set<string>();

  for (const tick of ticks) {
    const ms = parseInstant(tick.recorded_at);
    if (!inWindow(ms, startMs, endMs)) continue;
    tickDays.add(tick.recorded_at.slice(0, 10));
    merged.push(
      toChartPoint(
        tick.recorded_at,
        tick.market_price,
        tick.fair_value,
      ),
    );
  }

  for (const snap of daily) {
    const day = snap.as_of_date.slice(0, 10);
    const ms = parseInstant(`${day}T12:00:00Z`);
    if (!inWindow(ms, startMs, endMs)) continue;
    if (tickDays.has(day)) continue;
    merged.push(
      toChartPoint(
        `${day}T12:00:00Z`,
        snap.market_price,
        snap.fair_value,
      ),
    );
  }

  merged.sort((a, b) => parseInstant(a.date) - parseInstant(b.date));

  const withLive = augmentWithLiveQuote(merged, opts);
  return downsampleHybrid(withLive, MAX_CHART_POINTS);
}

/** Game history + market snapshots when possible; narrow tick-only windows fall back. */
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
  if (history.length > 0) {
    const hybrid = buildChartPointsHybrid(ticks, daily, history, range, opts);
    if (hybrid.length >= 2) {
      return { points: hybrid, source: "mixed" };
    }
    if (hybrid.length === 1 && opts?.currentMarket) {
      const doubled = augmentWithLiveQuote(hybrid, opts);
      if (doubled.length >= 2) {
        return { points: doubled, source: "mixed" };
      }
    }
  }

  let tickPoints = buildChartPointsFromTicks(ticks, range, opts?.endAt);
  tickPoints = augmentWithLiveQuote(tickPoints, opts);
  if (tickPoints.length >= 2) {
    return { points: tickPoints, source: "ticks" };
  }

  let dailyPoints = buildChartPointsFromDaily(daily, range, opts?.endAt);
  dailyPoints = augmentWithLiveQuote(dailyPoints, opts);
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
