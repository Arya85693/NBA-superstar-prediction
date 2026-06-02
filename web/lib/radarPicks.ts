import { isRecentGameMover } from "./marketAnalytics";
import {
  meetsUpNextMinutes,
  meetsWatchMinutes,
} from "./playerMinutes";
import type { MarketRow, MarketState } from "./types";

export type RadarPick = {
  player_id: number;
  ticker: string;
  player_name: string;
  team_abbr: string;
  fair_value: number;
  market_price: number;
  premium_pct: number | null;
  projection_score: number | null;
  fair_value_change_pct: number | null;
  change_pct: number | null;
  game_date: string;
  season_avg_minutes: number;
  recent_avg_minutes: number;
  /** Short human label for why they appear on this list */
  reason: string;
  score: number;
};

export type RadarPicks = {
  upNext: RadarPick[];
  watch: RadarPick[];
};

const UP_NEXT_LIMIT = 5;
const WATCH_LIMIT = 5;

/** Top N by fair value treated as established stars — excluded from "up next". */
const ESTABLISHED_STAR_RANK = 15;

const FAIR_VALUE_FLOOR = 52;
const FAIR_VALUE_CEILING = 128;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function normPct(pct: number | null, cap = 12): number {
  if (pct === null || Number.isNaN(pct)) return 0;
  return clamp01(Math.abs(pct) / cap);
}

/** 0–1: rewards rotation-level minutes and rising recent usage. */
function minutesOpportunityScore(row: MarketRow): number {
  const season = clamp01(row.season_avg_minutes / 32);
  const recent = clamp01(row.recent_avg_minutes / 32);
  const trend =
    row.season_avg_minutes > 0
      ? clamp01(
          (row.recent_avg_minutes - row.season_avg_minutes + 6) / 12,
        )
      : 0;
  return 0.45 * season + 0.4 * recent + 0.15 * trend;
}

function latestGameDate(rows: MarketRow[]): string | null {
  let max: string | null = null;
  for (const r of rows) {
    if (r.game_date && (!max || r.game_date > max)) max = r.game_date;
  }
  return max;
}

function fairValueRank(row: MarketRow, rows: MarketRow[]): number {
  const sorted = [...rows].sort((a, b) => b.fair_value - a.fair_value);
  return sorted.findIndex((r) => r.player_id === row.player_id);
}

function isEligibleActive(row: MarketRow): boolean {
  return !row.caution_no_play_current_season;
}

function toPick(
  row: MarketRow,
  score: number,
  reason: string,
  state: MarketState | undefined,
): RadarPick {
  return {
    player_id: row.player_id,
    ticker: row.ticker,
    player_name: row.player_name,
    team_abbr: row.team_abbr,
    fair_value: row.fair_value,
    market_price: row.market_price,
    premium_pct: row.premium_pct,
    projection_score: state ? state.projection_score : null,
    fair_value_change_pct: row.fair_value_change_pct,
    change_pct: row.change_pct,
    game_date: row.game_date,
    season_avg_minutes: row.season_avg_minutes,
    recent_avg_minutes: row.recent_avg_minutes,
    reason,
    score,
  };
}

function buildReason(parts: string[]): string {
  const uniq = [...new Set(parts.filter(Boolean))];
  return uniq.slice(0, 2).join(" · ") || "On our radar";
}

function minutesReason(row: MarketRow): string | null {
  if (row.recent_avg_minutes >= row.season_avg_minutes + 3) {
    return "Minutes trending up";
  }
  if (row.season_avg_minutes >= 22) return "Rotation minutes";
  if (row.season_avg_minutes >= 16) return "Regular minutes";
  return null;
}

function upNextReason(
  row: MarketRow,
  state: MarketState | undefined,
): string {
  const parts: string[] = [];
  const minNote = minutesReason(row);
  if (minNote) parts.push(minNote);
  const proj = state?.projection_score ?? 0;
  if (proj > 0.25) parts.push("Projection trending up");
  else if (proj > 0.1) parts.push("Positive outlook");
  const fv = row.fair_value_change_pct;
  if (fv != null && fv > 1.5) parts.push("Recent fair value gain");
  if (row.fair_value < 95) parts.push("Room to climb the board");
  if (row.premium_pct != null && row.premium_pct > 2) {
    parts.push("Market paying a premium");
  }
  return buildReason(parts);
}

