import Link from "next/link";
import { TeamBadge } from "@/components/dashboard/teamBadge";
import { formatPct } from "@/lib/marketAnalytics";
import type { MarketAnalytics } from "@/lib/marketAnalytics";

/** Server-rendered “3 players to watch” from latest snapshot movers. */
export function PlayersToWatch({ analytics }: { analytics: MarketAnalytics }) {
  const picks = [
    ...analytics.topGainers.slice(0, 2),
    ...analytics.topLosers.slice(0, 1),
  ].slice(0, 3);

  if (picks.length === 0) return null;

  return (
    <section className="mt-8" aria-labelledby="players-to-watch-heading">
      <p className="hs-eyebrow">Opportunities</p>
      <h2 id="players-to-watch-heading" className="mt-2 text-lg font-semibold text-charcoal">
        3 players to watch this cycle
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Largest repricing moves in the latest ingestion - open any card to see why.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-3">
        {picks.map((p) => {
          const up = p.change_pct >= 0;
          return (
            <li key={p.player_id}>
              <Link
                href={`/player/${p.player_id}`}
                className="block h-full rounded-xl border border-border bg-surface px-4 py-4 transition hover:border-accent/30 hover:shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-accent">{p.ticker}</span>
                  <TeamBadge abbr={p.team_abbr} />
                </div>
                <p className="mt-2 font-medium text-foreground">{p.player_name}</p>
                <p
                  className={`mt-2 font-mono text-lg font-semibold tabular-nums ${up ? "text-positive" : "text-negative"}`}
                >
                  {formatPct(p.change_pct)}
                </p>
                <p className="mt-1 text-xs text-muted">vs prior ingested game</p>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
