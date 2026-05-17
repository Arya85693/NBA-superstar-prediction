import Link from "next/link";

import { MarketPreviewCard } from "@/components/home/MarketPreviewCard";
import { ButtonLink } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import type { MarketAnalytics } from "@/lib/marketAnalytics";
import type { MarketMeta } from "@/lib/types";

export function LandingHero({
  analytics,
  meta,
  listingCount,
}: {
  analytics?: MarketAnalytics;
  meta?: MarketMeta;
  listingCount?: number;
}) {
  const hasPreview = analytics && meta && listingCount != null;

  return (
    <section className="relative z-0 pb-2 pt-0 md:pb-3">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[min(18rem,62%)] opacity-90"
        style={{
          backgroundImage: `radial-gradient(ellipse 70% 50% at 0% 0%, rgb(181 106 122 / 0.14), transparent 55%),
            radial-gradient(ellipse 50% 40% at 100% 10%, rgb(30 42 58 / 0.06), transparent 50%)`,
        }}
        aria-hidden
      />

      <div className="relative grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 xl:gap-12">
        <div className="max-w-xl lg:max-w-none">
          <Eyebrow>Track · Trade · Learn</Eyebrow>
          <h1 className="hs-display mt-4 text-charcoal">
            NBA player value that moves with{" "}
            <span className="text-accent">real games</span>
          </h1>
          <p className="hs-prose mt-4 max-w-lg">
            See who repriced after each refresh, understand why, and paper trade players you
            believe in - no real money, updated automatically from game data.
          </p>
          <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <span className="text-accent" aria-hidden>→</span>
              Model prices from on-court performance
            </li>
            <li className="flex gap-2">
              <span className="text-accent" aria-hidden>→</span>
              Board refreshes ~every 30 minutes
            </li>
            <li className="flex gap-2">
              <span className="text-accent" aria-hidden>→</span>
              $100k paper portfolio to practice
            </li>
          </ul>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:gap-4">
            <ButtonLink href="/market" variant="primary" size="lg" className="min-w-[11rem]">
              See latest movers
            </ButtonLink>
            <ButtonLink href="/portfolio" variant="secondary" size="lg" className="min-w-[11rem]">
              My portfolio
            </ButtonLink>
          </div>
          <p className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-positive" aria-hidden />
              Paper trading only
            </span>
            <span className="hidden text-border sm:inline" aria-hidden>
              ·
            </span>
            <Link href="/how-it-works" className="font-medium text-accent transition hover:text-accent-hover">
              How pricing works →
            </Link>
          </p>
        </div>

        {hasPreview ? (
          <MarketPreviewCard
            analytics={analytics}
            meta={meta}
            listingCount={listingCount}
          />
        ) : (
          <HeroPreviewPlaceholder />
        )}
      </div>
    </section>
  );
}

function HeroPreviewPlaceholder() {
  return (
    <div className="hs-hero-market-card flex min-h-[18rem] items-center justify-center border-dashed">
      <p className="max-w-xs text-center text-sm text-muted">
        Connect market data to preview the latest rolling snapshot here.
      </p>
    </div>
  );
}

const features = [
  {
    title: "Model-driven prices",
    body: "Smoothing across opening anchor, prior-season productivity, and each new ingested game - not just last night's box score.",
    mark: "01",
  },
  {
    title: "Paper execution",
    body: "Buy and sell whole shares with a cash balance. Track equity and positions like a brokerage view.",
    mark: "02",
  },
  {
    title: "History & context",
    body: "Per-player charts, game score vs season averages, and cautions when the dataset shows no minutes yet.",
    mark: "03",
  },
] as const;

export function LandingFeatures() {
  return (
    <section className="hs-page-section-tight">
      <div className="mx-auto max-w-2xl text-center">
        <Eyebrow className="text-muted">Platform</Eyebrow>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-charcoal md:text-[1.75rem]">
          Engineered for rolling snapshots
        </h2>
        <p className="hs-prose mx-auto mt-3 max-w-lg">
          Every screen uses the same automated model quotes - scan the latest board, drill into a
          player, and paper trade against each refresh cycle.
        </p>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-3 md:gap-5">
        {features.map((f) => (
          <article
            key={f.title}
            className="group hs-card p-6 transition duration-200 hover:-translate-y-0.5 hover:border-accent/20 hover:shadow-md md:p-7"
          >
            <span className="font-mono text-xs font-semibold tracking-widest text-accent/80">
              {f.mark}
            </span>
            <h3 className="mt-3 text-lg font-semibold tracking-tight text-charcoal">{f.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{f.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function LandingCta({ seasonLabel }: { seasonLabel: string | null }) {
  return (
    <section className="hs-page-section-tight">
      <div className="hs-panel-cta flex flex-col items-start gap-6 px-7 py-8 md:flex-row md:items-center md:justify-between md:px-10 md:py-9">
        <div className="max-w-xl">
          <p className="hs-eyebrow">Get started</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-charcoal md:text-2xl">
            Ready to browse the board?
          </h2>
          <p className="hs-prose mt-3">
            Search players by name or team, sort by price, and drill into any listing for charts
            and paper trading on the latest snapshot.
            {seasonLabel && (
              <>
                {" "}
                Latest dataset season:{" "}
                <span className="hs-stat-value font-medium text-charcoal">{seasonLabel}</span>.
              </>
            )}
          </p>
        </div>
        <ButtonLink href="/market" variant="primary" size="lg" className="shrink-0">
          Go to market →
        </ButtonLink>
      </div>
    </section>
  );
}
