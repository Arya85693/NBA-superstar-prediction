import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { RadarPickGrid } from "@/components/radar/RadarPickGrid";
import { getMarketMeta, getMarketRows } from "@/lib/marketData";
import { loadMarketStates } from "@/lib/marketState";
import { computeRadarPicks } from "@/lib/radarPicks";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Player radar — up next & watch list",
  description:
    "Breakout candidates and watch-list players ranked by forward outlook (projection + minutes), with market and sentiment context.",
  alternates: { canonical: "/radar" },
};

export default async function RadarPage() {
  let picks;
  let meta;
  try {
    const [rows, states, marketMeta] = await Promise.all([
      getMarketRows(),
      loadMarketStates(),
      getMarketMeta(),
    ]);
    meta = marketMeta;
    picks = computeRadarPicks(rows, states);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load data";
    return (
      <div className="rounded-xl border border-negative/20 bg-negative-muted p-6 text-negative">
        <p className="font-medium">Cannot load radar</p>
        <p className="mt-2 text-sm opacity-90">{msg}</p>
      </div>
    );
  }

  const hasMarketLayer = picks.upNext.some((p) => p.projection_score != null);

  return (
    <div>
      <PageHeader
        eyebrow="Opportunity radar"
        title="Up next & watch list"
        description="Curated picks ranked like the research backtest: projection and minutes trend first, then market narrative. Low-minute players are filtered out."
        marketMeta={meta}
      />

      {!hasMarketLayer && (
        <div className="mb-8 hs-callout-warning text-sm">
          <span className="mr-1.5 text-warning" aria-hidden>
            ⚠
          </span>
          Market Price levers are not loaded (hosted Supabase layer). Lists use fair
          value and last-game moves only. Set{" "}
          <code className="rounded bg-surface-muted px-1 text-xs">PRICES_SOURCE=supabase</code>{" "}
          for full projection and sentiment signals.
        </div>
      )}

      <RadarPickGrid
        upNext={picks.upNext}
        watch={picks.watch}
        upNextEmpty="No breakout candidates with enough rotation minutes matched this cycle."
        watchEmpty="No watch-list players with enough minutes matched this cycle."
      />

      <p className="mt-10 text-center text-sm text-muted-foreground">
        Want the full board?{" "}
        <Link href="/market" className="font-medium text-accent hover:text-accent-hover">
          Open player market →
        </Link>
      </p>
    </div>
  );
}
