import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { WatchlistButton } from "@/components/engagement/WatchlistButton";
import { MarketRefreshMeta } from "@/components/market/MarketRefreshMeta";
import { PlayerInsightsPanel } from "@/components/player/PlayerInsightsPanel";
import { PlayerChartSection } from "@/components/PlayerChartSection";
import { TradePanel } from "@/components/TradePanel";
import { formatUsd } from "@/lib/format";
import {
  getLatestForPlayer,
  getMarketMeta,
  getPlayerHistory,
  getTickerForPlayer,
  playerPlayedCurrentDatasetSeason,
} from "@/lib/marketData";
import { seasonGamesGmAvg } from "@/lib/playerMetrics";

export const dynamic = "force-dynamic";

const latestForPlayer = cache(getLatestForPlayer);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const playerId = Number(id);
  if (!Number.isFinite(playerId)) return { title: "Player" };
  const quote = await latestForPlayer(playerId);
  if (!quote) return { title: "Player" };
  return { title: quote.player_name };
}

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const playerId = Number(id);
  if (!Number.isFinite(playerId)) notFound();

  const [quote, history, playedCurrentSeason, marketMeta, tickerRaw] =
    await Promise.all([
      latestForPlayer(playerId),
      getPlayerHistory(playerId),
      playerPlayedCurrentDatasetSeason(playerId),
      getMarketMeta(),
      getTickerForPlayer(playerId),
    ]);

  if (!quote) notFound();

  const ticker = tickerRaw ?? "-";

  const { avg: seasonAvgGmsc, count: seasonGmGames } = seasonGamesGmAvg(
    history,
    quote.season,
  );

  const priorAnchor = quote.prior_season_avg_game_score;
  const seasonLabel = marketMeta.current_dataset_season;
  const cautionNoPlayCurrent = !playedCurrentSeason && Boolean(seasonLabel);
  const cautionTitle = seasonLabel
    ? `No minutes logged in ${seasonLabel} in this dataset - price may reflect prior seasons or projections only.`
    : undefined;

  return (
    <div>
      <MarketRefreshMeta meta={marketMeta} variant="compact" className="mb-4" />
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted">
        <Link href="/" className="hover:text-foreground">
          Home
        </Link>
        <span aria-hidden className="text-border-strong">
          /
        </span>
        <Link href="/market" className="hover:text-accent">
          Market
        </Link>
        <span aria-hidden className="text-border-strong">
          /
        </span>
        <span className="text-muted-foreground">{quote.player_name}</span>
      </nav>

      <div className="mb-8 flex flex-col gap-8 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted">{quote.team_abbr}</p>
            <span
              className="hs-team-badge font-mono tracking-wider text-accent"
              title="Short symbol for this listing"
            >
              {ticker}
            </span>
            {ticker !== "-" ? (
              <WatchlistButton
                playerId={playerId}
                playerName={quote.player_name}
                ticker={ticker}
                teamAbbr={quote.team_abbr}
              />
            ) : null}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{quote.player_name}</h1>
          <p className="mt-2 text-sm text-muted">
            Last game {quote.game_date} · Season {quote.season}
          </p>

          <PlayerInsightsPanel
            history={history}
            quote={quote}
            seasonAvgGmsc={seasonAvgGmsc}
          />

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="dash-kpi px-5 py-5">
              <div className="hs-label">
                Price (model)
              </div>
              <div className="mt-1 flex items-baseline gap-2 font-mono text-2xl text-positive">
                <span>{formatUsd(quote.price_after_game)}</span>
                {cautionNoPlayCurrent && (
                  <span
                    className="text-xl leading-none text-warning"
                    title={cautionTitle ?? undefined}
                    aria-label={cautionTitle ?? undefined}
                    role="img"
                  >
                    ⚠️
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs text-muted">
                Smoothed signal - see chart ranges for shape.
              </p>
            </div>

            <div className="dash-kpi px-5 py-5">
              <div className="hs-label">
                Game score · last game
              </div>
              <div className="mt-1 font-mono text-2xl text-foreground">
                {quote.game_score.toFixed(1)}
              </div>
              <p className="mt-2 text-xs text-muted">Single-game Hollinger GmSc.</p>
            </div>

            <div className="dash-kpi px-5 py-5">
              <div className="hs-label">
                Season avg · game score
              </div>
              <div className="mt-1 font-mono text-2xl text-foreground">
                {seasonAvgGmsc != null ? seasonAvgGmsc.toFixed(1) : "-"}
              </div>
              <p className="mt-2 text-xs text-muted">
                {seasonGmGames > 0
                  ? `${seasonGmGames} game${seasonGmGames === 1 ? "" : "s"} in ${quote.season}`
                  : "No games in file for this season"}
              </p>
            </div>

            <div className="dash-kpi px-5 py-5">
              <div className="hs-label">
                Prior season avg (anchor)
              </div>
              <div className="mt-1 font-mono text-2xl text-foreground">
                {typeof priorAnchor === "number" && Number.isFinite(priorAnchor)
                  ? priorAnchor.toFixed(1)
                  : "-"}
              </div>
              <p className="mt-2 text-xs text-muted">
                Mean GmSc in the season before this one (pricing anchor when available).
              </p>
            </div>
          </div>

          <h2 className="mb-4 mt-10 text-sm font-medium uppercase tracking-wide text-muted">
            Price history
          </h2>
          <PlayerChartSection
            history={history}
            marketEndDate={marketMeta.current_dataset_last_game_date}
            marketMeta={marketMeta}
          />
        </div>

        <div className="w-full shrink-0 lg:w-80 lg:self-start lg:sticky lg:top-20 lg:z-10">
          <TradePanel
            playerId={playerId}
            playerName={quote.player_name}
            price={quote.price_after_game}
            ticker={ticker !== "-" ? ticker : undefined}
          />
        </div>
      </div>
    </div>
  );
}
