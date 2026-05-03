"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { formatUsd } from "@/lib/format";

type Pf = { cash: number; total: number };

type PortfolioFetch = "loading" | "ok" | "error";

const tabs: { href: string; label: string; match: (p: string) => boolean }[] = [
  { href: "/", label: "Home", match: (p) => p === "/" },
  {
    href: "/market",
    label: "Market",
    match: (p) => p === "/market" || p.startsWith("/player/"),
  },
  { href: "/portfolio", label: "Portfolio", match: (p) => p === "/portfolio" },
  {
    href: "/how-it-works",
    label: "How it works",
    match: (p) => p === "/how-it-works",
  },
];

export function Nav() {
  const path = usePathname();
  const [pf, setPf] = useState<Pf | null>(null);
  const [portfolioFetch, setPortfolioFetch] = useState<PortfolioFetch>("loading");

  useEffect(() => {
    let alive = true;
    function load() {
      fetch("/api/portfolio")
        .then(async (r) => {
          const d = (await r.json()) as {
            cash?: number;
            total?: number;
            error?: string;
          };
          return { ok: r.ok, d };
        })
        .then(({ ok, d }) => {
          if (!alive) return;
          if (
            ok &&
            typeof d.cash === "number" &&
            Number.isFinite(d.cash)
          ) {
            setPf({
              cash: d.cash,
              total:
                typeof d.total === "number" && Number.isFinite(d.total)
                  ? d.total
                  : d.cash,
            });
            setPortfolioFetch("ok");
          } else {
            setPf(null);
            setPortfolioFetch("error");
          }
        })
        .catch(() => {
          if (!alive) return;
          setPf(null);
          setPortfolioFetch("error");
        });
    }
    setPortfolioFetch("loading");
    load();
    const onUp = () => load();
    window.addEventListener("portfolio-updated", onUp);
    return () => {
      alive = false;
      window.removeEventListener("portfolio-updated", onUp);
    };
  }, [path]);

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800/90 bg-zinc-950/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-8">
          <Link
            href="/"
            className="shrink-0 text-base font-semibold tracking-tight text-zinc-100"
          >
            <span className="text-zinc-400">NBA</span> Paper Market
          </Link>
          <nav
            className="flex flex-wrap items-end gap-1 sm:gap-6"
            aria-label="Main"
          >
            {tabs.map((t) => {
              const active = t.match(path);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  prefetch
                  className={
                    active
                      ? "-mb-px border-b-2 border-emerald-500 px-2 pb-3 text-sm font-medium text-zinc-100"
                      : "border-b-2 border-transparent px-2 pb-3 text-sm font-medium text-zinc-500 transition hover:text-zinc-300"
                  }
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-3 border-t border-zinc-800/80 pt-2 sm:border-t-0 sm:pt-0">
          <div className="text-right text-sm">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">
              Buying power
            </div>
            {portfolioFetch === "loading" && (
              <div className="font-mono text-emerald-400/70">…</div>
            )}
            {portfolioFetch === "ok" && pf && (
              <div className="font-mono text-emerald-400">{formatUsd(pf.cash)}</div>
            )}
            {portfolioFetch === "error" && (
              <div className="max-w-[9rem] text-xs leading-snug text-zinc-500">
                Couldn&apos;t load
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
