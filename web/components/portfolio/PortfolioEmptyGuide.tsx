import Link from "next/link";

const steps = [
  { n: "1", text: "Open the market and pick a player who moved.", href: "/market" },
  { n: "2", text: "Read the insight block - understand why value changed.", href: "/market" },
  { n: "3", text: "Paper buy shares, then track P&L here.", href: "/market" },
] as const;

export function PortfolioEmptyGuide() {
  return (
    <div className="rounded-2xl border border-border bg-surface p-8 text-center">
      <p className="hs-eyebrow">No positions yet</p>
      <h2 className="mt-2 text-lg font-semibold text-charcoal">Start your paper portfolio</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        You have $100,000 in simulated cash. Buy shares when you believe a player&apos;s value
        will rise after strong games.
      </p>
      <ol className="mx-auto mt-6 max-w-sm space-y-3 text-left text-sm text-muted-foreground">
        {steps.map((s) => (
          <li key={s.n} className="flex gap-3">
            <span className="font-mono text-xs font-semibold text-accent">{s.n}</span>
            <Link href={s.href} className="hover:text-accent">
              {s.text}
            </Link>
          </li>
        ))}
      </ol>
      <Link href="/market" className="hs-btn hs-btn-primary mt-8 inline-flex">
        Go to market
      </Link>
    </div>
  );
}
