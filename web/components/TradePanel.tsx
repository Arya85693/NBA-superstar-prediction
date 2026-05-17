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
    <div className="hs-panel p-5 md:p-6">
      <h3 className="hs-label mb-4">
        Paper trade — {playerName}
        {ticker && (
          <span className="ml-2 font-mono normal-case tracking-normal text-accent">
            · {ticker}
          </span>
        )}
      </h3>
      <div className="mb-4 hs-inset px-3 py-2.5">
        <BuyingPower cash={cash} state={portfolioState} />
      </div>
      <p className="hs-stat-value mb-3 text-2xl text-foreground">
        {formatUsd(price)}
        <span className="ml-2 text-sm font-sans font-normal text-muted">/ sh</span>
      </p>
      <label className="mb-2 block text-sm text-muted-foreground">Shares (whole)</label>
      <input
        type="number"
        min={1}
        step={1}
        value={shares}
        onChange={(e) => setShares(e.target.value)}
        className="hs-input mb-4 font-mono"
      />
      <div className="mb-4 space-y-1 text-sm text-muted">
        <p>Est. {est}</p>
        {portfolioState === "ok" && cash !== null && maxBuyShares !== null && (
          <p className="text-xs text-muted">
            {maxBuyShares >= 1 ? (
              <>
                Up to <span className="font-mono text-muted-foreground">{maxBuyShares}</span> share
                {maxBuyShares === 1 ? "" : "s"} at this price.
              </>
            ) : (
              <span className="text-warning/90">
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
          className="hs-btn hs-btn-primary flex-1 disabled:opacity-50"
        >
          Buy
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => trade("sell")}
          className="hs-btn hs-btn-secondary flex-1 disabled:opacity-50"
        >
          Sell
        </button>
      </div>
      {msg && <p className="mt-3 text-sm text-muted-foreground">{msg}</p>}
    </div>
  );
}
