"use client";

import { useState } from "react";

export type ValueFlash = {
  /** "hs-flash-up" | "hs-flash-down" after a change, "" before any change */
  className: string;
  /** Changes on every move; put it on the flashing element as `key` so the animation replays. */
  key: number;
};

/**
 * Briefly highlights a number when it changes between renders (e.g. after a live
 * board refresh): green when it rises, loss color when it falls.
 *
 * Uses the "adjust state while rendering" pattern instead of an effect, and lets
 * the CSS animation end on its own, so there are no timers to clean up.
 */
export function useValueFlash(value: number | null | undefined): ValueFlash {
  const [prev, setPrev] = useState(value);
  const [flash, setFlash] = useState<ValueFlash>({ className: "", key: 0 });

  if (value !== prev) {
    setPrev(value);
    if (prev != null && value != null && Number.isFinite(prev) && Number.isFinite(value)) {
      setFlash({ className: value > prev ? "hs-flash-up" : "hs-flash-down", key: flash.key + 1 });
    }
  }

  return flash;
}
