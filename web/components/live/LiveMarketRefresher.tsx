"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect, useRef } from "react";
import {
  LIVE_MAX_BACKOFF_MS,
  LIVE_POLL_MS,
  MARKET_UPDATED_EVENT,
  revisionKey,
  setLiveStatus,
  type RevisionPayload,
} from "@/lib/liveMarket";

/**
 * Keeps every open page in sync with the pipeline without reloads.
 *
 * Polls /api/market/revision (one row) every LIVE_POLL_MS while the tab is visible.
 * When the prices or market revision changes it calls router.refresh(), which
 * re-renders server components with fresh data while keeping client state
 * (search box, sort, share inputs). Client components that fetch /api/market
 * themselves listen for MARKET_UPDATED_EVENT.
 *
 * Hidden tabs and offline browsers stop polling and check again as soon as they
 * come back. Failures back off exponentially up to LIVE_MAX_BACKOFF_MS.
 */
export function LiveMarketRefresher() {
  const router = useRouter();
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;
    let failures = 0;
    let stopped = false;

    const schedule = (ms: number) => {
      if (timer) clearTimeout(timer);
      timer = stopped ? null : setTimeout(check, ms);
    };

    async function check() {
      timer = null;
      if (document.visibilityState !== "visible") {
        setLiveStatus("paused");
        return; // resumed by visibilitychange
      }
      if (!navigator.onLine) {
        setLiveStatus("offline");
        return; // resumed by the online event
      }

      controller?.abort();
      controller = new AbortController();
      try {
        const res = await fetch("/api/market/revision", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`revision ${res.status}`);
        const data = (await res.json()) as RevisionPayload;
        const key = revisionKey(data);

        if (lastKey.current !== null && key !== lastKey.current) {
          startTransition(() => router.refresh());
          window.dispatchEvent(new CustomEvent(MARKET_UPDATED_EVENT, { detail: data }));
        }
        lastKey.current = key;
        failures = 0;
        setLiveStatus("live", data.updatedAt);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        failures += 1;
        setLiveStatus("error");
      }

      schedule(
        failures === 0 ? LIVE_POLL_MS : Math.min(LIVE_POLL_MS * 2 ** failures, LIVE_MAX_BACKOFF_MS),
      );
    }

    const resume = () => {
      if (document.visibilityState === "visible") schedule(0);
    };

    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("focus", resume);
    schedule(0);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("focus", resume);
    };
  }, [router]);

  return null;
}
