import { formatPct } from "@/lib/marketAnalytics";

export function MoverKpiValue({
  ticker,
  changePct,
  tone,
}: {
  ticker: string;
  changePct: number;
  tone: "positive" | "negative";
}) {
  const toneClass = tone === "positive" ? "text-positive" : "text-negative";

  return (
    <p
      className={`whitespace-nowrap font-mono text-lg font-semibold leading-tight tabular-nums tracking-tight md:text-xl ${toneClass}`}
    >
      {ticker} {formatPct(changePct)}
    </p>
  );
}
