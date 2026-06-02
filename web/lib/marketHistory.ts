import { createSupabaseServerClient } from "./supabase";
import type { MarketTick } from "./types";

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

/**
 * Load intraday Market Price ticks for one player (newest first in DB, returned
 * ascending for charting). Returns [] in local CSV mode or when the table is
 * empty / missing.
 */
export async function getMarketTicksForPlayer(
  playerId: number,
  sinceDays = 400,
): Promise<MarketTick[]> {
  if (!pricesFromSupabase() || !Number.isFinite(playerId) || playerId <= 0) {
    return [];
  }

  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();

  try {
    const supabase = createSupabaseServerClient();
    const pageSize = 1000;
    const out: MarketTick[] = [];
    let from = 0;

    for (;;) {
      const { data, error } = await supabase
        .from("player_market_ticks")
        .select("player_id, recorded_at, market_price, fair_value, premium_pct")
        .eq("player_id", playerId)
        .gte("recorded_at", since)
        .order("recorded_at", { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) {
        // Table may not exist until migration is applied.
        return [];
      }
      if (!data?.length) break;
      for (const raw of data) {
        out.push(rowToTick(raw as TickRow));
      }
      from += data.length;
      if (data.length < pageSize) break;
    }

    return out;
  } catch {
    return [];
  }
}
