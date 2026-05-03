import path from "path";

/** Repo `data/` directory (parent of `web/`) */
export function getDataDir(): string {
  return path.join(process.cwd(), "..", "data");
}

export function pricesCsvPath(): string {
  return path.join(getDataDir(), "player_game_prices.csv");
}

export function activePlayersCsvPath(): string {
  return path.join(getDataDir(), "active_players.csv");
}

export function portfolioJsonPath(): string {
  return path.join(getDataDir(), "paper_portfolio.json");
}
