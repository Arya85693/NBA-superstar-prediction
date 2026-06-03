import Link from "next/link";
import { TeamBadge } from "@/components/dashboard/teamBadge";
import { formatUsdNumberOnly } from "@/lib/format";
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
              className="group flex h-full flex-col rounded-xl border border-border bg-surface px-4 py-3.5 transition hover:border-accent/30 hover:shadow-sm"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[13px] font-semibold tracking-wide text-accent">
                  {p.ticker}
                </span>
                <TeamBadge abbr={p.team_abbr} />
              </div>
              <p className="mt-2 text-[15px] font-medium leading-snug text-foreground group-hover:text-accent">
                {p.player_name}
              </p>
              <div className="mt-auto flex items-end justify-between gap-3 border-t border-border/70 pt-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                    Market
                  </p>
                  <p className="mt-0.5 font-mono text-sm font-medium tabular-nums text-foreground">
                    <span className="text-muted">$</span>
                    {formatUsdNumberOnly(p.price_after_game)}
                  </p>
                </div>
                <div
                  className="shrink-0 rounded-md border border-positive/20 bg-positive-muted px-2 py-1 text-right"
                  title="Forward-outlook score (0–100)"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                    Outlook
                  </p>
                  <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-positive">
                    {Math.round((p.outlook_score ?? 0) * 100)}
                  </p>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
