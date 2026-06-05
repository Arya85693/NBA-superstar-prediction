"use client";

import { useMemo, useState } from "react";
import {
  buildMarketChartPoints,
  type ChartRange,
  CHART_RANGE_DAYS,
} from "@/lib/marketChart";
import type { MarketDailySnapshot } from "@/lib/marketHistory";
import { buildProductionGamePoints } from "@/lib/productionChart";
import { PriceChart } from "@/components/PriceChart";
import { ProductionFairValueChart } from "@/components/ProductionFairValueChart";
import type { MarketMeta, MarketTick, PriceRow } from "@/lib/types";

const TABS: { key: ChartRange; label: string }[] = [
  { key: "1w", label: "1 week" },
  { key: "1m", label: "1 month" },
  { key: "1y", label: "1 year" },
];

export function PlayerAnalyticsCharts({
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

  const endAnchor =
    marketMeta?.market_updated_at ?? marketEndDate ?? lastGameDate ?? null;

  const productionPoints = useMemo(
    () => buildProductionGamePoints(history, range, endAnchor),
    [endAnchor, history, range],
  );

  const { points: pricePoints, source } = useMemo(
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

  const windowLabel = `last ${CHART_RANGE_DAYS[range]} days`;

  return (
    <div className="min-w-0 space-y-10">
      <div className="flex flex-wrap gap-2">
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

      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
          Production → Fair Value
        </h2>
        <p className="mt-1 mb-4 text-xs text-muted">
          Bars = Hollinger game score each night (production). Line = Fair Value after
          that game — how stats build the fundamental price ({windowLabel}).
        </p>
        <div className="hs-chart-frame rounded-xl border border-border/80 bg-surface px-2 pb-1 pt-3 sm:px-3">
          <ProductionFairValueChart points={productionPoints} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
          Fair Value → Market Price
        </h2>
        <p className="mt-1 mb-4 text-xs text-muted">
          Solid = tradable Market Price. Dashed = Fair Value. The gap is premium /
          discount from projection, news, team context, and demand ({windowLabel}).
        </p>
        {pricePoints.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-sm text-muted">
            No price history in this window. Try a longer range, or run the market
            pipeline to build tick history.
          </p>
        ) : (
          <div className="hs-chart-frame rounded-xl border border-border/80 bg-surface px-2 pb-1 pt-3 sm:px-3">
            <PriceChart
              points={pricePoints}
              showFairValue={source !== "games"}
            />
          </div>
        )}
      </section>
    </div>
  );
}
