/**
 * TypeScript port of pipeline/price_engine.py (one-game step) and
 * pipeline/fv_live_state.py (live projection). Pure, no I/O.
 *
 * Parity is pinned by web/tests/liveFairValue.test.mjs against golden values
 * printed by tests/test_fv_live_state.py. If you change a constant or formula in
 * price_engine.py, change it here and regenerate the golden values.
 */

// --- price_engine.py constants ------------------------------------------------
export const ALPHA = 0.3;
const EARLY_GAMES_THRESHOLD = 5;
const EARLY_ALPHA_MULTIPLIER = 0.5;
const SURPRISE_Z_CAP = 2.0;
const SURPRISE_ALPHA_MULT = 0.5;
const SURPRISE_Z_WEIGHT_THRESHOLD = 1.5;
const WEIGHT_TONIGHT_SURPRISE = 0.4;
const PRICE_MIN = 45.0;
const PRICE_MAX = 185.0;
const ROOKIE_IPO_PRICE = PRICE_MIN + 0.12 * (PRICE_MAX - PRICE_MIN);
const WEIGHT_TONIGHT = 0.3;
const WEIGHT_PRIOR_YEAR = 0.35;
const WEIGHT_SEASON_AVG = 0.35;
const GS_MAP_LO = -3.0;
const GS_MAP_HI = 34.0;
const MINUTES_REF = 34.0;
const MIN_MINUTES_FACTOR = 0.22;
const MAX_MINUTES_FACTOR = 1.08;
export const PRICE_FLOOR = 0.0;
export const PRICE_CEILING = PRICE_MAX + 55.0;

// --- fv_live_state.py constants ------------------------------------------------
export const DNP_PROGRESS_THRESHOLD = 0.5;
const REGULATION_MINUTES = 48.0;
const PERIOD_MINUTES = 12.0;

/** Row of public.player_fv_state (see fv_live_state.FvState). */
export type FvState = {
  player_id: number;
  season: string;
  last_game_date: string | null;
  fair_value: number;
  games_in_season: number;
  season_eff_sum: number;
  hist_mean: number;
  hist_std: number;
  hist_n: number;
  prior_eff: number | null;
  prior_conf: number;
  mean_minutes: number;
  gs_per_minute: number;
};

/** The box-score fields Hollinger game score needs. */
export type StatLine = {
  minutes: number;
  points: number;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  oreb: number;
  dreb: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  plusMinus: number;
};

/** game_score.hollinger_game_score */
export function hollingerGameScore(s: StatLine): number {
  const ftMiss = s.fta - s.ftm;
  return (
    s.points +
    0.4 * s.fgm -
    0.7 * s.fga -
    0.4 * ftMiss +
    0.7 * s.oreb +
    0.3 * s.dreb +
    s.stl +
    0.7 * s.ast +
    0.7 * s.blk -
    0.4 * s.pf -
    s.tov
  );
}

function played(minutes: number): boolean {
  return Number.isFinite(minutes) && minutes > 0;
}

export function minutesFactor(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return MIN_MINUTES_FACTOR;
  const r = minutes / MINUTES_REF;
  return Math.max(MIN_MINUTES_FACTOR, Math.min(MAX_MINUTES_FACTOR, r));
}

function effectiveGameScore(gameScore: number, minutes: number): number {
  return gameScore * minutesFactor(minutes);
}

function gameScoreToPrice(gs: number): number {
  if (Number.isNaN(gs)) return ROOKIE_IPO_PRICE;
  const span = GS_MAP_HI - GS_MAP_LO;
  let t = (gs - GS_MAP_LO) / span;
  t = Math.max(0.0, Math.min(1.0, t));
  return PRICE_MIN + t * (PRICE_MAX - PRICE_MIN);
}

function effectiveAlpha(baseAlpha: number, gamesInSeason: number, surpriseZ: number): number {
  const early = gamesInSeason <= EARLY_GAMES_THRESHOLD ? EARLY_ALPHA_MULTIPLIER : 1.0;
  const surpriseBoost = 1.0 + Math.min(Math.abs(surpriseZ), SURPRISE_Z_CAP) * SURPRISE_ALPHA_MULT;
  return baseAlpha * early * surpriseBoost;
}

