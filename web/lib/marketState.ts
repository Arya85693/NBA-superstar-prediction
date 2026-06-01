import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { createSupabaseServerClient } from "./supabase";
import type { MarketExplanation, MarketState } from "./types";

/**
 * Market Price layer (Layer 2) loader.
 *
 * Hosted (PRICES_SOURCE=supabase): reads public.player_market_state, cached
 * until prices_snapshot_meta.market_revision changes (so new Market Prices show
 * within a cycle even when no games were played).
 *
 * Local CSV mode: reads data/player_market_state.csv if the pipeline produced
 * one; otherwise returns an empty map and callers fall back to Fair Value. This
 * keeps the app fully functional before the market tables exist (backward compat).
 */

function pricesFromSupabase(): boolean {
  return process.env.PRICES_SOURCE === "supabase";
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function optNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(v: unknown): boolean {
  return v === true || v === "true" || v === "True" || v === 1 || v === "1";
}

function parseExplanation(v: unknown): MarketExplanation | null {
  if (v == null) return null;
  if (typeof v === "object") return v as MarketExplanation;
  if (typeof v === "string" && v.trim() !== "") {
    try {
      return JSON.parse(v) as MarketExplanation;
    } catch {
      return null;
    }
  }
  return null;
}

type MarketStateRow = Record<string, unknown>;

function rowToState(r: MarketStateRow): MarketState {
  return {
    player_id: num(r.player_id),
    player_name: String(r.player_name ?? ""),
    team_abbr: String(r.team_abbr ?? ""),
    fair_value: num(r.fair_value),
    market_price: num(r.market_price),
    prev_market_price: num(r.prev_market_price),
    premium_pct: num(r.premium_pct),
    change: num(r.change),
    change_pct: optNum(r.change_pct),
    projection_score: num(r.projection_score),
    projection_adjustment: num(r.projection_adjustment),
    sentiment_score: num(r.sentiment_score),
    sentiment_adjustment: num(r.sentiment_adjustment),
    team_context_score: num(r.team_context_score),
    team_context_adjustment: num(r.team_context_adjustment),
    demand_score: num(r.demand_score),
    demand_adjustment: num(r.demand_adjustment),
    net_demand: num(r.net_demand),
    recent_buy_volume: num(r.recent_buy_volume),
    recent_sell_volume: num(r.recent_sell_volume),
    move_capped: bool(r.move_capped),
    premium_capped: bool(r.premium_capped),
    explanation: parseExplanation(r.explanation),
    updated_at: typeof r.updated_at === "string" ? r.updated_at : null,
  };
}

const MARKET_STATE_SELECT =
  "player_id, player_name, team_abbr, fair_value, market_price, prev_market_price, premium_pct, change, change_pct, projection_score, projection_adjustment, sentiment_score, sentiment_adjustment, team_context_score, team_context_adjustment, demand_score, demand_adjustment, net_demand, recent_buy_volume, recent_sell_volume, move_capped, premium_capped, explanation, updated_at";

let stateCache: { sourceKey: string; states: Map<number, MarketState> } | null =
  null;
let inflight: Promise<Map<number, MarketState>> | null = null;

/** market_revision + updated_at; used for cache-busting the board/quotes. */
export async function getMarketRevisionInfo(): Promise<{
  revision: number;
  updatedAt: string | null;
}> {
  if (!pricesFromSupabase()) {
    const p = localMarketCsvPath();
    if (p && fs.existsSync(p)) {
      return { revision: fs.statSync(p).mtimeMs, updatedAt: null };
    }
    return { revision: 0, updatedAt: null };
  }
  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("prices_snapshot_meta")
      .select("market_revision, market_updated_at")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw error;
    return {
      revision: Number(data?.market_revision ?? 0),
      updatedAt:
        typeof data?.market_updated_at === "string"
          ? data.market_updated_at
          : null,
    };
  } catch {
    return { revision: 0, updatedAt: null };
  }
}

function localMarketCsvPath(): string | null {
  // data/player_market_state.csv at repo root (one level above web/).
  const candidates = [
    path.join(process.cwd(), "..", "data", "player_market_state.csv"),
    path.join(process.cwd(), "data", "player_market_state.csv"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

async function loadFromSupabase(): Promise<Map<number, MarketState>> {
  const supabase = createSupabaseServerClient();
  const states = new Map<number, MarketState>();
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("player_market_state")
      .select(MARKET_STATE_SELECT)
      .order("player_id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) {
      // Table may not exist yet (migration not applied) — degrade gracefully.
      throw new Error(`player_market_state: ${error.message}`);
    }
    if (!data?.length) break;
    for (const r of data) {
      const s = rowToState(r as MarketStateRow);
      if (s.player_id > 0) states.set(s.player_id, s);
    }
    from += data.length;
  }
  return states;
}

function loadFromLocalCsv(): Map<number, MarketState> {
  const states = new Map<number, MarketState>();
  const p = localMarketCsvPath();
  if (!p) return states;
  const text = fs.readFileSync(p, "utf-8");
  const rows = parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
  }) as MarketStateRow[];
  for (const r of rows) {
    const s = rowToState(r);
    if (s.player_id > 0) states.set(s.player_id, s);
  }
  return states;
}

/**
 * Map of player_id -> current Market Price state. Cached until the market
 * revision (hosted) or CSV mtime (local) changes. Returns an empty map (not an
 * error) when the market layer is not yet populated.
 */
export async function loadMarketStates(): Promise<Map<number, MarketState>> {
  const { revision } = await getMarketRevisionInfo();
  const sourceKey = pricesFromSupabase()
    ? `sb:${revision}`
    : `disk:${revision}`;

  if (stateCache?.sourceKey === sourceKey) return stateCache.states;

  if (!inflight) {
    inflight = (async () => {
      try {
        const states = pricesFromSupabase()
          ? await loadFromSupabase()
          : loadFromLocalCsv();
        stateCache = { sourceKey, states };
        return states;
      } catch {
        // Degrade to empty so callers fall back to Fair Value.
        const empty = new Map<number, MarketState>();
        stateCache = { sourceKey, states: empty };
        return empty;
      } finally {
        inflight = null;
      }
    })();
  }
  return inflight;
}

export async function getMarketStateForPlayer(
  playerId: number,
): Promise<MarketState | null> {
  const states = await loadMarketStates();
  return states.get(playerId) ?? null;
}
