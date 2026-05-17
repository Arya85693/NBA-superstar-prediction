import { formatRelativeUpdated } from "@/lib/marketAnalytics";
import { formatLastRefreshAt, REFRESH_CADENCE_LABEL } from "@/lib/marketRefresh";
import type { MarketMeta } from "@/lib/types";

export function MarketStatusBar({
  meta,
  listingCount,
}: {
  meta: MarketMeta;
  listingCount: number;
}) {
  const season = meta.current_dataset_season ?? "-";
  const lastGame = meta.current_dataset_last_game_date ?? "-";
  const updatedRelative = formatRelativeUpdated(meta.data_updated_at);
  const updatedAbsolute = formatLastRefreshAt(meta.data_updated_at);

  return (
    <div className="hs-inset flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4 font-mono text-sm text-muted-foreground md:gap-x-10 md:px-6">
      <StatusItem label="Season" value={season} accent />
      <Divider />
      <StatusItem label="Last game in data" value={lastGame} />
      <Divider className="hidden sm:block" />
      <StatusItem label="Tracked" value={String(listingCount)} />
      <Divider className="hidden md:block" />
      <span className="text-muted">
        <span className="text-muted-foreground">Ingested </span>
        <span className="font-medium text-accent">{updatedRelative}</span>
        {updatedAbsolute ? (
          <>
            <span className="text-muted"> · </span>
            <span className="font-medium text-foreground">{updatedAbsolute}</span>
          </>
        ) : null}
        <span className="text-muted"> · Cadence {REFRESH_CADENCE_LABEL}</span>
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
