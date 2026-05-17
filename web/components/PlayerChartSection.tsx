"use client";

import { useMemo, useState } from "react";
import { PriceChart, type ChartPoint } from "@/components/PriceChart";
import { MarketRefreshMeta } from "@/components/market/MarketRefreshMeta";
import type { MarketMeta, PriceRow } from "@/lib/types";

export type ChartRange = "1w" | "1m" | "1y";

const TABS: { key: ChartRange; label: string }[] = [
  { key: "1w", label: "1 week" },
  { key: "1m", label: "1 month" },
  { key: "1y", label: "1 year" },
];

const RANGE_DAYS: Record<ChartRange, number> = {
  "1w": 7,
  "1m": 30,
  "1y": 365,
};

function parseIsoDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function sortHistory(history: PriceRow[]): PriceRow[] {
  return [...history].sort(
    (a, b) => new Date(a.game_date).getTime() - new Date(b.game_date).getTime(),
  );
}

export function buildChartPointsForRange(
  history: PriceRow[],
  range: ChartRange,
  marketEndDate?: string | null,
): ChartPoint[] {
  if (history.length === 0) return [];

  const sorted = sortHistory(history);
  const lastGameDate = sorted[sorted.length - 1]!.game_date;
  const end = parseIsoDate(marketEndDate ?? lastGameDate);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - RANGE_DAYS[range]);

  const byDate = new Map<string, PriceRow>();
  for (const row of sorted) {
    byDate.set(row.game_date, row);
  }

  const previous = [...sorted]
    .reverse()
    .find((row) => parseIsoDate(row.game_date).getTime() <= start.getTime());
  const firstInWindow = sorted.find(
    (row) => parseIsoDate(row.game_date).getTime() >= start.getTime(),
  );

  if (!previous && !firstInWindow) return [];

  const seriesStart = previous ? start : parseIsoDate(firstInWindow!.game_date);
  const out: ChartPoint[] = [];
  let currentPrice = previous?.price_after_game ?? null;

  for (
    const cursor = new Date(seriesStart);
    cursor.getTime() <= end.getTime();
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const iso = toIsoDate(cursor);
    const gameRow = byDate.get(iso);
    if (gameRow) currentPrice = gameRow.price_after_game;
    if (currentPrice == null) continue;
    out.push({
      date: iso,
      price: currentPrice,
      gs: gameRow?.game_score ?? null,
      hadGame: Boolean(gameRow),
    });
  }

  return out;
}

export function PlayerChartSection({
  history,
  marketEndDate,
  marketMeta,
}: {
  history: PriceRow[];
  marketEndDate?: string | null;
  marketMeta?: MarketMeta;
}) {
  const [range, setRange] = useState<ChartRange>("1m");

  const points = useMemo(
    () => buildChartPointsForRange(history, range, marketEndDate),
    [history, marketEndDate, range],
  );
  const gamesInWindow = useMemo(
    () => points.filter((point) => point.hadGame).length,
    [points],
  );

  return (
    <div className="min-w-0">
      {marketMeta ? (
        <MarketRefreshMeta meta={marketMeta} variant="compact" className="mb-4" />
      ) : null}
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map(({ key, label }) => {
          const on = range === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setRange(key)}
              className={
                on
                  ? "rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white"
                  : "rounded-lg border border-border-strong bg-surface-muted px-3 py-1.5 text-sm text-muted-foreground hover:border-border-strong hover:text-foreground"
              }
            >
              {label}
            </button>
          );
        })}
      </div>
      {points.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-sm text-muted">
          No price history in this window. Try a longer range.
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted">
            Showing {points.length} day{points.length === 1 ? "" : "s"} · {gamesInWindow} game
            {gamesInWindow === 1 ? "" : "s"} in window · end date {points[points.length - 1]?.date}
          </p>
          {gamesInWindow === 0 ? (
            <p className="mb-3 rounded-lg border border-border bg-surface-muted/50 px-3 py-2 text-xs text-muted-foreground">
              No new game data in this interval - model price is carried forward from the last
              ingested game.
            </p>
          ) : null}
          <div className="hs-chart-frame rounded-xl border border-border/80 bg-surface px-2 pb-1 pt-3 sm:px-3">
            <PriceChart points={points} />
          </div>
        </>
      )}
    </div>
  );
}
