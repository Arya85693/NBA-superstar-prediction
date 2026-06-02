export type PriceRow = {
  player_id: number;
  player_name: string;
  team_abbr: string;
  game_id: string;
  game_date: string;
  season: string;
  /** Minutes in this game row (0 = DNP / no log). */
  minutes?: number;
  game_score: number;
  price_after_game: number;
  /** From pipeline when present in CSV */
  prior_season_avg_game_score?: number | null;
};

export type MarketRow = PriceRow & {
  /**
   * Market Price change since the previous pipeline cycle (~30 min). Can differ
   * from game performance when levers (sentiment, team context, etc.) move price.
   */
  change_pct: number | null;
  /** Fair Value change vs the player's prior ingested game (basketball performance). */
  fair_value_change_pct: number | null;
  /** True if this player has no row with minutes > 0 in the dataset's latest season */
  caution_no_play_current_season: boolean;
  /** Short symbol (e.g. AMZN-style) - unique within the active market list */
  ticker: string;
  /** Layer 1 — statistically justified value (latest fair value). */
  fair_value: number;
  /** Layer 2 — actual tradable price. Equals `price_after_game` for compat. */
  market_price: number;
  /** (market - fair) / fair; null when fair value is unknown. */
  premium_pct: number | null;
  /** Top human-readable reasons the Market Price is where it is. */
  drivers?: string[];
  /** Latest ingested game minutes (current season). */
  last_game_minutes: number;
  /** Season-to-date average minutes (games with minutes > 0). */
  season_avg_minutes: number;
  /** Average minutes over the last five played games this season. */
  recent_avg_minutes: number;
  /** Count of current-season games with minutes logged. */
  season_games_with_minutes: number;
};

/** One intraday snapshot appended each market pipeline cycle. */
export type MarketTick = {
  player_id: number;
  recorded_at: string;
  market_price: number;
  fair_value: number;
  premium_pct: number;
};

/** Lever breakdown stored in player_market_state.explanation (jsonb). */
export type MarketExplanation = {
  fair_value?: number;
  market_price?: number;
  premium_pct?: number;
  target_price?: number;
  change?: number;
  change_pct?: number | null;
  move_capped?: boolean;
  premium_capped?: boolean;
  levers?: Record<
    string,
    { score: number; weight: number; adjustment_pct: number }
  >;
  drivers?: string[];
};

/**
 * Current Market Price state for one player (Layer 2). Mirrors
 * public.player_market_state. All demand fields default to 0 before traction.
 */
export type MarketState = {
  player_id: number;
  player_name: string;
  team_abbr: string;
  fair_value: number;
  market_price: number;
  prev_market_price: number;
  premium_pct: number;
  change: number;
  change_pct: number | null;
  projection_score: number;
  projection_adjustment: number;
  sentiment_score: number;
  sentiment_adjustment: number;
  team_context_score: number;
  team_context_adjustment: number;
  demand_score: number;
  demand_adjustment: number;
  net_demand: number;
  recent_buy_volume: number;
  recent_sell_volume: number;
  move_capped: boolean;
  premium_capped: boolean;
  explanation: MarketExplanation | null;
  updated_at?: string | null;
};

/** Quote used to fill a trade and headline the player page. */
export type MarketQuote = {
  player_id: number;
  market_price: number;
  fair_value: number;
  premium_pct: number;
  change: number;
  change_pct: number | null;
  drivers: string[];
  /** "market" when a real Market Price row exists; otherwise a fair-value fallback. */
  source: "market" | "fair_value_fallback";
};

/** Label for tooltips, e.g. "2025-26" - newest season present in player_game_prices.csv */
export type MarketMeta = {
  current_dataset_season: string | null;
  current_dataset_last_game_date?: string | null;
  /** Supabase revision or local CSV mtimeMs - cache-bust key for prices data */
  prices_revision?: number;
  /** When prices were last written (Supabase updated_at or CSV mtime) */
  data_updated_at?: string | null;
  /** Bumps every time the Market Price layer recomputes (even with no new games) */
  market_revision?: number;
  /** When Market Price was last recomputed */
  market_updated_at?: string | null;
};

export type Portfolio = {
  cash: number;
  /** player_id string -> whole shares */
  positions: Record<string, number>;
  /** player_id string -> weighted avg cost per share (null if unknown) */
  avgCostPerShare: Record<string, number | null>;
};
