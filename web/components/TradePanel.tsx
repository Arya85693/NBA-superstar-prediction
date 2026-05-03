"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BuyingPower } from "@/components/BuyingPower";
import { formatUsd } from "@/lib/format";
import { maxWholeSharesAtPrice, usePortfolioCash } from "@/hooks/usePortfolioCash";

type Props = {
  playerId: number;
  playerName: string;
  price: number;
  ticker?: string;
};

export function TradePanel({ playerId, playerName, price, ticker }: Props) {
  const router = useRouter();
  const { cash, state: portfolioState } = usePortfolioCash();
  const [shares, setShares] = useState("1");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const n = Math.max(1, Math.floor(Number(shares) || 0));
  const est = formatUsd(price * n);
  const maxBuyShares =
    portfolioState === "ok" && cash !== null
      ? maxWholeSharesAtPrice(cash, price)
      : null;

  async function trade(side: "buy" | "sell") {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_id: playerId, side, shares: n }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? "Trade failed");
        return;
      }
      setMsg(`${side === "buy" ? "Bought" : "Sold"} ${n} shares @ ${formatUsd(price)}`);
      window.dispatchEvent(new Event("portfolio-updated"));
      router.refresh();
    } catch {
      setMsg("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <h3 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-500">
        Paper trade — {playerName}
        {ticker && (
          <span className="ml-2 font-mono text-emerald-500/90">· {ticker}</span>
        )}
      </h3>
      <div className="mb-4 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2.5">
        <BuyingPower cash={cash} state={portfolioState} />
      </div>
      <p className="mb-3 font-mono text-2xl text-zinc-100">
        {formatUsd(price)}
        <span className="ml-2 text-sm font-sans text-zinc-500">/ sh</span>
      </p>
      <label className="mb-2 block text-sm text-zinc-400">Shares (whole)</label>
      <input
        type="number"
        min={1}
        step={1}
        value={shares}
        onChange={(e) => setShares(e.target.value)}
        className="mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-zinc-100"
      />
      <div className="mb-4 space-y-1 text-sm text-zinc-500">
        <p>Est. {est}</p>
        {portfolioState === "ok" && cash !== null && maxBuyShares !== null && (
          <p className="text-xs text-zinc-500">
            {maxBuyShares >= 1 ? (
              <>
                Up to <span className="font-mono text-zinc-400">{maxBuyShares}</span> share
                {maxBuyShares === 1 ? "" : "s"} at this price.
              </>
            ) : (
              <span className="text-amber-200/90">
                Buying power below one share at {formatUsd(price)} / sh.
              </span>
            )}
          </p>
        )}
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => trade("buy")}
          className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          Buy
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => trade("sell")}
          className="flex-1 rounded-lg border border-zinc-600 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
        >
          Sell
        </button>
      </div>
      {msg && <p className="mt-3 text-sm text-zinc-400">{msg}</p>}
    </div>
  );
}
