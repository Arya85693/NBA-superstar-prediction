"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BuyingPower } from "@/components/BuyingPower";
import { formatUsd } from "@/lib/format";
import { maxWholeSharesAtPrice, usePortfolioCash } from "@/hooks/usePortfolioCash";
import type { MarketRow } from "@/lib/types";

export function AddMarketPosition() {
  const router = useRouter();
  const { cash, state: portfolioState } = usePortfolioCash();
  const [rows, setRows] = useState<MarketRow[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [shares, setShares] = useState("1");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let ok = true;
    fetch("/api/market")
      .then((r) => r.json())
      .then((d: { rows?: MarketRow[]; error?: string }) => {
        if (!ok) return;
        if (d.error) setLoadErr(d.error);
        else if (d.rows) setRows(d.rows);
      })
      .catch(() => {
        if (ok) setLoadErr("Could not load market");
      });
    return () => {
      ok = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const s = q.trim().toLowerCase();
    if (!s) return rows.slice(0, 40);
    return rows
      .filter(
        (r) =>
          r.player_name.toLowerCase().includes(s) ||
          r.team_abbr.toLowerCase().includes(s) ||
          r.ticker.toLowerCase().includes(s),
      )
      .slice(0, 30);
  }, [rows, q]);

  const selected = useMemo(
    () => rows?.find((r) => r.player_id === selectedId) ?? null,
    [rows, selectedId],
  );

  const n = Math.max(1, Math.floor(Number(shares) || 0));

  const maxBuyShares =
    selected && portfolioState === "ok" && cash !== null
      ? maxWholeSharesAtPrice(cash, selected.price_after_game)
      : null;

  async function buy() {
    if (!selected) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player_id: selected.player_id,
          side: "buy",
          shares: n,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMsg(data.error ?? "Buy failed");
        return;
      }
      setMsg(`Bought ${n} shares of ${selected.player_name}.`);
      window.dispatchEvent(new Event("portfolio-updated"));
      router.refresh();
    } catch {
      setMsg("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/30 p-5 md:p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Buy another player
      </h2>
      <p className="mt-1 text-sm text-zinc-500">
        Search the same market list and add a new position without leaving this page.
      </p>

      <div className="mt-4 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2.5">
        <BuyingPower cash={cash} state={portfolioState} />
      </div>

      {loadErr && (
        <p className="mt-3 text-sm text-rose-400">{loadErr}</p>
      )}

      {rows && (
        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs text-zinc-500">Search</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, team, or ticker (e.g. KIRV)…"
              className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-zinc-500">Pick a player</label>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-800">
              {filtered.length === 0 ? (
                <p className="p-4 text-sm text-zinc-500">No matches.</p>
              ) : (
                <ul className="divide-y divide-zinc-800">
                  {filtered.map((r) => {
                    const on = selectedId === r.player_id;
                    return (
                      <li key={r.player_id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedId(r.player_id);
                            setMsg(null);
                          }}
                          className={
                            on
                              ? "flex w-full items-center justify-between gap-2 bg-emerald-950/40 px-3 py-2.5 text-left text-sm"
                              : "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm text-zinc-300 hover:bg-zinc-800/60"
                          }
                        >
                          <span className="min-w-0">
                            <span className="font-medium text-zinc-100">
                              {r.player_name}
                            </span>
                            <span className="ml-2 text-zinc-500">{r.team_abbr}</span>
                            <span className="ml-2 font-mono text-xs font-semibold text-emerald-500/90">
                              {r.ticker}
                            </span>
                          </span>
                          <span className="shrink-0 font-mono text-sm text-zinc-400">
                            {formatUsd(r.price_after_game)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {selected && (
            <div className="flex flex-col gap-3 border-t border-zinc-800 pt-4 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs text-zinc-500">Last model price / sh</p>
                <p className="font-mono text-lg text-zinc-100">
                  {formatUsd(selected.price_after_game)}
                </p>
                {portfolioState === "ok" && cash !== null && maxBuyShares !== null && (
                  <p className="mt-1 text-xs text-zinc-500">
                    {maxBuyShares >= 1 ? (
                      <>
                        Up to{" "}
                        <span className="font-mono text-zinc-400">{maxBuyShares}</span> share
                        {maxBuyShares === 1 ? "" : "s"} at this price.
                      </>
                    ) : (
                      <span className="text-amber-200/90">
                        Not enough buying power for one share.
                      </span>
                    )}
                  </p>
                )}
              </div>
              <div className="sm:ml-4">
                <label className="mb-1.5 block text-xs text-zinc-500">Shares</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                  className="w-24 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100"
                />
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={buy}
                className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 sm:ml-auto"
              >
                {busy ? "…" : "Buy"}
              </button>
            </div>
          )}

          {msg && (
            <p className="text-sm text-zinc-400" role="status">
              {msg}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
