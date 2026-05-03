import Link from "next/link";
import { getMarketMeta } from "@/lib/marketData";
import { LandingCta, LandingFeatures, LandingHero } from "@/components/Landing";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let seasonLabel: string | null = null;
  try {
    const meta = await getMarketMeta();
    seasonLabel = meta.current_dataset_season;
  } catch {
    /* landing still works */
  }

  return (
    <div className="pb-12">
      <LandingHero />
      <LandingFeatures />

      <section className="mt-16 border-y border-zinc-800/80 bg-zinc-900/20 py-10 md:mt-20">
        <div className="mx-auto flex max-w-4xl flex-col gap-6 px-2 md:flex-row md:items-center md:justify-between md:gap-10">
          <div className="text-center md:text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Learn
            </p>
            <p className="mt-2 text-lg font-medium text-zinc-200">
              How prices move and what each screen shows
            </p>
          </div>
          <Link
            href="/how-it-works"
            className="inline-flex items-center justify-center self-center rounded-xl border border-emerald-800/60 bg-emerald-950/30 px-5 py-2.5 text-sm font-medium text-emerald-300 transition hover:border-emerald-600 hover:bg-emerald-950/50 md:self-auto"
          >
            How it works
          </Link>
        </div>
      </section>

      <LandingCta seasonLabel={seasonLabel} />
    </div>
  );
}
