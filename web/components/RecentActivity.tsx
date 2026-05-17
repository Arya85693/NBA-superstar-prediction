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
      <p className="rounded-2xl border border-zinc-800/90 bg-zinc-900/30 p-8 text-center text-sm text-zinc-500">
        No trades yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-800/90 shadow-sm shadow-black/20">
      <table className="w-full min-w-[880px] text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900/50 text-zinc-400">
            <th className="px-3 py-3">Time</th>
            <th className="px-3 py-3">Side</th>
            <th className="px-3 py-3">Player</th>
            <th className="px-3 py-3 text-right">Shares</th>
            <th className="px-3 py-3 text-right">Price</th>
            <th className="px-3 py-3 text-right">Total</th>
            <th className="px-3 py-3 text-right">Realized P&amp;L</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {trades.map((t) => (
            <tr key={t.id} className="hover:bg-zinc-900/80">
              <td className="whitespace-nowrap px-3 py-3 text-zinc-400">
                {formatTradeTime(t.createdAt)}
              </td>
              <td className="px-3 py-3">
                <span
                  className={
                    t.side === "buy"
                      ? "font-semibold uppercase text-emerald-400"
                      : "font-semibold uppercase text-zinc-300"
                  }
                >
                  {t.side}
                </span>
              </td>
              <td className="px-3 py-3">
                <Link
                  href={`/player/${t.playerId}`}
                  className="font-medium text-emerald-400 hover:underline"
                >
                  {t.playerName}
                </Link>
                {t.teamAbbr ? (
                  <span className="ml-2 text-zinc-600">{t.teamAbbr}</span>
                ) : null}
              </td>
              <td className="px-3 py-3 text-right font-mono">{t.shares}</td>
              <td className="px-3 py-3 text-right font-mono text-zinc-400">
                {formatUsd(t.pricePerShare)}
              </td>
              <td className="px-3 py-3 text-right font-mono">
                {formatUsd(t.grossAmount)}
              </td>
              <td
                className={`px-3 py-3 text-right font-mono ${
                  t.realizedPnl !== null ? pnlTextClass(t.realizedPnl) : "text-zinc-500"
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
