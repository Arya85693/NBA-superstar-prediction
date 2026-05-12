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
    title: "Live games",
    body: "As regular-season and playoff games land in your dataset, performance feeds the model. The price is a smoothed signal — it carries season context, not just the last box score.",
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
    accent: "from-emerald-500/15 to-transparent",
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
      "Charts compare model price to game score over time and carry prices forward between games, so inactive stretches stay visible.",
      "The trade panel buys and sells whole shares at the latest model price.",
    ],
  },
  {
    title: "Portfolio",
    href: "/portfolio",
    accent: "from-violet-500/12 to-transparent",
    bullets: [
      "Paper cash, position value, and total equity — same framing as a simple brokerage view.",
      "Use it to test sizing and holds against the same quotes the model publishes.",
    ],
  },
] as const;

const glossary = [
  {
    term: "Model price",
    def: "The simulator’s valuation for one share of a player at the latest ingested game — not a market quote from any exchange.",
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
    def: "Difference in model price from the previous game row in your dataset for that player — useful for scanning the board.",
  },
] as const;

export default async function HowItWorksPage() {
  let seasonLabel: string | null = null;
  try {
    const meta = await getMarketMeta();
    seasonLabel = meta.current_dataset_season;
  } catch {
    /* page still renders */
  }

  return (
    <div>
      <PageHeader
        eyebrow="Guide"
        title="How it works"
        description="A practical map of the simulator: how prices are built, what each screen is for, and how simulated trading fits in. This is education about the app — not financial advice, and not real securities."
      />

      {/* Quick jump */}
      <nav
        aria-label="On this page"
        className="-mt-2 mb-10 flex flex-wrap gap-2 border-b border-zinc-800/60 pb-8"
      >
        {navLinks.map((l) => (
          <a
            key={l.href}
            href={l.href}
            className="rounded-full border border-zinc-700/80 bg-zinc-900/40 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-emerald-700/60 hover:text-emerald-300"
          >
            {l.label}
          </a>
        ))}
      </nav>

      {/* Intro strip */}
      <div className="relative mb-12 overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-zinc-900/90 via-zinc-950 to-emerald-950/25 px-6 py-8 md:px-10 md:py-10">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage: `radial-gradient(circle at 15% 40%, rgba(52, 211, 153, 0.1), transparent 50%),
              radial-gradient(circle at 85% 60%, rgba(59, 130, 246, 0.06), transparent 45%)`,
          }}
        />
        <div className="relative grid gap-6 md:grid-cols-[1fr_auto] md:items-center md:gap-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400/90">
              At a glance
            </p>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-300">
              You&apos;re paper-trading model-implied &quot;shares&quot; of players. Prices blend anchors,
              history, and new games; the UI is built so you can sanity-check moves against charts and
              season context — not chase one noisy stat.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row md:flex-col">
            <Link
              href="/market"
              className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-zinc-950 shadow-lg shadow-emerald-900/25 transition hover:bg-emerald-400"
            >
              Open market
            </Link>
            <Link
              href="/portfolio"
              className="inline-flex items-center justify-center rounded-xl border border-zinc-600 bg-zinc-900/50 px-5 py-3 text-sm font-medium text-zinc-200 transition hover:border-zinc-500"
            >
              View portfolio
            </Link>
          </div>
        </div>
      </div>

      {/* Model */}
      <section id="model" className="scroll-mt-24">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
          The price engine
        </h2>
        <p className="mt-2 max-w-2xl text-xl font-semibold tracking-tight text-zinc-100 md:text-2xl">
          How a model price comes together
        </p>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {modelSteps.map((s) => (
            <div
              key={s.step}
              className="group relative rounded-2xl border border-zinc-800/90 bg-zinc-900/35 p-6 transition hover:border-zinc-700 hover:bg-zinc-900/55"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                  {s.step}
                </span>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700/80 bg-zinc-950/80 font-mono text-base text-emerald-500/90">
                  {s.icon}
                </div>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-zinc-100">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Screens */}
      <section id="screens" className="scroll-mt-24 mt-16 md:mt-20">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Navigation
        </h2>
        <p className="mt-2 max-w-2xl text-xl font-semibold tracking-tight text-zinc-100 md:text-2xl">
          Where to click in the app
        </p>
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {screens.map((sc) => (
            <div
              key={sc.title}
              className="relative overflow-hidden rounded-2xl border border-zinc-800/90 bg-zinc-900/30 p-6 md:p-7"
            >
              <div
                className={`pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br ${sc.accent} blur-2xl`}
                aria-hidden
              />
              <div className="relative flex items-start justify-between gap-3">
                <h3 className="text-lg font-semibold text-zinc-100">{sc.title}</h3>
                <Link
                  href={sc.href}
                  className="shrink-0 text-xs font-semibold text-emerald-400/90 transition hover:text-emerald-300"
                >
                  Go →
                </Link>
              </div>
              <ul className="relative mt-4 space-y-3 text-sm leading-relaxed text-zinc-400">
                {sc.bullets.map((b) => (
                  <li key={b} className="flex gap-2.5">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-emerald-500/70" aria-hidden />
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
        <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/25 p-6 md:flex md:gap-10 md:p-8">
          <div className="md:max-w-md md:shrink-0">
            <h2 className="text-lg font-semibold text-zinc-100">Charts &amp; game score</h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              On a player page, game score is that night&apos;s Hollinger-style summary from the box
              score. Model price can stay elevated after a soft night because the path carries prior
              games and season structure — use the chart window and season averages to see whether a
              move is a blip or part of a trend.
            </p>
          </div>
          <div className="mt-6 flex-1 border-t border-zinc-800/80 pt-6 md:mt-0 md:border-l md:border-t-0 md:pl-10 md:pt-0">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
              Practical tips
            </p>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-zinc-400">
              <li className="flex gap-2.5">
                <span className="text-emerald-500/80" aria-hidden>
                  ✓
                </span>
                <span>Compare the latest point to the season line — not only to yesterday.</span>
              </li>
              <li className="flex gap-2.5">
                <span className="text-emerald-500/80" aria-hidden>
                  ✓
                </span>
                <span>Resize or pan chart ranges when you want a streak vs full-season context.</span>
              </li>
              <li className="flex gap-2.5">
                <span className="text-emerald-500/80" aria-hidden>
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
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Execution
        </h2>
        <p className="mt-2 max-w-2xl text-xl font-semibold tracking-tight text-zinc-100 md:text-2xl">
          Paper trading, simply
        </p>
        <div className="mt-6 rounded-2xl border border-zinc-800/90 bg-zinc-900/30 p-6 md:p-8">
          <p className="max-w-3xl text-sm leading-relaxed text-zinc-400">
            You start with paper cash. Orders are whole shares at the latest model price shown on
            that player — there&apos;s no bid/ask spread or slippage simulation. Your portfolio rolls
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
                className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-4 py-3"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
                  {row.k}
                </p>
                <p className="mt-1 text-sm font-medium text-zinc-200">{row.v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Warnings */}
      <section id="warnings" className="scroll-mt-24 mt-16 md:mt-20">
        <h2 className="text-lg font-semibold text-zinc-100">Caution next to a price</h2>
        <div className="mt-4 rounded-xl border border-amber-900/45 bg-amber-950/25 px-4 py-4 text-sm leading-relaxed text-amber-100/95 md:px-5 md:py-5">
          <p>
            <span className="mr-1.5 text-amber-400" aria-hidden>
              ⚠️
            </span>
            A warning means this player has{" "}
            <strong className="font-semibold text-amber-50">no minutes logged</strong>
            {seasonLabel ? (
              <>
                {" "}
                in <span className="font-mono text-amber-200/95">{seasonLabel}</span>
              </>
            ) : (
              " in the newest season present"
            )}{" "}
            in your dataset file — injury, inactive, or data lag. The price may still reflect older
            seasons or the model anchor; treat it as stale relative to current floor time until your
            file catches up.
          </p>
        </div>
      </section>

      {/* Glossary */}
      <section id="terms" className="scroll-mt-24 mt-16 md:mt-20">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Glossary
        </h2>
        <p className="mt-2 text-xl font-semibold tracking-tight text-zinc-100 md:text-2xl">
          Terms you&apos;ll see repeated
        </p>
        <dl className="mt-8 grid gap-4 sm:grid-cols-2">
          {glossary.map((g) => (
            <div
              key={g.term}
              className="rounded-2xl border border-zinc-800/90 bg-zinc-900/25 px-5 py-4"
            >
              <dt className="font-semibold text-zinc-200">{g.term}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-zinc-500">{g.def}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Closing disclaimer + CTAs */}
      <div className="mt-16 rounded-2xl border border-zinc-800 bg-zinc-900/35 px-6 py-8 md:mt-20 md:px-10">
        <p className="max-w-3xl text-sm leading-relaxed text-zinc-500">
          Simulation only — paper currency and model-driven prices. Nothing here is investment
          advice, a prediction of real athletic or financial outcomes, or an offer of securities.
          If your pipeline or dataset changes, replay history and labels change with it.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/market"
            className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
          >
            Open market
          </Link>
          <Link
            href="/portfolio"
            className="rounded-xl border border-zinc-600 bg-zinc-900/50 px-5 py-2.5 text-sm font-medium text-zinc-200 hover:border-zinc-500"
          >
            Portfolio
          </Link>
          <Link
            href="/"
            className="rounded-xl border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-300 hover:border-zinc-500"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
