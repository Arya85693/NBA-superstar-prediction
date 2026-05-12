import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
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

  const ticker = tickerRaw ?? "—";

  const { avg: seasonAvgGmsc, count: seasonGmGames } = seasonGamesGmAvg(
    history,
    quote.season,
  );

  const priorAnchor = quote.prior_season_avg_game_score;
  const seasonLabel = marketMeta.current_dataset_season;
  const cautionNoPlayCurrent = !playedCurrentSeason && Boolean(seasonLabel);
  const cautionTitle = seasonLabel
    ? `No minutes logged in ${seasonLabel} in this dataset — price may reflect prior seasons or projections only.`
    : undefined;

  return (
    <div>
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-zinc-500">
        <Link href="/" className="hover:text-zinc-300">
          Home
        </Link>
        <span aria-hidden className="text-zinc-700">
          /
        </span>
        <Link href="/market" className="hover:text-emerald-400">
          Market
        </Link>
        <span aria-hidden className="text-zinc-700">
          /
        </span>
        <span className="text-zinc-400">{quote.player_name}</span>
      </nav>

      <div className="mb-8 flex flex-col gap-8 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-zinc-500">{quote.team_abbr}</p>
            <span
              className="rounded-md border border-emerald-800/50 bg-emerald-950/40 px-2.5 py-0.5 font-mono text-xs font-semibold tracking-wider text-emerald-400"
              title="Paper market ticker"
            >
              {ticker}
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{quote.player_name}</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Last game {quote.game_date} · Season {quote.season}
          </p>

          <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm leading-relaxed text-zinc-400">
            <p className="text-zinc-300">
              <span className="font-medium text-zinc-200">Price</span> is a{" "}
              <strong>smoothed</strong> value from season IPO, prior-year productivity, and
              game-by-game updates — not “last night only.”{" "}
              <span className="font-medium text-zinc-200">Game score</span> below is{" "}
              <strong>just that last box score</strong>, so a quiet night can sit next to a
              still-high price.
            </p>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
              <div className="text-xs uppercase tracking-wide text-zinc-500">
                Price (model)
              </div>
              <div className="mt-1 flex items-baseline gap-2 font-mono text-2xl text-emerald-400">
                <span>{formatUsd(quote.price_after_game)}</span>
                {cautionNoPlayCurrent && (
                  <span
                    className="text-xl leading-none text-amber-400"
                    title={cautionTitle ?? undefined}
                    aria-label={cautionTitle ?? undefined}
                    role="img"
                  >
                    ⚠️
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs text-zinc-600">
                Smoothed signal — see chart ranges for shape.
              </p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
              <div className="text-xs uppercase tracking-wide text-zinc-500">
                Game score · last game
              </div>
              <div className="mt-1 font-mono text-2xl text-zinc-100">
                {quote.game_score.toFixed(1)}
              </div>
              <p className="mt-2 text-xs text-zinc-600">Single-game Hollinger GmSc.</p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
              <div className="text-xs uppercase tracking-wide text-zinc-500">
                Season avg · game score
              </div>
              <div className="mt-1 font-mono text-2xl text-zinc-100">
                {seasonAvgGmsc != null ? seasonAvgGmsc.toFixed(1) : "—"}
              </div>
              <p className="mt-2 text-xs text-zinc-600">
                {seasonGmGames > 0
                  ? `${seasonGmGames} game${seasonGmGames === 1 ? "" : "s"} in ${quote.season}`
                  : "No games in file for this season"}
              </p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
              <div className="text-xs uppercase tracking-wide text-zinc-500">
                Prior season avg (anchor)
              </div>
              <div className="mt-1 font-mono text-2xl text-zinc-100">
                {typeof priorAnchor === "number" && Number.isFinite(priorAnchor)
                  ? priorAnchor.toFixed(1)
                  : "—"}
              </div>
              <p className="mt-2 text-xs text-zinc-600">
                Mean GmSc in the season before this one (pricing anchor when available).
              </p>
            </div>
          </div>

          <h2 className="mb-4 mt-10 text-sm font-medium uppercase tracking-wide text-zinc-500">
            Price history
          </h2>
          <PlayerChartSection
            history={history}
            marketEndDate={marketMeta.current_dataset_last_game_date}
          />
        </div>

        <div className="w-full shrink-0 lg:w-80 lg:self-start lg:sticky lg:top-20 lg:z-10">
          <TradePanel
            playerId={playerId}
            playerName={quote.player_name}
            price={quote.price_after_game}
            ticker={ticker !== "—" ? ticker : undefined}
          />
        </div>
      </div>
    </div>
  );
}
