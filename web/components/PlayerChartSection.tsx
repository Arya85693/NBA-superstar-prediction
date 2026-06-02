"use client";

import { useMemo, useState } from "react";
import {
  buildMarketChartPoints,
  type ChartRange,
  CHART_RANGE_DAYS,
} from "@/lib/marketChart";
import { MarketRefreshMeta } from "@/components/market/MarketRefreshMeta";
import { PriceChart } from "@/components/PriceChart";
import type { MarketMeta, MarketTick, PriceRow } from "@/lib/types";

const TABS: { key: ChartRange; label: string }[] = [
  { key: "1w", label: "1 week" },
  { key: "1m", label: "1 month" },
  { key: "1y", label: "1 year" },
];

export type { ChartRange };

export function PlayerChartSection({
  history,
  marketTicks,
  marketEndDate,
  lastGameDate,
  currentMarket,
  marketMeta,
}: {
  history: PriceRow[];
  marketTicks: MarketTick[];
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

  const { points, source } = useMemo(
    () =>
      buildMarketChartPoints(marketTicks, history, range, {
        endAt: marketMeta?.market_updated_at ?? marketEndDate,
        endGameDate: lastGameDate ?? marketEndDate,
        currentMarket,
      }),
    [
      currentMarket,
      history,
      lastGameDate,
      marketEndDate,
      marketMeta?.market_updated_at,
      marketTicks,
      range,
    ],
  );

  const tickCount = marketTicks.length;

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
          No price history in this window. Try a longer range, or run the market pipeline
          a few times to build tick history.
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted">
            {source === "ticks" ? (
              <>
                Market Price · {points.length} snapshot{points.length === 1 ? "" : "s"} in
                the last {CHART_RANGE_DAYS[range]} days
                {tickCount > 0 ? ` (${tickCount} ticks loaded)` : ""}
              </>
            ) : (
              <>
                Fair Value from games · Market tick history not available yet — run the
                market pipeline after applying{" "}
                <span className="font-mono">market_price_ticks.sql</span>
              </>
            )}
          </p>
          {source === "games" && lastGameDate ? (
            <p className="mb-3 rounded-lg border border-border bg-surface-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Chart ends at this player&apos;s last game ({lastGameDate}). Fair Value only
              moves when new games are ingested — switch to tick history for stock-style
              updates between games.
            </p>
          ) : null}
          <div className="hs-chart-frame rounded-xl border border-border/80 bg-surface px-2 pb-1 pt-3 sm:px-3">
            <PriceChart points={points} showFairValue={source === "ticks"} />
          </div>
        </>
      )}
    </div>
  );
}
