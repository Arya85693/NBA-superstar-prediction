"use client";

import { formatUsd } from "@/lib/format";

type State = "loading" | "ok" | "error";

export function BuyingPower({
  cash,
  state,
  className = "",
}: {
  cash: number | null;
  state: State;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">Buying power</div>
      {state === "loading" && (
        <div className="mt-0.5 font-mono text-sm text-zinc-500">…</div>
      )}
      {state === "error" && (
        <div className="mt-0.5 text-xs text-zinc-500">Could not load</div>
      )}
      {state === "ok" && cash !== null && (
        <div className="mt-0.5 font-mono text-sm tabular-nums text-emerald-400">
          {formatUsd(cash)}
        </div>
      )}
    </div>
  );
}
