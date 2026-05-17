import type { ReactNode } from "react";
import Link from "next/link";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { MarketStatusBar } from "@/components/dashboard/MarketStatusBar";
import { MoverKpiValue } from "@/components/dashboard/MoverKpiValue";
import { formatUsd } from "@/lib/format";
import { formatPct } from "@/lib/marketAnalytics";
import type { MarketAnalytics } from "@/lib/marketAnalytics";
import type { MarketMeta } from "@/lib/types";
import { MarketTicker } from "./MarketTicker";

export function HomeMarketPulse({
  meta,
  analytics,
  listingCount,
}: {
  meta: MarketMeta;
  analytics: MarketAnalytics;
  listingCount: number;
}) {
  const { pulse } = analytics;
  const tickerMovers = [
    ...analytics.topGainers.slice(0, 4),
    ...analytics.topLosers.slice(0, 3),
  ];

  return (
    <section className="mt-0" aria-labelledby="home-pulse-heading">
      <div className="mb-6">
        <div className="flex items-center justify-between gap-4">
          <p className="hs-eyebrow">Live pulse</p>
          <Link href="/market" className="hs-btn hs-btn-secondary shrink-0 text-sm">
            Full board →
          </Link>
        </div>
        <h2
          id="home-pulse-heading"
          className="mt-2 text-xl font-semibold tracking-tight text-charcoal md:text-2xl"
        >
          Market snapshot
        </h2>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
          Same model quotes as the full board — daily move vs each player&apos;s prior game.
        </p>
      </div>

      <div className="mt-4">
        <MarketTicker movers={tickerMovers} />
      </div>

      <div className="mt-4">
        <MarketStatusBar meta={meta} listingCount={listingCount} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-12">
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
          <DashboardCard
            variant="featured"
            label="Index cap"
            value={formatUsd(pulse.totalMarketCap)}
            hint="Sum of latest model prices."
            className="hs-card-premium"
          />
          <DashboardCard
            variant="featured"
            label="Median quote"
            value={formatUsd(pulse.medianPrice)}
            hint="Middle price on the board."
            className="hs-card-premium"
          />
        </div>
        <div className="flex flex-col gap-3 lg:col-span-5">
          <div className="grid grid-cols-3 gap-3">
            <CompactStat
              label="Advancers"
              value={formatPct(pulse.gainersPct, { signed: false })}
              tone="positive"
            />
            <CompactStat
              label="Decliners"
              value={formatPct(pulse.losersPct, { signed: false })}
              tone="negative"
            />
            <CompactStat
              label="Avg |move|"
              value={formatPct(pulse.avgAbsMovePct, { signed: false })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <CompactStat
              label="Hottest"
              value={
                pulse.hottest ? (
                  <MoverKpiValue
                    ticker={pulse.hottest.ticker}
                    changePct={pulse.hottest.change_pct}
                    tone="positive"
                  />
                ) : (
                  "—"
                )
              }
            />
            <CompactStat
              label="Coldest"
              value={
                pulse.coldest ? (
                  <MoverKpiValue
                    ticker={pulse.coldest.ticker}
                    changePct={pulse.coldest.change_pct}
                    tone="negative"
                  />
                ) : (
                  "—"
                )
              }
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function CompactStat({
  label,
  value,
  tone,
  className,
}: {
  label: string;
  value: ReactNode;
  tone?: "positive" | "negative";
  className?: string;
}) {
  const valueClass =
    tone === "positive"
      ? "text-positive"
      : tone === "negative"
        ? "text-negative"
        : "text-charcoal";

  return (
    <div className={`hs-compact-stat ${className ?? ""}`}>
      <p className="dash-label">{label}</p>
      <div className={`mt-2 font-mono text-sm font-semibold tabular-nums ${valueClass}`}>
        {value}
      </div>
    </div>
  );
}
