"use client";

import { useCallback, useEffect, useState } from "react";
import { isWatchlisted, toggleWatchlist, type WatchlistEntry } from "@/lib/watchlist";

export function WatchlistButton({
  playerId,
  playerName,
  ticker,
  teamAbbr,
}: {
  playerId: number;
  playerName: string;
  ticker: string;
  teamAbbr: string;
}) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(isWatchlisted(playerId));
  }, [playerId]);

  const toggle = useCallback(() => {
    const entry: WatchlistEntry = {
      player_id: playerId,
      player_name: playerName,
      ticker,
      team_abbr: teamAbbr,
      addedAt: new Date().toISOString(),
    };
    const next = toggleWatchlist(entry);
    setOn(next);
    window.dispatchEvent(new Event("watchlist-updated"));
  }, [playerId, playerName, ticker, teamAbbr]);

  return (
    <button
      type="button"
      onClick={toggle}
      className={
        on
          ? "rounded-lg border border-accent/40 bg-accent-muted px-3 py-1.5 text-xs font-semibold text-accent"
          : "rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-accent/30 hover:text-foreground"
      }
      aria-pressed={on}
    >
      {on ? "★ On watchlist" : "☆ Watchlist"}
    </button>
  );
}
