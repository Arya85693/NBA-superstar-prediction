import { createSupabaseServiceRoleClient } from "./supabase";
import type { Portfolio } from "./types";

export const STARTING_CASH = 100_000;

/** Must match `supabase/init_paper_market.sql` seed row (guest / demo). */
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

/**
 * Resolve the portfolios.id row for this Supabase Auth user. Guests use the
 * shared demo portfolio id. Creates a row if missing (e.g. trigger race).
 */
export async function getPortfolioIdForUser(userId: string | null): Promise<string> {
  if (!userId) return PAPER_PORTFOLIO_ID;

  const supabase = createSupabaseServiceRoleClient();
  const { data: row, error } = await supabase
    .from("portfolios")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase portfolios lookup: ${error.message}`);
  }
  if (row?.id) return row.id;

  const { data: inserted, error: insErr } = await supabase
    .from("portfolios")
    .insert({ user_id: userId, cash: STARTING_CASH })
    .select("id")
    .single();

  if (!insErr && inserted?.id) return inserted.id;

  const { data: again } = await supabase
    .from("portfolios")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (again?.id) return again.id;

  throw new Error(
    `Supabase portfolios create: ${insErr?.message ?? "unknown error"}`,
  );
}

export async function readPortfolio(portfolioId: string): Promise<Portfolio> {
  const supabase = createSupabaseServiceRoleClient();

  const { data: row, error } = await supabase
    .from("portfolios")
    .select("cash")
    .eq("id", portfolioId)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase portfolios read: ${error.message}`);
  }

  if (!row) {
    if (portfolioId !== PAPER_PORTFOLIO_ID) {
      throw new Error("Portfolio not found for this account.");
    }
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
    .eq("portfolio_id", portfolioId);

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

export async function writePortfolio(portfolioId: string, p: Portfolio): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const cash = roundMoney(p.cash);

  const { error: delErr } = await supabase
    .from("positions")
    .delete()
    .eq("portfolio_id", portfolioId);

  if (delErr) {
    throw new Error(`Supabase positions clear: ${delErr.message}`);
  }

  const rows = Object.entries(p.positions)
    .map(([pidStr, shares]) => ({
      portfolio_id: portfolioId,
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
    .eq("id", portfolioId);

  if (upErr) {
    throw new Error(`Supabase portfolios update: ${upErr.message}`);
  }
}
