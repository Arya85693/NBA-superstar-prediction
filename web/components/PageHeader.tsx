import { MarketRefreshMeta } from "@/components/market/MarketRefreshMeta";
import { Eyebrow } from "@/components/ui/Eyebrow";
import type { MarketMeta } from "@/lib/types";

export function PageHeader({
  eyebrow,
  title,
  description,
  marketMeta,
  showSimulationNote = false,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  marketMeta?: MarketMeta;
  showSimulationNote?: boolean;
}) {
  return (
    <header className="mb-10 border-b border-border/70 pb-8">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h1 className={`hs-page-title ${eyebrow ? "mt-3" : ""}`}>{title}</h1>
      {description && <p className="hs-prose mt-4 max-w-2xl">{description}</p>}
      {marketMeta ? (
        <MarketRefreshMeta
          meta={marketMeta}
          variant="bar"
          showSimulationNote={showSimulationNote}
          className="mt-6"
        />
      ) : null}
    </header>
  );
}

