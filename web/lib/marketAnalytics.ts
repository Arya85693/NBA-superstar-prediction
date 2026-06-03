import type { MarketRow } from "./types";

/** Moves smaller than this (in %) count as unchanged for breadth. */
const UNCHANGED_EPSILON = 0.005;

const TOP_MOVERS_COUNT = 5;
const TOP_TEAMS_COUNT = 6;

/**
 * Only rank movers whose last ingested game is within this many calendar days of
 * the newest game in the dataset. Excludes eliminated / idle players whose
 * "last game" move is stale even if the % looks huge.
 */
export const RECENT_MOVER_MAX_AGE_DAYS = 14;

export type MoverMetricKind = "market_cycle" | "forward_outlook";

export type MarketMoverSnapshot = {
  player_id: number;
  ticker: string;
  player_name: string;
  team_abbr: string;
  price_after_game: number;
  /** Date of the ingested game that produced this move. */
  game_date: string;
  /** Sort/display metric — market % or outlook score×100. */
  change_pct: number;
  metric_kind: MoverMetricKind;
  /** 0–1 when metric_kind is forward_outlook. */
  outlook_score?: number;
};

export type MarketPulseMetrics = {
  totalMarketCap: number;
  medianPrice: number;
  gainersPct: number;
  losersPct: number;
  avgAbsMovePct: number;
  hottest: MarketMoverSnapshot | null;
  coldest: MarketMoverSnapshot | null;
};

export type TeamPerformanceSnapshot = {
  team_abbr: string;
  avgChangePct: number;
  playerCount: number;
  withMoveCount: number;
};

export type MarketBreadthStats = {
  advancing: number;
  declining: number;
  unchanged: number;
  activeThisSeason: number;
  cautionFlagged: number;
  totalListings: number;
  withChangeData: number;
};

