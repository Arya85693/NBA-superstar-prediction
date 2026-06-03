import { unstable_cache } from "next/cache";

/** Upcoming game from BALLDONTLIE (minimal fields for slate UI). */
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

const CACHE_SECONDS = 3600;
const SLATE_LOOKAHEAD_DAYS = 7;

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

function parseGame(row: BdlGameRow): UpcomingGame | null {
  const home = row.home_team?.abbreviation?.trim();
  const visitor = row.visitor_team?.abbreviation?.trim();
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

function isUpcoming(game: UpcomingGame): boolean {
  const status = game.status.toLowerCase();
  if (status === "final") return false;
  if (status.includes("final")) return false;
  return true;
}

async function fetchGamesPage(
  path: string,
  startDate: string,
  endDate: string,
  cursor: string | null,
  apiKey: string,
): Promise<{ games: BdlGameRow[]; nextCursor: string | null }> {
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
    throw new Error(`BALLDONTLIE games HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    data?: BdlGameRow[];
    meta?: { next_cursor?: string | null };
  };
  return {
    games: json.data ?? [],
    nextCursor: json.meta?.next_cursor ?? null,
  };
}

async function fetchAllUpcomingGames(): Promise<UpcomingGame[]> {
  const apiKey = bdlApiKey();
  if (!apiKey) return [];

  const startDate = etYmd();
  const endDate = addDaysYmd(startDate, SLATE_LOOKAHEAD_DAYS);
  const paths = ["/nba/v1/games", "/v1/games"];

  let lastError: Error | null = null;

  for (const path of paths) {
    try {
      const collected: UpcomingGame[] = [];
      let cursor: string | null = null;

      do {
        const page = await fetchGamesPage(path, startDate, endDate, cursor, apiKey);
        for (const row of page.games) {
          if (row.postponed) continue;
          const game = parseGame(row);
          if (game && isUpcoming(game)) collected.push(game);
        }
        cursor = page.nextCursor;
      } while (cursor);

      collected.sort((a, b) => {
        const ta = a.datetime ?? `${a.date}T12:00:00Z`;
        const tb = b.datetime ?? `${b.date}T12:00:00Z`;
        return ta.localeCompare(tb);
      });

      return collected;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  if (lastError) {
    console.warn("[nbaSchedule] fetch failed:", lastError.message);
  }
  return [];
}

/**
 * Upcoming games for the next week (ET). Cached ~1h. Empty when API key missing.
 */
export async function getUpcomingGames(): Promise<UpcomingGame[]> {
  const day = etYmd();
  return unstable_cache(fetchAllUpcomingGames, ["nba-upcoming-games", day], {
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
