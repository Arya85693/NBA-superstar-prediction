import fs from "fs";
import { parse } from "csv-parse";
import { activePlayersCsvPath, pricesCsvPath } from "./paths";
import { assignPlayerTickers } from "./playerTicker";
import type { MarketMeta, MarketRow, PriceRow } from "./types";

function parseNum(v: string | undefined, fallback = 0): number {
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseOptionalNum(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Load active player IDs from CSV */
export function loadActivePlayerIds(): Set<number> {
  const p = activePlayersCsvPath();
  if (!fs.existsSync(p)) return new Set();
  const text = fs.readFileSync(p, "utf-8");
  const rows = text
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const [id] = line.split(",");
      return parseNum(id, NaN);
    })
    .filter((id) => Number.isFinite(id));
  return new Set(rows);
}

function rowKeyDateGame(row: PriceRow): number {
  const t = new Date(row.game_date).getTime();
  return t * 1e15 + Number(row.game_id);
}

/** NBA season string "2025-26" → start year for ordering */
export function seasonStartYear(season: string): number {
  const y = Number(String(season).split("-")[0]);
  return Number.isFinite(y) ? y : -1;
}

export type PricesBundle = {
  latest: Map<number, PriceRow>;
  prior: Map<number, PriceRow>;
  maxSeason: string | null;
  playedIds: Set<number>;
  /** All game rows per player — filled in the same CSV pass as latest/prior */
  histories: Map<number, PriceRow[]>;
  /** Active-roster tickers — same rules as the market table, computed once per bundle */
  tickers: Map<number, string>;
};

let bundleCache: { mtimeMs: number; bundle: PricesBundle } | null = null;

function parseRow(r: Record<string, string>): PriceRow {
  return {
    player_id: parseNum(r.player_id),
    player_name: String(r.player_name ?? ""),
    team_abbr: String(r.team_abbr ?? ""),
    game_id: String(r.game_id ?? ""),
    game_date: String(r.game_date ?? ""),
    season: String(r.season ?? ""),
    game_score: parseNum(r.game_score),
    price_after_game: parseNum(r.price_after_game),
    prior_season_avg_game_score: parseOptionalNum(
      r.prior_season_avg_game_score,
    ),
  };
}

/**
 * Single streaming pass over player_game_prices.csv (~200k rows):
 * latest + prior row per player, full per-player history, newest season string,
 * who played (minutes > 0) that season, and active-roster tickers.
 * Cached until file mtime changes.
 */
export async function loadPricesBundle(): Promise<PricesBundle> {
  const path = pricesCsvPath();
  if (!fs.existsSync(path)) {
    throw new Error(`Missing ${path}. Run: python pipeline/run_pipeline.py`);
  }

  const st = fs.statSync(path);
  if (bundleCache?.mtimeMs === st.mtimeMs) {
    return bundleCache.bundle;
  }

  const latest = new Map<number, PriceRow>();
  const prior = new Map<number, PriceRow>();
  const histories = new Map<number, PriceRow[]>();

  let blockPid: number | null = null;
  let prevInBlock: PriceRow | null = null;
  let lastInBlock: PriceRow | null = null;

  const flushBlock = () => {
    if (blockPid !== null && lastInBlock) {
      latest.set(blockPid, lastInBlock);
      if (prevInBlock) prior.set(blockPid, prevInBlock);
    }
  };

  const playersBySeason = new Map<string, Set<number>>();
  let maxSeason: string | null = null;
  let maxY = -1;

  await new Promise<void>((resolve, reject) => {
    const parser = fs
      .createReadStream(path)
      .pipe(
        parse({
          columns: true,
          relax_column_count: true,
          relax_quotes: true,
          skip_empty_lines: true,
        }),
      );

    parser.on("data", (r: Record<string, string>) => {
      const row = parseRow(r);
      const sea = String(r.season ?? "");

      if (sea) {
        const y = seasonStartYear(sea);
        if (y > maxY) {
          maxY = y;
          maxSeason = sea;
        }
      }

      const mins = parseNum(r.minutes);
      if (mins > 0 && sea && row.player_id) {
        let set = playersBySeason.get(sea);
        if (!set) {
          set = new Set();
          playersBySeason.set(sea, set);
        }
        set.add(row.player_id);
      }

      if (!row.player_id) return;

      let list = histories.get(row.player_id);
      if (!list) {
        list = [];
        histories.set(row.player_id, list);
      }
      list.push(row);

      if (blockPid !== row.player_id) {
        flushBlock();
        blockPid = row.player_id;
        prevInBlock = null;
        lastInBlock = row;
        return;
      }
      prevInBlock = lastInBlock;
      lastInBlock = row;
    });
    parser.on("end", () => {
      flushBlock();
      resolve();
    });
    parser.on("error", (e) => reject(e));
  });

  const playedIds =
    maxSeason != null
      ? (playersBySeason.get(maxSeason) ?? new Set<number>())
      : new Set<number>();

  const active = loadActivePlayerIds();
  const minimalForTickers: { player_id: number; player_name: string }[] = [];
  for (const id of active) {
    const row = latest.get(id);
    if (!row) continue;
    minimalForTickers.push({ player_id: id, player_name: row.player_name });
  }
  const tickers = assignPlayerTickers(minimalForTickers);

  const bundle: PricesBundle = {
    latest,
    prior,
    maxSeason,
    playedIds,
    histories,
    tickers,
  };
  bundleCache = { mtimeMs: st.mtimeMs, bundle };
  return bundle;
}

