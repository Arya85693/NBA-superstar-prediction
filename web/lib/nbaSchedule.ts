import { unstable_cache } from "next/cache";

/** Upcoming game (minimal fields for slate UI). */
export type UpcomingGame = {
  id: number;
  date: string;
  datetime: string | null;
  status: string;
  home_abbr: string;
  visitor_abbr: string;
  postseason: boolean;
};

type BdlTeam = { abbreviation?: string };
type BdlGameRow = {
  id: number;
  date?: string;
  datetime?: string | null;
  status?: string;
  postponed?: boolean;
  postseason?: boolean;
  home_team?: BdlTeam;
  visitor_team?: BdlTeam;
};

type EspnScoreboard = {
  events?: EspnEvent[];
};

type EspnEvent = {
  id?: string;
  date?: string;
  competitions?: Array<{
    status?: { type?: { completed?: boolean; state?: string } };
    competitors?: Array<{
      homeAway?: string;
      team?: { abbreviation?: string };
    }>;
  }>;
};

/** ESPN and other short labels → market (BDL) abbreviations used in player rows. */
const ESPN_TO_MARKET: Record<string, string> = {
  NY: "NYK",
  SA: "SAS",
  GS: "GSW",
  NO: "NOP",
  PHO: "PHX",
  UTAH: "UTA",
  WSH: "WAS",
};

const CACHE_SECONDS = 3600;
const SLATE_LOOKAHEAD_DAYS = 7;
const CACHE_KEY_VERSION = "v2";

export function normalizeTeamAbbr(abbr: string): string {
  const key = abbr.trim().toUpperCase();
  return ESPN_TO_MARKET[key] ?? key;
}

function bdlApiKey(): string | null {
  const key = (process.env.BALLDONTLIE_API_KEY ?? "").trim();
  return key || null;
}

function bdlBaseUrl(): string {
  return (
    process.env.BALLDONTLIE_BASE_URL ?? "https://api.balldontlie.io"
  ).replace(/\/$/, "");
}

/** Calendar date YYYY-MM-DD in US Eastern (slate day boundaries). */
export function etYmd(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(date);
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days));
  return dt.toISOString().slice(0, 10);
}

function listDatesInclusive(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  let cur = startYmd;
  while (cur <= endYmd) {
    out.push(cur);
    cur = addDaysYmd(cur, 1);
  }
  return out;
}

function ymdToEspn(ymd: string): string {
  return ymd.replace(/-/g, "");
}

function parseBdlGame(row: BdlGameRow): UpcomingGame | null {
  const home = normalizeTeamAbbr(row.home_team?.abbreviation ?? "");
  const visitor = normalizeTeamAbbr(row.visitor_team?.abbreviation ?? "");
  if (!home || !visitor || !row.date) return null;
  return {
    id: row.id,
    date: row.date,
    datetime: row.datetime ?? null,
    status: (row.status ?? "").trim(),
    home_abbr: home,
    visitor_abbr: visitor,
    postseason: Boolean(row.postseason),
  };
}

function parseEspnEvent(event: EspnEvent): UpcomingGame | null {
  const comp = event.competitions?.[0];
  if (!comp) return null;

  const state = comp.status?.type?.state ?? "";
  if (comp.status?.type?.completed || state === "post") return null;

  const homeRaw = comp.competitors?.find((c) => c.homeAway === "home")?.team
    ?.abbreviation;
  const visitorRaw = comp.competitors?.find((c) => c.homeAway === "away")?.team
    ?.abbreviation;
  const home = normalizeTeamAbbr(homeRaw ?? "");
  const visitor = normalizeTeamAbbr(visitorRaw ?? "");
  if (!home || !visitor) return null;

  const datetime = event.date ?? null;
  const date =
    datetime && Number.isFinite(new Date(datetime).getTime())
      ? etYmd(new Date(datetime))
      : etYmd();

  const idNum = Number.parseInt(String(event.id ?? ""), 10);
  const id = Number.isFinite(idNum) ? idNum : hashGameKey(date, visitor, home);

  return {
    id,
    date,
    datetime,
    status: state || "scheduled",
    home_abbr: home,
    visitor_abbr: visitor,
    postseason: false,
  };
}

function hashGameKey(date: string, visitor: string, home: string): number {
  const s = `${date}:${visitor}@${home}`;
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h || 1;
}

