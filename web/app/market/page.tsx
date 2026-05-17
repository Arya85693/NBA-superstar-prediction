import { getMarketMeta, getMarketRows } from "@/lib/marketData";
import { MarketTable } from "@/components/MarketTable";
import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Market",
};

export default async function MarketPage() {
  let rows;
  let meta;
  try {
    [rows, meta] = await Promise.all([getMarketRows(), getMarketMeta()]);
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
        eyebrow="Live board"
        title="Player market"
        description="Search and sort the board. Each row shows model price (2 decimals), team, last game, and change vs the prior game in your dataset. Quotes update from regular-season and playoff games. Click a row or Open for charts and simulated trading."
      />
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
