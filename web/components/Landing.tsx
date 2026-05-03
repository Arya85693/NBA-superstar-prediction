import Link from "next/link";

export function LandingHero() {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-zinc-900/90 via-zinc-950 to-emerald-950/30 px-6 py-14 shadow-2xl shadow-black/40 md:px-12 md:py-20">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: `radial-gradient(circle at 20% 30%, rgba(52, 211, 153, 0.12), transparent 45%),
            radial-gradient(circle at 80% 70%, rgba(59, 130, 246, 0.08), transparent 40%)`,
        }}
      />
      <div className="relative mx-auto max-w-3xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-400/90">
          Paper trading · Model prices
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-50 md:text-5xl lg:text-6xl">
          Trade NBA players like{" "}
          <span className="bg-gradient-to-r from-emerald-300 to-teal-400 bg-clip-text text-transparent">
            stocks
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-zinc-400">
          A simulated market powered by your pipeline — season anchors, game-by-game updates,
          and a paper portfolio so you can explore the model without real money.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <Link
            href="/market"
            className="inline-flex min-w-[200px] items-center justify-center rounded-xl bg-emerald-500 px-6 py-3.5 text-sm font-semibold text-zinc-950 shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-400"
          >
            Open market
          </Link>
          <Link
            href="/portfolio"
            className="inline-flex min-w-[200px] items-center justify-center rounded-xl border border-zinc-600 bg-zinc-900/50 px-6 py-3.5 text-sm font-medium text-zinc-200 backdrop-blur transition hover:border-zinc-500 hover:bg-zinc-800/60"
          >
            View portfolio
          </Link>
        </div>
      </div>
    </section>
  );
}

const features = [
  {
    title: "Model-driven prices",
    body: "Smoothing across IPO, prior-season productivity, and live game signal — not just last night’s box score.",
    icon: "◆",
  },
  {
    title: "Paper execution",
    body: "Buy and sell whole shares with a cash balance. Track equity and positions like a real brokerage view.",
    icon: "◇",
  },
  {
    title: "History & context",
    body: "Per-player charts, game score vs season averages, and cautions when the dataset shows no minutes yet.",
    icon: "○",
  },
] as const;

export function LandingFeatures() {
  return (
    <section className="mt-16 md:mt-24">
      <h2 className="text-center text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
        Product
      </h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-2xl font-semibold tracking-tight text-zinc-100 md:text-3xl">
        Everything you need to explore the market
      </p>
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {features.map((f) => (
          <div
            key={f.title}
            className="group rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-6 transition hover:border-zinc-700 hover:bg-zinc-900/70"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700/80 bg-zinc-950/80 font-mono text-lg text-emerald-500/90">
              {f.icon}
            </div>
            <h3 className="mt-4 text-lg font-semibold text-zinc-100">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function LandingCta({ seasonLabel }: { seasonLabel: string | null }) {
  return (
    <section className="mt-16 rounded-2xl border border-zinc-800 bg-zinc-900/30 px-6 py-10 md:mt-24 md:px-10">
      <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100 md:text-2xl">
            Ready to browse the board?
          </h2>
          <p className="mt-2 max-w-xl text-sm text-zinc-500">
            Search players by name or team, sort by price, and drill into any listing for charts
            and trading.
            {seasonLabel && (
              <>
                {" "}
                Latest dataset season:{" "}
                <span className="font-mono text-zinc-400">{seasonLabel}</span>.
              </>
            )}
          </p>
        </div>
        <Link
          href="/market"
          className="shrink-0 rounded-xl bg-zinc-100 px-6 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-white"
        >
          Go to market →
        </Link>
      </div>
    </section>
  );
}
