import { formatUsd } from "@/lib/format";
import { computeForwardOutlookScore } from "@/lib/forwardOutlook";
import type { MarketMeta, MarketQuote, MarketState, PriceRow } from "@/lib/types";
import type { MarketDailySnapshot } from "@/lib/marketHistory";
import { PlayerAnalyticsCharts } from "@/components/PlayerAnalyticsCharts";
import type { MarketTick } from "@/lib/types";

function pct(n: number): string {
  return `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;
}

function LeverRow({
  label,
  score,
  adjustment,
  hint,
}: {
  label: string;
  score: number;
  adjustment: number;
  hint: string;
}) {
  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className="py-2.5 pr-4 text-sm text-foreground">{label}</td>
      <td className="py-2.5 pr-4 font-mono text-sm tabular-nums text-muted-foreground">
        {score.toFixed(3)}
      </td>
      <td
        className={`py-2.5 pr-4 font-mono text-sm tabular-nums ${
          adjustment > 0
            ? "text-positive"
            : adjustment < 0
              ? "text-negative"
              : "text-muted-foreground"
        }`}
      >
        {pct(adjustment)}
      </td>
      <td className="py-2.5 text-xs text-muted">{hint}</td>
    </tr>
  );
}

export function PlayerResearchPanel({
  history,
  quote,
  marketQuote,
  marketState,
  marketTicks,
  marketDaily,
  marketEndDate,
  marketMeta,
  seasonAvgMinutes,
  recentAvgMinutes,
  seasonGamesWithMinutes,
  lastGameMinutes,
}: {
  history: PriceRow[];
  quote: PriceRow;
  marketQuote: MarketQuote | null;
  marketState: MarketState | null;
  marketTicks: MarketTick[];
  marketDaily: MarketDailySnapshot[];
  marketEndDate?: string | null;
  marketMeta?: MarketMeta;
  seasonAvgMinutes: number;
  recentAvgMinutes: number;
  seasonGamesWithMinutes: number;
  lastGameMinutes: number;
}) {
  const marketPrice =
    marketState?.market_price ?? marketQuote?.market_price ?? quote.price_after_game;
  const fairValue =
    marketState?.fair_value ?? marketQuote?.fair_value ?? quote.price_after_game;
  const premiumPct = marketState?.premium_pct ?? marketQuote?.premium_pct ?? 0;
  const hasMarketLayer = marketQuote?.source === "market" && marketState != null;

  const outlookRow = {
    ...quote,
    fair_value: fairValue,
    market_price: marketPrice,
    premium_pct: premiumPct * 100,
    projection_score: marketState?.projection_score ?? null,
    change_pct:
      marketState?.change_pct != null ? marketState.change_pct * 100 : null,
    season_avg_minutes: seasonAvgMinutes,
    recent_avg_minutes: recentAvgMinutes,
    season_games_with_minutes: seasonGamesWithMinutes,
    last_game_minutes: lastGameMinutes,
    forward_outlook_score: 0,
    ticker: "",
    caution_no_play_current_season: false,
    fair_value_change_pct: null,
  };
  const forwardOutlook = computeForwardOutlookScore(outlookRow);

  return (
    <div className="space-y-10">
      <section className="rounded-2xl border border-border bg-surface-muted/30 px-5 py-6 md:px-7">
        <p className="hs-eyebrow">Research lab</p>
        <h2 className="mt-2 text-lg font-semibold text-charcoal">
          How the model sees this player
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          For learning and analysis — not required for trading. Production (game
          score) feeds Fair Value; Market Price adds premium / discount from
          projection, sentiment, team context, and demand.
        </p>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border/80 bg-surface px-4 py-3">
            <dt className="hs-label">Forward outlook</dt>
            <dd className="mt-1 font-mono text-2xl tabular-nums text-foreground">
              {Math.round(forwardOutlook * 100)}
            </dd>
            <p className="mt-1 text-xs text-muted">
              Short-term improvement tilt (projection + minutes).
            </p>
          </div>
          <div className="rounded-xl border border-border/80 bg-surface px-4 py-3">
            <dt className="hs-label">Projection score</dt>
            <dd className="mt-1 font-mono text-2xl tabular-nums text-foreground">
              {marketState?.projection_score != null
                ? marketState.projection_score.toFixed(3)
                : "—"}
            </dd>
            <p className="mt-1 text-xs text-muted">Form, minutes, age curve.</p>
          </div>
          <div className="rounded-xl border border-border/80 bg-surface px-4 py-3">
            <dt className="hs-label">Premium vs fair</dt>
            <dd
              className={`mt-1 font-mono text-2xl tabular-nums ${
                premiumPct > 0
                  ? "text-positive"
                  : premiumPct < 0
                    ? "text-negative"
                    : "text-foreground"
              }`}
            >
              {premiumPct >= 0 ? "+" : ""}
              {(premiumPct * 100).toFixed(2)}%
            </dd>
            <p className="mt-1 text-xs text-muted">Market − Fair, as % of fair.</p>
          </div>
          <div className="rounded-xl border border-border/80 bg-surface px-4 py-3">
            <dt className="hs-label">Season avg minutes</dt>
            <dd className="mt-1 font-mono text-2xl tabular-nums text-foreground">
              {seasonAvgMinutes > 0 ? seasonAvgMinutes.toFixed(1) : "—"}
            </dd>
            <p className="mt-1 text-xs text-muted">
              Recent {recentAvgMinutes > 0 ? recentAvgMinutes.toFixed(1) : "—"} avg.
            </p>
          </div>
        </dl>
      </section>

      {hasMarketLayer && marketState ? (
        <section className="rounded-2xl border border-border bg-surface px-5 py-6 md:px-7">
          <h3 className="text-sm font-medium uppercase tracking-wide text-muted">
            Market levers (Layer 2)
          </h3>
          <p className="mt-1 mb-4 text-xs text-muted">
            Each lever nudges Market Price as a fraction of Fair Value. Scores run
            from −1 to +1.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <th className="pb-2 pr-4 font-medium">Lever</th>
                  <th className="pb-2 pr-4 font-medium">Score</th>
                  <th className="pb-2 pr-4 font-medium">Price impact</th>
                  <th className="pb-2 font-medium">What it measures</th>
                </tr>
              </thead>
              <tbody>
                <LeverRow
                  label="Projection"
                  score={marketState.projection_score}
                  adjustment={marketState.projection_adjustment}
                  hint="Recent form, minutes trend, age vs position prime."
                />
                <LeverRow
                  label="Sentiment"
                  score={marketState.sentiment_score}
                  adjustment={marketState.sentiment_adjustment}
                  hint="Injuries + news headlines (smoothed)."
                />
                <LeverRow
                  label="Team context"
                  score={marketState.team_context_score}
                  adjustment={marketState.team_context_adjustment}
                  hint="Current-season team win %."
                />
                <LeverRow
                  label="Demand"
                  score={marketState.demand_score}
                  adjustment={marketState.demand_adjustment}
                  hint="Recent user buy/sell flow (capped per account)."
                />
              </tbody>
            </table>
          </div>
          {(marketQuote?.drivers.length ?? 0) > 0 ? (
            <div className="mt-4 rounded-lg border border-border/70 bg-surface-muted/40 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Active drivers
              </p>
              <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                {marketQuote!.drivers.map((d) => (
                  <li key={d}>· {d}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : (
        <p className="rounded-xl border border-border bg-surface-muted/40 px-4 py-3 text-sm text-muted">
          Market lever breakdown appears after the pipeline publishes Layer 2 state
          to Supabase ({formatUsd(fairValue)} fair value shown until then).
        </p>
      )}

      <PlayerAnalyticsCharts
        history={history}
        marketTicks={marketTicks}
        marketDaily={marketDaily}
        marketEndDate={marketEndDate}
        lastGameDate={quote.game_date}
        currentMarket={{
          marketPrice,
          fairValue,
          recordedAt: marketMeta?.market_updated_at ?? null,
        }}
        marketMeta={marketMeta}
      />

      <section className="rounded-2xl border border-border bg-surface-muted/30 px-5 py-6 md:px-7">
        <h3 className="text-sm font-medium uppercase tracking-wide text-muted">
          Reading the two charts
        </h3>
        <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Production → Fair Value:</span>{" "}
            Big game score nights usually pull Fair Value up on the next step — like
            earnings moving intrinsic value.
          </li>
          <li>
            <span className="font-medium text-foreground">Fair Value → Market Price:</span>{" "}
            Market can trade above or below fair when projection, age, news, or
            demand lean bullish or bearish.
          </li>
          <li>
            <span className="font-medium text-foreground">Outlook vs rank:</span> The
            market board sorts by Market Price, not Outlook. A hotter premium can rank
            a player above someone with higher fair value or outlook.
          </li>
        </ul>
      </section>
    </div>
  );
}
