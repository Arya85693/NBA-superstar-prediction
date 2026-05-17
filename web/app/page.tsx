import type { ReactNode } from "react";
import Link from "next/link";
import { HomeMarketPulse } from "@/components/home/HomeMarketPulse";
import { HomeMoversSection } from "@/components/home/HomeMoversSection";
import { LandingCta, LandingFeatures, LandingHero } from "@/components/Landing";
import { ButtonLink } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { computeMarketAnalytics } from "@/lib/marketAnalytics";
import { getMarketMeta, getMarketRows } from "@/lib/marketData";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let seasonLabel: string | null = null;
  let marketSections: ReactNode = null;
  let heroProps: {
    analytics?: ReturnType<typeof computeMarketAnalytics>;
    meta?: Awaited<ReturnType<typeof getMarketMeta>>;
    listingCount?: number;
  } = {};

  try {
    const [rows, meta] = await Promise.all([getMarketRows(), getMarketMeta()]);
    seasonLabel = meta.current_dataset_season;
    const analytics = computeMarketAnalytics(rows);
    heroProps = { analytics, meta, listingCount: rows.length };
    marketSections = (
      <>
        <HomeMarketPulse meta={meta} analytics={analytics} listingCount={rows.length} />
        <HomeMoversSection analytics={analytics} />
      </>
    );
  } catch {
    marketSections = (
      <section className="mt-10 hs-callout-warning px-6 py-12 text-center md:px-10">
        <p className="text-base font-medium text-warning">Market intelligence unavailable</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          Run the pipeline or check your data source, then refresh. You can still browse
          other pages.
        </p>
        <ButtonLink href="/market" variant="secondary" className="mt-6">
          Try market board
        </ButtonLink>
      </section>
    );
  }

  return (
    <div className="pb-14 md:pb-20">
      <LandingHero {...heroProps} />
      <div className="hs-home-market-band -mx-5 px-5 md:-mx-8 md:px-8">
        {marketSections}
      </div>

      <div className="hs-page-section-tight">
        <LandingFeatures />
      </div>

      <section className="hs-page-section-tight">
        <div className="hs-card flex flex-col items-center gap-5 px-6 py-8 text-center md:flex-row md:justify-between md:gap-8 md:px-9 md:py-9 md:text-left">
          <div>
            <Eyebrow className="text-muted">Learn</Eyebrow>
            <p className="mt-2 text-lg font-semibold tracking-tight text-charcoal md:text-xl">
              How prices move and what each screen shows
            </p>
          </div>
          <ButtonLink href="/how-it-works" variant="secondary">
            Read the guide
          </ButtonLink>
        </div>
      </section>

      <LandingCta seasonLabel={seasonLabel} />
    </div>
  );
}