/**
 * Newest season string in the prices file, and who has logged minutes > 0 in that season.
 */
export async function getCurrentSeasonPlaySnapshot(): Promise<{
  maxSeason: string | null;
  playedIds: Set<number>;
}> {
  try {
    const b = await loadPricesBundle();
    return { maxSeason: b.maxSeason, playedIds: b.playedIds };
  } catch {
    return { maxSeason: null, playedIds: new Set() };
  }
}

export async function getMarketMeta(): Promise<MarketMeta> {
  const { maxSeason } = await getCurrentSeasonPlaySnapshot();
  return { current_dataset_season: maxSeason };
}

/** Whether this player has any game with minutes > 0 in the dataset's newest season */
export async function playerPlayedCurrentDatasetSeason(
  playerId: number,
): Promise<boolean> {
  const { maxSeason, playedIds } = await getCurrentSeasonPlaySnapshot();
  if (!maxSeason) return true;
  return playedIds.has(playerId);
}

/**
 * Latest row per player (optionally restricted to active roster CSV).
 */
export async function loadLatestQuotes(
  activeOnly: boolean,
): Promise<Map<number, PriceRow>> {
  const { latest } = await loadPricesBundle();
  if (!activeOnly) return latest;
  const active = loadActivePlayerIds();
  const m = new Map<number, PriceRow>();
  for (const [id, row] of latest) {
    if (active.has(id)) m.set(id, row);
  }
  return m;
}

type MarketRowAcc = PriceRow & {
  change_pct: number | null;
  caution_no_play_current_season: boolean;
};

/**
 * Ticker symbol for one player — uses tickers precomputed in loadPricesBundle().
 */
export async function getTickerForPlayer(
  playerId: number,
): Promise<string | null> {
  const b = await loadPricesBundle();
  if (!loadActivePlayerIds().has(playerId)) return null;
  return b.tickers.get(playerId) ?? null;
}

export async function getMarketRows(): Promise<MarketRow[]> {
  const b = await loadPricesBundle();
  const active = loadActivePlayerIds();

  const rows: MarketRowAcc[] = [];
  for (const id of active) {
    const row = b.latest.get(id);
    if (!row) continue;
    const prev = b.prior.get(id);
    let change_pct: number | null = null;
    if (prev && prev.price_after_game > 0) {
      change_pct =
        ((row.price_after_game - prev.price_after_game) /
          prev.price_after_game) *
        100;
    }
    const caution_no_play_current_season =
      b.maxSeason != null && !b.playedIds.has(id);
    rows.push({ ...row, change_pct, caution_no_play_current_season });
  }

  const withTickers: MarketRow[] = rows.map((r) => ({
    ...r,
    ticker: b.tickers.get(r.player_id) ?? "????",
  }));

  withTickers.sort((a, b) => b.price_after_game - a.price_after_game);
  return withTickers;
}

/**
 * All rows for one player — served from the in-memory bundle (same full-file pass as quotes).
 */
export async function getPlayerHistory(playerId: number): Promise<PriceRow[]> {
  try {
    const b = await loadPricesBundle();
    const rows = b.histories.get(playerId);
    if (!rows?.length) return [];
    return [...rows].sort((a, b) => rowKeyDateGame(a) - rowKeyDateGame(b));
  } catch {
    return [];
  }
}

export async function getLatestForPlayer(
  playerId: number,
): Promise<PriceRow | null> {
  const { latest } = await loadPricesBundle();
  return latest.get(playerId) ?? null;
}
