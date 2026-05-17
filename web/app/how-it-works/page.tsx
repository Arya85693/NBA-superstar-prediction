import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { getMarketMeta } from "@/lib/marketData";

export const metadata = {
  title: "How it works",
};

export const dynamic = "force-dynamic";

const navLinks = [
  { href: "#model", label: "Model price" },
  { href: "#screens", label: "Screens" },
  { href: "#charts", label: "Charts & game score" },
  { href: "#trading", label: "Paper trading" },
  { href: "#warnings", label: "Caution" },
  { href: "#terms", label: "Terms" },
] as const;

const modelSteps = [
  {
    step: "01",
    title: "Anchor & history",
    body: "Each listing starts from an opening anchor and prior-season productivity. That keeps prices from whipsawing on tiny samples early in the year.",
    icon: "◆",
  },
  {
    step: "02",
    title: "Ingested games",
    body: "As regular-season and playoff games enter each ingestion cycle (~30 min cadence), performance feeds the automated repricing engine. The price is a smoothed signal - it carries season context, not just the last box score.",
    icon: "◇",
  },
  {
    step: "03",
    title: "What you trade",
    body: "The number you see is the model’s latest quote for that player. It updates when that player logs another game and otherwise stays flat until the next one.",
    icon: "○",
  },
] as const;

const screens = [
  {
    title: "Market",
    href: "/market",
    accent: "from-accent/15 to-transparent",
    bullets: [
      "Search by name or team; sort by price or recent change.",
      "Each row shows price (2 decimals), team, last game date, and move vs the prior game in your file.",
      "Click a row or Open to go to that player’s detail page.",
    ],
  },
  {
    title: "Player page",
    href: "/market",
    accent: "from-sky-500/12 to-transparent",
    bullets: [
      "Ticker, team, last game date, and season label sit up top for orientation.",
      "Price charts carry model quotes forward between games; tooltips show game score on nights with ingested box scores.",
      "The trade panel buys and sells whole shares at the latest model price.",
    ],
  },
  {
    title: "Portfolio",
    href: "/portfolio",
    accent: "from-violet-500/12 to-transparent",
    bullets: [
      "Paper cash, position value, and total equity - same framing as a simple brokerage view.",
      "Use it to test sizing and holds against the same quotes the model publishes.",
    ],
  },
] as const;

const glossary = [
  {
    term: "Model price",
    def: "The simulator’s valuation for one share of a player at the latest ingested game - not a market quote from any exchange.",
  },
  {
    term: "Game score",
    def: "Hollinger-style single-game summary from the box score. A quiet night doesn’t have to tank price if the model still weights season strength.",
  },
  {
    term: "Paper cash / equity",
    def: "Virtual balance and portfolio totals only. No deposits, withdrawals, or real P&L.",
  },
  {
    term: "Change vs prior game",
    def: "Difference in model price from the previous ingested game row for that player - useful for scanning the latest snapshot.",
  },
  {
    term: "Rolling snapshot",
    def: "Board state after the most recent ingestion cycle. Quotes refresh when new games are added (~30 min cadence), not tick-by-tick.",
  },
  {
    term: "Board total",
    def: "Sum of latest model prices across tracked players. An internal aggregate - not exchange market capitalization.",
  },
] as const;

