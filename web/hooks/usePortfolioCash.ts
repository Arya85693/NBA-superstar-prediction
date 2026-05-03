"use client";

import { useCallback, useEffect, useState } from "react";

type State = "loading" | "ok" | "error";

export function usePortfolioCash() {
  const [cash, setCash] = useState<number | null>(null);
  const [state, setState] = useState<State>("loading");

  const load = useCallback(() => {
    fetch("/api/portfolio")
      .then((r) => r.json())
      .then((d: { cash?: number; error?: string }) => {
        if (typeof d.cash === "number" && Number.isFinite(d.cash)) {
          setCash(d.cash);
          setState("ok");
        } else {
          setCash(null);
          setState("error");
        }
      })
      .catch(() => {
        setCash(null);
        setState("error");
      });
  }, []);

  useEffect(() => {
    load();
    const onUp = () => load();
    window.addEventListener("portfolio-updated", onUp);
    return () => window.removeEventListener("portfolio-updated", onUp);
  }, [load]);

  return { cash, state, reload: load };
}

/** Whole shares affordable at a positive per-share price (paper trading). */
export function maxWholeSharesAtPrice(cash: number, pricePerShare: number): number {
  if (!(pricePerShare > 0) || !(cash >= 0)) return 0;
  return Math.floor(cash / pricePerShare + 1e-9);
}
