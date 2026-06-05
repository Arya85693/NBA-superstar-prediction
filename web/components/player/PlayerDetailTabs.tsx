"use client";

import { useState } from "react";
import { PlayerChartSection } from "@/components/PlayerChartSection";
import { PlayerResearchPanel } from "@/components/player/PlayerResearchPanel";
import type { MarketDailySnapshot } from "@/lib/marketHistory";
import type {
  MarketMeta,
  MarketQuote,
  MarketState,
  MarketTick,
  PriceRow,
} from "@/lib/types";

type TabId = "overview" | "research";

const TABS: { id: TabId; label: string; description: string }[] = [
  {
    id: "overview",
    label: "Overview",
    description: "Trading view — market price history",
  },
  {
    id: "research",
    label: "Research",
    description: "Charts, levers, and model breakdown",
  },
];

export function PlayerDetailTabs({
  history,
  marketTicks,
  marketDaily,
  marketEndDate,
  lastGameDate,
  currentMarket,
  marketMeta,
  quote,
  marketQuote,
  marketState,
  seasonAvgMinutes,
  recentAvgMinutes,
  seasonGamesWithMinutes,
  lastGameMinutes,
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
  quote: PriceRow;
  marketQuote: MarketQuote | null;
  marketState: MarketState | null;
  seasonAvgMinutes: number;
  recentAvgMinutes: number;
  seasonGamesWithMinutes: number;
  lastGameMinutes: number;
}) {
  const [tab, setTab] = useState<TabId>("overview");

  return (
    <div className="mt-10">
      <div
        className="flex flex-wrap gap-2 border-b border-border pb-3"
        role="tablist"
        aria-label="Player detail sections"
      >
        {TABS.map(({ id, label, description }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`player-tab-${id}`}
              id={`player-tab-btn-${id}`}
              title={description}
              onClick={() => setTab(id)}
              className={
                active
                  ? "rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
                  : "rounded-lg border border-border-strong bg-surface-muted px-4 py-2 text-sm text-muted-foreground hover:border-border-strong hover:text-foreground"
              }
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="mt-6" role="tabpanel" id={`player-tab-${tab}`} aria-labelledby={`player-tab-btn-${tab}`}>
        {tab === "overview" ? (
          <>
            <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-muted">
              Market Price history
            </h2>
            <p className="mb-4 text-xs text-muted">
              Tradable quote over time (solid). Fair Value from stats shown dashed when
              tick history is available.
            </p>
            <PlayerChartSection
              history={history}
              marketTicks={marketTicks}
              marketDaily={marketDaily}
              marketEndDate={marketEndDate}
              lastGameDate={lastGameDate}
              currentMarket={currentMarket}
              marketMeta={marketMeta}
            />
          </>
        ) : (
          <PlayerResearchPanel
            history={history}
            quote={quote}
            marketQuote={marketQuote}
            marketState={marketState}
            marketTicks={marketTicks}
            marketDaily={marketDaily}
            marketEndDate={marketEndDate}
            marketMeta={marketMeta}
            seasonAvgMinutes={seasonAvgMinutes}
            recentAvgMinutes={recentAvgMinutes}
            seasonGamesWithMinutes={seasonGamesWithMinutes}
            lastGameMinutes={lastGameMinutes}
          />
        )}
      </div>
    </div>
  );
}
