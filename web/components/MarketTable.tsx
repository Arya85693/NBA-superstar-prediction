"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatUsdNumberOnly } from "@/lib/format";
import type { MarketMeta, MarketRow } from "@/lib/types";

function fmtPct(n: number | null) {
  if (n === null || Number.isNaN(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function priceCautionTitle(meta: MarketMeta | undefined): string {
  const s = meta?.current_dataset_season;
  return s
    ? `No minutes logged in ${s} in this dataset — price may reflect prior seasons or projections only.`
    : "No minutes logged in the latest season in this dataset.";
}

function teamHue(abbr: string): number {
  let h = 0;
  for (let i = 0; i < abbr.length; i++) {
    h = (h + abbr.charCodeAt(i) * (i + 3)) % 360;
  }
  return h;
}

type SortKey =
  | "price_desc"
  | "price_asc"
  | "name"
  | "change_desc"
  | "change_asc"
  | "date_desc";

function cmpChange(a: MarketRow, b: MarketRow): number {
  const av = a.change_pct;
  const bv = b.change_pct;
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  return av - bv;
}

function sortRows(rows: MarketRow[], key: SortKey): MarketRow[] {
  const out = [...rows];
  switch (key) {
    case "price_desc":
      out.sort((a, b) => b.price_after_game - a.price_after_game);
      break;
    case "price_asc":
      out.sort((a, b) => a.price_after_game - b.price_after_game);
      break;
    case "name":
      out.sort((a, b) => a.player_name.localeCompare(b.player_name));
      break;
    case "change_desc":
      out.sort((a, b) => cmpChange(b, a));
      break;
    case "change_asc":
      out.sort((a, b) => cmpChange(a, b));
      break;
    case "date_desc":
      out.sort(
        (a, b) =>
          new Date(b.game_date).getTime() - new Date(a.game_date).getTime(),
      );
      break;
    default:
      break;
  }
  return out;
}

const PAGE_SIZE = 20;

function RowPrice({
  r,
  meta,
  align = "end",
}: {
  r: MarketRow;
  meta?: MarketMeta;
  align?: "start" | "end";
}) {
  const num = formatUsdNumberOnly(r.price_after_game);
  const end = align === "end";
  const caution = r.caution_no_play_current_season;
  return (
    <div
      className={`flex w-full min-w-0 flex-nowrap items-center gap-0 ${end ? "justify-end" : "justify-start"}`}
    >
      {/*
        Tight "$131.62" (no 1fr gap): $ + digits as one cluster, right-aligned in a fixed slot.
        Warning stays in its own column so ⚠️ never shifts this cluster.
      */}
      <div className="flex w-[10.5rem] shrink-0 items-center justify-end font-mono text-sm tabular-nums leading-none">
        <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
          <span className="text-zinc-500">$</span>
          <span className="text-zinc-100">{num}</span>
        </span>
      </div>
      <div className="flex h-6 w-7 shrink-0 items-center justify-start pl-1">
        {caution ? (
          <span
            className="inline-flex leading-none text-amber-400"
            title={priceCautionTitle(meta)}
            aria-label={priceCautionTitle(meta)}
            role="img"
          >
            ⚠️
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function MarketTable({
  rows,
  meta,
}: {
  rows: MarketRow[];
  meta?: MarketMeta;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("price_desc");
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r) =>
        r.player_name.toLowerCase().includes(s) ||
        r.team_abbr.toLowerCase().includes(s) ||
        r.ticker.toLowerCase().includes(s),
    );
  }, [rows, q]);

  const sorted = useMemo(
    () => sortRows(filtered, sort),
    [filtered, sort],
  );

  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (alive) setShowAll(false);
    });
    return () => {
      alive = false;
    };
  }, [q, sort]);

  const visible = useMemo(() => {
    if (showAll || sorted.length <= PAGE_SIZE) return sorted;
    return sorted.slice(0, PAGE_SIZE);
  }, [sorted, showAll]);

  const hiddenCount = Math.max(0, sorted.length - PAGE_SIZE);
  const openPlayer = (id: number) => {
    router.push(`/player/${id}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1">
          <label htmlFor="market-search" className="sr-only">
            Search players
          </label>
          <div className="relative max-w-xl">
            <span
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
              aria-hidden
            >
              ⌕
            </span>
            <input
              id="market-search"
              type="search"
              placeholder="Search name, team, or ticker (e.g. NJOK)…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900/80 py-2.5 pl-10 pr-4 text-sm text-zinc-100 placeholder:text-zinc-500 shadow-inner focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            />
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Displaying{" "}
            <span className="font-medium text-zinc-400">{visible.length}</span>
            {hiddenCount > 0 && !showAll ? (
              <>
                {" "}
                of{" "}
                <span className="font-medium text-zinc-400">{sorted.length}</span> in this
                list
              </>
            ) : (
              <>
                {" "}
                player{visible.length === 1 ? "" : "s"} in this list
                {sorted.length !== rows.length && (
                  <>
                    {" "}
                    (<span className="font-medium text-zinc-400">{rows.length}</span> total in
                    market)
                  </>
                )}
              </>
            )}
            {q.trim() ? " · filtered by search" : ""}. Row opens detail — charts &amp; trade.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="market-sort" className="text-xs font-medium text-zinc-500">
            Sort
          </label>
          <select
            id="market-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
          >
            <option value="price_desc">Price · high → low</option>
            <option value="price_asc">Price · low → high</option>
            <option value="change_desc">Change · gainers first</option>
            <option value="change_asc">Change · losers first</option>
            <option value="date_desc">Last game · newest</option>
            <option value="name">Name · A–Z</option>
          </select>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="grid gap-3 md:hidden">
        {visible.map((r) => {
          const hue = teamHue(r.team_abbr);
          return (
            <button
              key={r.player_id}
              type="button"
              onClick={() => openPlayer(r.player_id)}
              className="group flex w-full gap-3 rounded-2xl border border-zinc-800/90 bg-zinc-900/50 p-4 text-left shadow-sm shadow-black/20 transition hover:border-zinc-700 hover:bg-zinc-900/80"
            >
              <div
                className="flex h-12 w-[3.25rem] shrink-0 items-center justify-center rounded-xl font-mono text-[11px] font-bold leading-tight tracking-wide text-zinc-100 ring-1 ring-white/10"
                style={{
                  background: `linear-gradient(145deg, hsla(${hue}, 42%, 28%, 0.95), hsla(${hue}, 35%, 18%, 0.98))`,
                }}
              >
                {r.ticker}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-zinc-100 group-hover:text-emerald-400">
                      {r.player_name}
                    </p>
                    <span
                      className="mt-1 inline-block rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-300"
                      style={{
                        borderColor: `hsla(${hue}, 45%, 42%, 0.45)`,
                        backgroundColor: `hsla(${hue}, 35%, 16%, 0.65)`,
                      }}
                    >
                      {r.team_abbr}
                    </span>
                  </div>
                  <span className="shrink-0 text-zinc-500 transition group-hover:text-emerald-400">
                    →
                  </span>
                </div>
                <div className="mt-3 space-y-2 border-t border-zinc-800/80 pt-3 text-sm">
                  <div className="flex flex-nowrap items-center justify-between gap-3">
                    <RowPrice r={r} meta={meta} align="start" />
                    <span
                      className={`shrink-0 tabular-nums ${
                        r.change_pct == null
                          ? "text-zinc-500"
                          : r.change_pct >= 0
                            ? "text-emerald-400"
                            : "text-rose-400"
                      }`}
                    >
                      {fmtPct(r.change_pct)}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500">{r.game_date}</div>
                </div>
              </div>
            </button>
          );
        })}
        {sorted.length === 0 && (
          <p className="rounded-2xl border border-zinc-800 py-10 text-center text-sm text-zinc-500">
            No matches. Try another search.
          </p>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-2xl border border-zinc-800/90 shadow-lg shadow-black/30 md:block">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-sm">
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3 pl-5">Player</th>
              <th className="px-4 py-3">Team</th>
              <th className="px-4 py-3 text-right">Price</th>
              <th className="px-4 py-3 text-right">Change</th>
              <th className="px-4 py-3 text-right">Last game</th>
              <th className="px-4 py-3 pr-5 text-right text-zinc-600">&nbsp;</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/90">
            {visible.map((r) => {
              const hue = teamHue(r.team_abbr);
              return (
                <tr
                  key={r.player_id}
                  role="link"
                  tabIndex={0}
                  onClick={() => openPlayer(r.player_id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openPlayer(r.player_id);
                    }
                  }}
                  className="cursor-pointer bg-zinc-950/40 transition hover:bg-zinc-900/90 focus-visible:bg-zinc-900/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40"
                >
                  <td className="px-4 py-3 pl-5">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-11 shrink-0 items-center justify-center rounded-lg font-mono text-[10px] font-bold leading-tight tracking-wide text-zinc-100 ring-1 ring-white/10"
                        style={{
                          background: `linear-gradient(145deg, hsla(${hue}, 42%, 28%, 0.95), hsla(${hue}, 35%, 18%, 0.98))`,
                        }}
                      >
                        {r.ticker}
                      </div>
                      <div className="min-w-0">
                        <span className="block truncate font-medium text-zinc-100">
                          {r.player_name}
                        </span>
                        <span className="text-xs text-zinc-600">
                          Model price · tap row for chart
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex rounded-md border px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-zinc-200"
                      style={{
                        borderColor: `hsla(${hue}, 45%, 42%, 0.45)`,
                        backgroundColor: `hsla(${hue}, 35%, 16%, 0.65)`,
                      }}
                    >
                      {r.team_abbr}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-zinc-100">
                    <RowPrice r={r} meta={meta} />
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-mono tabular-nums ${
                      r.change_pct == null
                        ? "text-zinc-500"
                        : r.change_pct >= 0
                          ? "text-emerald-400"
                          : "text-rose-400"
                    }`}
                  >
                    {fmtPct(r.change_pct)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-400">
                    {r.game_date}
                  </td>
                  <td className="px-4 py-3 pr-5 text-right">
                    <Link
                      href={`/player/${r.player_id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-emerald-500/90 hover:text-emerald-400"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Open
                      <span aria-hidden>→</span>
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <p className="p-10 text-center text-sm text-zinc-500">No matches.</p>
        )}
      </div>

      {hiddenCount > 0 && (
        <div className="flex flex-col items-center gap-2 border-t border-zinc-800/80 pt-6">
          {!showAll ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="rounded-xl border border-zinc-600 bg-zinc-900/80 px-6 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-emerald-600/60 hover:bg-zinc-800 hover:text-white"
            >
              Show more — {hiddenCount} more player{hiddenCount === 1 ? "" : "s"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowAll(false)}
              className="rounded-xl border border-zinc-700 px-6 py-2.5 text-sm font-medium text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200"
            >
              Show less (first {PAGE_SIZE} only)
            </button>
          )}
          <p className="text-center text-xs text-zinc-600">
            First page is {PAGE_SIZE} rows; sort order applies before expanding.
          </p>
        </div>
      )}
    </div>
  );
}
