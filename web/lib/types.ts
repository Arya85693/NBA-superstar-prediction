export type PriceRow = {
  player_id: number;
  player_name: string;
  team_abbr: string;
  game_id: string;
  game_date: string;
  season: string;
  game_score: number;
  price_after_game: number;
  /** From pipeline when present in CSV */
  prior_season_avg_game_score?: number | null;
};

export type MarketRow = PriceRow & {
  /** vs prior game in file for same player (same season chain) */
  change_pct: number | null;
  /** True if this player has no row with minutes > 0 in the dataset's latest season */
  caution_no_play_current_season: boolean;
  /** Short symbol (e.g. AMZN-style) — unique within the active market list */
  ticker: string;
};

/** Label for tooltips, e.g. "2025-26" — newest season present in player_game_prices.csv */
export type MarketMeta = {
  current_dataset_season: string | null;
};

export type Portfolio = {
  cash: number;
  /** player_id string -> whole shares */
  positions: Record<string, number>;
};
