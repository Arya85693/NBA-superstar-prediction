"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BuyingPower } from "@/components/BuyingPower";
import { formatUsd } from "@/lib/format";
import { usePortfolioCash } from "@/hooks/usePortfolioCash";
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
    return (
      <p className="rounded-2xl border border-zinc-800/90 bg-zinc-900/30 p-8 text-center text-sm text-zinc-500">
        No positions yet. Use <strong className="text-zinc-400">Buy another player</strong>{" "}
        below or open any player on the market.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-3 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2.5">
        <BuyingPower cash={cash} state={portfolioState} />
      </div>
      {msg && (
        <p className="mb-3 rounded-lg border border-rose-900/50 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">
          {msg}
        </p>
      )}
      <div className="overflow-x-auto rounded-2xl border border-zinc-800/90 shadow-sm shadow-black/20">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/50 text-zinc-400">
              <th className="px-3 py-3">Player</th>
              <th className="px-3 py-3 text-right">Shares</th>
              <th className="px-3 py-3 text-right">Price</th>
              <th className="px-3 py-3 text-right">Value</th>
              <th className="px-3 py-3 text-right">Portfolio %</th>
              <th className="px-3 py-3 text-right">Trade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {positions.map((p) => {
              const busy = busyId === p.player_id;
              return (
                <tr key={p.player_id} className="hover:bg-zinc-900/80">
                  <td className="px-3 py-3">
                    <Link
                      href={`/player/${p.player_id}`}
                      className="font-medium text-emerald-400 hover:underline"
                    >
                      {p.name}
                    </Link>
                    <span className="ml-2 text-zinc-600">{p.team_abbr}</span>
                  </td>
                  <td className="px-3 py-3 text-right font-mono">{p.shares}</td>
                  <td className="px-3 py-3 text-right font-mono text-zinc-400">
                    {p.price != null ? formatUsd(p.price) : "—"}
                  </td>
                  <td className="px-3 py-3 text-right font-mono">{formatUsd(p.value)}</td>
                  <td className="px-3 py-3 text-right text-zinc-400">
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
                        className="w-16 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-right font-mono text-xs text-zinc-100"
                        aria-label={`Share quantity for ${p.name}`}
                      />
                      <button
                        type="button"
                        disabled={busy || p.price == null}
                        onClick={() => trade(p.player_id, "buy", p.shares)}
                        className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
                      >
                        Buy
                      </button>
                      <button
                        type="button"
                        disabled={busy || p.shares < 1}
                        onClick={() => trade(p.player_id, "sell", p.shares)}
                        className="rounded-md border border-zinc-600 px-2.5 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
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
