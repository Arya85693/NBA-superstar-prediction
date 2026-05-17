import type { MarketAnalytics } from "@/lib/marketAnalytics";

type Breadth = MarketAnalytics["breadth"];

type Segment = {
  id: string;
  label: string;
  count: number;
  pct: number;
  barClass: string;
  dotClass: string;
};

function pctOf(count: number, total: number) {
  return total > 0 ? (count / total) * 100 : 0;
}

export function BreadthPanel({ breadth }: { breadth: Breadth }) {
  const total = breadth.totalListings || 1;
  const advancingPct = pctOf(breadth.advancing, total);
  const decliningPct = pctOf(breadth.declining, total);
  const unchangedPct = pctOf(breadth.unchanged, total);

  const movementSegments: Segment[] = [
    {
      id: "advancing",
      label: "Advancing",
      count: breadth.advancing,
      pct: advancingPct,
      barClass: "bg-positive",
      dotClass: "bg-positive",
    },
    {
      id: "unchanged",
      label: "Unchanged",
      count: breadth.unchanged,
      pct: unchangedPct,
      barClass: "bg-border-strong",
      dotClass: "bg-border-strong",
    },
    {
      id: "declining",
      label: "Declining",
      count: breadth.declining,
      pct: decliningPct,
      barClass: "bg-negative",
      dotClass: "bg-negative",
    },
  ];

  return (
    <section className="hs-panel px-6 py-7 md:px-8 md:py-9">
      <header className="flex flex-col gap-4 border-b border-border/70 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="hs-eyebrow text-muted">Participation</p>
          <h3 className="hs-section-title mt-2">Market breadth</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            How listings moved vs their prior game across{" "}
            <span className="font-medium text-foreground">{breadth.totalListings}</span>{" "}
            active names.
          </p>
        </div>
        <p className="shrink-0 rounded-lg border border-border bg-surface-muted/80 px-3 py-2 text-xs leading-snug text-muted-foreground">
          <span className="font-mono font-medium text-foreground">
            {breadth.withChangeData}
          </span>{" "}
          with prior-game quotes
        </p>
      </header>

      {/* Distribution bar */}
      <div className="mt-8">
        <p className="hs-label mb-3">Move vs prior ingested game</p>
        <div
          className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-surface-inset p-0.5"
          role="img"
          aria-label={`Advancing ${advancingPct.toFixed(1)} percent, unchanged ${unchangedPct.toFixed(1)} percent, declining ${decliningPct.toFixed(1)} percent`}
        >
          {movementSegments.map((seg) =>
            seg.pct > 0 ? (
              <div
                key={seg.id}
                className={`${seg.barClass} min-w-[3px] rounded-sm transition-[width]`}
                style={{ width: `${seg.pct}%` }}
                title={`${seg.label}: ${seg.count} (${seg.pct.toFixed(1)}%)`}
              />
            ) : null,
          )}
        </div>
        <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
          {movementSegments.map((seg) => (
            <li key={seg.id} className="flex items-center gap-2.5 text-sm">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${seg.dotClass}`}
                aria-hidden
              />
              <span className="text-muted-foreground">{seg.label}</span>
              <span className="font-mono font-medium tabular-nums text-foreground">
                {seg.count}
              </span>
              <span className="font-mono text-xs tabular-nums text-muted">
                ({seg.pct.toFixed(1)}%)
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Stat tiles */}
      <div className="mt-8 grid gap-4 lg:grid-cols-2 lg:gap-6">
        <div>
          <p className="hs-label mb-3">Price movement</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <BreadthTile
              label="Advancing"
              value={breadth.advancing}
              sharePct={advancingPct}
              accent="positive"
            />
            <BreadthTile
              label="Declining"
              value={breadth.declining}
              sharePct={decliningPct}
              accent="negative"
            />
            <BreadthTile
              label="Unchanged"
              value={breadth.unchanged}
              sharePct={unchangedPct}
              accent="neutral"
            />
          </div>
        </div>
        <div>
          <p className="hs-label mb-3">Dataset coverage</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <BreadthTile
              label="Active season"
              value={breadth.activeThisSeason}
              sharePct={pctOf(breadth.activeThisSeason, total)}
              accent="positive"
              hint="Minutes logged in dataset season"
            />
            <BreadthTile
              label="Caution"
              value={breadth.cautionFlagged}
              sharePct={pctOf(breadth.cautionFlagged, total)}
              accent="warning"
              hint="No minutes in current season"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function BreadthTile({
  label,
  value,
  sharePct,
  accent,
  hint,
}: {
  label: string;
  value: number;
  sharePct: number;
  accent: "positive" | "negative" | "neutral" | "warning";
  hint?: string;
}) {
  const accentStyles = {
    positive: "border-l-positive bg-positive-muted/35",
    negative: "border-l-negative bg-negative-muted/30",
    neutral: "border-l-border-strong bg-surface",
    warning: "border-l-warning bg-warning-muted/50",
  };

  const valueStyles = {
    positive: "text-foreground",
    negative: "text-foreground",
    neutral: "text-foreground",
    warning: "text-foreground",
  };

  return (
    <article
      className={`rounded-lg border border-border border-l-[3px] px-4 py-4 ${accentStyles[accent]}`}
    >
      <p className="hs-label">{label}</p>
      <p
        className={`mt-2 font-mono text-2xl font-semibold leading-none tabular-nums ${valueStyles[accent]}`}
      >
        {value}
      </p>
      <p className="mt-1.5 font-mono text-xs tabular-nums text-muted">
        {sharePct.toFixed(1)}% of board
      </p>
      {hint ? <p className="mt-2 text-xs leading-relaxed text-muted">{hint}</p> : null}
    </article>
  );
}
