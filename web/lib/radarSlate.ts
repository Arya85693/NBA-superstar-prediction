import { formatOutlookScore } from "./forwardOutlook";
import {
  formatGameTip,
  getUpcomingGames,
  type UpcomingGame,
} from "./nbaSchedule";
import { meetsWatchMinutes } from "./playerMinutes";
import type { MarketRow } from "./types";

export type SlatePlayerHighlight = {
  player_id: number;
  ticker: string;
  player_name: string;
  team_abbr: string;
  outlook_score: number;
  outlook_label: string;
};

export type SlateGame = {
  id: number;
  tip_label: string;
  visitor_abbr: string;
  home_abbr: string;
  highlights: SlatePlayerHighlight[];
};

export type RadarSlate = {
  games: SlateGame[];
};

const MAX_GAMES = 4;
const MAX_PER_TEAM = 2;
const MIN_OUTLOOK = 0.32;

function isEligible(row: MarketRow): boolean {
  return !row.caution_no_play_current_season && meetsWatchMinutes(row);
}

function topForTeam(
  rows: MarketRow[],
  teamAbbr: string,
): SlatePlayerHighlight[] {
  return rows
    .filter((r) => r.team_abbr === teamAbbr && isEligible(r))
    .filter((r) => r.forward_outlook_score >= MIN_OUTLOOK)
    .sort((a, b) => b.forward_outlook_score - a.forward_outlook_score)
    .slice(0, MAX_PER_TEAM)
    .map((r) => ({
      player_id: r.player_id,
      ticker: r.ticker,
      player_name: r.player_name,
      team_abbr: r.team_abbr,
      outlook_score: r.forward_outlook_score,
      outlook_label: formatOutlookScore(r.forward_outlook_score),
    }));
}

function buildGameSlate(game: UpcomingGame, rows: MarketRow[]): SlateGame | null {
  const visitor = topForTeam(rows, game.visitor_abbr);
  const home = topForTeam(rows, game.home_abbr);
  const highlights = [...visitor, ...home].sort(
    (a, b) => b.outlook_score - a.outlook_score,
  );

  if (highlights.length === 0) return null;

  return {
    id: game.id,
    tip_label: formatGameTip(game),
    visitor_abbr: game.visitor_abbr,
    home_abbr: game.home_abbr,
    highlights,
  };
}

/**
 * Match upcoming games to tradable players with strong forward outlook.
 * Returns at most four games that have at least one highlight.
 */
export function buildRadarSlate(
  rows: MarketRow[],
  games: UpcomingGame[],
): RadarSlate {
  const slateGames: SlateGame[] = [];

  for (const game of games) {
    if (slateGames.length >= MAX_GAMES) break;
    const entry = buildGameSlate(game, rows);
    if (entry) slateGames.push(entry);
  }

  return { games: slateGames };
}

export async function getRadarSlate(rows: MarketRow[]): Promise<RadarSlate> {
  const games = await getUpcomingGames();
  return buildRadarSlate(rows, games);
}
