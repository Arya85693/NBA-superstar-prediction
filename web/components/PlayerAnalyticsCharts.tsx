"use client";

import { useMemo, useState, type ReactNode } from "react";
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

function ChartSection({
  step,
  title,
  description,
  children,
}: {
  step: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <article className="rounded-xl border border-border/80 bg-surface">
      <div className="flex flex-wrap items-start gap-4 border-b border-border/70 px-4 py-4 sm:px-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 font-mono text-sm font-semibold text-accent">
          {step}
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-foreground">{title}</h4>
          <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
        </div>
      </div>
      <div className="hs-chart-frame px-2 pb-1 pt-3 sm:px-3">{children}</div>
    </article>
  );
}

export function PlayerAnalyticsCharts({
  history,
  marketTicks,
  marketDaily,
  marketEndDate,
  lastGameDate,
  currentMarket,
  marketMeta,
  embedded = false,
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
  /** When true, omit outer spacing (parent section provides the frame). */
  embedded?: boolean;
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
    <div className={embedded ? "min-w-0 space-y-5" : "min-w-0 space-y-8"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          Time range
        </p>
        <div className="inline-flex rounded-xl border border-border bg-surface-muted p-1">
          {TABS.map(({ key, label }) => {
            const on = range === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setRange(key)}
                className={
                  on
                    ? "rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white shadow-sm"
                    : "rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-5">
        <ChartSection
          step="01"
          title="Production → Fair Value"
          description={`Bars = Hollinger game score each night. Line = fair value after that game (${windowLabel}).`}
        >
          <ProductionFairValueChart points={productionPoints} />
        </ChartSection>

        <ChartSection
          step="02"
          title="Fair Value → Market Price"
          description={`Solid = tradable market price. Dashed = fair value. Gap = premium or discount (${windowLabel}).`}
        >
          {pricePoints.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">
              No price history in this window. Try a longer range, or run the market
              pipeline to build tick history.
            </p>
          ) : (
            <PriceChart points={pricePoints} showFairValue={source !== "games"} />
          )}
        </ChartSection>
      </div>
    </div>
  );
}
