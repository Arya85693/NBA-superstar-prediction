import Link from "next/link";
import { formatUsd } from "@/lib/format";
import {
  formatSignedUsd,
  formatTradeTime,
  pnlTextClass,
} from "@/lib/portfolioPnl";
import type { RecentTradeRow } from "@/lib/tradeHistory";

function realizedLabel(pnl: number | null): string {
  if (pnl === null) return "—";
  return formatSignedUsd(pnl);
}

export function RecentActivity({ trades }: { trades: RecentTradeRow[] }) {
  if (trades.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
        No trades yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border shadow-sm shadow-slate-900/5">
      <table className="w-full min-w-[880px] text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-surface text-muted-foreground">
            <th className="px-3 py-3">Time</th>
            <th className="px-3 py-3">Side</th>
            <th className="px-3 py-3">Player</th>
            <th className="px-3 py-3 text-right">Shares</th>
            <th className="px-3 py-3 text-right">Price</th>
            <th className="px-3 py-3 text-right">Total</th>
            <th className="px-3 py-3 text-right">Realized P&amp;L</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {trades.map((t) => (
            <tr key={t.id} className="hover:bg-surface-muted">
              <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                {formatTradeTime(t.createdAt)}
              </td>
              <td className="px-3 py-3">
                <span
                  className={
                    t.side === "buy"
                      ? "font-semibold uppercase text-positive"
                      : "font-semibold uppercase text-foreground"
                  }
                >
                  {t.side}
                </span>
              </td>
              <td className="px-3 py-3">
                <Link
                  href={`/player/${t.playerId}`}
                  className="font-medium text-positive hover:underline"
                >
                  {t.playerName}
                </Link>
                {t.teamAbbr ? (
                  <span className="ml-2 text-muted">{t.teamAbbr}</span>
                ) : null}
              </td>
              <td className="px-3 py-3 text-right font-mono">{t.shares}</td>
              <td className="px-3 py-3 text-right font-mono text-muted-foreground">
                {formatUsd(t.pricePerShare)}
              </td>
              <td className="px-3 py-3 text-right font-mono">
                {formatUsd(t.grossAmount)}
              </td>
              <td
                className={`px-3 py-3 text-right font-mono ${
                  t.realizedPnl !== null ? pnlTextClass(t.realizedPnl) : "text-muted"
                }`}
              >
                {realizedLabel(t.realizedPnl)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
