import fs from "fs";
import { parse } from "csv-parse";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { createSupabaseServerClient } from "./supabase";
import { activePlayersCsvPath, pricesCsvPath } from "./paths";
import { assignPlayerTickers } from "./playerTicker";
import type { MarketMeta, MarketRow, PriceRow } from "./types";

function pricesFromSupabase(): boolean {
  return process.env.PRICES_SOURCE === "supabase";
}

/** Rows per Supabase request; must be ≤ Project Settings → API → Max rows (often 1000). */
function supabasePageSize(): number {
  const raw = Number(process.env.PRICES_SUPABASE_PAGE_SIZE);
  const n = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1000;
  return Math.min(Math.max(200, n), 50_000);
}

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

let activeFileCache: { mtimeMs: number; ids: Set<number> } | null = null;
let activeSupabaseCache: { revision: number; ids: Set<number> } | null = null;

/** Active roster IDs — from CSV (local) or active_players table (hosted). */
export async function loadActivePlayerIds(): Promise<Set<number>> {
  if (pricesFromSupabase()) {
    const supabase = createSupabaseServerClient();
    const { data: meta, error: me } = await supabase
      .from("prices_snapshot_meta")
      .select("revision")
      .eq("id", 1)
      .maybeSingle();
    if (me) throw new Error(`Supabase prices_snapshot_meta: ${me.message}`);
    const revision = Number(meta?.revision ?? 0);
    if (activeSupabaseCache?.revision === revision) {
      return activeSupabaseCache.ids;
    }

    const ids = new Set<number>();
    const pageSize = supabasePageSize();
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from("active_players")
        .select("player_id")
        .order("player_id", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw new Error(`Supabase active_players: ${error.message}`);
      if (!data?.length) break;
      for (const r of data) {
        const id = Number(r.player_id);
        if (Number.isFinite(id) && id > 0) ids.add(id);
      }
      from += data.length;
      // Do not compare to pageSize — PostgREST may cap below our request; keep paging until empty.
    }
    activeSupabaseCache = { revision, ids };
    return ids;
  }

  const p = activePlayersCsvPath();
  if (!fs.existsSync(p)) return new Set();
  const st = fs.statSync(p);
  if (activeFileCache?.mtimeMs === st.mtimeMs) {
    return activeFileCache.ids;
  }
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
  const ids = new Set(rows);
  activeFileCache = { mtimeMs: st.mtimeMs, ids };
  return ids;
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
  histories: Map<number, PriceRow[]>;
  tickers: Map<number, string>;
};

type BundleCacheEntry = { sourceKey: string; bundle: PricesBundle };

let bundleCache: BundleCacheEntry | null = null;
let bundleInflight: Promise<PricesBundle> | null = null;

type MutableBundleState = {
  latest: Map<number, PriceRow>;
  prior: Map<number, PriceRow>;
  histories: Map<number, PriceRow[]>;
  playersBySeason: Map<string, Set<number>>;
  maxSeason: string | null;
  maxY: number;
  blockPid: number | null;
  prevInBlock: PriceRow | null;
  lastInBlock: PriceRow | null;
};

function createEmptyState(): MutableBundleState {
  return {
    latest: new Map(),
    prior: new Map(),
    histories: new Map(),
    playersBySeason: new Map(),
    maxSeason: null,
    maxY: -1,
    blockPid: null,
    prevInBlock: null,
    lastInBlock: null,
  };
}

function flushBlock(state: MutableBundleState): void {
  if (state.blockPid !== null && state.lastInBlock) {
    state.latest.set(state.blockPid, state.lastInBlock);
    if (state.prevInBlock) state.prior.set(state.blockPid, state.prevInBlock);
  }
}

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

function feedPriceRowRecord(
  state: MutableBundleState,
  r: Record<string, string>,
): void {
  const row = parseRow(r);
  const sea = String(r.season ?? "");

  if (sea) {
    const y = seasonStartYear(sea);
    if (y > state.maxY) {
      state.maxY = y;
      state.maxSeason = sea;
    }
  }

  const mins = parseNum(r.minutes);
  if (mins > 0 && sea && row.player_id) {
    let set = state.playersBySeason.get(sea);
    if (!set) {
      set = new Set();
      state.playersBySeason.set(sea, set);
    }
    set.add(row.player_id);
  }

  if (!row.player_id) return;

  let list = state.histories.get(row.player_id);
  if (!list) {
    list = [];
    state.histories.set(row.player_id, list);
  }
  list.push(row);

  if (state.blockPid !== row.player_id) {
    flushBlock(state);
    state.blockPid = row.player_id;
    state.prevInBlock = null;
    state.lastInBlock = row;
    return;
  }
  state.prevInBlock = state.lastInBlock;
  state.lastInBlock = row;
}

type PriceDbRow = {
  player_id: number;
  player_name: string | null;
  team_abbr: string | null;
  game_id: string;
  game_date: string;
  season: string | null;
  minutes: number | string | null;
  game_score: number | string | null;
  price_after_game: number | string | null;
  prior_season_avg_game_score: number | string | null;
};

