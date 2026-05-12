"use client";

import { useMemo, useState } from "react";
import { PriceChart, type ChartPoint } from "@/components/PriceChart";
import type { PriceRow } from "@/lib/types";

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

/**
 * Daily carried-forward series anchored to the market's latest dataset date.
 * If the player has not played recently, their last price stays flat into the window.
 */
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
}: {
  history: PriceRow[];
  marketEndDate?: string | null;
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
                  ? "rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white"
                  : "rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
              }
            >
              {label}
            </button>
          );
        })}
      </div>
      {points.length === 0 ? (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-6 text-center text-sm text-zinc-500">
          No price history in this window. Try a longer range.
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs text-zinc-600">
            Showing {points.length} day{points.length === 1 ? "" : "s"} · {gamesInWindow} game
            {gamesInWindow === 1 ? "" : "s"} in window · end date {points[points.length - 1]?.date}
          </p>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 pb-2 pt-4 shadow-inner shadow-black/20 sm:px-5">
            <PriceChart points={points} />
          </div>
        </>
      )}
    </div>
  );
}
