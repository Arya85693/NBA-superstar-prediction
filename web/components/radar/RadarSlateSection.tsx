import Link from "next/link";
import type { RadarSlate, SlateGame } from "@/lib/radarSlate";

function SlateGameRow({ game }: { game: SlateGame }) {
  return (
    <li className="flex flex-col gap-2 border-b border-border/50 py-3 last:border-0 last:pb-0 first:pt-0 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 shrink-0 items-baseline gap-2 sm:w-[11.5rem] sm:flex-col sm:items-start sm:gap-0.5">
        <span className="font-mono text-[13px] font-semibold tracking-wide text-foreground">
          {game.visitor_abbr} @ {game.home_abbr}
        </span>
        <span className="text-[11px] text-muted-foreground">{game.tip_label}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
        {game.highlights.map((h) => (
          <Link
            key={h.player_id}
            href={`/player/${h.player_id}`}
            className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border/70 bg-surface-muted/60 px-2 py-1 text-[11px] transition hover:border-accent/40 hover:bg-surface-muted"
            title={`${h.player_name} · forward outlook ${h.outlook_label}`}
          >
            <span className="font-mono font-semibold text-accent">{h.ticker}</span>
            <span className="truncate text-muted-foreground">{h.team_abbr}</span>
            <span className="font-mono tabular-nums text-foreground">{h.outlook_label}</span>
          </Link>
        ))}
      </div>
    </li>
  );
}

export function RadarSlateSection({ slate }: { slate: RadarSlate }) {
  if (slate.games.length === 0) return null;

  return (
    <section className="mb-8" aria-labelledby="radar-slate-heading">
      <div className="rounded-xl border border-border/70 bg-surface/80 px-4 py-4 md:px-5 md:py-5">
        <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2
              id="radar-slate-heading"
              className="text-sm font-semibold tracking-tight text-charcoal"
            >
              Upcoming slate
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Next {slate.games.length} games · players to watch by forward outlook
            </p>
          </div>
        </header>
        <ul>
          {slate.games.map((g) => (
            <SlateGameRow key={g.id} game={g} />
          ))}
        </ul>
        <p className="mt-3 text-[10px] leading-snug text-muted">
          Outlook scores reflect expected player performance vs baseline — not game
          winners.
        </p>
      </div>
    </section>
  );
}
