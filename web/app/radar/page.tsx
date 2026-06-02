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
    "Breakout candidates and players to watch, ranked from fair value, projection, sentiment, and market price signals.",
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
        description="Players the model flags as breakout candidates (“up next”) and names worth tracking this cycle (“watch out for”). Lists require real playing time this season — deep bench and low-minute players are filtered out. Rankings blend minutes, fair value trends, projection and sentiment levers, and live market price — not a guarantee of real-world performance."
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

      <section className="mb-12" aria-labelledby="up-next-heading">
        <h2 id="up-next-heading" className="text-lg font-semibold text-charcoal">
          Up next
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Not yet at the top of the board, but in the rotation (about 16+ season
          minutes, 14+ recent) with forward signals — rising projection, fair value
          gains, and room to climb before the market fully prices them in.
        </p>
        <div className="mt-5">
          <RadarPickGrid
            picks={picks.upNext}
            emptyMessage="No breakout candidates with enough rotation minutes matched this cycle. Check back after more games are ingested."
          />
        </div>
      </section>

      <section className="mb-10" aria-labelledby="watch-heading">
        <h2 id="watch-heading" className="text-lg font-semibold text-charcoal">
          Watch out for
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Momentum and narrative heat for players with meaningful minutes (about
          12+ season average). Strong projection or sentiment, sharp fair value or
          market moves, or an unusual gap between price and fundamentals.
        </p>
        <div className="mt-5">
          <RadarPickGrid
            picks={picks.watch}
            emptyMessage="No watch-list players with enough minutes matched the filters this cycle."
          />
        </div>
      </section>

      <p className="text-center text-sm text-muted-foreground">
        Want the full board?{" "}
        <Link href="/market" className="font-medium text-accent hover:text-accent-hover">
          Open player market →
        </Link>
      </p>
    </div>
  );
}
