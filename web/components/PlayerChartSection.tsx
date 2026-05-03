"use client";

import { useMemo, useState } from "react";
import { PriceChart } from "@/components/PriceChart";
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

/** Games on or after (last game date − range days). */
export function filterHistoryByRange(
  history: PriceRow[],
  range: ChartRange,
): PriceRow[] {
  if (history.length === 0) return [];
  const sorted = [...history].sort(
    (a, b) =>
      new Date(a.game_date).getTime() - new Date(b.game_date).getTime(),
  );
  const last = new Date(sorted[sorted.length - 1]!.game_date);
  const cutoff = new Date(last);
  cutoff.setDate(cutoff.getDate() - RANGE_DAYS[range]);
  cutoff.setHours(0, 0, 0, 0);
  return sorted.filter((h) => new Date(h.game_date) >= cutoff);
}

export function PlayerChartSection({ history }: { history: PriceRow[] }) {
  const [range, setRange] = useState<ChartRange>("1m");

  const filtered = useMemo(
    () => filterHistoryByRange(history, range),
    [history, range],
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
      {filtered.length === 0 ? (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-6 text-center text-sm text-zinc-500">
          No games in this window. Try a longer range.
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs text-zinc-600">
            Showing {filtered.length} game{filtered.length === 1 ? "" : "s"} · end date{" "}
            {filtered[filtered.length - 1]?.game_date}
          </p>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 pb-2 pt-4 shadow-inner shadow-black/20 sm:px-5">
            <PriceChart history={filtered} />
          </div>
        </>
      )}
    </div>
  );
}
