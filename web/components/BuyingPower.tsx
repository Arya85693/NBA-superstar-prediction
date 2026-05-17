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
      <div className="text-[10px] uppercase tracking-wide text-muted">Buying power</div>
      {state === "loading" && (
        <div className="mt-0.5 font-mono text-sm text-muted">…</div>
      )}
      {state === "error" && (
        <div className="mt-0.5 text-xs text-muted">Could not load</div>
      )}
      {state === "ok" && cash !== null && (
        <div className="mt-0.5 font-mono text-sm tabular-nums text-positive">
          {formatUsd(cash)}
        </div>
      )}
    </div>
  );
}
