"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUsdNumberOnly } from "@/lib/format";
import {
  readWatchlist,
  removeFromWatchlist,
  type WatchlistEntry,
} from "@/lib/watchlist";
import type { MarketRow } from "@/lib/types";

type WatchlistRow = WatchlistEntry & {
  price: number | null;
  change_pct: number | null;
  game_date: string | null;
};

function fmtPct(n: number | null) {
  if (n === null || Number.isNaN(n)) return "-";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function WatchlistPanel() {
  const router = useRouter();
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [marketRows, setMarketRows] = useState<MarketRow[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const load = useCallback(() => {
    setEntries(readWatchlist());
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("watchlist-updated", load);
    return () => window.removeEventListener("watchlist-updated", load);
  }, [load]);

  useEffect(() => {
    let ok = true;
    fetch("/api/market")
      .then((r) => r.json())
      .then((d: { rows?: MarketRow[]; error?: string }) => {
        if (!ok) return;
        if (d.error) setLoadErr(d.error);
        else if (d.rows) setMarketRows(d.rows);
      })
      .catch(() => {
        if (ok) setLoadErr("Could not load latest prices");
      });
    return () => {
      ok = false;
    };
  }, []);

  const rows: WatchlistRow[] = useMemo(() => {
    const byId = new Map<number, MarketRow>();
    if (marketRows) {
      for (const r of marketRows) byId.set(r.player_id, r);
    }
    return entries.map((e) => {
      const m = byId.get(e.player_id);
      return {
        ...e,
        price: m?.price_after_game ?? null,
        change_pct: m?.change_pct ?? null,
        game_date: m?.game_date ?? null,
      };
    });
  }, [entries, marketRows]);

  const remove = (playerId: number) => {
    removeFromWatchlist(playerId);
    window.dispatchEvent(new Event("watchlist-updated"));
    load();
  };

  if (entries.length === 0) {
    return (
      <div
        id="watchlist"
        className="scroll-mt-24 rounded-2xl border border-border bg-surface p-8 text-center"
      >
        <p className="hs-eyebrow">Watchlist</p>
        <h2 className="mt-2 text-lg font-semibold text-charcoal">No players on your watchlist</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Track players you care about without owning shares. Use{" "}
          <span className="font-medium text-foreground">Add to watchlist</span> on any player
          page, then check repricing here after each refresh.
        </p>
        <Link href="/market" className="hs-btn hs-btn-primary mt-6 inline-flex">
          Browse market
        </Link>
      </div>
    );
  }

  return (
    <div id="watchlist" className="scroll-mt-24">
      {loadErr && (
        <p className="mb-3 text-sm text-warning">{loadErr}</p>
      )}
      <div className="overflow-x-auto rounded-2xl border border-border shadow-sm shadow-slate-900/5">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-muted-foreground">
              <th className="px-4 py-3 pl-5">Player</th>
              <th className="px-4 py-3">Team</th>
              <th className="px-4 py-3 text-right">Price</th>
              <th className="px-4 py-3 text-right">Change</th>
              <th className="px-4 py-3 text-right">Last game</th>
              <th className="px-4 py-3 pr-5 text-right">&nbsp;</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const up = r.change_pct != null && r.change_pct >= 0;
              return (
                <tr key={r.player_id} className="hover:bg-surface-muted">
                  <td className="px-4 py-3.5 pl-5">
                    <Link
                      href={`/player/${r.player_id}`}
                      className="flex items-center gap-2 font-medium text-accent hover:underline"
                    >
                      <span className="font-mono text-xs font-semibold">{r.ticker}</span>
                      {r.player_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="hs-team-badge">{r.team_abbr}</span>
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono tabular-nums">
                    {r.price != null ? (
                      <>
                        <span className="text-muted">$</span>
                        {formatUsdNumberOnly(r.price)}
                      </>
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </td>
                  <td
                    className={`px-4 py-3.5 text-right font-mono tabular-nums ${
                      r.change_pct == null
                        ? "text-muted"
                        : up
                          ? "text-positive"
                          : "text-negative"
                    }`}
                  >
                    {fmtPct(r.change_pct)}
                  </td>
                  <td className="px-4 py-3.5 text-right text-muted-foreground">
                    {r.game_date ?? "-"}
                  </td>
                  <td className="px-4 py-3.5 pr-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => router.push(`/player/${r.player_id}`)}
                        className="rounded-md border border-border-strong px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-surface-inset"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(r.player_id)}
                        className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted hover:text-negative"
                        aria-label={`Remove ${r.player_name} from watchlist`}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">
        Stored on this device. Prices update on each market refresh (~30 min).
      </p>
    </div>
  );
}
