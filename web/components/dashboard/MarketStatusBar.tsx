import type { MarketMeta } from "@/lib/types";
import { formatRelativeUpdated } from "@/lib/marketAnalytics";

export function MarketStatusBar({
  meta,
  listingCount,
}: {
  meta: MarketMeta;
  listingCount: number;
}) {
  const season = meta.current_dataset_season ?? "—";
  const lastGame = meta.current_dataset_last_game_date ?? "—";
  const revision =
    meta.prices_revision != null ? String(meta.prices_revision) : "—";
  const updatedLabel = formatRelativeUpdated(meta.data_updated_at);

  return (
    <div className="hs-inset flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4 font-mono text-sm text-muted-foreground md:gap-x-10 md:px-6">
      <StatusItem label="Season" value={season} accent />
      <Divider />
      <StatusItem label="Last game" value={lastGame} />
      <Divider className="hidden sm:block" />
      <StatusItem label="Revision" value={revision} />
      <Divider className="hidden sm:block" />
      <StatusItem label="Listings" value={String(listingCount)} />
      <Divider className="hidden md:block" />
      <span className="text-muted">
        <span className="text-muted-foreground">Updated </span>
        <span className="font-medium text-accent">{updatedLabel}</span>
      </span>
    </div>
  );
}

function StatusItem({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="text-xs text-muted">{label}</span>
      <span
        className={`text-sm ${accent ? "font-medium text-accent" : "font-medium text-foreground"}`}
      >
        {value}
      </span>
    </span>
  );
}

function Divider({ className }: { className?: string }) {
  return (
    <span
      className={`hidden h-4 w-px bg-border md:inline-block ${className ?? ""}`}
      aria-hidden
    />
  );
}
