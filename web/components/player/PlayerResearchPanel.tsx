import { formatUsd } from "@/lib/format";
import { computeForwardOutlookScore } from "@/lib/forwardOutlook";
import type { MarketMeta, MarketQuote, MarketState, PriceRow } from "@/lib/types";
import type { MarketDailySnapshot } from "@/lib/marketHistory";
import { PlayerAnalyticsCharts } from "@/components/PlayerAnalyticsCharts";
import type { MarketTick } from "@/lib/types";

function pct(n: number): string {
  return `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;
}

function scoreTone(score: number): string {
  if (score > 0.05) return "text-positive";
  if (score < -0.05) return "text-negative";
  return "text-muted-foreground";
}

function MetricCard({
  label,
  value,
  hint,
  tone = "text-foreground",
  featured = false,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: string;
  featured?: boolean;
}) {
  return (
    <div className={featured ? "dash-kpi-featured px-5 py-5" : "dash-kpi px-5 py-5"}>
      <dt className="hs-label">{label}</dt>
      <dd className={`mt-2 font-mono text-2xl tabular-nums tracking-tight ${tone}`}>
        {value}
      </dd>
      <p className="mt-2 text-xs leading-relaxed text-muted">{hint}</p>
    </div>
  );
}

function LeverCard({
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
  const clamped = Math.max(-1, Math.min(1, score));
  const magnitude = Math.abs(clamped) * 50;
  const barTone =
    score > 0.05
      ? "bg-positive"
      : score < -0.05
        ? "bg-negative"
        : "bg-muted-foreground/40";

  return (
    <article className="dash-kpi px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-foreground">{label}</h4>
          <p className="mt-1 text-xs leading-relaxed text-muted">{hint}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-0.5 font-mono text-xs tabular-nums ${
              adjustment > 0
                ? "border-positive/25 bg-positive-muted/50 text-positive"
                : adjustment < 0
                  ? "border-negative/25 bg-negative-muted/45 text-negative"
                  : "border-border bg-surface-muted text-muted-foreground"
            }`}
          >
            {pct(adjustment)}
          </span>
          <span className={`font-mono text-sm tabular-nums ${scoreTone(score)}`}>
            {score.toFixed(3)}
          </span>
        </div>
      </div>

      <div
        className="relative mt-4 h-2 overflow-hidden rounded-full bg-surface-muted"
        role="img"
        aria-label={`${label} score ${score.toFixed(2)}`}
      >
        <span
          className="absolute top-0 bottom-0 left-1/2 w-px bg-border-strong"
          aria-hidden
        />
        <span
          className={`absolute top-0 bottom-0 rounded-full ${barTone}`}
          style={
            clamped >= 0
              ? { left: "50%", width: `${magnitude}%` }
              : { right: "50%", width: `${magnitude}%` }
          }
        />
      </div>
    </article>
  );
}

const FLOW_STEPS = [
  {
    step: "1",
    title: "Production",
    body: "Game score each night",
  },
  {
    step: "2",
    title: "Fair Value",
    body: "Stats-based fundamental price",
  },
  {
    step: "3",
    title: "Market Price",
    body: "Tradable quote + premium",
  },
] as const;

