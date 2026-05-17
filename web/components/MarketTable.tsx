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
          <span className="text-muted">$</span>
          <span className="text-foreground">{num}</span>
        </span>
      </div>
      <div className="flex h-6 w-7 shrink-0 items-center justify-start pl-1">
        {caution ? (
          <span
            className="inline-flex leading-none text-warning"
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
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
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
              className="hs-input py-2.5 pl-10 shadow-none"
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            Displaying{" "}
            <span className="font-medium text-muted-foreground">{visible.length}</span>
            {hiddenCount > 0 && !showAll ? (
              <>
                {" "}
                of{" "}
                <span className="font-medium text-muted-foreground">{sorted.length}</span> in this
                list
              </>
            ) : (
              <>
                {" "}
                player{visible.length === 1 ? "" : "s"} in this list
                {sorted.length !== rows.length && (
                  <>
                    {" "}
                    (<span className="font-medium text-muted-foreground">{rows.length}</span> total in
                    market)
                  </>
                )}
              </>
            )}
            {q.trim() ? " · filtered by search" : ""}. Row opens detail — charts &amp; trade.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="market-sort" className="text-xs font-medium text-muted">
            Sort
          </label>
          <select
            id="market-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="hs-select"
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
          return (
            <button
              key={r.player_id}
              type="button"
              onClick={() => openPlayer(r.player_id)}
              className="group hs-card flex w-full gap-3 p-4 text-left transition hover:shadow-md"
            >
              <div className="hs-ticker-chip h-12 w-[3.25rem] text-[11px]">{r.ticker}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground group-hover:text-accent">
                      {r.player_name}
                    </p>
                    <span className="hs-team-badge mt-1">{r.team_abbr}</span>
                  </div>
                  <span className="shrink-0 text-muted transition group-hover:text-accent">
                    →
                  </span>
                </div>
                <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
                  <div className="flex flex-nowrap items-center justify-between gap-3">
                    <RowPrice r={r} meta={meta} align="start" />
                    <span
                      className={`shrink-0 tabular-nums ${
                        r.change_pct == null
                          ? "text-muted"
                          : r.change_pct >= 0
                            ? "text-positive"
                            : "text-negative"
                      }`}
                    >
                      {fmtPct(r.change_pct)}
                    </span>
                  </div>
                  <div className="text-xs text-muted">{r.game_date}</div>
                </div>
              </div>
            </button>
          );
        })}
        {sorted.length === 0 && (
          <p className="rounded-2xl border border-border py-10 text-center text-sm text-muted">
            No matches. Try another search.
          </p>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden hs-table-shell md:block">
        <table>
          <thead>
            <tr>
              <th className="pl-5">Player</th>
              <th>Team</th>
              <th className="text-right">Price</th>
              <th className="text-right">Change</th>
              <th className="text-right">Last game</th>
              <th className="pr-5 text-right">&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
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
              >
                <td className="px-4 py-3.5 pl-5">
                  <div className="flex items-center gap-3">
                    <div className="hs-ticker-chip h-10 w-11 text-[10px]">{r.ticker}</div>
                    <div className="min-w-0">
                      <span className="block truncate font-medium text-foreground">
                        {r.player_name}
                      </span>
                      <span className="text-xs text-muted">Model price · tap for chart</span>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <span className="hs-team-badge">{r.team_abbr}</span>
                </td>
                <td className="px-4 py-3.5 font-medium text-foreground">
                  <RowPrice r={r} meta={meta} />
                </td>
                <td
                  className={`px-4 py-3.5 text-right font-mono tabular-nums ${
                    r.change_pct == null
                      ? "text-muted"
                      : r.change_pct >= 0
                        ? "text-positive"
                        : "text-negative"
                  }`}
                >
                  {fmtPct(r.change_pct)}
                </td>
                <td className="px-4 py-3.5 text-right tabular-nums text-muted-foreground">
                  {r.game_date}
                </td>
                <td className="px-4 py-3.5 pr-5 text-right">
                  <Link
                    href={`/player/${r.player_id}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Open
                    <span aria-hidden>→</span>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <p className="p-10 text-center text-sm text-muted">No matches.</p>
        )}
      </div>

      {hiddenCount > 0 && (
        <div className="flex flex-col items-center gap-2 border-t border-border pt-6">
          {!showAll ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="rounded-xl border border-border-strong bg-surface-muted px-6 py-2.5 text-sm font-medium text-foreground transition hover:border-accent/50 hover:bg-surface-inset hover:text-foreground"
            >
              Show more — {hiddenCount} more player{hiddenCount === 1 ? "" : "s"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowAll(false)}
              className="rounded-xl border border-border-strong px-6 py-2.5 text-sm font-medium text-muted-foreground transition hover:border-border-strong hover:text-foreground"
            >
              Show less (first {PAGE_SIZE} only)
            </button>
          )}
          <p className="text-center text-xs text-muted">
            First page is {PAGE_SIZE} rows; sort order applies before expanding.
          </p>
        </div>
      )}
    </div>
  );
}
