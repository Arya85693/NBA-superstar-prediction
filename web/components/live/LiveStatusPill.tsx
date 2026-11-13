"use client";

import { useSyncExternalStore } from "react";
import {
  getLiveStatus,
  getServerLiveStatus,
  LIVE_POLL_MS,
  subscribeLiveStatus,
  type LiveState,
} from "@/lib/liveMarket";

const LABEL: Record<LiveState, string> = {
  connecting: "Connecting",
  live: "Live",
  paused: "Paused",
  offline: "Offline",
  error: "Reconnecting",
};

/** Nav indicator for the live board sync driven by LiveMarketRefresher. */
export function LiveStatusPill() {
  const status = useSyncExternalStore(subscribeLiveStatus, getLiveStatus, getServerLiveStatus);
  const live = status.state === "live";
  const bad = status.state === "error" || status.state === "offline";

  const published = status.updatedAt ? new Date(status.updatedAt) : null;
  const publishedLabel =
    published && Number.isFinite(published.getTime())
      ? published.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : null;

  const title = live
    ? `Prices update on this page automatically. Checking every ${LIVE_POLL_MS / 1000}s${
        publishedLabel ? ` · last published ${publishedLabel}` : ""
      }.`
    : status.state === "paused"
      ? "Paused while this tab is in the background. Resumes when you come back."
      : bad
        ? "Can't reach the price feed right now. Retrying automatically."
        : "Connecting to the price feed.";

  const dot = live ? "bg-positive" : bad ? "bg-warning" : "bg-muted";

  return (
    <span
      className="inline-flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground"
      title={title}
      role="status"
      aria-live="polite"
    >
      <span className="relative flex h-2 w-2" aria-hidden>
        {live && (
          <span className={`hs-live-ping absolute inline-flex h-full w-full rounded-full ${dot}`} />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dot}`} />
      </span>
      {LABEL[status.state]}
    </span>
  );
}
