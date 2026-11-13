import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  gameProgress,
  hollingerGameScore,
  liveFairValue,
  oneStep,
} from "../../supabase/functions/_shared/liveFairValue.ts";
import {
  isPricedGame,
  nbaTeamAbbr,
  parseDisplayClock,
  parseScoreboard,
  parseSummaryLines,
  scanDates,
  seasonLabel,
} from "../../supabase/functions/_shared/espn.ts";
import {
  MIN_WRITE_DELTA,
  planTick,
  scaledCycleLimits,
  targetPrice,
} from "../../supabase/functions/_shared/marketTick.ts";

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

// --- Parity with pipeline/fv_live_state.py ------------------------------------
// Regenerate with: python -m pytest tests/test_fv_live_state.py -s -k parity
const PY_STATE = {
  player_id: 2, season: "2026-27", last_game_date: "2026-10-26", fair_value: 83.434821,
  games_in_season: 3, season_eff_sum: 27.893647, hist_mean: 9.297882, hist_std: 3.518508,
  hist_n: 3, prior_eff: 9.13998, prior_conf: 0.48, mean_minutes: 33.0, gs_per_minute: 0.285859,
};
const PY_CASES = [[22.5, 31.0, 1.0], [6.0, 10.0, 0.4], [-3.0, 20.0, 0.75]];
const PY_VALUES = [92.382884199, 84.079996655, 80.935441894];

test("live Fair Value matches the Python model exactly", () => {
  PY_CASES.forEach(([gs, min, p], i) => {
    assert.ok(
      Math.abs(liveFairValue(PY_STATE, gs, min, p).fairValue - PY_VALUES[i]) < 1e-6,
      `case ${i}`,
    );
  });
});

test("final line equals one full game step; DNP never moves Fair Value", () => {
  assert.equal(liveFairValue(PY_STATE, 22.5, 31, 1).fairValue, oneStep(PY_STATE, 22.5, 31));
  assert.equal(oneStep(PY_STATE, 30, 0), PY_STATE.fair_value);
  assert.equal(liveFairValue(PY_STATE, 0, 0, 0.9).fairValue, PY_STATE.fair_value);
});

test("game progress", () => {
  assert.equal(gameProgress("pre", 0, 0), 0);
  assert.equal(gameProgress("in", 2, 0), 0.5); // halftime
  assert.equal(gameProgress("in", 3, 360), 30 / 48);
  assert.equal(gameProgress("in", 5, 100), 1);
  assert.equal(gameProgress("post", 4, 0), 1);
});

// --- ESPN parsing ---------------------------------------------------------------
test("parses a final box score by key name, incl. DNP and team renames", () => {
  const lines = parseSummaryLines(fixture("espn_summary_final.json"));
  const kd = lines.find((l) => l.name === "Kevin Durant");
  assert.deepEqual(
    { ...kd.line },
    {
      minutes: 34, points: 20, fgm: 8, fga: 17, fg3m: 1, fg3a: 4, ftm: 3, fta: 4,
      oreb: 0, dreb: 4, reb: 4, ast: 5, stl: 0, blk: 0, tov: 2, pf: 2, plusMinus: 17,
    },
  );
  assert.ok(Math.abs(hollingerGameScore(kd.line) - 12.8) < 1e-9);

  const dray = lines.find((l) => l.name === "Draymond Green");
  assert.equal(dray.teamAbbr, "GSW"); // ESPN "GS"
  assert.equal(dray.line.plusMinus, -20);
  assert.ok(Math.abs(hollingerGameScore(dray.line) - 11.2) < 1e-9);

  const adams = lines.find((l) => l.name === "Steven Adams");
  assert.equal(adams.didNotPlay, true);
  assert.equal(adams.line.minutes, 0);
});

test("parses a live box score at halftime", () => {
  const lines = parseSummaryLines(fixture("espn_summary_live.json"));
  const rj = lines.find((l) => l.name === "RJ Barrett");
  assert.equal(rj.line.minutes, 19);
  assert.equal(rj.line.points, 13);
  assert.equal(rj.line.plusMinus, 8);
});

