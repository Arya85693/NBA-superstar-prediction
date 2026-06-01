import { formatUsd } from "@/lib/format";
import type { MarketQuote } from "@/lib/types";

function premiumLabel(premiumPct: number): { text: string; tone: string } {
  const pct = premiumPct * 100;
  if (pct > 0.05) {
    return { text: `Trading ${pct.toFixed(1)}% above Fair Value`, tone: "text-positive" };
  }
  if (pct < -0.05) {
    return {
      text: `Trading ${Math.abs(pct).toFixed(1)}% below Fair Value`,
      tone: "text-negative",
    };
  }
  return { text: "Trading in line with Fair Value", tone: "text-muted-foreground" };
}

/**
 * Explainability surface for Layer 2. Shows the gap between Market Price and
 * Fair Value and the human-readable drivers behind it. Every line is sourced
 * from pipeline/market_engine.py — there is no random movement to explain.
 */
export function MarketExplainCard({ market }: { market: MarketQuote }) {
  const premium = premiumLabel(market.premium_pct);
  const isFallback = market.source === "fair_value_fallback";

  return (
    <section
      className="mt-6 rounded-2xl border border-border bg-surface-muted/30 px-5 py-6 md:px-7"
      aria-labelledby="market-explain-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="hs-eyebrow">Two-layer pricing</p>
          <h2
            id="market-explain-heading"
            className="mt-2 text-lg font-semibold text-charcoal"
          >
            Why this price
          </h2>
        </div>
        <span className={`text-sm font-medium ${premium.tone}`}>{premium.text}</span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <dt className="hs-label">Market price</dt>
          <dd className="mt-1 font-mono text-xl text-foreground">
            {formatUsd(market.market_price)}
          </dd>
          <p className="mt-1 text-xs text-muted">What you buy and sell at.</p>
        </div>
        <div>
          <dt className="hs-label">Fair value</dt>
          <dd className="mt-1 font-mono text-xl text-foreground">
            {formatUsd(market.fair_value)}
          </dd>
          <p className="mt-1 text-xs text-muted">Justified by basketball production.</p>
        </div>
        <div>
          <dt className="hs-label">Premium / discount</dt>
          <dd
            className={`mt-1 font-mono text-xl ${
              market.premium_pct > 0
                ? "text-positive"
                : market.premium_pct < 0
                  ? "text-negative"
                  : "text-foreground"
            }`}
          >
            {market.premium_pct >= 0 ? "+" : ""}
            {(market.premium_pct * 100).toFixed(2)}%
          </dd>
          <p className="mt-1 text-xs text-muted">Market price vs Fair Value.</p>
        </div>
      </dl>

      {market.drivers.length > 0 && (
        <ul className="mt-5 space-y-2.5">
          {market.drivers.map((d) => (
            <li
              key={d}
              className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground"
            >
              <span
                className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent/70"
                aria-hidden
              />
              <span>{d}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-5 text-xs text-muted">
        {isFallback ? (
          <>Market Price layer not published yet — showing Fair Value.</>
        ) : (
          <>
            <strong className="font-medium text-muted-foreground">How it works:</strong>{" "}
            Fair Value updates from games. Market Price drifts toward Fair Value plus
            explainable premiums from projections, demand, sentiment and team context —
            with movement caps so it can never be pumped. No random movement.
          </>
        )}
      </p>
    </section>
  );
}
