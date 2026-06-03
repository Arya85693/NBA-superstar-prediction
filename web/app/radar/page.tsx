import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { RadarPickGrid } from "@/components/radar/RadarPickGrid";
import { RadarSlateSection } from "@/components/radar/RadarSlateSection";
import { getMarketMeta, getMarketRows } from "@/lib/marketData";
import { loadMarketStates } from "@/lib/marketState";
import { computeRadarPicks } from "@/lib/radarPicks";
import { getRadarSlate } from "@/lib/radarSlate";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Player radar — slate, up next & watch list",
  description:
    "Upcoming NBA games with forward-outlook highlights, plus breakout candidates and watch-list players ranked by projection and minutes.",
  alternates: { canonical: "/radar" },
};

export default async function RadarPage() {
  let picks;
  let meta;
  let slate;
  try {
    const rows = await getMarketRows();
    const [states, marketMeta, slateResult] = await Promise.all([
      loadMarketStates(),
      getMarketMeta(),
      getRadarSlate(rows),
    ]);
    meta = marketMeta;
    slate = slateResult;
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
        description="Upcoming games with standout player outlook, plus curated breakout and watch-list picks from the research backtest."
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

      <RadarSlateSection slate={slate} />

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
