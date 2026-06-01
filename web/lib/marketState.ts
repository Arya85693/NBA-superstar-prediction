import { createSupabaseServerClient } from "./supabase";
import type { MarketExplanation, MarketState } from "./types";

/**
 * Market Price layer (Layer 2) loader.
 *
 * Reads public.player_market_state from Supabase, cached until
 * prices_snapshot_meta.market_revision changes (so new Market Prices show within
 * a cycle even when no games were played).
 *
 * The Market Price layer is a *hosted* feature: it needs the database for
 * cross-cycle continuity. In local CSV mode (PRICES_SOURCE != supabase) we
 * intentionally return an empty map so callers fall back to Fair Value — and,
 * importantly, we keep this module free of `fs`/`path` so Turbopack does not
 * trace the whole parent repo during `next build`. To preview the live Market
 * Price layer locally, run with PRICES_SOURCE=supabase (reads the same tables).
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
  return v === true || v === "true" || v === 1;
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

/**
 * Map of player_id -> current Market Price state. Cached until the market
 * revision changes. Returns an empty map (not an error) when the market layer
 * is not yet populated or in local CSV mode, so callers fall back to Fair Value.
 */
export async function loadMarketStates(): Promise<Map<number, MarketState>> {
  if (!pricesFromSupabase()) return new Map();

  const { revision } = await getMarketRevisionInfo();
  const sourceKey = `sb:${revision}`;
  if (stateCache?.sourceKey === sourceKey) return stateCache.states;

  if (!inflight) {
    inflight = (async () => {
      try {
        const states = await loadFromSupabase();
        stateCache = { sourceKey, states };
        return states;
      } catch {
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