function isUpcoming(game: UpcomingGame): boolean {
  const status = game.status.toLowerCase();
  if (status === "final" || status === "post") return false;
  if (status.includes("final")) return false;

  const when = game.datetime ? new Date(game.datetime) : null;
  if (when && Number.isFinite(when.getTime())) {
    // Drop games that ended more than ~4 hours ago (handles live/post edge cases).
    if (when.getTime() < Date.now() - 4 * 60 * 60 * 1000 && status !== "pre") {
      return false;
    }
  }

  return true;
}

function dedupeGames(games: UpcomingGame[]): UpcomingGame[] {
  const seen = new Set<string>();
  const out: UpcomingGame[] = [];
  for (const g of games) {
    const key = `${g.date}:${g.visitor_abbr}@${g.home_abbr}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(g);
  }
  out.sort((a, b) => {
    const ta = a.datetime ?? `${a.date}T12:00:00Z`;
    const tb = b.datetime ?? `${b.date}T12:00:00Z`;
    return ta.localeCompare(tb);
  });
  return out;
}

async function fetchBdlGames(
  startDate: string,
  endDate: string,
  apiKey: string,
): Promise<UpcomingGame[]> {
  const paths = ["/nba/v1/games", "/v1/games"];
  let lastError: Error | null = null;

  for (const path of paths) {
    try {
      const collected: UpcomingGame[] = [];
      let cursor: string | null = null;

      do {
        const params = new URLSearchParams();
        params.set("start_date", startDate);
        params.set("end_date", endDate);
        params.set("per_page", "100");
        if (cursor) params.set("cursor", cursor);

        const url = `${bdlBaseUrl()}${path}?${params.toString()}`;
        const res = await fetch(url, {
          headers: { Authorization: apiKey, Accept: "application/json" },
          next: { revalidate: CACHE_SECONDS },
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(
            `BALLDONTLIE games HTTP ${res.status}: ${body.slice(0, 200)}`,
          );
        }

        const json = (await res.json()) as {
          data?: BdlGameRow[];
          meta?: { next_cursor?: string | null };
        };

        for (const row of json.data ?? []) {
          if (row.postponed) continue;
          const game = parseBdlGame(row);
          if (game && isUpcoming(game)) collected.push(game);
        }
        cursor = json.meta?.next_cursor ?? null;
      } while (cursor);

      if (collected.length > 0) return dedupeGames(collected);
      return collected;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  if (lastError) {
    console.warn("[nbaSchedule] BDL fetch failed:", lastError.message);
  }
  return [];
}

async function fetchEspnGames(
  startDate: string,
  endDate: string,
): Promise<UpcomingGame[]> {
  const collected: UpcomingGame[] = [];

  for (const ymd of listDatesInclusive(startDate, endDate)) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${ymdToEspn(ymd)}`;
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        next: { revalidate: CACHE_SECONDS },
      });
      if (!res.ok) continue;

      const json = (await res.json()) as EspnScoreboard;
      for (const event of json.events ?? []) {
        const game = parseEspnEvent(event);
        if (game && isUpcoming(game)) collected.push(game);
      }
    } catch (e) {
      console.warn("[nbaSchedule] ESPN fetch failed:", e);
    }
  }

  return dedupeGames(collected);
}

async function fetchAllUpcomingGames(): Promise<UpcomingGame[]> {
  const startDate = etYmd();
  const endDate = addDaysYmd(startDate, SLATE_LOOKAHEAD_DAYS);

  const apiKey = bdlApiKey();
  if (apiKey) {
    const bdl = await fetchBdlGames(startDate, endDate, apiKey);
    if (bdl.length > 0) return bdl;
  }

  return fetchEspnGames(startDate, endDate);
}

/**
 * Upcoming games for the next week (ET). Cached ~1h.
 * Uses BALLDONTLIE when `BALLDONTLIE_API_KEY` is set; otherwise ESPN scoreboard.
 */
export async function getUpcomingGames(): Promise<UpcomingGame[]> {
  const day = etYmd();
  return unstable_cache(fetchAllUpcomingGames, ["nba-upcoming-games", CACHE_KEY_VERSION, day], {
    revalidate: CACHE_SECONDS,
  })();
}

/** Tip time label in Eastern, or date-only fallback. */
export function formatGameTip(game: UpcomingGame): string {
  if (game.datetime) {
    const d = new Date(game.datetime);
    if (Number.isFinite(d.getTime())) {
      const time = d.toLocaleString("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        minute: "2-digit",
      });
      const today = etYmd();
      if (game.date === today) return time;
      const datePart = d.toLocaleString("en-US", {
        timeZone: "America/New_York",
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      return `${datePart} · ${time}`;
    }
  }
  if (game.date === etYmd()) return "Today";
  const [y, m, d] = game.date.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!, 12));
  return dt.toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
