"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatPct } from "@/lib/marketAnalytics";
import {
  computeSinceVisitMoves,
  readVisitSnapshot,
  writeVisitSnapshot,
  type SinceVisitMove,
} from "@/lib/visitMemory";
import type { MarketMeta, MarketRow } from "@/lib/types";

export function SinceLastVisitBanner({
  rows,
  meta,
}: {
  rows: MarketRow[];
  meta: MarketMeta;
}) {
  const [moves, setMoves] = useState<SinceVisitMove[] | null>(null);

  useEffect(() => {
    const prior = readVisitSnapshot();
    const computed = computeSinceVisitMoves(prior, rows, { minAbsPct: 0.75, limit: 5 });
    setMoves(computed);

    const prices: Record<string, number> = {};
    for (const r of rows) {
      prices[String(r.player_id)] = r.price_after_game;
    }
    writeVisitSnapshot({
      visitedAt: new Date().toISOString(),
      pricesRevision: meta.prices_revision ?? null,
      prices,
    });
  }, [rows, meta.prices_revision]);

  if (moves === null || moves.length === 0) return null;

  return (
    <section className="hs-card px-5 py-5 md:px-7" aria-labelledby="since-visit-heading">
      <p className="hs-eyebrow">Since your last visit</p>
      <h2 id="since-visit-heading" className="mt-2 text-lg font-semibold text-charcoal">
        Biggest value shifts on your watch
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Compared to prices stored locally from your previous session - not financial returns.
      </p>
      <ul className="mt-4 space-y-2">
        {moves.map((m) => {
          const up = m.changePct >= 0;
          return (
            <li key={m.player_id}>
              <Link
                href={`/player/${m.player_id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-surface-muted/50 px-3 py-2.5 transition hover:border-accent/30"
              >
                <span className="min-w-0">
                  <span className="font-mono text-xs font-semibold text-accent">{m.ticker}</span>
                  <span className="ml-2 text-sm font-medium text-foreground">{m.player_name}</span>
                  <span className="ml-2 text-xs text-muted">{m.team_abbr}</span>
                </span>
                <span
                  className={`font-mono text-sm font-semibold tabular-nums ${up ? "text-positive" : "text-negative"}`}
                >
                  {formatPct(m.changePct)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
