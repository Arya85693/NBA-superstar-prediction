import {
  getMarketRefreshLabels,
  REFRESH_CADENCE_LABEL,
  SIMULATION_NOTE,
} from "@/lib/marketRefresh";
import type { MarketMeta } from "@/lib/types";

type Variant = "inline" | "bar" | "compact";

export function MarketRefreshMeta({
  meta,
  variant = "inline",
  showSimulationNote = false,
  className = "",
}: {
  meta: MarketMeta;
  variant?: Variant;
  showSimulationNote?: boolean;
  className?: string;
}) {
  const { relative, absolute } = getMarketRefreshLabels(meta);

  if (variant === "compact") {
    return (
      <p className={`text-xs leading-relaxed text-muted ${className}`}>
        <span className="text-muted-foreground">Updated </span>
        <span className="font-medium text-foreground">{relative}</span>
        {absolute ? (
          <>
            <span className="text-muted"> · Last refresh </span>
            <span className="font-mono text-[11px] text-muted-foreground">{absolute}</span>
          </>
        ) : null}
        <span className="text-muted"> · Cadence </span>
        <span className="font-medium text-foreground">{REFRESH_CADENCE_LABEL}</span>
      </p>
    );
  }

  if (variant === "bar") {
    return (
      <RefreshBar
        className={className}
        relative={relative}
        absolute={absolute}
        showSimulationNote={showSimulationNote}
      />
    );
  }

  return (
    <div className={`space-y-1.5 text-xs leading-relaxed text-muted ${className}`}>
      <p>
        <span className="text-muted-foreground">Updated </span>
        <span className="font-medium text-foreground">{relative}</span>
        {absolute ? (
          <>
            <span className="text-muted"> · Last refresh </span>
            <span className="font-mono text-[11px] text-muted-foreground">{absolute}</span>
          </>
        ) : null}
        <span className="text-muted"> · Refresh cadence </span>
        <span className="font-medium text-foreground">{REFRESH_CADENCE_LABEL}</span>
      </p>
      <p className="text-muted-foreground">
        Prices refresh automatically from newly ingested game data (rolling market snapshot).
      </p>
      {showSimulationNote ? (
        <p className="text-muted-foreground/90">{SIMULATION_NOTE}</p>
      ) : null}
    </div>
  );
}

function RefreshBar({
  className,
  relative,
  absolute,
  showSimulationNote,
}: {
  className: string;
  relative: string;
  absolute: string | null;
  showSimulationNote: boolean;
}) {
  return (
    <div
      className={`hs-inset flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-xs leading-relaxed text-muted-foreground md:gap-x-6 md:px-5 ${className}`}
    >
      <span>
        <span className="text-muted">Updated </span>
        <span className="font-medium text-accent">{relative}</span>
      </span>
      {absolute ? (
        <span>
          <span className="text-muted">Last refresh </span>
          <span className="font-mono font-medium text-foreground">{absolute}</span>
        </span>
      ) : null}
      <span>
        <span className="text-muted">Cadence </span>
        <span className="font-medium text-foreground">{REFRESH_CADENCE_LABEL}</span>
      </span>
      <span className="min-w-[12rem] flex-1 basis-full text-muted sm:basis-auto">
        Automated repricing from ingested game data - rolling snapshot, not tick-by-tick.
      </span>
      {showSimulationNote ? (
        <span className="basis-full border-t border-border/60 pt-2 text-[11px] text-muted sm:border-t-0 sm:pt-0">
          {SIMULATION_NOTE}
        </span>
      ) : null}
    </div>
  );
}
