import type { ReactNode } from "react";
import Link from "next/link";
import { formatUsd } from "@/lib/format";
import type { MarketAnalytics } from "@/lib/marketAnalytics";
import { formatPct } from "@/lib/marketAnalytics";
import { BOARD_TOTAL_TOOLTIP } from "@/lib/marketRefresh";
import type { MarketMeta } from "@/lib/types";
import { BreadthPanel } from "./BreadthPanel";
import { DashboardCard } from "./DashboardCard";
import { MarketStatusBar } from "./MarketStatusBar";
import { MoverKpiValue } from "./MoverKpiValue";
import { MoverRow } from "./MoverRow";
import { TeamBadge } from "./teamBadge";

export function MarketIntelligenceDashboard({
  meta,
  analytics,
  listingCount,
}: {
  meta: MarketMeta;
  analytics: MarketAnalytics;
  listingCount: number;
}) {
  const { pulse, topGainers, topLosers, topTeams, bottomTeams, breadth } =
    analytics;

  return (
    <section
      className="mt-10 space-y-14 md:mt-12 md:space-y-16"
      aria-labelledby="market-intel-heading"
    >
      {/* Header */}
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between md:gap-10">
        <div className="max-w-2xl">
          <p className="hs-eyebrow">Market pulse</p>
          <h2
            id="market-intel-heading"
            className="hs-page-title mt-3 md:text-4xl"
          >
            Rolling snapshot overview
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
            Aggregated from the same automated model quotes as the full board - move vs each
            player&apos;s prior ingested game in the latest cycle.
          </p>
        </div>
        <Link
          href="/market"
          className="hs-btn hs-btn-secondary shrink-0 self-start"
        >
          Full market board →
        </Link>
      </div>

      <MarketStatusBar meta={meta} listingCount={listingCount} />

      {/* KPIs */}
      <div className="space-y-6">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="dash-section-title">Market overview</h3>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <DashboardCard
            variant="featured"
            label="Board total"
            labelTitle={BOARD_TOTAL_TOOLTIP}
            value={formatUsd(pulse.totalMarketCap)}
            hint="Sum of latest model quotes across tracked players."
          />
          <DashboardCard
            variant="featured"
            label="Median quote"
            value={formatUsd(pulse.medianPrice)}
            hint="Middle price on the board."
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <DashboardCard
            label="Advancers"
            value={formatPct(pulse.gainersPct, { signed: false })}
            hint="Share of players with a positive move vs prior ingested game."
            valueClassName="text-positive"
          />
          <DashboardCard
            label="Decliners"
            value={formatPct(pulse.losersPct, { signed: false })}
            hint="Share of players with a negative move vs prior ingested game."
            valueClassName="text-negative"
          />
          <DashboardCard
            label="Avg |move|"
            value={formatPct(pulse.avgAbsMovePct, { signed: false })}
            hint="Mean absolute % change vs prior game."
          />
          <DashboardCard
            compactValue
            label="Hottest"
            value={
              pulse.hottest ? (
                <MoverKpiValue
                  ticker={pulse.hottest.ticker}
                  changePct={pulse.hottest.change_pct}
                  tone="positive"
                />
              ) : (
                "-"
              )
            }
            hint={pulse.hottest?.player_name}
          />
          <DashboardCard
            compactValue
            label="Coldest"
            value={
              pulse.coldest ? (
                <MoverKpiValue
                  ticker={pulse.coldest.ticker}
                  changePct={pulse.coldest.change_pct}
                  tone="negative"
                />
              ) : (
                "-"
              )
            }
            hint={pulse.coldest?.player_name}
          />
        </div>
      </div>

      {/* Movers */}
      <div className="space-y-6">
        <div>
          <h3 className="dash-section-title">Movement</h3>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Largest moves vs each player&apos;s prior ingested game
          </p>
        </div>
        <div className="grid gap-6 xl:grid-cols-2 xl:gap-8">
          <MoversPanel
            title="Top gainers"
            subtitle="Positive movers"
            movers={topGainers}
            direction="gain"
            emptyMessage="No gainers with prior-game quotes in this snapshot."
          />
          <MoversPanel
            title="Top losers"
            subtitle="Negative movers"
            movers={topLosers}
            direction="loss"
            emptyMessage="No losers with prior-game quotes in this snapshot."
          />
        </div>
      </div>

      {/* Teams */}
      <div className="space-y-6">
        <div>
          <h3 className="dash-section-title">By franchise</h3>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Average daily move aggregated by team
          </p>
        </div>
        <div className="grid gap-6 xl:grid-cols-2 xl:gap-8">
          <TeamPanel
            title="Team leaders"
            subtitle="Strongest average move"
            teams={topTeams}
            positive
          />
          <TeamPanel
            title="Team laggards"
            subtitle="Weakest average move"
            teams={bottomTeams}
            positive={false}
          />
        </div>
      </div>

      <BreadthPanel breadth={breadth} />
    </section>
  );
}

function PanelShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="dash-panel flex flex-col px-5 py-6 md:px-7 md:py-8">
      <header className="mb-6">
        <h4 className="text-base font-semibold tracking-tight text-foreground">{title}</h4>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </header>
      {children}
    </div>
  );
}

function MoversPanel({
  title,
  subtitle,
  movers,
  direction,
  emptyMessage,
}: {
  title: string;
  subtitle: string;
  movers: MarketAnalytics["topGainers"];
  direction: "gain" | "loss";
  emptyMessage: string;
}) {
  return (
    <PanelShell title={title} subtitle={subtitle}>
      {movers.length === 0 ? (
        <p className="py-12 text-center text-[15px] text-muted">{emptyMessage}</p>
      ) : (
        <ul className="space-y-1">
          {movers.map((m, i) => (
            <li key={m.player_id}>
              <MoverRow mover={m} rank={i + 1} direction={direction} />
            </li>
          ))}
        </ul>
      )}
    </PanelShell>
  );
}

function TeamPanel({
  title,
  subtitle,
  teams,
  positive,
}: {
  title: string;
  subtitle: string;
  teams: MarketAnalytics["topTeams"];
  positive: boolean;
}) {
  return (
    <PanelShell title={title} subtitle={subtitle}>
      {teams.length === 0 ? (
        <p className="py-12 text-center text-[15px] text-muted">No team aggregates available.</p>
      ) : (
        <ul className="space-y-0.5">
          {teams.map((t, i) => (
            <li
              key={t.team_abbr}
              className="flex items-center justify-between gap-4 rounded-xl px-2 py-4 transition hover:bg-surface-muted/80 md:px-3"
            >
              <div className="flex min-w-0 items-center gap-4">
                <span className="w-7 shrink-0 text-center font-mono text-sm tabular-nums text-muted">
                  {i + 1}
                </span>
                <TeamBadge abbr={t.team_abbr} />
                <span className="truncate text-sm text-muted-foreground">
                  {t.withMoveCount}/{t.playerCount} quoted
                </span>
              </div>
              <span
                className={`shrink-0 font-mono text-lg font-medium tabular-nums ${
                  positive ? "text-positive" : "text-negative"
                }`}
              >
                {formatPct(t.avgChangePct)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </PanelShell>
  );
}
