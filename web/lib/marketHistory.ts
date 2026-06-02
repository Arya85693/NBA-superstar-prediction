import fs from "fs";
import { parse } from "csv-parse/sync";
import { createSupabaseServerClient } from "./supabase";
import { marketTicksCsvPath } from "./paths";
import type { MarketTick } from "./types";

export type MarketDailySnapshot = {
  player_id: number;
  as_of_date: string;
  market_price: number;
  fair_value: number;
  premium_pct: number;
};

function pricesFromSupabase(): boolean {
  return process.env.PRICES_SOURCE === "supabase";
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

type TickRow = {
  player_id: number;
  recorded_at: string;
  market_price: number | string;
  fair_value: number | string;
  premium_pct: number | string;
};

function rowToTick(r: TickRow): MarketTick {
  return {
    player_id: num(r.player_id),
    recorded_at: String(r.recorded_at),
    market_price: num(r.market_price),
    fair_value: num(r.fair_value),
    premium_pct: num(r.premium_pct),
  };
}

function loadTicksFromLocalCsv(
  playerId: number,
  sinceIso: string,
): MarketTick[] {
  const path = marketTicksCsvPath();
  if (!fs.existsSync(path)) return [];

  const text = fs.readFileSync(path, "utf-8");
  const rows = parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  const sinceMs = new Date(sinceIso).getTime();
  const out: MarketTick[] = [];
  for (const r of rows) {
    const pid = num(r.player_id, NaN);
    if (pid !== playerId) continue;
    const tick = rowToTick({
      player_id: pid,
      recorded_at: r.recorded_at ?? "",
      market_price: r.market_price ?? "0",
      fair_value: r.fair_value ?? "0",
      premium_pct: r.premium_pct ?? "0",
    });
    const ms = new Date(tick.recorded_at).getTime();
    if (!Number.isFinite(ms) || ms < sinceMs) continue;
    out.push(tick);
  }

  out.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  return out;
}

async function loadTicksFromSupabase(
  playerId: number,
  sinceIso: string,
): Promise<MarketTick[]> {
  const supabase = createSupabaseServerClient();
  const pageSize = 1000;
  const out: MarketTick[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("player_market_ticks")
      .select("player_id, recorded_at, market_price, fair_value, premium_pct")
      .eq("player_id", playerId)
      .gte("recorded_at", sinceIso)
      .order("recorded_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) return [];
    if (!data?.length) break;
    for (const raw of data) {
      out.push(rowToTick(raw as TickRow));
    }
    from += data.length;
    if (data.length < pageSize) break;
  }

  return out;
}

/**
 * Intraday Market Price ticks (~30 min pipeline cycles). Supabase when hosted,
 * else `data/player_market_ticks.csv` after `update_market_state.py`.
 */
export async function getMarketTicksForPlayer(
  playerId: number,
  sinceDays = 400,
): Promise<MarketTick[]> {
  if (!Number.isFinite(playerId) || playerId <= 0) return [];

  const sinceIso = new Date(Date.now() - sinceDays * 86_400_000).toISOString();

  try {
    if (pricesFromSupabase()) {
      return await loadTicksFromSupabase(playerId, sinceIso);
    }
    return loadTicksFromLocalCsv(playerId, sinceIso);
  } catch {
    return [];
  }
}

/**
 * Daily market rollup (one row per pipeline day). Fallback when tick table is
 * empty or the selected range has too few intraday points.
 */
export async function getMarketDailyHistoryForPlayer(
  playerId: number,
  sinceDays = 400,
): Promise<MarketDailySnapshot[]> {
  if (!pricesFromSupabase() || !Number.isFinite(playerId) || playerId <= 0) {
    return [];
  }

  const since = new Date(Date.now() - sinceDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

  try {
    const supabase = createSupabaseServerClient();
    const pageSize = 1000;
    const out: MarketDailySnapshot[] = [];
    let from = 0;

    for (;;) {
      const { data, error } = await supabase
        .from("player_market_history")
        .select("player_id, as_of_date, market_price, fair_value, premium_pct")
        .eq("player_id", playerId)
        .gte("as_of_date", since)
        .order("as_of_date", { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) return [];
      if (!data?.length) break;
      for (const raw of data) {
        const row = raw as {
          player_id: number;
          as_of_date: string;
          market_price: number | string;
          fair_value: number | string;
          premium_pct: number | string;
        };
        out.push({
          player_id: num(row.player_id),
          as_of_date: String(row.as_of_date).slice(0, 10),
          market_price: num(row.market_price),
          fair_value: num(row.fair_value),
          premium_pct: num(row.premium_pct),
        });
      }
      from += data.length;
      if (data.length < pageSize) break;
    }

    return out;
  } catch {
    return [];
  }
}
