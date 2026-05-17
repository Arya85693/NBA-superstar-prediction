import { loadLatestQuotes } from "./marketData";
import { roundMoney } from "./portfolioStore";
import { createSupabaseServiceRoleClient } from "./supabase";

export type RecentTradeRow = {
  id: string;
  createdAt: string;
  side: "buy" | "sell";
  playerId: number;
  playerName: string;
  teamAbbr: string;
  shares: number;
  pricePerShare: number;
  grossAmount: number;
  realizedPnl: number | null;
};

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const TRADE_SELECT =
  "id, created_at, side, player_id, shares, price_per_share, gross_amount, realized_pnl";

/** Recent fills for a portfolio, newest first, with player names from latest quotes. */
export async function getRecentTrades(
  portfolioId: string,
  limit = 15,
): Promise<RecentTradeRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  const cap = Math.min(Math.max(1, Math.floor(limit)), 20);

  const { data: rows, error } = await supabase
    .from("trades")
    .select(TRADE_SELECT)
    .eq("portfolio_id", portfolioId)
    .order("created_at", { ascending: false })
    .limit(cap);

  if (error) {
    throw new Error(`Supabase trades read: ${error.message}`);
  }

  const quotes = await loadLatestQuotes(false);
  const out: RecentTradeRow[] = [];

  for (const r of rows ?? []) {
    const playerId = Number(r.player_id);
    if (!Number.isFinite(playerId) || playerId <= 0) continue;

    const shares = Math.floor(asNumber(r.shares) ?? 0);
    const pricePerShare = asNumber(r.price_per_share);
    const grossAmount = asNumber(r.gross_amount);
    if (shares < 1 || pricePerShare === null || grossAmount === null) continue;

    const side = r.side === "sell" ? "sell" : "buy";
    const q = quotes.get(playerId);
    const realizedRaw = r.realized_pnl;
    const realizedPnl =
      realizedRaw === null || realizedRaw === undefined
        ? null
        : asNumber(realizedRaw);

    out.push({
      id: String(r.id),
      createdAt: String(r.created_at),
      side,
      playerId,
      playerName: q?.player_name ?? `#${playerId}`,
      teamAbbr: q?.team_abbr ?? "",
      shares,
      pricePerShare,
      grossAmount: roundMoney(grossAmount),
      realizedPnl:
        realizedPnl === null ? null : roundMoney(realizedPnl),
    });
  }

  return out;
}

/** Sum of realized_pnl across all sells with a recorded gain/loss. */
export async function getPortfolioRealizedPnl(
  portfolioId: string,
): Promise<number> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: rows, error } = await supabase
    .from("trades")
    .select("realized_pnl")
    .eq("portfolio_id", portfolioId)
    .not("realized_pnl", "is", null);

  if (error) {
    throw new Error(`Supabase trades realized P&L: ${error.message}`);
  }

  let sum = 0;
  for (const r of rows ?? []) {
    const n = asNumber(r.realized_pnl);
    if (n !== null) sum += n;
  }
  return roundMoney(sum);
}