function dbRowToRecord(r: PriceDbRow): Record<string, string> {
  const psg = r.prior_season_avg_game_score;
  return {
    player_id: String(r.player_id),
    player_name: String(r.player_name ?? ""),
    team_abbr: String(r.team_abbr ?? ""),
    game_id: String(r.game_id),
    game_date: String(r.game_date),
    season: String(r.season ?? ""),
    minutes: String(r.minutes ?? ""),
    game_score: String(r.game_score ?? ""),
    price_after_game: String(r.price_after_game ?? ""),
    prior_season_avg_game_score:
      psg == null || psg === "" ? "" : String(psg),
  };
}

const PRICE_ROW_SELECT =
  "player_id, player_name, team_abbr, game_id, game_date, season, minutes, game_score, price_after_game, prior_season_avg_game_score";

async function supabaseLatestRowForPlayerId(
  supabase: SupabaseClient,
  playerId: number,
): Promise<PriceRow | null> {
  const { data, error } = await supabase
    .from("player_game_prices")
    .select(PRICE_ROW_SELECT)
    .eq("player_id", playerId)
    .order("game_date", { ascending: false })
    .order("game_id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`Supabase latest row for player ${playerId}: ${error.message}`);
  }
  if (!data) return null;
  return parseRow(dbRowToRecord(data as PriceDbRow));
}

async function supabasePlayerHistoryRows(
  supabase: SupabaseClient,
  playerId: number,
): Promise<PriceRow[]> {
  const pageSize = supabasePageSize();
  const out: PriceRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("player_game_prices")
      .select(PRICE_ROW_SELECT)
      .eq("player_id", playerId)
      .order("game_date", { ascending: true })
      .order("game_id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) {
      throw new Error(
        `Supabase history for player ${playerId}: ${error.message}`,
      );
    }
    if (!data?.length) break;
    for (const raw of data) {
      out.push(parseRow(dbRowToRecord(raw as PriceDbRow)));
    }
    from += data.length;
  }
  return out.sort((a, b) => rowKeyDateGame(a) - rowKeyDateGame(b));
}

async function finalizeBundleState(
  state: MutableBundleState,
): Promise<PricesBundle> {
  flushBlock(state);

  const playedIds =
    state.maxSeason != null
      ? (state.playersBySeason.get(state.maxSeason) ?? new Set<number>())
      : new Set<number>();

  const active = await loadActivePlayerIds();
  const minimalForTickers: { player_id: number; player_name: string }[] = [];
  for (const id of active) {
    const row = state.latest.get(id);
    if (!row) continue;
    minimalForTickers.push({ player_id: id, player_name: row.player_name });
  }
  const tickers = assignPlayerTickers(minimalForTickers);

  return {
    latest: state.latest,
    prior: state.prior,
    maxSeason: state.maxSeason,
    playedIds,
    histories: state.histories,
    tickers,
  };
}

async function parsePricesBundleFromDisk(
  path: string,
  sourceKey: string,
): Promise<PricesBundle> {
  const state = createEmptyState();

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
      feedPriceRowRecord(state, r);
    });
    parser.on("end", () => resolve());
    parser.on("error", (e) => reject(e));
  });

  const bundle = await finalizeBundleState(state);
  bundleCache = { sourceKey, bundle };
  return bundle;
}

async function parsePricesBundleFromSupabase(
  sourceKey: string,
): Promise<PricesBundle> {
  const supabase = createSupabaseServerClient();
  const state = createEmptyState();
  const pageSize = supabasePageSize();
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("player_game_prices")
      .select(PRICE_ROW_SELECT)
      .order("player_id", { ascending: true })
      .order("game_date", { ascending: true })
      .order("game_id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Supabase player_game_prices: ${error.message}`);
    }
    if (!data?.length) break;

    for (const raw of data) {
      feedPriceRowRecord(state, dbRowToRecord(raw as PriceDbRow));
    }

    from += data.length;
    // Do not compare to pageSize — server max rows may be < PRICES_SUPABASE_PAGE_SIZE; keep until empty.
  }

  const bundle = await finalizeBundleState(state);
  bundleCache = { sourceKey, bundle };
  return bundle;
}

/**
 * Single pass over all price rows (CSV file or Supabase):
 * latest + prior row per player, full per-player history, newest season string,
 * who played (minutes > 0) that season, and active-roster tickers.
 * Cached until file mtime or prices_snapshot_meta.revision changes.
 */