export type MarketAnalytics = {
  pulse: MarketPulseMetrics;
  /** Largest Market Price moves since the prior pipeline cycle (~30 min). */
  topGainers: MarketMoverSnapshot[];
  topLosers: MarketMoverSnapshot[];
  /** Highest forward-improvement outlook (projection + minutes; backtest-aligned). */
  topOutlookRisers: MarketMoverSnapshot[];
  topTeams: TeamPerformanceSnapshot[];
  bottomTeams: TeamPerformanceSnapshot[];
  breadth: MarketBreadthStats;
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function marketChangePct(row: MarketRow): number | null {
  const v = row.change_pct;
  if (v === null || Number.isNaN(v)) return null;
  return v;
}

function fairValueGameChangePct(row: MarketRow): number | null {
  const v = row.fair_value_change_pct;
  if (v === null || Number.isNaN(v)) return null;
  return v;
}

function maxGameDateInRows(rows: MarketRow[]): string | null {
  let max: string | null = null;
  for (const r of rows) {
    if (r.game_date && (!max || r.game_date > max)) max = r.game_date;
  }
  return max;
}

function gameAgeDays(gameDate: string, latestGameDate: string): number | null {
  const d = new Date(`${gameDate}T12:00:00Z`).getTime();
  const l = new Date(`${latestGameDate}T12:00:00Z`).getTime();
  if (!Number.isFinite(d) || !Number.isFinite(l)) return null;
  return (l - d) / 86_400_000;
}

/** True when the player's latest ingested game is recent enough to rank as a mover. */
export function isRecentGameMover(
  row: MarketRow,
  latestGameDate: string | null,
): boolean {
  if (!latestGameDate || !row.game_date) return false;
  if (row.caution_no_play_current_season) return false;
  const age = gameAgeDays(row.game_date, latestGameDate);
  if (age === null || age < 0) return false;
  return age <= RECENT_MOVER_MAX_AGE_DAYS;
}

function recentMoverRows(rows: MarketRow[]): MarketRow[] {
  const latest = maxGameDateInRows(rows);
  if (!latest) return [];
  return rows.filter((r) => isRecentGameMover(r, latest));
}

function baseMover(row: MarketRow): Omit<MarketMoverSnapshot, "change_pct" | "metric_kind"> {
  return {
    player_id: row.player_id,
    ticker: row.ticker,
    player_name: row.player_name,
    team_abbr: row.team_abbr,
    price_after_game: row.price_after_game,
    game_date: row.game_date,
  };
}

function toMarketCycleMover(row: MarketRow): MarketMoverSnapshot | null {
  const change = marketChangePct(row);
  if (change === null) return null;
  return {
    ...baseMover(row),
    change_pct: change,
    metric_kind: "market_cycle",
  };
}

function toOutlookMover(row: MarketRow): MarketMoverSnapshot {
  const score = row.forward_outlook_score;
  return {
    ...baseMover(row),
    change_pct: score * 100,
    metric_kind: "forward_outlook",
    outlook_score: score,
  };
}

function cmpMoverDesc(a: MarketMoverSnapshot, b: MarketMoverSnapshot): number {
  if (b.change_pct !== a.change_pct) return b.change_pct - a.change_pct;
  if (b.price_after_game !== a.price_after_game) {
    return b.price_after_game - a.price_after_game;
  }
  return a.player_name.localeCompare(b.player_name);
}

function cmpMoverAsc(a: MarketMoverSnapshot, b: MarketMoverSnapshot): number {
  if (a.change_pct !== b.change_pct) return a.change_pct - b.change_pct;
  if (b.price_after_game !== a.price_after_game) {
    return b.price_after_game - a.price_after_game;
  }
  return a.player_name.localeCompare(b.player_name);
}

function classifyMove(changePct: number | null): "up" | "down" | "flat" | "unknown" {
  if (changePct === null || Number.isNaN(changePct)) return "unknown";
  if (changePct > UNCHANGED_EPSILON) return "up";
  if (changePct < -UNCHANGED_EPSILON) return "down";
  return "flat";
}

function aggregateTeams(rows: MarketRow[]): TeamPerformanceSnapshot[] {
  const byTeam = new Map<string, number[]>();
  for (const row of rows) {
    const change = marketChangePct(row) ?? fairValueGameChangePct(row);
    if (change === null) continue;
    const list = byTeam.get(row.team_abbr) ?? [];
    list.push(change);
    byTeam.set(row.team_abbr, list);
  }

  const teams: TeamPerformanceSnapshot[] = [];
  for (const [team_abbr, changes] of byTeam) {
    const avgChangePct =
      changes.reduce((acc, n) => acc + n, 0) / changes.length;
    teams.push({
      team_abbr,
      avgChangePct,
      playerCount: changes.length,
      withMoveCount: changes.length,
    });
  }

  teams.sort((a, b) => {
    if (b.avgChangePct !== a.avgChangePct) return b.avgChangePct - a.avgChangePct;
    if (b.withMoveCount !== a.withMoveCount) return b.withMoveCount - a.withMoveCount;
    return a.team_abbr.localeCompare(b.team_abbr);
  });

  return teams;
}

function computePulse(allRows: MarketRow[], recentRows: MarketRow[]): MarketPulseMetrics {
  const prices = allRows.map((r) => r.price_after_game);
  const movers = recentRows
    .map(toMarketCycleMover)
    .filter((m): m is MarketMoverSnapshot => m !== null);

  const withMove = movers.length;
  const gainers = movers.filter((m) => m.change_pct > UNCHANGED_EPSILON).length;
  const losers = movers.filter((m) => m.change_pct < -UNCHANGED_EPSILON).length;

  const absMoves = movers.map((m) => Math.abs(m.change_pct));
  const avgAbsMovePct =
    absMoves.length > 0
      ? absMoves.reduce((acc, n) => acc + n, 0) / absMoves.length
      : 0;

  const sortedDesc = [...movers].sort(cmpMoverDesc);
  const sortedAsc = [...movers].sort(cmpMoverAsc);

  return {
    totalMarketCap: prices.reduce((acc, n) => acc + n, 0),
    medianPrice: median(prices),
    gainersPct: withMove > 0 ? (gainers / withMove) * 100 : 0,
    losersPct: withMove > 0 ? (losers / withMove) * 100 : 0,
    avgAbsMovePct,
    hottest: sortedDesc[0] ?? null,
    coldest: sortedAsc[0] ?? null,
  };
}

function computeBreadth(rows: MarketRow[]): MarketBreadthStats {
  let advancing = 0;
  let declining = 0;
  let unchanged = 0;
  let withChangeData = 0;
  let activeThisSeason = 0;
  let cautionFlagged = 0;

  for (const row of rows) {
    if (row.caution_no_play_current_season) cautionFlagged += 1;
    else activeThisSeason += 1;

    const bucket = classifyMove(marketChangePct(row) ?? fairValueGameChangePct(row));
    if (bucket === "unknown") continue;
    withChangeData += 1;
    if (bucket === "up") advancing += 1;
    else if (bucket === "down") declining += 1;
    else unchanged += 1;
  }

  return {
    advancing,
    declining,
    unchanged,
    activeThisSeason,
    cautionFlagged,
    totalListings: rows.length,
    withChangeData,
  };
}

/** Derive dashboard analytics from a market board snapshot (pure, memoize at call site). */
export function computeMarketAnalytics(rows: MarketRow[]): MarketAnalytics {
  const recentRows = recentMoverRows(rows);

  const marketMovers = recentRows
    .map(toMarketCycleMover)
    .filter((m): m is MarketMoverSnapshot => m !== null);

  const topGainers = [...marketMovers].sort(cmpMoverDesc).slice(0, TOP_MOVERS_COUNT);
  const topLosers = [...marketMovers].sort(cmpMoverAsc).slice(0, TOP_MOVERS_COUNT);

  const outlookMovers = recentRows
    .filter((r) => r.projection_score != null && r.forward_outlook_score >= 0.35)
    .map(toOutlookMover);

  const topOutlookRisers = [...outlookMovers]
    .sort(cmpMoverDesc)
    .slice(0, TOP_MOVERS_COUNT);

  const teams = aggregateTeams(recentRows);

  return {
    pulse: computePulse(rows, recentRows),
    topGainers,
    topLosers,
    topOutlookRisers,
    topTeams: teams.slice(0, TOP_TEAMS_COUNT),
    bottomTeams: [...teams].reverse().slice(0, TOP_TEAMS_COUNT),
    breadth: computeBreadth(recentRows),
  };
}

export function formatMoverMetric(mover: MarketMoverSnapshot): string {
  if (mover.metric_kind === "forward_outlook") {
    const n = Math.round((mover.outlook_score ?? 0) * 100);
    return `Outlook ${n}`;
  }
  return formatPct(mover.change_pct);
}

export function formatRelativeUpdated(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "unknown";
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "just now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatPct(n: number | null, opts?: { signed?: boolean }): string {
  if (n === null || Number.isNaN(n)) return "-";
  const sign = opts?.signed !== false && n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}
