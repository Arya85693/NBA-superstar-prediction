"use client";

import type { MarketMeta, MarketRow } from "@/lib/types";
import { SinceLastVisitBanner } from "./SinceLastVisitBanner";

export function SinceLastVisitSection({
  rows,
  meta,
}: {
  rows: MarketRow[];
  meta: MarketMeta;
}) {
  return <SinceLastVisitBanner rows={rows} meta={meta} />;
}
