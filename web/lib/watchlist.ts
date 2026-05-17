export const WATCHLIST_STORAGE_KEY = "hs:watchlist";

export type WatchlistEntry = {
  player_id: number;
  player_name: string;
  ticker: string;
  team_abbr: string;
  addedAt: string;
};

export function readWatchlist(): WatchlistEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WatchlistEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeWatchlist(entries: WatchlistEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* quota */
  }
}

export function isWatchlisted(playerId: number): boolean {
  return readWatchlist().some((e) => e.player_id === playerId);
}

export function toggleWatchlist(entry: WatchlistEntry): boolean {
  const list = readWatchlist();
  const idx = list.findIndex((e) => e.player_id === entry.player_id);
  if (idx >= 0) {
    list.splice(idx, 1);
    writeWatchlist(list);
    return false;
  }
  list.unshift(entry);
  writeWatchlist(list.slice(0, 30));
  return true;
}

export function removeFromWatchlist(playerId: number): void {
  writeWatchlist(readWatchlist().filter((e) => e.player_id !== playerId));
}
