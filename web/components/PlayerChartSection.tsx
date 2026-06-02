"use client";

import { useMemo, useState } from "react";
import {
  buildMarketChartPoints,
  type ChartRange,
  type ChartDataSource,
  CHART_RANGE_DAYS,
} from "@/lib/marketChart";
import type { MarketDailySnapshot } from "@/lib/marketHistory";
import { MarketRefreshMeta } from "@/components/market/MarketRefreshMeta";
import { PriceChart } from "@/components/PriceChart";
import type { MarketMeta, MarketTick, PriceRow } from "@/lib/types";

const TABS: { key: ChartRange; label: string }[] = [
  { key: "1w", label: "1 week" },
  { key: "1m", label: "1 month" },
  { key: "1y", label: "1 year" },
];

export type { ChartRange };

function sourceCaption(
  source: ChartDataSource,
  pointCount: number,
  range: ChartRange,
  tickCount: number,
  dailyCount: number,
): string {
  const window = `last ${CHART_RANGE_DAYS[range]} days`;
  if (source === "mixed") {
    return `Game-day fair value + market snapshots · ${pointCount} point${pointCount === 1 ? "" : "s"} in the ${window}${tickCount > 0 ? ` (${tickCount} ticks)` : dailyCount > 0 ? ` (${dailyCount} daily)` : ""}`;
  }
  if (source === "ticks") {
    return `Market & fair value · ${pointCount} intraday snapshot${pointCount === 1 ? "" : "s"} in the ${window}${tickCount > 0 ? ` (${tickCount} ticks loaded)` : ""}`;
  }
  if (source === "daily") {
    return `Market & fair value · ${pointCount} daily snapshot${pointCount === 1 ? "" : "s"} in the ${window}${dailyCount > 0 ? ` (${dailyCount} days on file)` : ""}`;
  }
  return `Fair value by game day · live market quote at the latest pipeline update`;
}

function sourceHint(
  source: ChartDataSource,
  lastGameDate: string | null | undefined,
  marketUpdatedAt: string | null | undefined,
  tickCount: number,
  dailyCount: number,
): string | null {
  if (source === "mixed") {
    if (lastGameDate && marketUpdatedAt) {
      const gameDay = lastGameDate.slice(0, 10);
      const updatedDay = marketUpdatedAt.slice(0, 10);
      if (updatedDay > gameDay) {
        return `Fair value steps on ingested games. Market price keeps updating from pipeline snapshots after the last game (${gameDay}) — including when a team is out.`;
      }
    }
    return "Fair value steps on ingested games; market price follows pipeline snapshots between games.";
  }

  if (source === "ticks") return null;

  if (source === "daily") {
    if (tickCount === 0) {
      return "Intraday tick history is still sparse — showing one point per pipeline day. More cycles will fill in stock-style moves between games.";
    }
    return null;
  }

  if (tickCount === 0 && dailyCount === 0) {
    return (
      "Run market_price_ticks.sql in Supabase, then python pipeline/update_market_state.py on a schedule (CI does this ~every 30 min when secrets are set). Until then, the chart uses game-day fair value with the current market quote at the end."
    );
  }

  if (lastGameDate && marketUpdatedAt) {
    const gameDay = lastGameDate.slice(0, 10);
    const updatedDay = marketUpdatedAt.slice(0, 10);
    if (updatedDay > gameDay) {
      return `Last ingested game: ${gameDay}. Market price through the latest pipeline run is shown at the end of the line.`;
    }
  }

  if (lastGameDate) {
    return `Last ingested game: ${lastGameDate}. Fair value updates when new games are ingested.`;
  }

  return null;
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

  const { points, source } = useMemo(
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

  const hint = sourceHint(
    source,
    lastGameDate,
    marketMeta?.market_updated_at ?? currentMarket?.recordedAt,
    marketTicks.length,
    marketDaily.length,
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
          No price history in this window. Try a longer range, or run the market pipeline
          a few times to build tick history.
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted">
            {sourceCaption(
              source,
              points.length,
              range,
              marketTicks.length,
              marketDaily.length,
            )}
          </p>
          {hint ? (
            <p
              className={
                source === "games"
                  ? "mb-3 rounded-lg border border-border bg-surface-muted/50 px-3 py-2 text-xs text-muted-foreground"
                  : "mb-3 text-xs text-muted-foreground"
              }
            >
              {hint}
            </p>
          ) : null}
          <div className="hs-chart-frame rounded-xl border border-border/80 bg-surface px-2 pb-1 pt-3 sm:px-3">
            <PriceChart points={points} showFairValue={source !== "games"} />
          </div>
        </>
      )}
    </div>
  );
}
