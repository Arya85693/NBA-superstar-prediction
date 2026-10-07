import { loadLatestQuotes } from "./marketData";
import { loadMarketStates } from "./marketState";
import { positionMetrics, resolveMarkPrice } from "./portfolioMath";
import type { MarkSource } from "./portfolioMath";
import {
  getPortfolioIdForUser,
  readPortfolio,
  roundMoney,
  STARTING_CASH,
} from "./portfolioStore";
import { getPortfolioRealizedPnl, getRecentTrades } from "./tradeHistory";
import type { RecentTradeRow } from "./tradeHistory";

export type PositionRow = {
  player_id: number;
  shares: number;
  /** Mark per share: Market Price mid, else Fair Value, else average cost. */
  price: number | null;
  priceSource: MarkSource;
  value: number;
  name: string;
  team_abbr: string;
  avgCostPerShare: number | null;
  costBasis: number | null;
  unrealizedPnl: number | null;
  /** Share of total portfolio value (cash + all positions), 0–100 */
  allocationPct: number;
};

export type PortfolioSnapshot = {
  cash: number;
  positions: PositionRow[];
  positionsValue: number;
  total: number;
  startingCash: number;
  /** Cash as % of total equity */
  cashPct: number;
  /** Market value of stock positions as % of total equity */
  equitiesPct: number;
  /** Total equity minus starting cash */
  totalReturn: number;
  /** Percent gain/loss vs starting cash */
  totalReturnPct: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  recentTrades: RecentTradeRow[];
};

/** Pass `authUserId` from Supabase Auth (`user.id`), or `null` for guest demo portfolio. */
export async function getPortfolioSnapshot(
  authUserId: string | null,
): Promise<PortfolioSnapshot> {
  const portfolioId = await getPortfolioIdForUser(authUserId);
  const [pf, quotes, marketStates, realizedPnl, recentTrades] = await Promise.all([
    readPortfolio(portfolioId),
    loadLatestQuotes(false),
    loadMarketStates(),
    getPortfolioRealizedPnl(portfolioId),
    getRecentTrades(portfolioId, 15),
  ]);

  let positionsValue = 0;
  let unrealizedPnl = 0;
  const raw: Omit<PositionRow, "allocationPct">[] = [];

  for (const [pidStr, shares] of Object.entries(pf.positions)) {
    if (shares <= 0) continue;
    const pid = Number(pidStr);
    const q = quotes.get(pid);
    const avgCostPerShare = pf.avgCostPerShare[pidStr] ?? null;
    const { price, source: priceSource } = resolveMarkPrice({
      marketPrice: marketStates.get(pid)?.market_price,
      fairValue: q?.price_after_game,
      avgCostPerShare,
    });
    const { value, costBasis, unrealizedPnl: positionUnrealized } =
      positionMetrics(price, shares, avgCostPerShare);
    if (positionUnrealized !== null) unrealizedPnl += positionUnrealized;
    positionsValue += value;
    raw.push({
      player_id: pid,
      shares,
      price,
      priceSource,
      value,
      name: q?.player_name ?? `#${pid}`,
      team_abbr: q?.team_abbr ?? "",
      avgCostPerShare,
      costBasis,
      unrealizedPnl: positionUnrealized,
    });
  }

  unrealizedPnl = roundMoney(unrealizedPnl);
  const totalPnl = roundMoney(realizedPnl + unrealizedPnl);

  raw.sort((a, b) => b.value - a.value);

  const cash = roundMoney(pf.cash);
  positionsValue = roundMoney(positionsValue);
  const total = roundMoney(cash + positionsValue);

  const cashPct =
    total > 0 ? roundMoney((cash / total) * 100) : cash > 0 ? 100 : 0;
  const equitiesPct =
    total > 0 ? roundMoney((positionsValue / total) * 100) : 0;

  const totalReturn = roundMoney(total - STARTING_CASH);
  const totalReturnPct =
    STARTING_CASH > 0
      ? roundMoney(((total - STARTING_CASH) / STARTING_CASH) * 100)
      : 0;

  const positions: PositionRow[] = raw.map((p) => ({
    ...p,
    allocationPct:
      total > 0 ? roundMoney((p.value / total) * 100) : 0,
  }));

  return {
    cash,
    positions,
    positionsValue,
    total,
    startingCash: STARTING_CASH,
    cashPct,
    equitiesPct,
    totalReturn,
    totalReturnPct,
    realizedPnl,
    unrealizedPnl,
    totalPnl,
    recentTrades,
  };
}
