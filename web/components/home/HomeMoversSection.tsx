import type { ReactNode } from "react";
import { MoverRow } from "@/components/dashboard/MoverRow";
import { MarketRefreshMeta } from "@/components/market/MarketRefreshMeta";
import { CHANGE_VS_PRIOR_GAME_TOOLTIP } from "@/lib/marketRefresh";
import type { MarketAnalytics } from "@/lib/marketAnalytics";
import type { MarketMeta } from "@/lib/types";

export function HomeMoversSection({
  analytics,
  meta,
}: {
  analytics: MarketAnalytics;
  meta: MarketMeta;
}) {
  const { topGainers, topLosers } = analytics;

  return (
    <section className="mt-12 md:mt-14" aria-labelledby="home-movers-heading">
      <div className="mb-6">
        <p className="hs-eyebrow">Movement</p>
        <h2
          id="home-movers-heading"
          className="mt-2 text-xl font-semibold tracking-tight text-charcoal md:text-2xl"
        >
          Latest movers
        </h2>
        <p
          className="mt-2 text-sm text-muted-foreground"
          title={CHANGE_VS_PRIOR_GAME_TOOLTIP}
        >
          Largest repricing moves vs each player&apos;s prior ingested game in the latest
          cycle.
        </p>
        <MarketRefreshMeta meta={meta} variant="compact" className="mt-3" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2 xl:gap-8">
        <MoversPanel
          title="Top gainers"
          subtitle="Positive movers"
          movers={topGainers}
          direction="gain"
          emptyMessage="No gainers with prior-game quotes in this snapshot."
          featured
        />
        <MoversPanel
          title="Top losers"
          subtitle="Negative movers"
          movers={topLosers}
          direction="loss"
          emptyMessage="No losers with prior-game quotes in this snapshot."
          featured
        />
      </div>
    </section>
  );
}

function MoversPanel({
  title,
  subtitle,
  movers,
  direction,
  emptyMessage,
  featured,
}: {
  title: string;
  subtitle: string;
  movers: MarketAnalytics["topGainers"];
  direction: "gain" | "loss";
  emptyMessage: string;
  featured?: boolean;
}) {
  return (
    <PanelShell title={title} subtitle={subtitle} featured={featured}>
      {movers.length === 0 ? (
        <p className="py-10 text-center text-[15px] text-muted">{emptyMessage}</p>
      ) : (
        <ul className="divide-y divide-border/60">
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

function PanelShell({
  title,
  subtitle,
  children,
  featured,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  featured?: boolean;
}) {
  return (
    <div className={featured ? "hs-movers-panel" : "dash-panel px-5 py-6 md:px-7 md:py-8"}>
      <header className="mb-5 border-b border-border/60 pb-4">
        <h3 className="text-base font-semibold tracking-tight text-charcoal">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </header>
      {children}
    </div>
  );
}
