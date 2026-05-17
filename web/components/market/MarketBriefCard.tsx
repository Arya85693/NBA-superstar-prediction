import { buildMarketBrief } from "@/lib/marketRefresh";
import type { MarketAnalytics } from "@/lib/marketAnalytics";
import type { MarketMeta } from "@/lib/types";
import { MarketRefreshMeta } from "./MarketRefreshMeta";

export function MarketBriefCard({
  analytics,
  meta,
}: {
  analytics: MarketAnalytics;
  meta: MarketMeta;
}) {
  const brief = buildMarketBrief(analytics);

  return (
    <section
      className="hs-card border-accent/15 bg-surface-muted/40 px-5 py-5 md:px-7 md:py-6"
      aria-labelledby="market-brief-heading"
    >
      <p id="market-brief-heading" className="hs-eyebrow text-muted">
        Latest market snapshot
      </p>
      <p className="mt-3 text-[15px] leading-relaxed text-foreground">{brief}</p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        Automated repricing engine - quotes move when new games enter the dataset, not
        tick-by-tick.
      </p>
      <MarketRefreshMeta meta={meta} variant="compact" className="mt-4" />
    </section>
  );
}
