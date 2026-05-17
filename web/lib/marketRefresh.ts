import type { MarketAnalytics } from "./marketAnalytics";
import { formatRelativeUpdated } from "./marketAnalytics";
import type { MarketMeta } from "./types";

/** Documented automated ingestion cadence - shown in UI when pipeline runs on schedule. */
export const REFRESH_CADENCE_LABEL = "~30 min";

export const BOARD_TOTAL_TOOLTIP =
  "Aggregate sum of latest model prices across tracked players. Not a real market capitalization metric.";

export const CHANGE_VS_PRIOR_GAME_TOOLTIP =
  "Percent change in model price versus each player's previous ingested game row in the dataset.";

export const SIMULATION_NOTE =
  "Model-driven simulation - paper currency only. Prices derive from ingested game performance and refresh on each ingestion cycle.";

export function formatLastRefreshAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export type MarketRefreshLabels = {
  relative: string;
  absolute: string | null;
  cadence: string;
};

export function getMarketRefreshLabels(meta: MarketMeta): MarketRefreshLabels {
  return {
    relative: formatRelativeUpdated(meta.data_updated_at),
    absolute: formatLastRefreshAt(meta.data_updated_at),
    cadence: REFRESH_CADENCE_LABEL,
  };
}

/** One-sentence board summary for homepage / headers. */
export function buildMarketBrief(analytics: MarketAnalytics): string {
  const { pulse, breadth } = analytics;
  const adv = pulse.gainersPct.toFixed(0);
  const decl = pulse.losersPct.toFixed(0);
  const tracked = breadth.withChangeData || breadth.totalListings;

  if (tracked === 0) {
    return "Latest snapshot loaded - waiting for prior-game quotes to compute board breadth.";
  }

  if (pulse.gainersPct >= pulse.losersPct) {
    return `Board breadth: ${adv}% of tracked players repriced upward versus their prior ingested game in the latest cycle (${decl}% declined, ${breadth.unchanged} flat).`;
  }

  return `Board breadth: ${decl}% of tracked players repriced downward versus their prior ingested game in the latest cycle (${adv}% advanced, ${breadth.unchanged} flat).`;
}
