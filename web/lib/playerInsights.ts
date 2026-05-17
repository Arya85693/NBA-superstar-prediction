import type { PriceRow } from "./types";

export type PlayerMomentum = "heating" | "cooling" | "steady" | "unknown";

export type PlayerInsights = {
  momentum: PlayerMomentum;
  headline: string;
  bullets: string[];
  /** Last N games with both price rows */
  recentGames: number;
  priceChange5Pct: number | null;
  gmscVsSeasonDelta: number | null;
  volatilityLabel: string | null;
};

function sortedHistory(history: PriceRow[]): PriceRow[] {
  return [...history].sort(
    (a, b) => new Date(a.game_date).getTime() - new Date(b.game_date).getTime(),
  );
}

function pctChange(from: number, to: number): number | null {
  if (!Number.isFinite(from) || from === 0) return null;
  return ((to - from) / from) * 100;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function buildPlayerInsights(
  history: PriceRow[],
  latest: PriceRow,
  seasonAvgGmsc: number | null,
): PlayerInsights {
  const rows = sortedHistory(history);
  const seasonRows = rows.filter((r) => r.season === latest.season);
  const recent = seasonRows.slice(-5);
  const recentGames = recent.length;

  const bullets: string[] = [];
  let momentum: PlayerMomentum = "unknown";
  let headline = "Building a read from available game history.";

  const priceChange5Pct =
    recent.length >= 2
      ? pctChange(recent[0]!.price_after_game, recent[recent.length - 1]!.price_after_game)
      : null;

  const lastGm = latest.game_score;
  const gmscVsSeasonDelta =
    seasonAvgGmsc != null && Number.isFinite(lastGm)
      ? lastGm - seasonAvgGmsc
      : null;

  if (priceChange5Pct != null && recentGames >= 2) {
    const abs = Math.abs(priceChange5Pct);
    const dir = priceChange5Pct >= 0 ? "risen" : "fallen";
    bullets.push(
      `Model price has ${dir} ${abs.toFixed(1)}% over the last ${recentGames} ingested game${recentGames === 1 ? "" : "s"} in ${latest.season}.`,
    );
    if (priceChange5Pct > 2) momentum = "heating";
    else if (priceChange5Pct < -2) momentum = "cooling";
    else momentum = "steady";
  }

  if (gmscVsSeasonDelta != null && seasonAvgGmsc != null) {
    if (gmscVsSeasonDelta > 2) {
      bullets.push(
        `Last game game score (${lastGm.toFixed(1)}) is ${gmscVsSeasonDelta.toFixed(1)} above the ${latest.season} average (${seasonAvgGmsc.toFixed(1)}) - performance running hot.`,
      );
      if (momentum === "steady" || momentum === "unknown") momentum = "heating";
    } else if (gmscVsSeasonDelta < -2) {
      bullets.push(
        `Last game game score (${lastGm.toFixed(1)}) is ${Math.abs(gmscVsSeasonDelta).toFixed(1)} below the ${latest.season} average (${seasonAvgGmsc.toFixed(1)}) - quieter than usual.`,
      );
      if (momentum === "steady" || momentum === "unknown") momentum = "cooling";
    } else {
      bullets.push(
        `Last game game score is in line with the ${latest.season} average (${seasonAvgGmsc.toFixed(1)}).`,
      );
    }
  }

  const priceMoves: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1]!.price_after_game;
    const curr = recent[i]!.price_after_game;
    const ch = pctChange(prev, curr);
    if (ch != null) priceMoves.push(ch);
  }

  let volatilityLabel: string | null = null;
  if (priceMoves.length >= 3) {
    const vol = stdDev(priceMoves);
    if (vol > 1.5) {
      volatilityLabel = "elevated";
      bullets.push(
        "Recent repricing has been choppy - larger game-to-game price swings than usual.",
      );
    } else if (vol < 0.35) {
      volatilityLabel = "low";
      bullets.push("Recent repricing has been stable - small moves between ingested games.");
    } else {
      volatilityLabel = "moderate";
    }
  }

  if (momentum === "heating") {
    headline = "Upward momentum - price and recent performance are trending positive.";
  } else if (momentum === "cooling") {
    headline = "Cooling stretch - recent games or repricing are softening value.";
  } else if (momentum === "steady") {
    headline = "Steady path - price is moving gradually with recent games.";
  }

  if (bullets.length === 0) {
    bullets.push(
      "Not enough ingested games this season yet for trend lines - check back after more games enter the pipeline.",
    );
  }

  return {
    momentum,
    headline,
    bullets,
    recentGames,
    priceChange5Pct,
    gmscVsSeasonDelta,
    volatilityLabel,
  };
}

export function momentumLabel(m: PlayerMomentum): string {
  switch (m) {
    case "heating":
      return "Heating up";
    case "cooling":
      return "Cooling off";
    case "steady":
      return "Steady";
    default:
      return "Limited data";
  }
}