const READING_TIPS = [
  {
    title: "Production → Fair Value",
    body: "Big game score nights usually pull Fair Value up on the next step — like earnings moving intrinsic value.",
  },
  {
    title: "Fair Value → Market Price",
    body: "Market can trade above or below fair when projection, age, news, or demand lean bullish or bearish.",
  },
  {
    title: "Outlook vs rank",
    body: "The market board sorts by Market Price, not Outlook. A hotter premium can rank a player above someone with higher fair value.",
  },
] as const;

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
  const outlookPct = Math.round(forwardOutlook * 100);

  const premiumTone =
    premiumPct > 0
      ? "text-positive"
      : premiumPct < 0
        ? "text-negative"
        : "text-foreground";

  return (
    <div className="space-y-8">
      <section
        className="overflow-hidden rounded-2xl border border-border bg-surface-muted/30"
        aria-labelledby="research-hero-heading"
      >
        <div className="border-b border-border/80 bg-surface/60 px-5 py-6 md:px-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-xl">
              <p className="hs-eyebrow">Research lab</p>
              <h2
                id="research-hero-heading"
                className="mt-2 text-xl font-semibold tracking-tight text-charcoal"
              >
                Model breakdown
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Deep dive for your own analysis — not required for trading. See how
                production builds fair value, then how levers shape the tradable price.
              </p>
            </div>
            <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground">
              For learning only
            </span>
          </div>

          <ol className="mt-6 grid gap-3 sm:grid-cols-3">
            {FLOW_STEPS.map((item, index) => (
              <li
                key={item.step}
                className="relative flex items-center gap-3 rounded-xl border border-border/80 bg-surface px-4 py-3"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 font-mono text-sm font-semibold text-accent">
                  {item.step}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{item.title}</p>
                  <p className="text-xs text-muted">{item.body}</p>
                </div>
                {index < FLOW_STEPS.length - 1 ? (
                  <span
                    className="pointer-events-none absolute -right-2 top-1/2 hidden -translate-y-1/2 text-muted sm:block"
                    aria-hidden
                  >
                    →
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>

        <dl className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4 md:p-7">
          <MetricCard
            label="Forward outlook"
            value={String(outlookPct)}
            hint="Short-term improvement tilt from projection and minutes."
            featured
          />
          <MetricCard
            label="Projection score"
            value={
              marketState?.projection_score != null
                ? marketState.projection_score.toFixed(3)
                : "—"
            }
            hint="Form, minutes trend, and age vs position prime."
          />
          <MetricCard
            label="Premium vs fair"
            value={`${premiumPct >= 0 ? "+" : ""}${(premiumPct * 100).toFixed(2)}%`}
            hint="Market price minus fair value, as % of fair."
            tone={premiumTone}
          />
          <MetricCard
            label="Minutes profile"
            value={seasonAvgMinutes > 0 ? seasonAvgMinutes.toFixed(1) : "—"}
            hint={`Season avg · last 5 games ${recentAvgMinutes > 0 ? recentAvgMinutes.toFixed(1) : "—"} · ${seasonGamesWithMinutes} logged`}
          />
        </dl>

        <div className="border-t border-border/80 px-5 py-4 md:px-7">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
            <span>
              Last game {quote.game_date} · GmSc {quote.game_score.toFixed(1)}
            </span>
            <span className="font-mono tabular-nums text-muted-foreground">
              {formatUsd(fairValue)} fair · {formatUsd(marketPrice)} market
            </span>
          </div>
          <div
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-muted"
            role="img"
            aria-label={`Forward outlook ${outlookPct} out of 100`}
          >
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${outlookPct}%` }}
            />
          </div>
        </div>
      </section>

      {hasMarketLayer && marketState ? (
        <section
          className="rounded-2xl border border-border bg-surface-muted/30 px-5 py-6 md:px-7"
          aria-labelledby="research-levers-heading"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="hs-eyebrow">Layer 2</p>
              <h3
                id="research-levers-heading"
                className="mt-2 text-lg font-semibold text-charcoal"
              >
                Market levers
              </h3>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Each lever nudges market price as a fraction of fair value. Scores run
                from −1 (bearish) to +1 (bullish).
              </p>
            </div>
            <p className="font-mono text-sm tabular-nums text-muted-foreground">
              Net premium{" "}
              <span className={premiumTone}>
                {premiumPct >= 0 ? "+" : ""}
                {(premiumPct * 100).toFixed(2)}%
              </span>
            </p>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <LeverCard
              label="Projection"
              score={marketState.projection_score}
              adjustment={marketState.projection_adjustment}
              hint="Recent form, minutes trend, age vs position prime."
            />
            <LeverCard
              label="Sentiment"
              score={marketState.sentiment_score}
              adjustment={marketState.sentiment_adjustment}
              hint="Injuries and news headlines, smoothed over time."
            />
            <LeverCard
              label="Team context"
              score={marketState.team_context_score}
              adjustment={marketState.team_context_adjustment}
              hint="Current-season team win percentage."
            />
            <LeverCard
              label="Demand"
              score={marketState.demand_score}
              adjustment={marketState.demand_adjustment}
              hint="Recent user buy/sell flow, capped per account."
            />
          </div>

          {(marketQuote?.drivers.length ?? 0) > 0 ? (
            <div className="mt-6 rounded-xl border border-border/80 bg-surface px-4 py-4 md:px-5">
              <p className="hs-label">Active drivers</p>
              <ul className="mt-3 space-y-2.5">
                {marketQuote!.drivers.map((d) => (
                  <li
                    key={d}
                    className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground"
                  >
                    <span
                      className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent/70"
                      aria-hidden
                    />
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-border-strong bg-surface-muted/25 px-5 py-8 text-center md:px-7">
          <p className="hs-eyebrow">Layer 2 pending</p>
          <p className="mt-2 text-sm font-medium text-foreground">
            Lever breakdown unlocks after the pipeline publishes market state
          </p>
          <p className="mt-2 text-sm text-muted">
            Fair value is live at {formatUsd(fairValue)}. Market levers appear once
            Supabase has the latest Layer 2 snapshot.
          </p>
        </section>
      )}

      <section
        className="rounded-2xl border border-border bg-surface-muted/30 px-5 py-6 md:px-7"
        aria-labelledby="research-charts-heading"
      >
        <p className="hs-eyebrow">Visual analysis</p>
        <h3
          id="research-charts-heading"
          className="mt-2 text-lg font-semibold text-charcoal"
        >
          Production and pricing charts
        </h3>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Game-night spikes in the first chart; market vs fair divergence in the second.
        </p>
        <div className="mt-6">
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
            embedded
          />
        </div>
      </section>

      <section
        className="rounded-2xl border border-border bg-surface-muted/30 px-5 py-6 md:px-7"
        aria-labelledby="research-guide-heading"
      >
        <p className="hs-eyebrow">Quick reference</p>
        <h3
          id="research-guide-heading"
          className="mt-2 text-lg font-semibold text-charcoal"
        >
          How to read these charts
        </h3>
        <ul className="mt-5 grid gap-4 md:grid-cols-3">
          {READING_TIPS.map((tip, index) => (
            <li
              key={tip.title}
              className="dash-kpi flex h-full flex-col px-4 py-4 sm:px-5"
            >
              <span className="font-mono text-xs font-semibold text-accent">
                {String(index + 1).padStart(2, "0")}
              </span>
              <p className="mt-2 text-sm font-semibold text-foreground">{tip.title}</p>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                {tip.body}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
