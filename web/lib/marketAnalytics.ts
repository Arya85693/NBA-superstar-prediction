import type { MarketRow } from "./types";

/** Moves smaller than this (in %) count as unchanged for breadth. */
const UNCHANGED_EPSILON = 0.005;

const TOP_MOVERS_COUNT = 5;
const TOP_TEAMS_COUNT = 6;

export type MarketMoverSnapshot = {
  player_id: number;
  ticker: string;
  player_name: string;
  team_abbr: string;
  price_after_game: number;
  change_pct: number;
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
  topGainers: MarketMoverSnapshot[];
  topLosers: MarketMoverSnapshot[];
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

function toMover(row: MarketRow): MarketMoverSnapshot | null {
  if (row.change_pct === null || Number.isNaN(row.change_pct)) return null;
  return {
    player_id: row.player_id,
    ticker: row.ticker,
    player_name: row.player_name,
    team_abbr: row.team_abbr,
    price_after_game: row.price_after_game,
    change_pct: row.change_pct,
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
    if (row.change_pct === null || Number.isNaN(row.change_pct)) continue;
    const list = byTeam.get(row.team_abbr) ?? [];
    list.push(row.change_pct);
    byTeam.set(row.team_abbr, list);
  }

  const teams: TeamPerformanceSnapshot[] = [];
  for (const [team_abbr, changes] of byTeam) {
    const sum = changes.reduce((acc, n) => acc + n, 0);
    teams.push({
      team_abbr,
      avgChangePct: sum / changes.length,
      playerCount: rows.filter((r) => r.team_abbr === team_abbr).length,
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

function computePulse(rows: MarketRow[]): MarketPulseMetrics {
  const prices = rows.map((r) => r.price_after_game);
  const movers = rows
    .map(toMover)
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

    const bucket = classifyMove(row.change_pct);
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
  const movers = rows
    .map(toMover)
    .filter((m): m is MarketMoverSnapshot => m !== null);

  const topGainers = [...movers].sort(cmpMoverDesc).slice(0, TOP_MOVERS_COUNT);
  const topLosers = [...movers].sort(cmpMoverAsc).slice(0, TOP_MOVERS_COUNT);

  const teams = aggregateTeams(rows);

  return {
    pulse: computePulse(rows),
    topGainers,
    topLosers,
    topTeams: teams.slice(0, TOP_TEAMS_COUNT),
    bottomTeams: [...teams].reverse().slice(0, TOP_TEAMS_COUNT),
    breadth: computeBreadth(rows),
  };
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
