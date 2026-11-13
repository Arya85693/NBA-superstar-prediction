/**
 * Live board sync: the browser polls a tiny revision endpoint and re-renders
 * only when the pipeline publishes new prices (prices revision or market revision).
 */

/** Window event fired after a new pricing revision is detected (detail: RevisionPayload). */
export const MARKET_UPDATED_EVENT = "hs-market-updated";

/** How often a visible tab checks for a new pricing revision. */
export const LIVE_POLL_MS = 30_000;

/** Longest wait between checks while the endpoint keeps failing. */
export const LIVE_MAX_BACKOFF_MS = 5 * 60_000;

export type RevisionPayload = {
  prices: number;
  market: number;
  updatedAt: string | null;
};

export function revisionKey(r: RevisionPayload): string {
  return `${r.prices}:${r.market}`;
}

export type LiveState = "connecting" | "live" | "paused" | "offline" | "error";

export type LiveStatus = {
  state: LiveState;
  /** ms epoch of the last successful revision check */
  lastCheckedAt: number | null;
  /** ISO time the market layer last published (market_updated_at) */
  updatedAt: string | null;
};

const INITIAL_STATUS: LiveStatus = { state: "connecting", lastCheckedAt: null, updatedAt: null };

let status: LiveStatus = INITIAL_STATUS;
const listeners = new Set<() => void>();

export function setLiveStatus(state: LiveState, updatedAt?: string | null): void {
  status = {
    state,
    lastCheckedAt: state === "live" ? Date.now() : status.lastCheckedAt,
    updatedAt: updatedAt === undefined ? status.updatedAt : updatedAt,
  };
  for (const l of listeners) l();
}

export function subscribeLiveStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLiveStatus(): LiveStatus {
  return status;
}

export function getServerLiveStatus(): LiveStatus {
  return INITIAL_STATUS;
}
