import {
  buildPlayerInsights,
  momentumLabel,
  type PlayerMomentum,
} from "@/lib/playerInsights";
import type { PriceRow } from "@/lib/types";

const momentumStyles: Record<PlayerMomentum, string> = {
  heating: "border-positive/30 bg-positive-muted/40 text-positive",
  cooling: "border-negative/25 bg-negative-muted/35 text-negative",
  steady: "border-border bg-surface-muted/50 text-muted-foreground",
  unknown: "border-border bg-surface-muted/40 text-muted",
};

export function PlayerInsightsPanel({
  history,
  quote,
  seasonAvgGmsc,
}: {
  history: PriceRow[];
  quote: PriceRow;
  seasonAvgGmsc: number | null;
}) {
  const insights = buildPlayerInsights(history, quote, seasonAvgGmsc);

  return (
    <section
      className="mt-8 rounded-2xl border border-border bg-surface-muted/30 px-5 py-6 md:px-7"
      aria-labelledby="player-insights-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="hs-eyebrow">What happened & why it matters</p>
          <h2 id="player-insights-heading" className="mt-2 text-lg font-semibold text-charcoal">
            Player insight
          </h2>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${momentumStyles[insights.momentum]}`}
        >
          {momentumLabel(insights.momentum)}
        </span>
      </div>

      <p className="mt-4 text-[15px] leading-relaxed text-foreground">{insights.headline}</p>

      <ul className="mt-4 space-y-2.5">
        {insights.bullets.map((b) => (
          <li key={b} className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent/70" aria-hidden />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <p className="mt-5 text-xs text-muted">
        <strong className="font-medium text-muted-foreground">What to do next:</strong>{" "}
        Compare the chart to season averages, add to your watchlist on the portfolio page to
        track the next refresh, or paper trade from the panel on the right.
      </p>
    </section>
  );
}
