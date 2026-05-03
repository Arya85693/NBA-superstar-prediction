import { createSupabaseServerClient } from "./supabase";
import type { Portfolio } from "./types";

export const STARTING_CASH = 100_000;

/** Must match `supabase/init_paper_market.sql` seed row. */
export const PAPER_PORTFOLIO_ID =
  "00000000-0000-0000-0000-000000000001" as const;

const DEFAULT: Portfolio = {
  cash: STARTING_CASH,
  positions: {},
};

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseCash(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : STARTING_CASH;
  }
  return STARTING_CASH;
}

export async function readPortfolio(): Promise<Portfolio> {
  const supabase = createSupabaseServerClient();

  let { data: row, error } = await supabase
    .from("portfolios")
    .select("cash")
    .eq("id", PAPER_PORTFOLIO_ID)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase portfolios read: ${error.message}`);
  }

  if (!row) {
    const { error: insErr } = await supabase.from("portfolios").insert({
      id: PAPER_PORTFOLIO_ID,
      cash: STARTING_CASH,
    });
    if (insErr) {
      throw new Error(`Supabase portfolios seed: ${insErr.message}`);
    }
    return { ...DEFAULT, positions: { ...DEFAULT.positions } };
  }

  const cash = roundMoney(parseCash(row.cash));

  const { data: posRows, error: posErr } = await supabase
    .from("positions")
    .select("player_id, shares")
    .eq("portfolio_id", PAPER_PORTFOLIO_ID);

  if (posErr) {
    throw new Error(`Supabase positions read: ${posErr.message}`);
  }

  const positions: Record<string, number> = {};
  for (const r of posRows ?? []) {
    const pid = Number(r.player_id);
    const shares = Math.floor(Number(r.shares));
    if (!Number.isFinite(pid) || pid <= 0 || !Number.isFinite(shares)) continue;
    if (shares > 0) positions[String(pid)] = shares;
  }

  return { cash, positions };
}

export async function writePortfolio(p: Portfolio): Promise<void> {
  const supabase = createSupabaseServerClient();
  const cash = roundMoney(p.cash);

  const { error: delErr } = await supabase
    .from("positions")
    .delete()
    .eq("portfolio_id", PAPER_PORTFOLIO_ID);

  if (delErr) {
    throw new Error(`Supabase positions clear: ${delErr.message}`);
  }

  const rows = Object.entries(p.positions)
    .map(([pidStr, shares]) => ({
      portfolio_id: PAPER_PORTFOLIO_ID,
      player_id: Number(pidStr),
      shares: Math.floor(Number(shares)),
    }))
    .filter((r) => Number.isFinite(r.player_id) && r.player_id > 0 && r.shares > 0);

  if (rows.length > 0) {
    const { error: insErr } = await supabase.from("positions").insert(rows);
    if (insErr) {
      throw new Error(`Supabase positions insert: ${insErr.message}`);
    }
  }

  const { error: upErr } = await supabase
    .from("portfolios")
    .update({ cash, updated_at: new Date().toISOString() })
    .eq("id", PAPER_PORTFOLIO_ID);

  if (upErr) {
    throw new Error(`Supabase portfolios update: ${upErr.message}`);
  }
}
