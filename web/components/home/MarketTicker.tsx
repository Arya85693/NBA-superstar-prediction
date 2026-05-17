import Link from "next/link";
import { formatPct } from "@/lib/marketAnalytics";
import type { MarketMoverSnapshot } from "@/lib/marketAnalytics";

export function MarketTicker({ movers }: { movers: MarketMoverSnapshot[] }) {
  if (movers.length === 0) return null;

  const items = [...movers, ...movers];

  return (
    <div className="hs-ticker-wrap overflow-hidden rounded-xl border border-border/80 bg-charcoal/[0.03] py-2.5">
      <div className="hs-ticker-track flex w-max gap-8 px-4">
        {items.map((m, i) => {
          const up = m.change_pct >= 0;
          return (
            <Link
              key={`${m.player_id}-${i}`}
              href={`/player/${m.player_id}`}
              className="inline-flex shrink-0 items-center gap-3 font-mono text-xs transition hover:opacity-80"
            >
              <span className="font-semibold text-accent">{m.ticker}</span>
              <span className="text-muted-foreground">{m.team_abbr}</span>
              <span
                className={`font-semibold tabular-nums ${up ? "text-positive" : "text-negative"}`}
              >
                {formatPct(m.change_pct)}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
