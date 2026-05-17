import Link from "next/link";
import { SnapshotBadge } from "@/components/market/SnapshotBadge";
import { TeamBadge } from "@/components/dashboard/teamBadge";
import { MarketRefreshMeta } from "@/components/market/MarketRefreshMeta";
import { formatUsd, formatUsdNumberOnly } from "@/lib/format";
import { formatPct } from "@/lib/marketAnalytics";
import { MiniAreaChart } from "@/components/home/MiniAreaChart";
import { buildRepricingPulseSeries } from "@/lib/boardPulseSeries";
import { BOARD_TOTAL_TOOLTIP } from "@/lib/marketRefresh";
import type { MarketAnalytics } from "@/lib/marketAnalytics";
import type { MarketMeta } from "@/lib/types";

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
  const season = meta.current_dataset_season ?? "Current season";
  const pulseSeries = buildRepricingPulseSeries(analytics);
  const pulsePositive = pulse.gainersPct >= pulse.losersPct;

  return (
    <div className="hs-hero-market-card relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgb(44_40_37/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(44_40_37/0.04)_1px,transparent_1px)] bg-size-[1.25rem_1.25rem]"
        aria-hidden
      />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <SnapshotBadge />
          <span className="font-mono text-[11px] text-muted">
            {season} · {listingCount} tracked
          </span>
        </div>

        <div className="mt-4">
          <MarketRefreshMeta meta={meta} variant="compact" />
        </div>

        <div className="mt-5">
          <p
            className="text-[10px] font-semibold uppercase tracking-widest text-muted"
            title={BOARD_TOTAL_TOOLTIP}
          >
            Board total
          </p>
          <p className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-charcoal md:text-[1.65rem]">
            {formatUsd(pulse.totalMarketCap)}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Sum of latest model quotes across tracked players
          </p>
          {pulseSeries ? (
            <div className="mt-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                Repricing pulse
              </p>
              <div className="mt-2 h-[4.5rem] w-full">
                <MiniAreaChart values={pulseSeries} positive={pulsePositive} />
              </div>
              <p className="mt-1.5 text-[10px] text-muted">
                Indexed from largest moves in this snapshot
              </p>
            </div>
          ) : null}
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
                Latest mover
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
