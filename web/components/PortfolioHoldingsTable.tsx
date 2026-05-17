"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BuyingPower } from "@/components/BuyingPower";
import { formatUsd } from "@/lib/format";
import { usePortfolioCash } from "@/hooks/usePortfolioCash";
import { PortfolioEmptyGuide } from "@/components/portfolio/PortfolioEmptyGuide";
import { formatSignedUsd, pnlTextClass } from "@/lib/portfolioPnl";
import type { PositionRow } from "@/lib/portfolioView";

function pct(n: number) {
  return `${n.toFixed(2)}%`;
}

export function PortfolioHoldingsTable({
  positions,
}: {
  positions: PositionRow[];
}) {
  const router = useRouter();
  const { cash, state: portfolioState } = usePortfolioCash();
  const [qty, setQty] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const getShares = (playerId: number) => {
    const raw = qty[playerId] ?? "1";
    return Math.max(1, Math.floor(Number(raw) || 0));
  };

  const trade = async (
    playerId: number,
    side: "buy" | "sell",
    maxShares: number,
  ) => {
    const n = getShares(playerId);
    if (side === "sell" && n > maxShares) {
      setMsg(`Sell at most ${maxShares} shares (your position).`);
      return;
    }
    setBusyId(playerId);
    setMsg(null);
    try {
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_id: playerId, side, shares: n }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMsg(data.error ?? "Trade failed");
        return;
      }
      setMsg(null);
      window.dispatchEvent(new Event("portfolio-updated"));
      router.refresh();
    } catch {
      setMsg("Network error");
    } finally {
      setBusyId(null);
    }
  };

  const empty = useMemo(() => positions.length === 0, [positions.length]);

  if (empty) {
    return <PortfolioEmptyGuide />;
  }

  return (
    <div>
      <div className="mb-3 rounded-lg border border-border bg-surface-muted px-3 py-2.5">
        <BuyingPower cash={cash} state={portfolioState} />
      </div>
      {msg && (
        <p className="mb-3 rounded-lg border border-negative/20 bg-negative-muted px-3 py-2 text-sm text-negative">
          {msg}
        </p>
      )}
      <div className="overflow-x-auto rounded-2xl border border-border shadow-sm shadow-slate-900/5">
        <table className="w-full min-w-[1040px] text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-muted-foreground">
              <th className="px-3 py-3">Player</th>
              <th className="px-3 py-3 text-right">Shares</th>
              <th className="px-3 py-3 text-right">Avg cost</th>
              <th className="px-3 py-3 text-right">Cost basis</th>
              <th className="px-3 py-3 text-right">Price</th>
              <th className="px-3 py-3 text-right">Value</th>
              <th className="px-3 py-3 text-right">Unrealized P&amp;L</th>
              <th className="px-3 py-3 text-right">Portfolio %</th>
              <th className="px-3 py-3 text-right">Trade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {positions.map((p) => {
              const busy = busyId === p.player_id;
              return (
                <tr key={p.player_id} className="hover:bg-surface-muted">
                  <td className="px-3 py-3">
                    <Link
                      href={`/player/${p.player_id}`}
                      className="font-medium text-positive hover:underline"
                    >
                      {p.name}
                    </Link>
                    <span className="ml-2 text-muted">{p.team_abbr}</span>
                  </td>
                  <td className="px-3 py-3 text-right font-mono">{p.shares}</td>
                  <td className="px-3 py-3 text-right font-mono text-muted-foreground">
                    {p.avgCostPerShare != null
                      ? formatUsd(p.avgCostPerShare)
                      : "-"}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-muted-foreground">
                    {p.costBasis != null ? formatUsd(p.costBasis) : "-"}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-muted-foreground">
                    {p.price != null ? formatUsd(p.price) : "-"}
                  </td>
                  <td className="px-3 py-3 text-right font-mono">{formatUsd(p.value)}</td>
                  <td
                    className={`px-3 py-3 text-right font-mono ${
                      p.unrealizedPnl !== null
                        ? pnlTextClass(p.unrealizedPnl)
                        : "text-muted"
                    }`}
                  >
                    {p.unrealizedPnl !== null
                      ? formatSignedUsd(p.unrealizedPnl)
                      : "-"}
                  </td>
                  <td className="px-3 py-3 text-right text-muted-foreground">
                    {pct(p.allocationPct)}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={qty[p.player_id] ?? "1"}
                        onChange={(e) =>
                          setQty((prev) => ({
                            ...prev,
                            [p.player_id]: e.target.value,
                          }))
                        }
                        className="w-16 rounded-md border border-border-strong bg-background px-2 py-1.5 text-right font-mono text-xs text-foreground"
                        aria-label={`Share quantity for ${p.name}`}
                      />
                      <button
                        type="button"
                        disabled={busy || p.price == null}
                        onClick={() => trade(p.player_id, "buy", p.shares)}
                        className="rounded-md bg-accent px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-accent disabled:opacity-40"
                      >
                        Buy
                      </button>
                      <button
                        type="button"
                        disabled={busy || p.shares < 1}
                        onClick={() => trade(p.player_id, "sell", p.shares)}
                        className="rounded-md border border-border-strong px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-inset disabled:opacity-40"
                      >
                        Sell
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
