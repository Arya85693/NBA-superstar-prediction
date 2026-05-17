"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readWatchlist, type WatchlistEntry } from "@/lib/watchlist";

export function WatchlistStrip() {
  const [items, setItems] = useState<WatchlistEntry[]>([]);

  useEffect(() => {
    const load = () => setItems(readWatchlist().slice(0, 6));
    load();
    window.addEventListener("watchlist-updated", load);
    return () => window.removeEventListener("watchlist-updated", load);
  }, []);

  if (items.length === 0) return null;

  return (
    <section className="mt-8" aria-labelledby="watchlist-strip-heading">
      <p id="watchlist-strip-heading" className="hs-eyebrow">
        Your watchlist
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((e) => (
          <Link
            key={e.player_id}
            href={`/player/${e.player_id}`}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm transition hover:border-accent/40"
          >
            <span className="font-mono text-xs font-semibold text-accent">{e.ticker}</span>
            <span className="text-foreground">{e.player_name}</span>
          </Link>
        ))}
        <Link
          href="/market"
          className="inline-flex items-center rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-accent"
        >
          Browse market →
        </Link>
      </div>
    </section>
  );
}
