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
      <div className="rounded-xl border border-rose-900 bg-rose-950/40 p-6 text-rose-200">
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
        description="Search and sort the board. Each row shows model price (2 decimals), team, last game, and change vs the prior game in your file. Click a row or Open for charts and paper trading."
      />
      {meta?.current_dataset_season && (
        <div className="mb-6 rounded-lg border border-amber-900/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-200/90">
          <span className="mr-1.5 text-amber-400">⚠️</span>
          Next to a price means no minutes logged in{" "}
          <span className="font-medium text-amber-100">{meta.current_dataset_season}</span>{" "}
          in this dataset (injury, inactive, or data lag).
        </div>
      )}
      <MarketTable rows={rows} meta={meta} />
    </div>
  );
}
