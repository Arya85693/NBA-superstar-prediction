"use client";

import { useMemo, useState } from "react";
import {
  buildGameNightChartPoints,
  buildMarketChartPoints,
  type ChartRange,
  type ChartDataSource,
  CHART_RANGE_DAYS,
} from "@/lib/marketChart";
import type { MarketDailySnapshot } from "@/lib/marketHistory";
import { MarketRefreshMeta } from "@/components/market/MarketRefreshMeta";
import { PerformanceGameChart } from "@/components/PerformanceGameChart";
import { PriceChart } from "@/components/PriceChart";
import type { MarketMeta, MarketTick, PriceRow } from "@/lib/types";

const RANGE_TABS: { key: ChartRange; label: string }[] = [
  { key: "1w", label: "1 week" },
  { key: "1m", label: "1 month" },
  { key: "1y", label: "1 year" },
];

type ChartView = "performance" | "market";

const VIEW_TABS: { key: ChartView; label: string; description: string }[] = [
  {
    key: "performance",
    label: "Performance",
    description: "Game-night fair value with production bars",
  },
  {
    key: "market",
    label: "Market",
    description: "Tradable price between pipeline updates",
  },
];

export type { ChartRange };

function marketCaption(
  source: ChartDataSource,
  pointCount: number,
  range: ChartRange,
  tickCount: number,
  dailyCount: number,
): string {
  const window = `last ${CHART_RANGE_DAYS[range]} days`;
  if (source === "mixed") {
    return `${pointCount} points · ${window}${tickCount > 0 ? ` · ${tickCount} ticks` : ""}`;
  }
  if (source === "ticks") {
    return `${pointCount} intraday snapshots · ${window}`;
  }
  if (source === "daily") {
    return `${pointCount} daily snapshots · ${window}`;
  }
  return `Game-day fair value · ${window}`;
}

export function PlayerChartSection({
  history,
  marketTicks,
  marketDaily,
  marketEndDate,
  lastGameDate,
  currentMarket,
  marketMeta,
}: {
  history: PriceRow[];
  marketTicks: MarketTick[];
  marketDaily: MarketDailySnapshot[];
  marketEndDate?: string | null;
  lastGameDate?: string | null;
  currentMarket?: {
    marketPrice: number;
    fairValue: number;
    recordedAt?: string | null;
  };
  marketMeta?: MarketMeta;
}) {
  const [range, setRange] = useState<ChartRange>("1m");
  const [view, setView] = useState<ChartView>("performance");

  const endAnchor =
    marketMeta?.market_updated_at ?? marketEndDate ?? lastGameDate ?? null;

  const performancePoints = useMemo(
    () => buildGameNightChartPoints(history, range, endAnchor),
    [endAnchor, history, range],
  );

  const { points: marketPoints, source } = useMemo(
    () =>
      buildMarketChartPoints(marketTicks, marketDaily, history, range, {
        endAt: marketMeta?.market_updated_at ?? marketEndDate,
        endGameDate: lastGameDate ?? marketEndDate,
        currentMarket,
      }),
    [
      currentMarket,
      history,
      lastGameDate,
      marketDaily,
      marketEndDate,
      marketMeta?.market_updated_at,
      marketTicks,
      range,
    ],
  );

  const activeView = VIEW_TABS.find((t) => t.key === view)!;
  const points = view === "performance" ? performancePoints : marketPoints;

  return (
    <div className="min-w-0">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Price chart</h3>
          <p className="mt-0.5 text-xs text-muted">{activeView.description}</p>
        </div>
        {marketMeta ? (
          <MarketRefreshMeta meta={marketMeta} variant="compact" className="shrink-0" />
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-border bg-surface-muted p-1">
          {VIEW_TABS.map(({ key, label }) => {
            const on = view === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className={
                  on
                    ? "rounded-lg bg-accent px-3.5 py-1.5 text-sm font-medium text-white shadow-sm"
                    : "rounded-lg px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                }
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="inline-flex rounded-xl border border-border bg-surface-muted p-1">
          {RANGE_TABS.map(({ key, label }) => {
            const on = range === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setRange(key)}
                className={
                  on
                    ? "rounded-lg bg-accent px-3.5 py-1.5 text-sm font-medium text-white shadow-sm"
                    : "rounded-lg px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {points.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
          No price history in this window. Try a longer range, or run the market pipeline
          to build tick history.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/90 bg-gradient-to-b from-surface to-surface-muted/50 p-4 shadow-sm sm:p-5">
          {view === "performance" ? (
            <PerformanceGameChart points={performancePoints} range={range} />
          ) : (
            <>
              <p className="mb-3 text-xs text-muted">
                {marketCaption(
                  source,
                  points.length,
                  range,
                  marketTicks.length,
                  marketDaily.length,
                )}
              </p>
              <div className="hs-chart-frame -mx-1 px-1 pb-1 pt-2">
                <PriceChart
                  points={marketPoints}
                  showFairValue={source !== "games"}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
