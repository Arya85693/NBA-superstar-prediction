import type { PriceRow } from "./types";

/** Minutes context for the current dataset season (from game logs). */
export type PlayerMinutesProfile = {
  last_game_minutes: number;
  season_avg_minutes: number;
  recent_avg_minutes: number;
  season_games_with_minutes: number;
};

const RECENT_GAMES = 5;

function gameMinutes(row: PriceRow): number {
  const m = row.minutes;
  return typeof m === "number" && Number.isFinite(m) && m > 0 ? m : 0;
}

/**
 * Aggregate minutes for one player in the dataset's latest season.
 * Returns null when there is no playable sample.
 */
export function computePlayerMinutesProfile(
  history: PriceRow[] | undefined,
  currentSeason: string | null,
): PlayerMinutesProfile | null {
  if (!history?.length || !currentSeason) return null;

  const seasonGames = history
    .filter((g) => g.season === currentSeason && gameMinutes(g) > 0)
    .sort((a, b) => {
      const da = a.game_date.localeCompare(b.game_date);
      if (da !== 0) return da;
      return String(a.game_id).localeCompare(String(b.game_id));
    });

  if (seasonGames.length === 0) return null;

  const mins = seasonGames.map(gameMinutes);
  const season_avg_minutes = mins.reduce((a, b) => a + b, 0) / mins.length;
  const recent = seasonGames.slice(-RECENT_GAMES).map(gameMinutes);
  const recent_avg_minutes =
    recent.reduce((a, b) => a + b, 0) / recent.length;
  const last = seasonGames[seasonGames.length - 1]!;

  return {
    last_game_minutes: gameMinutes(last),
    season_avg_minutes,
    recent_avg_minutes,
    season_games_with_minutes: seasonGames.length,
  };
}

/** Minimum sample before we trust season averages. */
export const MIN_SEASON_GAMES = 5;

/** Up next: real rotation path — not deep bench or garbage-time only. */
export const UP_NEXT_MIN_SEASON_AVG = 16;
export const UP_NEXT_MIN_RECENT_AVG = 14;
export const UP_NEXT_MIN_LAST_GAME = 8;

/** Watch: looser, but still needs meaningful run. */
export const WATCH_MIN_SEASON_AVG = 12;
export const WATCH_MIN_RECENT_AVG = 10;
export const WATCH_MIN_LAST_GAME = 6;

type MinutesGate = PlayerMinutesProfile | {
  last_game_minutes: number;
  season_avg_minutes: number;
  recent_avg_minutes: number;
  season_games_with_minutes: number;
};

export function meetsUpNextMinutes(profile: MinutesGate | null): boolean {
  if (!profile) return false;
  if (profile.season_games_with_minutes < MIN_SEASON_GAMES) return false;
  if (profile.season_avg_minutes < UP_NEXT_MIN_SEASON_AVG) return false;
  if (profile.recent_avg_minutes < UP_NEXT_MIN_RECENT_AVG) return false;
  if (profile.last_game_minutes < UP_NEXT_MIN_LAST_GAME) return false;
  return true;
}

export function meetsWatchMinutes(profile: MinutesGate | null): boolean {
  if (!profile) return false;
  if (profile.season_games_with_minutes < MIN_SEASON_GAMES) return false;
  if (profile.season_avg_minutes < WATCH_MIN_SEASON_AVG) return false;
  if (profile.recent_avg_minutes < WATCH_MIN_RECENT_AVG) return false;
  if (profile.last_game_minutes < WATCH_MIN_LAST_GAME) return false;
  return true;
}

export function formatMinutes(n: number): string {
  return Number.isFinite(n) ? n.toFixed(1) : "—";
}