function watchReason(row: MarketRow, state: MarketState | undefined): string {
  const parts: string[] = [];
  const minNote = minutesReason(row);
  if (minNote) parts.push(minNote);
  const proj = state?.projection_score ?? 0;
  const sent = state?.sentiment_score ?? 0;
  if (proj > 0.2) parts.push("Strong projection signal");
  if (sent > 0.15) parts.push("Positive sentiment");
  const fv = row.fair_value_change_pct;
  if (fv != null && Math.abs(fv) > 2) {
    parts.push(fv > 0 ? "Big last-game move" : "Sharp last-game swing");
  }
  const mkt = row.change_pct;
  if (mkt != null && Math.abs(mkt) > 0.5) {
    parts.push("Active market price action");
  }
  if (row.premium_pct != null && row.premium_pct > 4) {
    parts.push("Trading above fair value");
  } else if (row.premium_pct != null && row.premium_pct < -3 && proj > 0) {
    parts.push("Market lagging fundamentals");
  }
  return buildReason(parts);
}

/**
 * Rule-based radar lists from Fair Value + Market Price levers.
 * "Up next" = breakout candidates (not yet top-tier, strong forward signals).
 * "Watch" = momentum, narrative, or unusual market vs fundamentals.
 * Both lists require meaningful minutes — deep bench / low-usage players are excluded.
 */
export function computeRadarPicks(
  rows: MarketRow[],
  states: Map<number, MarketState>,
): RadarPicks {
  const latest = latestGameDate(rows);
  const active = rows.filter(isEligibleActive);

  const upNextScored: RadarPick[] = [];
  for (const row of active) {
    if (!meetsUpNextMinutes(row)) continue;

    const rank = fairValueRank(row, rows);
    if (rank >= 0 && rank < ESTABLISHED_STAR_RANK) continue;
    if (row.fair_value < FAIR_VALUE_FLOOR || row.fair_value > FAIR_VALUE_CEILING) {
      continue;
    }

    const state = states.get(row.player_id);
    const proj = state?.projection_score ?? 0;
    const fvMove = row.fair_value_change_pct ?? 0;
    const recent = latest ? isRecentGameMover(row, latest) : false;
    const minsN = minutesOpportunityScore(row);

    const upside =
      row.fair_value > 0
        ? clamp01((FAIR_VALUE_CEILING - row.fair_value) / (FAIR_VALUE_CEILING - FAIR_VALUE_FLOOR))
        : 0;

    let score =
      0.35 * clamp01((proj + 1) / 2) +
      0.2 * normPct(fvMove > 0 ? fvMove : 0) +
      0.15 * upside +
      0.1 * (recent ? 1 : 0) +
      0.2 * minsN;

    if (!state && fvMove > 0) {
      score =
        0.4 * normPct(fvMove) +
        0.2 * upside +
        0.15 * (recent ? 1 : 0) +
        0.25 * minsN;
    }

    if (score < 0.22) continue;
    upNextScored.push(toPick(row, score, upNextReason(row, state), state));
  }

  upNextScored.sort((a, b) => b.score - a.score || b.fair_value - a.fair_value);

  const watchScored: RadarPick[] = [];
  for (const row of active) {
    if (!meetsWatchMinutes(row)) continue;

    const state = states.get(row.player_id);
    const proj = state?.projection_score ?? 0;
    const sent = state?.sentiment_score ?? 0;
    const fv = row.fair_value_change_pct;
    const mkt = row.change_pct;
    const prem = row.premium_pct ?? 0;
    const recent = latest ? isRecentGameMover(row, latest) : false;
    const minsN = minutesOpportunityScore(row);

    const projN = clamp01((proj + 1) / 2);
    const sentN = clamp01((sent + 1) / 2);
    const fvN = normPct(fv);
    const mktN = normPct(mkt, 3);
    const premN = clamp01(Math.abs(prem) / 8);

    let score =
      0.25 * projN +
      0.15 * sentN +
      0.2 * fvN +
      0.12 * mktN +
      0.08 * premN +
      0.2 * minsN;

    if (recent && fv != null && Math.abs(fv) > 1) score += 0.08;
    if (prem > 3 && proj > 0.1) score += 0.05;

    if (score < 0.28) continue;
    watchScored.push(toPick(row, score, watchReason(row, state), state));
  }

  watchScored.sort((a, b) => b.score - a.score || b.market_price - a.market_price);

  const upNext = upNextScored.slice(0, UP_NEXT_LIMIT);
  const upIds = new Set(upNext.map((p) => p.player_id));

  const watch = watchScored
    .filter((p) => !upIds.has(p.player_id))
    .slice(0, WATCH_LIMIT);

  return { upNext, watch };
}