test("refuses a box score whose stat keys changed", () => {
  const bad = fixture("espn_summary_final.json");
  bad.boxscore.players[0].statistics[0].keys = ["minutes", "points"];
  assert.throws(() => parseSummaryLines(bad), /stat key/);
});

test("scoreboard: live, scheduled, season and pricing filter", () => {
  const games = parseScoreboard(fixture("espn_scoreboard_live.json"), "2026-11-12");
  const live = games.filter((g) => g.state === "in");
  assert.equal(live.length, 2);
  assert.equal(gameProgress(live[0].state, live[0].period, live[0].clockSeconds), 0.5);
  assert.ok(games.every(isPricedGame));
  assert.equal(isPricedGame({ ...games[0], seasonType: 1 }), false); // preseason
  assert.equal(isPricedGame({ ...games[0], isAllStar: true }), false);
  assert.equal(seasonLabel(games[0].seasonYear), "2026-27");
});

test("clock, abbreviations and scan window", () => {
  assert.equal(parseDisplayClock("5:32"), 332);
  assert.equal(parseDisplayClock("45.2"), 45.2);
  assert.equal(nbaTeamAbbr("UTAH"), "UTA");
  assert.equal(nbaTeamAbbr("LAL"), "LAL");
  // 2026-11-13 03:00 UTC = 22:00 ET on the 12th -> only that day
  assert.deepEqual(scanDates(new Date("2026-11-13T03:00:00Z")), ["2026-11-12"]);
  // 2026-11-13 07:00 UTC = 02:00 ET on the 13th -> late games from the 12th too
  assert.deepEqual(scanDates(new Date("2026-11-13T07:00:00Z")), ["2026-11-12", "2026-11-13"]);
});

// --- Market tick ------------------------------------------------------------------
const NOW = new Date("2026-11-13T02:00:00Z");
const state = (over = {}) => ({
  player_id: 7,
  market_price: 100,
  prev_market_price: 99,
  fair_value: 100,
  updated_at: new Date(NOW.getTime() - 5 * 60000).toISOString(),
  explanation: {
    availability: { factor: 1 },
    levers: { sentiment: { adjustment_pct: 0.02 }, demand: { adjustment_pct: 0 } },
  },
  ...over,
});

test("a 5-minute tick moves 1/6 of a cycle toward the target", () => {
  const row = planTick(state(), 100, null, NOW);
  const target = targetPrice(100, 1, 0.02); // 102
  const [, , rev] = scaledCycleLimits(0.1, 0.45, 5 / 30);
  assert.ok(Math.abs(row.market_price - (100 + rev * (target - 100))) < 1e-4);
  assert.equal(row.change, Number((row.market_price - 99).toFixed(4))); // vs prev cycle
  assert.equal(row.expected_updated_at, state().updated_at);
  assert.equal(row.explanation_patch.tick.fair_value_source, "official");
});

test("nothing to write when price already sits at target", () => {
  const atTarget = state({ market_price: 102, explanation: state().explanation });
  assert.equal(planTick(atTarget, 100, null, NOW), null);
  assert.ok(MIN_WRITE_DELTA > 0);
});

test("live game: anchors to live Fair Value in event mode, capped per tick", () => {
  const live = {
    live_fair_value: 130, base_fair_value: 100, game_state: "in", progress: 0.5,
    espn_event_id: "401909976",
  };
  const row = planTick(state(), 100, live, NOW);
  const [maxUp] = scaledCycleLimits(0.18, 0.7, 5 / 30);
  assert.equal(row.fair_value, 130);
  assert.ok(row.market_price <= 100 * (1 + maxUp) + 1e-4);
  assert.equal(row.move_capped, true);
  assert.equal(row.explanation_patch.tick.event_mode, true);
  assert.equal(row.explanation_patch.tick.fair_value_source, "live");
});

test("an immediate re-run cannot move price (no compounding)", () => {
  const fresh = state({ updated_at: NOW.toISOString(), market_price: 100, fair_value: 100 });
  assert.equal(planTick(fresh, 100, null, NOW), null);
});

test("cold start and missing Fair Value are left to the Python step", () => {
  assert.equal(planTick(state({ market_price: 0 }), 100, null, NOW), null);
  assert.equal(planTick(state({ fair_value: 0 }), null, null, NOW), null);
});