function smoothingTargetLive(
  gameScore: number,
  minutes: number,
  priorYearMeanGs: number | null,
  seasonToDateMeanGs: number,
  surpriseZ: number,
  priorConfidence: number,
): number {
  const pGame = gameScoreToPrice(effectiveGameScore(gameScore, minutes));
  const pSeason = gameScoreToPrice(seasonToDateMeanGs);
  const wTonight =
    Math.abs(surpriseZ) >= SURPRISE_Z_WEIGHT_THRESHOLD ? WEIGHT_TONIGHT_SURPRISE : WEIGHT_TONIGHT;
  const remainder = 1.0 - wTonight;
  const c = Math.max(0.0, Math.min(1.0, priorConfidence));
  if (priorYearMeanGs == null || Number.isNaN(priorYearMeanGs) || c <= 0.0) {
    return wTonight * pGame + remainder * pSeason;
  }
  const pPrior = gameScoreToPrice(priorYearMeanGs);
  const wPrior = remainder * (WEIGHT_PRIOR_YEAR / (WEIGHT_PRIOR_YEAR + WEIGHT_SEASON_AVG)) * c;
  const wSeason = remainder - wPrior;
  return wTonight * pGame + wPrior * pPrior + wSeason * pSeason;
}

/** fv_live_state.one_step: Fair Value after one more game. */
export function oneStep(state: FvState, gameScore: number, minutes: number, alpha = ALPHA): number {
  if (!played(minutes)) return state.fair_value;
  const eff = effectiveGameScore(gameScore, minutes);
  const surpriseZ = state.hist_n > 0 ? (eff - state.hist_mean) / state.hist_std : 0.0;
  const games = state.games_in_season + 1;
  const seasonAvgEff = (state.season_eff_sum + eff) / games;
  const alphaEff = effectiveAlpha(alpha, games, surpriseZ);
  const target = smoothingTargetLive(
    gameScore,
    minutes,
    state.prior_eff,
    seasonAvgEff,
    surpriseZ,
    state.prior_conf,
  );
  const price = (1.0 - alphaEff) * state.fair_value + alphaEff * target;
  return Math.min(PRICE_CEILING, Math.max(PRICE_FLOOR, price));
}

/** fv_live_state.game_progress */
export function gameProgress(gameState: string, period: number, clockSeconds: number): number {
  if (gameState === "post") return 1.0;
  if (gameState !== "in" || period <= 0) return 0.0;
  if (period > 4) return 1.0;
  const elapsed = (period - 1) * PERIOD_MINUTES + (PERIOD_MINUTES - clockSeconds / 60.0);
  return Math.max(0.0, Math.min(1.0, elapsed / REGULATION_MINUTES));
}

export type LiveFairValue = {
  fairValue: number;
  progress: number;
  projectedMinutes: number;
  projectedGameScore: number;
  fullGameFairValue: number;
};

/** fv_live_state.live_fair_value */
export function liveFairValue(
  state: FvState,
  gameScore: number,
  minutes: number,
  progress: number,
): LiveFairValue {
  const p = Math.max(0.0, Math.min(1.0, progress));
  if (minutes <= 0) {
    return {
      fairValue: state.fair_value,
      progress: p,
      projectedMinutes: 0,
      projectedGameScore: 0,
      fullGameFairValue: state.fair_value,
    };
  }
  const remaining = p >= 1.0 ? 0.0 : Math.max(0.0, state.mean_minutes * (1.0 - p));
  const projMinutes = minutes + remaining;
  const projGs = gameScore + state.gs_per_minute * remaining;
  const full = oneStep(state, projGs, projMinutes);
  return {
    fairValue: state.fair_value + p * (full - state.fair_value),
    progress: p,
    projectedMinutes: projMinutes,
    projectedGameScore: projGs,
    fullGameFairValue: full,
  };
}
