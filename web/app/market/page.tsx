import { StartHereGuide } from "@/components/onboarding/StartHereGuide";
import { MarketTable } from "@/components/MarketTable";
import { PageHeader } from "@/components/PageHeader";
import { computeMarketAnalytics } from "@/lib/marketAnalytics";
import { getMarketMeta, getMarketRows } from "@/lib/marketData";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Market",
};

export default async function MarketPage() {
  let rows;
  let meta;
  let topMover: ReturnType<typeof computeMarketAnalytics>["topGainers"][0] | undefined;
  try {
    [rows, meta] = await Promise.all([getMarketRows(), getMarketMeta()]);
    const analytics = computeMarketAnalytics(rows);
    topMover = analytics.topGainers[0];
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load data";
    return (
      <div className="rounded-xl border border-negative/20 bg-negative-muted p-6 text-negative">
        <p className="font-medium">Cannot load market data</p>
        <p className="mt-2 text-sm opacity-90">{msg}</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Rolling market snapshot"
        title="Player market"
        description="Search and sort the board. Each row shows model price (2 decimals), team, last ingested game, and change vs that player's prior game row. Quotes refresh automatically on each ingestion cycle (~30 min) when new regular-season or playoff games arrive. Click a row or Open for charts and paper trading."
        marketMeta={meta}
      />
      <div className="mb-8">
        <StartHereGuide
          topMoverId={topMover?.player_id}
          topMoverName={topMover?.player_name}
        />
      </div>
      {meta?.current_dataset_season && (
        <div className="mb-6 hs-callout-warning text-sm">
          <span className="mr-1.5 text-warning" aria-hidden>
            ⚠
          </span>
          Next to a price means no minutes logged in{" "}
          <span className="font-medium text-foreground">{meta.current_dataset_season}</span> in
          this dataset (injury, inactive, or data lag).
        </div>
      )}
      <MarketTable rows={rows} meta={meta} />
    </div>
  );
}