export async function loadPricesBundle(): Promise<PricesBundle> {
  if (pricesFromSupabase()) {
    const supabase = createSupabaseServerClient();
    const { data: meta, error } = await supabase
      .from("prices_snapshot_meta")
      .select("revision")
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      throw new Error(`Supabase prices_snapshot_meta: ${error.message}`);
    }
    const revision = Number(meta?.revision ?? 0);
    const sourceKey = `sb:${revision}`;
    if (bundleCache?.sourceKey === sourceKey) {
      return bundleCache.bundle;
    }

    if (!bundleInflight) {
      bundleInflight = parsePricesBundleFromSupabase(sourceKey).finally(() => {
        bundleInflight = null;
      });
    }
    return bundleInflight;
  }

  const path = pricesCsvPath();
  if (!fs.existsSync(path)) {
    throw new Error(`Missing ${path}. Run: python pipeline/run_pipeline.py`);
  }

  const st = fs.statSync(path);
  const sourceKey = `disk:${st.mtimeMs}`;
  if (bundleCache?.sourceKey === sourceKey) {
    return bundleCache.bundle;
  }

  if (!bundleInflight) {
    bundleInflight = parsePricesBundleFromDisk(path, sourceKey).finally(() => {
      bundleInflight = null;
    });
  }

  return bundleInflight;
}

export async function getCurrentSeasonPlaySnapshot(): Promise<{
  maxSeason: string | null;
  playedIds: Set<number>;
}> {
  if (pricesFromSupabase()) {
    try {
      const supabase = createSupabaseServerClient();
      const { data, error } = await supabase
        .from("prices_snapshot_meta")
        .select("max_dataset_season, played_player_ids")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      const maxSeason =
        typeof data?.max_dataset_season === "string" &&
        data.max_dataset_season.length > 0
          ? data.max_dataset_season
          : null;
      const rawIds = data?.played_player_ids;
      const playedIds = new Set<number>();
      if (Array.isArray(rawIds)) {
        for (const x of rawIds) {
          const n = Number(x);
          if (Number.isFinite(n) && n > 0) playedIds.add(n);
        }
      }
      if (maxSeason != null) {
        return { maxSeason, playedIds };
      }
    } catch {
      /* fall through to bundle */
    }
  }
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

export async function playerPlayedCurrentDatasetSeason(
  playerId: number,
): Promise<boolean> {
  const { maxSeason, playedIds } = await getCurrentSeasonPlaySnapshot();
  if (!maxSeason) return true;
  return playedIds.has(playerId);
}

export async function loadLatestQuotes(
  activeOnly: boolean,
): Promise<Map<number, PriceRow>> {
  const { latest } = await loadPricesBundle();
  if (!activeOnly) return latest;
  const active = await loadActivePlayerIds();
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

export async function getTickerForPlayer(
  playerId: number,
): Promise<string | null> {
  const active = await loadActivePlayerIds();
  if (!active.has(playerId)) return null;

  if (pricesFromSupabase()) {
    const supabase = createSupabaseServerClient();
    const { data: boardRow, error: boardErr } = await supabase
      .from("player_board")
      .select("ticker")
      .eq("player_id", playerId)
      .maybeSingle();
    if (!boardErr && boardRow?.ticker) return boardRow.ticker;

    // Backward compat if player_board not populated yet
    const ids = [...active].sort((a, b) => a - b);
    const minimal: { player_id: number; player_name: string }[] = [];
    const parallel = 30;
    for (let i = 0; i < ids.length; i += parallel) {
      const slice = ids.slice(i, i + parallel);
      const rows = await Promise.all(
        slice.map((id) => supabaseLatestRowForPlayerId(supabase, id)),
      );
      for (let j = 0; j < slice.length; j++) {
        const pr = rows[j];
        if (pr) {
          minimal.push({ player_id: slice[j]!, player_name: pr.player_name });
        }
      }
    }
    const tickers = assignPlayerTickers(minimal);
    return tickers.get(playerId) ?? null;
  }

  const b = await loadPricesBundle();
  return b.tickers.get(playerId) ?? null;
}

/** Version tag for server cache — bumps when prices file or Supabase revision changes. */
async function marketBoardCacheKey(): Promise<string> {
  if (pricesFromSupabase()) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("prices_snapshot_meta")
      .select("revision")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(`marketBoardCacheKey: ${error.message}`);
    return `sb:${Number(data?.revision ?? 0)}`;
  }
  const path = pricesCsvPath();
  if (!fs.existsSync(path)) return "disk:missing";
  return `disk:${fs.statSync(path).mtimeMs}`;
}

async function buildMarketRows(): Promise<MarketRow[]> {
  const b = await loadPricesBundle();
  const active = await loadActivePlayerIds();

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
 * Full market board — expensive on cold load. Cached server-side between tab visits
 * until prices revision / file mtime changes (see `marketBoardCacheKey`).
 */
export async function getMarketRows(): Promise<MarketRow[]> {
  const tag = await marketBoardCacheKey();
  return unstable_cache(
    async () => buildMarketRows(),
    ["market-board", tag],
    { revalidate: 600 },
  )();
}

export async function getPlayerHistory(playerId: number): Promise<PriceRow[]> {
  if (pricesFromSupabase()) {
    try {
      const supabase = createSupabaseServerClient();
      return await supabasePlayerHistoryRows(supabase, playerId);
    } catch {
      return [];
    }
  }
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
  if (pricesFromSupabase()) {
    const supabase = createSupabaseServerClient();
    return supabaseLatestRowForPlayerId(supabase, playerId);
  }
  const { latest } = await loadPricesBundle();
  return latest.get(playerId) ?? null;
}
