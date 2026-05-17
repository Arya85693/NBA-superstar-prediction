"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const STORAGE_KEY = "hs:start-here-dismissed";

const steps = [
  {
    n: "1",
    title: "See who moved",
    body: "Open the market board for the latest repricing after each ingestion cycle.",
    href: "/market",
    cta: "Market",
  },
  {
    n: "2",
    title: "Open a player",
    body: "Read the insight summary - what happened, why price moved, and recent trend.",
    href: "/market",
    cta: "Pick a mover",
  },
  {
    n: "3",
    title: "Paper trade",
    body: "Buy or sell simulated shares at the latest model price - no real money.",
    href: "/portfolio",
    cta: "Portfolio",
  },
] as const;

export function StartHereGuide({
  topMoverId,
  topMoverName,
}: {
  topMoverId?: number;
  topMoverName?: string;
}) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (dismissed) return null;

  const step2Href = topMoverId != null ? `/player/${topMoverId}` : "/market";
  const step2Cta =
    topMoverName != null ? `Open ${topMoverName.split(" ").pop()}` : "Pick a mover";

  return (
    <section
      className="hs-card border-accent/20 bg-accent-muted/30 px-5 py-6 md:px-7"
      aria-labelledby="start-here-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="hs-eyebrow text-accent">Start here</p>
          <h2 id="start-here-heading" className="mt-2 text-lg font-semibold text-charcoal">
            New here? Follow this path
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Track NBA player value from real game data, see why prices move, and practice
            with paper trading.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem(STORAGE_KEY, "1");
            } catch {
              /* ignore */
            }
            setDismissed(true);
          }}
          className="shrink-0 text-xs font-medium text-muted hover:text-foreground"
        >
          Dismiss
        </button>
      </div>

      <ol className="mt-6 grid gap-4 md:grid-cols-3">
        {steps.map((s, i) => {
          const href = i === 1 ? step2Href : s.href;
          const cta = i === 1 ? step2Cta : s.cta;
          return (
            <li
              key={s.n}
              className="rounded-xl border border-border/80 bg-surface/90 px-4 py-4"
            >
              <span className="font-mono text-xs font-semibold text-accent">{s.n}</span>
              <p className="mt-2 font-medium text-foreground">{s.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{s.body}</p>
              <Link
                href={href}
                className="mt-3 inline-block text-sm font-semibold text-accent hover:text-accent-hover"
              >
                {cta} →
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

