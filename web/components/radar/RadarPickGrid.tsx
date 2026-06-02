import Link from "next/link";
import { TeamBadge } from "@/components/dashboard/teamBadge";
import { formatUsdNumberOnly } from "@/lib/format";
import { formatPct } from "@/lib/marketAnalytics";
import { formatMinutes } from "@/lib/playerMinutes";
import type { RadarPick } from "@/lib/radarPicks";

export function RadarPickGrid({
  picks,
  emptyMessage,
}: {
  picks: RadarPick[];
  emptyMessage: string;
}) {
  if (picks.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-surface-muted/50 px-5 py-10 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {picks.map((p, i) => {
        const fvUp = (p.fair_value_change_pct ?? 0) >= 0;
        return (
          <li key={p.player_id}>
            <Link
              href={`/player/${p.player_id}`}
              className="flex h-full flex-col rounded-xl border border-border bg-surface px-4 py-4 transition hover:border-accent/35 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-xs tabular-nums text-muted">#{i + 1}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-accent">{p.ticker}</span>
                  <TeamBadge abbr={p.team_abbr} />
                </div>
              </div>
              <p className="mt-2 font-medium leading-snug text-foreground">{p.player_name}</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{p.reason}</p>
              <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-border/60 pt-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted">Market</p>
                  <p className="font-mono text-lg font-semibold tabular-nums text-foreground">
                    <span className="text-sm text-muted">$</span>
                    {formatUsdNumberOnly(p.market_price)}
                  </p>
                </div>
                {p.fair_value_change_pct != null && (
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wide text-muted">Last game FV</p>
                    <p
                      className={`font-mono text-sm font-semibold tabular-nums ${fvUp ? "text-positive" : "text-negative"}`}
                    >
                      {formatPct(p.fair_value_change_pct)}
                    </p>
                  </div>
                )}
              </div>
              <p className="mt-2 text-[11px] text-muted">
                <span className="text-muted-foreground">Minutes</span>{" "}
                <span className="font-mono tabular-nums text-foreground">
                  {formatMinutes(p.recent_avg_minutes)}
                </span>{" "}
                recent ·{" "}
                <span className="font-mono tabular-nums text-foreground">
                  {formatMinutes(p.season_avg_minutes)}
                </span>{" "}
                season avg
              </p>
              {p.projection_score != null && p.projection_score > 0.05 && (
                <p className="mt-1 text-[11px] text-muted">
                  Projection signal{" "}
                  <span className="font-mono tabular-nums text-positive">
                    +{Math.round(p.projection_score * 100)}
                  </span>
                </p>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
