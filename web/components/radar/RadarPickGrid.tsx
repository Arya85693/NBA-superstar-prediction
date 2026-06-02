import Link from "next/link";
import { TeamBadge } from "@/components/dashboard/teamBadge";
import { formatUsdNumberOnly } from "@/lib/format";
import { formatPct } from "@/lib/marketAnalytics";
import { formatMinutes } from "@/lib/playerMinutes";
import type { RadarPick } from "@/lib/radarPicks";

function primaryReason(reason: string): string {
  return reason.split(" · ")[0] ?? reason;
}

function RadarPickRow({ pick, rank }: { pick: RadarPick; rank: number }) {
  const fv = pick.fair_value_change_pct;
  const fvUp = fv != null && fv >= 0;
  const hasFv = fv != null && !Number.isNaN(fv);

  return (
    <Link
      href={`/player/${pick.player_id}`}
      className="group grid grid-cols-[2rem_1fr_auto] items-center gap-x-4 rounded-xl px-2 py-4 transition hover:bg-surface-muted/90 sm:grid-cols-[2.25rem_1fr_auto] sm:gap-x-5 md:py-[1.125rem]"
    >
      <span className="text-center font-mono text-sm tabular-nums text-muted">{rank}</span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[13px] font-semibold tracking-wide text-accent">
            {pick.ticker}
          </span>
          <TeamBadge abbr={pick.team_abbr} />
        </div>
        <p className="mt-1.5 truncate text-[15px] font-medium leading-snug text-foreground group-hover:text-accent">
          {pick.player_name}
        </p>
        <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
          {primaryReason(pick.reason)}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-[15px] font-medium tabular-nums text-foreground">
          <span className="text-muted">$</span>
          {formatUsdNumberOnly(pick.market_price)}
        </p>
        {hasFv ? (
          <p
            className={`mt-1 font-mono text-sm font-semibold tabular-nums ${fvUp ? "text-positive" : "text-negative"}`}
          >
            {formatPct(fv)}
          </p>
        ) : (
          <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-foreground">
            {formatMinutes(pick.recent_avg_minutes)} mpg
          </p>
        )}
        <p className="mt-0.5 text-[11px] text-muted">
          {formatMinutes(pick.recent_avg_minutes)} min · last 5
        </p>
      </div>
    </Link>
  );
}

function RadarPanel({
  title,
  subtitle,
  picks,
  emptyMessage,
  featured,
}: {
  title: string;
  subtitle: string;
  picks: RadarPick[];
  emptyMessage: string;
  featured?: boolean;
}) {
  return (
    <div className={featured ? "hs-movers-panel" : "dash-panel px-5 py-6 md:px-7 md:py-8"}>
      <header className="mb-5 border-b border-border/60 pb-4">
        <h3 className="text-base font-semibold tracking-tight text-charcoal">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </header>
      {picks.length === 0 ? (
        <p className="py-10 text-center text-[15px] text-muted">{emptyMessage}</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {picks.map((p, i) => (
            <li key={p.player_id}>
              <RadarPickRow pick={p} rank={i + 1} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RadarPickGrid({
  upNext,
  watch,
  upNextEmpty,
  watchEmpty,
}: {
  upNext: RadarPick[];
  watch: RadarPick[];
  upNextEmpty: string;
  watchEmpty: string;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-2 xl:gap-8">
      <RadarPanel
        title="Up next"
        subtitle="Top 5 · rotation minutes & breakout signals"
        picks={upNext}
        emptyMessage={upNextEmpty}
        featured
      />
      <RadarPanel
        title="Watch out for"
        subtitle="Top 5 · momentum & narrative heat"
        picks={watch}
        emptyMessage={watchEmpty}
      />
    </div>
  );
}
