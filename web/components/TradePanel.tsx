"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BuyingPower } from "@/components/BuyingPower";
import { formatUsd } from "@/lib/format";
import { loginHref, signupHref } from "@/lib/authRedirect";
import { maxWholeSharesAtPrice, usePortfolioCash } from "@/hooks/usePortfolioCash";
import { buyPrice, sellPrice, roundTripSpreadPct } from "@/lib/tradeCosts";

type Props = {
  playerId: number;
  playerName: string;
  price: number;
  ticker?: string;
};

type AuthUser = { id: string; email: string | null };

export function TradePanel({ playerId, playerName, price, ticker }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const returnPath = pathname || `/player/${playerId}`;
  const [authUser, setAuthUser] = useState<AuthUser | null | undefined>(undefined);
  const { cash, state: portfolioState } = usePortfolioCash(authUser != null);
  const [shares, setShares] = useState("1");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.json() as Promise<{ user: AuthUser | null }>)
      .then((d) => {
        if (alive) setAuthUser(d.user ?? null);
      })
      .catch(() => {
        if (alive) setAuthUser(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  const n = Math.max(1, Math.floor(Number(shares) || 0));
  const ask = buyPrice(price);
  const bid = sellPrice(price);
  const buyEst = formatUsd(ask * n);
  const sellEst = formatUsd(bid * n);
  const maxBuyShares =
    portfolioState === "ok" && cash !== null
      ? maxWholeSharesAtPrice(cash, ask)
      : null;

  async function trade(side: "buy" | "sell") {
    if (!authUser) {
      router.push(loginHref(returnPath));
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ player_id: playerId, side, shares: n }),
      });
      const data = await res.json();
      if (res.status === 401) {
        router.push(loginHref(returnPath));
        return;
      }
      if (!res.ok) {
        setMsg(data.error ?? "Trade failed");
        return;
      }
      const filled =
        typeof data.filled_at_price === "number"
          ? data.filled_at_price
          : side === "buy"
            ? ask
            : bid;
      setMsg(`${side === "buy" ? "Bought" : "Sold"} ${n} shares @ ${formatUsd(filled)}`);
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
      <p className="mb-3 text-xs leading-relaxed text-muted">
        Fills execute around the live Market Price with a {roundTripSpreadPct()}% bid/ask spread —
        buys fill just above the mid, sells just below. Market Price tracks Fair Value plus
        explainable projection, demand, sentiment and team-context premiums, and refreshes
        each ingestion cycle (~30 min) — even between games.
      </p>
      <h3 className="hs-label mb-4">
        Paper trade - {playerName}
        {ticker && (
          <span className="ml-2 font-mono normal-case tracking-normal text-accent">
            · {ticker}
          </span>
        )}
      </h3>
      <p className="hs-stat-value mb-1 text-2xl text-foreground">
        {formatUsd(price)}
        <span className="ml-2 text-sm font-sans font-normal text-muted">/ sh mid</span>
      </p>
      <p className="mb-3 text-xs text-muted">
        Buy <span className="font-mono text-success">{formatUsd(ask)}</span> · Sell{" "}
        <span className="font-mono text-warning">{formatUsd(bid)}</span> / sh
      </p>

      {authUser === undefined && (
        <p className="text-sm text-muted">Checking account…</p>
      )}

      {authUser === null && (
        <div className="rounded-xl border border-border bg-surface-muted/40 px-4 py-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Sign in to paper trade with your own $100k wallet. Browsing prices and charts is
            free — no account needed.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link href={loginHref(returnPath)} className="hs-btn hs-btn-primary flex-1 text-center">
              Sign in to trade
            </Link>
            <Link
              href={signupHref(returnPath)}
              className="hs-btn hs-btn-secondary flex-1 text-center"
            >
              Create account
            </Link>
          </div>
        </div>
      )}

      {authUser && (
        <>
          <div className="mb-4 hs-inset px-3 py-2.5">
            <BuyingPower cash={cash} state={portfolioState} />
          </div>
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
            <p>
              Est. buy <span className="text-muted-foreground">{buyEst}</span> · sell{" "}
              <span className="text-muted-foreground">{sellEst}</span>
            </p>
            {portfolioState === "ok" && cash !== null && maxBuyShares !== null && (
              <p className="text-xs text-muted">
                {maxBuyShares >= 1 ? (
                  <>
                    Up to <span className="font-mono text-muted-foreground">{maxBuyShares}</span>{" "}
                    share
                    {maxBuyShares === 1 ? "" : "s"} at the buy price.
                  </>
                ) : (
                  <span className="text-warning/90">
                    Buying power below one share at {formatUsd(ask)} / sh.
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
        </>
      )}
    </div>
  );
}
