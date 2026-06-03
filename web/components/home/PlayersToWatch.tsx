import Link from "next/link";
import { TeamBadge } from "@/components/dashboard/teamBadge";
import { formatMoverMetric } from "@/lib/marketAnalytics";
import type { MarketAnalytics } from "@/lib/marketAnalytics";

/** Server-rendered opportunities from forward-outlook ranking (backtest-aligned). */
export function PlayersToWatch({ analytics }: { analytics: MarketAnalytics }) {
  const picks = analytics.topOutlookRisers.slice(0, 3);

  if (picks.length === 0) return null;

  return (
    <section className="mt-8" aria-labelledby="players-to-watch-heading">
      <p className="hs-eyebrow">Opportunities</p>
      <h2 id="players-to-watch-heading" className="mt-2 text-lg font-semibold text-charcoal">
        3 players to watch this cycle
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Highest forward-outlook scores (projection + minutes trend) among active
        players — who the model expects to outperform their recent baseline.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-3">
        {picks.map((p) => (
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
              <p className="mt-2 font-mono text-lg font-semibold tabular-nums text-positive">
                {formatMoverMetric(p)}
              </p>
              <p className="mt-1 text-xs text-muted">
                ${p.price_after_game.toFixed(2)} market · forward signal
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
