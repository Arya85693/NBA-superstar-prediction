/**
 * ESPN public NBA JSON (site.api.espn.com) -> typed games and player lines.
 * Pure parsing, no I/O. Columns are looked up by key name, never by position,
 * and a payload without the expected keys throws instead of mis-reading stats.
 */
import type { StatLine } from "./liveFairValue.ts";

export const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";

export type EspnGame = {
  eventId: string;
  gameDate: string; // America/New_York day the scoreboard was queried for
  state: "pre" | "in" | "post" | string;
  completed: boolean;
  period: number;
  clockSeconds: number;
  seasonYear: number;
  seasonType: number;
  isAllStar: boolean;
};

export type EspnPlayerLine = {
  espnId: string;
  name: string;
  teamAbbr: string;
  didNotPlay: boolean;
  line: StatLine;
};

/** Same renames the Python ESPN fetcher applies (ESPN -> NBA abbreviations). */
const TEAM_ABBR: Record<string, string> = {
  GS: "GSW",
  NO: "NOP",
  NY: "NYK",
  SA: "SAS",
  UTAH: "UTA",
  WSH: "WAS",
};

export function nbaTeamAbbr(espnAbbr: string): string {
  const a = (espnAbbr ?? "").toUpperCase();
  return TEAM_ABBR[a] ?? a;
}

/** ESPN season.year 2027 -> "2026-27" (pipeline season label). */
export function seasonLabel(year: number): string {
  return `${year - 1}-${String(year).slice(-2)}`;
}

/** "5:32" -> 332, "45.2" -> 45.2, "" -> 0 */
export function parseDisplayClock(display: unknown): number {
  const s = String(display ?? "").trim();
  if (!s) return 0;
  if (s.includes(":")) {
    const [m, sec] = s.split(":");
    return Number(m) * 60 + Number(sec);
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// deno-lint-ignore no-explicit-any
type Json = any;

export function parseScoreboard(json: Json, gameDate: string): EspnGame[] {
  const events: Json[] = Array.isArray(json?.events) ? json.events : [];
  return events.map((e) => {
    const comp = e?.competitions?.[0] ?? {};
    const status = comp.status ?? e.status ?? {};
    const type = status.type ?? {};
    const clock = typeof status.clock === "number" ? status.clock : parseDisplayClock(status.displayClock);
    return {
      eventId: String(e.id),
      gameDate,
      state: String(type.state ?? "pre"),
      completed: Boolean(type.completed),
      period: Number(status.period ?? 0),
      clockSeconds: Number.isFinite(clock) ? clock : 0,
      seasonYear: Number(e?.season?.year ?? 0),
      seasonType: Number(e?.season?.type ?? 0),
      isAllStar: String(comp?.type?.abbreviation ?? "").toUpperCase() === "ALLSTAR",
    };
  });
}

/** Regular season (2), playoffs (3) and play-in (5); never preseason or All-Star. */
export function isPricedGame(g: EspnGame): boolean {
  return [2, 3, 5].includes(g.seasonType) && !g.isAllStar;
}

const REQUIRED_KEYS = [
  "minutes",
  "points",
  "fieldGoalsMade-fieldGoalsAttempted",
  "threePointFieldGoalsMade-threePointFieldGoalsAttempted",
  "freeThrowsMade-freeThrowsAttempted",
  "rebounds",
  "assists",
  "turnovers",
  "steals",
  "blocks",
  "offensiveRebounds",
  "defensiveRebounds",
  "fouls",
  "plusMinus",
] as const;

function int(v: unknown): number {
  const n = parseInt(String(v ?? "").replace("+", ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function madeAttempted(v: unknown): [number, number] {
  const [m, a] = String(v ?? "0-0").split("-");
  return [int(m), int(a)];
}

export function parseSummaryLines(json: Json): EspnPlayerLine[] {
  const teams: Json[] = json?.boxscore?.players;
  if (!Array.isArray(teams)) throw new Error("ESPN summary: boxscore.players missing");
  const out: EspnPlayerLine[] = [];
  for (const team of teams) {
    const teamAbbr = nbaTeamAbbr(team?.team?.abbreviation ?? "");
    const block = Array.isArray(team?.statistics) ? team.statistics[0] : team?.statistics;
    if (!block) continue;
    const keys: string[] = block.keys ?? [];
    const idx: Record<string, number> = {};
    for (const k of REQUIRED_KEYS) {
      const i = keys.indexOf(k);
      if (i < 0) throw new Error(`ESPN summary: stat key "${k}" missing (got ${keys.join(",")})`);
      idx[k] = i;
    }
    for (const a of block.athletes ?? []) {
      const espnId = String(a?.athlete?.id ?? "");
      if (!espnId) continue;
      const stats: string[] = Array.isArray(a.stats) ? a.stats : [];
      const didNotPlay = Boolean(a.didNotPlay) || stats.length === 0;
      const at = (k: string) => stats[idx[k]];
      const [fgm, fga] = madeAttempted(at("fieldGoalsMade-fieldGoalsAttempted"));
      const [fg3m, fg3a] = madeAttempted(at("threePointFieldGoalsMade-threePointFieldGoalsAttempted"));
      const [ftm, fta] = madeAttempted(at("freeThrowsMade-freeThrowsAttempted"));
      out.push({
        espnId,
        name: String(a?.athlete?.displayName ?? ""),
        teamAbbr,
        didNotPlay,
        line: {
          minutes: didNotPlay ? 0 : int(at("minutes")),
          points: int(at("points")),
          fgm,
          fga,
          fg3m,
          fg3a,
          ftm,
          fta,
          oreb: int(at("offensiveRebounds")),
          dreb: int(at("defensiveRebounds")),
          reb: int(at("rebounds")),
          ast: int(at("assists")),
          stl: int(at("steals")),
          blk: int(at("blocks")),
          tov: int(at("turnovers")),
          pf: int(at("fouls")),
          plusMinus: int(at("plusMinus")),
        },
      });
    }
  }
  return out;
}

/** America/New_York calendar day for an instant, as YYYY-MM-DD. */
export function etDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function etHour(d: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false })
      .format(d),
  ) % 24;
}

/** Game days to scan: today (ET), plus yesterday until 6am ET for late finishes. */
export function scanDates(now: Date): string[] {
  const today = etDate(now);
  if (etHour(now) >= 6) return [today];
  const y = new Date(now.getTime() - 24 * 3600 * 1000);
  return [etDate(y), today];
}
