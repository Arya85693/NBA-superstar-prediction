import Link from "next/link";
import { TeamBadge } from "@/components/dashboard/teamBadge";
import { formatUsd, formatUsdNumberOnly } from "@/lib/format";
import { formatPct } from "@/lib/marketAnalytics";
import type { MarketAnalytics } from "@/lib/marketAnalytics";
import type { MarketMeta } from "@/lib/types";
import { MiniAreaChart } from "./MiniAreaChart";

function buildIndexSeries(analytics: MarketAnalytics): number[] {
  const moves = [
    ...analytics.topGainers.map((m) => m.change_pct),
    ...analytics.topLosers.map((m) => m.change_pct),
  ];
  if (moves.length < 4) {
    return [42, 44, 43, 47, 46, 49, 48, 52, 51, 54];
  }
  let level = 50;
  return moves.slice(0, 10).map((pct) => {
    level += pct * 0.35;
    return level;
  });
}

export function MarketPreviewCard({
  analytics,
  meta,
  listingCount,
}: {
  analytics: MarketAnalytics;
  meta: MarketMeta;
  listingCount: number;
}) {
  const { pulse } = analytics;
  const featured = pulse.hottest ?? analytics.topGainers[0] ?? null;
  const indexPositive = pulse.gainersPct >= pulse.losersPct;
  const series = buildIndexSeries(analytics);
  const season = meta.current_dataset_season ?? "Current season";

  return (
    <div className="hs-hero-market-card relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgb(44_40_37/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(44_40_37/0.04)_1px,transparent_1px)] bg-size-[1.25rem_1.25rem]"
        aria-hidden
      />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <LiveBadge />
          <span className="font-mono text-[11px] text-muted">
            {season} · {listingCount} tickers
          </span>
        </div>

        <div className="mt-5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
            Market cap index
          </p>
          <p className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-charcoal md:text-[1.65rem]">
            {formatUsd(pulse.totalMarketCap)}
          </p>
          <p className="mt-1 font-mono text-xs text-muted">
            Sum of model quotes across active listings
          </p>
          <div className="mt-4 h-[4.5rem] w-full">
            <MiniAreaChart values={series} positive={indexPositive} />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 border-t border-border/70 pt-5">
          <StatChip
            label="Advancers"
            value={formatPct(pulse.gainersPct, { signed: false })}
            tone="positive"
          />
          <StatChip
            label="Decliners"
            value={formatPct(pulse.losersPct, { signed: false })}
            tone="negative"
          />
          <StatChip label="Median" value={formatUsd(pulse.medianPrice)} />
        </div>

        {featured ? (
          <Link
            href={`/player/${featured.player_id}`}
            className="group mt-5 flex items-center justify-between gap-4 rounded-xl border border-border/80 bg-surface-muted/60 px-4 py-3.5 transition hover:border-accent/30 hover:bg-surface-muted hover:shadow-sm"
          >
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                Top mover
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold text-accent">
                  {featured.ticker}
                </span>
                <TeamBadge abbr={featured.team_abbr} />
                <span className="truncate text-sm font-medium text-foreground group-hover:text-accent">
                  {featured.player_name}
                </span>
                <span className="font-mono text-sm tabular-nums text-muted-foreground">
                  ${formatUsdNumberOnly(featured.price_after_game)}
                </span>
              </div>
            </div>
            <span className="shrink-0 font-mono text-lg font-semibold tabular-nums text-positive">
              {formatPct(featured.change_pct)}
            </span>
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-positive/25 bg-positive-muted/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-positive">
      <span className="relative flex h-1.5 w-1.5">
        <span className="hs-live-ping absolute inline-flex h-full w-full rounded-full bg-positive opacity-60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-positive" />
      </span>
      Live board
    </span>
  );
}

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  const valueClass =
    tone === "positive"
      ? "text-positive"
      : tone === "negative"
        ? "text-negative"
        : "text-charcoal";

  return (
    <div className="rounded-lg bg-surface/80 px-2.5 py-2 text-center ring-1 ring-border/60">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-0.5 font-mono text-xs font-semibold tabular-nums ${valueClass}`}>
        {value}
      </p>
    </div>
  );
}