export default async function HowItWorksPage() {
  let seasonLabel: string | null = null;
  let marketMeta: Awaited<ReturnType<typeof getMarketMeta>> | undefined;
  try {
    marketMeta = await getMarketMeta();
    seasonLabel = marketMeta.current_dataset_season;
  } catch {
    /* page still renders */
  }

  return (
    <div>
      <PageHeader
        eyebrow="Guide"
        title="How it works"
        description="How the automated repricing engine works, how rolling snapshots refresh (~30 min when new games ingest), and how paper trading fits in. Educational - not financial advice or real securities."
        marketMeta={marketMeta}
        showSimulationNote
      />

      {/* Quick jump */}
      <nav
        aria-label="On this page"
        className="-mt-2 mb-10 flex flex-wrap gap-2 border-b border-border/60 pb-8"
      >
        {navLinks.map((l) => (
          <a
            key={l.href}
            href={l.href}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-accent/40 hover:text-accent-hover"
          >
            {l.label}
          </a>
        ))}
      </nav>

      {/* Intro strip */}
      <div className="relative mb-12 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-surface via-background to-accent-muted px-6 py-8 md:px-10 md:py-10">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage: `radial-gradient(circle at 15% 40%, rgb(183 110 121 / 0.12), transparent 50%),
              radial-gradient(circle at 85% 60%, rgb(148 163 184 / 0.1), transparent 45%)`,
          }}
        />
        <div className="relative grid gap-6 md:grid-cols-[1fr_auto] md:items-center md:gap-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
              At a glance
            </p>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-foreground">
              You&apos;re paper-trading simulated shares tied to player value. Prices blend anchors, history,
              and each ingestion cycle; the board refreshes automatically (~30 min) when new games
              arrive - a rolling snapshot, not a live exchange feed.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row md:flex-col">
            <Link href="/market" className="hs-btn hs-btn-primary">
              Open market
            </Link>
            <Link href="/portfolio" className="hs-btn hs-btn-secondary">
              View portfolio
            </Link>
          </div>
        </div>
      </div>

      {/* Model */}
      <section id="model" className="scroll-mt-24">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted">
          The price engine
        </h2>
        <p className="mt-2 max-w-2xl text-xl font-semibold tracking-tight text-foreground md:text-2xl">
          How a model price comes together
        </p>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {modelSteps.map((s) => (
            <div
              key={s.step}
              className="group relative rounded-2xl border border-border bg-surface-muted/35 p-6 transition hover:border-border-strong hover:bg-surface-muted/55"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted">
                  {s.step}
                </span>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-muted font-mono text-base text-accent">
                  {s.icon}
                </div>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-foreground">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Screens */}
      <section id="screens" className="scroll-mt-24 mt-16 md:mt-20">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted">
          Navigation
        </h2>
        <p className="mt-2 max-w-2xl text-xl font-semibold tracking-tight text-foreground md:text-2xl">
          Where to click in the app
        </p>
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {screens.map((sc) => (
            <div
              key={sc.title}
              className="relative overflow-hidden rounded-2xl border border-border bg-surface p-6 md:p-7"
            >
              <div
                className={`pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br ${sc.accent} blur-2xl`}
                aria-hidden
              />
              <div className="relative flex items-start justify-between gap-3">
                <h3 className="text-lg font-semibold text-foreground">{sc.title}</h3>
                <Link
                  href={sc.href}
                  className="shrink-0 text-xs font-semibold text-accent transition hover:text-accent-hover"
                >
                  Go →
                </Link>
              </div>
              <ul className="relative mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
                {sc.bullets.map((b) => (
                  <li key={b} className="flex gap-2.5">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent/70" aria-hidden />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Charts */}
      <section id="charts" className="scroll-mt-24 mt-16 md:mt-20">
        <div className="rounded-2xl border border-border bg-surface-muted/25 p-6 md:flex md:gap-10 md:p-8">
          <div className="md:max-w-md md:shrink-0">
            <h2 className="text-lg font-semibold text-foreground">Charts &amp; game score</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              On a player page, game score is that night&apos;s Hollinger-style summary when a game
              was ingested. Model price can stay elevated after a soft night because the path carries
              prior games and season structure - use chart ranges and season averages to separate blips
              from trends. Flat stretches mean no new game data in that interval.
            </p>
          </div>
          <div className="mt-6 flex-1 border-t border-border pt-6 md:mt-0 md:border-l md:border-t-0 md:pl-10 md:pt-0">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">
              Practical tips
            </p>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <li className="flex gap-2.5">
                <span className="text-positive/80" aria-hidden>
                  ✓
                </span>
                <span>Compare the latest point to the season line - not only to yesterday.</span>
              </li>
              <li className="flex gap-2.5">
                <span className="text-positive/80" aria-hidden>
                  ✓
                </span>
                <span>Resize or pan chart ranges when you want a streak vs full-season context.</span>
              </li>
              <li className="flex gap-2.5">
                <span className="text-positive/80" aria-hidden>
                  ✓
                </span>
                <span>
                  On days without a game, the chart carries the last model price forward so the line
                  stays continuous through inactive stretches.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Trading */}
      <section id="trading" className="scroll-mt-24 mt-16 md:mt-20">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted">
          Execution
        </h2>
        <p className="mt-2 max-w-2xl text-xl font-semibold tracking-tight text-foreground md:text-2xl">
          Paper trading, simply
        </p>
        <div className="mt-6 rounded-2xl border border-border bg-surface p-6 md:p-8">
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            You start with paper cash. Orders are whole shares at the latest model price shown on
            that player - there&apos;s no bid/ask spread or slippage simulation. Your portfolio rolls
            up cash, mark-to-model position value, and total equity so you can rehearse allocation
            ideas on the same timeline as your ingested games.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              { k: "Lot size", v: "Whole shares only" },
              { k: "Fill price", v: "Latest model quote on submit" },
              { k: "Balance", v: "Cash + positions = equity" },
            ].map((row) => (
              <div
                key={row.k}
                className="rounded-xl border border-border bg-background/50 px-4 py-3"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  {row.k}
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">{row.v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Warnings */}
      <section id="warnings" className="scroll-mt-24 mt-16 md:mt-20">
        <h2 className="text-lg font-semibold text-foreground">Caution next to a price</h2>
        <div className="mt-4 hs-callout-warning md:px-5 md:py-5">
          <p>
            <span className="mr-1.5 text-warning" aria-hidden>
              ⚠
            </span>
            A warning means this player has{" "}
            <strong className="font-semibold text-foreground">no minutes logged</strong>
            {seasonLabel ? (
              <>
                {" "}
                in <span className="font-mono text-warning/95">{seasonLabel}</span>
              </>
            ) : (
              " in the newest season present"
            )}{" "}
            in your dataset file - injury, inactive, or data lag. The price may still reflect older
            seasons or the model anchor; treat it as stale relative to current floor time until your
            file catches up.
          </p>
        </div>
      </section>

      <div className="hs-guide-lower-band -mx-5 px-5 md:-mx-8 md:px-8">
        {/* Glossary */}
        <section id="terms" className="scroll-mt-24">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted">
          Glossary
        </h2>
        <p className="mt-2 text-xl font-semibold tracking-tight text-foreground md:text-2xl">
          Terms you&apos;ll see repeated
        </p>
        <dl className="mt-8 grid gap-4 sm:grid-cols-2">
          {glossary.map((g) => (
            <div
              key={g.term}
              className="rounded-2xl border border-border bg-surface px-5 py-4"
            >
              <dt className="font-semibold text-foreground">{g.term}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted">{g.def}</dd>
            </div>
          ))}
        </dl>
        </section>

        {/* Closing disclaimer + CTAs */}
        <div className="hs-panel-cta mt-16 flex w-full flex-col gap-6 px-7 py-8 md:mt-20 md:flex-row md:items-center md:justify-between md:px-10 md:py-9">
        <p className="max-w-2xl text-sm leading-relaxed text-muted md:pr-6">
          Simulation only - paper currency and model-driven prices. Nothing here is investment
          advice, a prediction of real athletic or financial outcomes, or an offer of securities.
          If your pipeline or dataset changes, replay history and labels change with it.
        </p>
        <div className="flex shrink-0 flex-wrap gap-3">
          <Link
            href="/market"
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground hover:bg-accent-hover"
          >
            Open market
          </Link>
          <Link
            href="/portfolio"
            className="rounded-xl border border-border-strong bg-surface px-5 py-2.5 text-sm font-medium text-foreground hover:border-border-strong"
          >
            Portfolio
          </Link>
          <Link
            href="/"
            className="rounded-xl border border-border-strong px-5 py-2.5 text-sm font-medium text-foreground hover:border-border-strong"
          >
            Back to home
          </Link>
        </div>
      </div>
      </div>
    </div>
  );
}
