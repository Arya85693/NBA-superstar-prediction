import Link from "next/link";
import { formatUsdNumberOnly } from "@/lib/format";
import { formatPct } from "@/lib/marketAnalytics";
import type { MarketMoverSnapshot } from "@/lib/marketAnalytics";
import { TeamBadge } from "./teamBadge";

export function MoverRow({
  mover,
  rank,
  direction,
}: {
  mover: MarketMoverSnapshot;
  rank: number;
  direction: "gain" | "loss";
}) {
  const positive = direction === "gain";
  const pctClass = positive ? "text-positive" : "text-negative";

  return (
    <Link
      href={`/player/${mover.player_id}`}
      className="group grid grid-cols-[2rem_1fr_auto] items-center gap-x-4 gap-y-0.5 rounded-xl px-2 py-4 transition hover:bg-surface-muted/90 sm:grid-cols-[2.25rem_1fr_auto] sm:gap-x-5 md:py-[1.125rem]"
    >
      <span className="text-center font-mono text-sm tabular-nums text-muted">{rank}</span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[13px] font-semibold tracking-wide text-accent">
            {mover.ticker}
          </span>
          <TeamBadge abbr={mover.team_abbr} />
        </div>
        <p className="mt-1.5 truncate text-[15px] font-medium leading-snug text-foreground group-hover:text-accent">
          {mover.player_name}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-[15px] font-medium tabular-nums text-foreground">
          <span className="text-muted">$</span>
          {formatUsdNumberOnly(mover.price_after_game)}
        </p>
        <p className={`mt-1 font-mono text-sm font-semibold tabular-nums ${pctClass}`}>
          {formatPct(mover.change_pct)}
        </p>
      </div>
    </Link>
  );
}
