import { unstable_cache } from "next/cache";

const ESPN_SEARCH =
  "https://site.api.espn.com/apis/common/v3/search";

/** ESPN site API team ids (for roster fallback when name search is noisy). */
const ESPN_TEAM_IDS: Record<string, number> = {
  ATL: 1,
  BOS: 2,
  BKN: 17,
  CHA: 30,
  CHI: 4,
  CLE: 5,
  DAL: 6,
  DEN: 7,
  DET: 8,
  GSW: 9,
  HOU: 10,
  IND: 11,
  LAC: 12,
  LAL: 13,
  MEM: 29,
  MIA: 14,
  MIL: 15,
  MIN: 16,
  NOP: 3,
  NYK: 18,
  OKC: 25,
  ORL: 19,
  PHI: 20,
  PHX: 21,
  POR: 22,
  SAC: 23,
  SAS: 24,
  TOR: 28,
  UTA: 26,
  WAS: 27,
};

type EspnSearchItem = {
  id?: string;
  displayName?: string;
  league?: string;
  headshot?: { href?: string };
  teamRelationships?: Array<{
    core?: { abbreviation?: string };
  }>;
};

type EspnRosterAthlete = {
  id?: string;
  displayName?: string;
  headshot?: { href?: string };
};

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, " ")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameTokens(name: string): { first: string; last: string } {
  const parts = normalizeName(name).split(" ").filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0]!, last: parts[0]! };
  return { first: parts[0]!, last: parts[parts.length - 1]! };
}

function namesMatch(displayName: string, playerName: string): boolean {
  const a = normalizeName(displayName);
  const b = normalizeName(playerName);
  if (a === b) return true;

  const ta = nameTokens(displayName);
  const tb = nameTokens(playerName);
  if (!ta.last || !tb.last || ta.last !== tb.last) return false;

  const af = ta.first.replace(/\s/g, "");
  const bf = tb.first.replace(/\s/g, "");
  if (af === bf) return true;
  if (af.length > 0 && bf.length > 0 && af[0] === bf[0]) return true;
  return false;
}

function headshotFromItem(item: EspnSearchItem): string | null {
  const href = item.headshot?.href?.trim();
  if (href) return href;
  const id = item.id?.trim();
  if (!id) return null;
  return `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`;
}

function canonicalTeamAbbr(abbr?: string): string {
  const key = (abbr ?? "").toUpperCase().trim();
  const map: Record<string, string> = {
    UTAH: "UTA",
    PHO: "PHX",
    GS: "GSW",
    SA: "SAS",
    NY: "NYK",
    NO: "NOP",
    NOR: "NOP",
    WSH: "WAS",
    BRK: "BKN",
    CHO: "CHA",
  };
  return map[key] ?? key;
}

function teamsMatch(espnAbbr: string, ours?: string): boolean {
  if (!ours) return true;
  return canonicalTeamAbbr(espnAbbr) === canonicalTeamAbbr(ours);
}

function itemOnTeam(item: EspnSearchItem, teamAbbr?: string): boolean {
  if (!teamAbbr) return false;
  return itemTeamAbbrs(item).some((a) => teamsMatch(a, teamAbbr));
}

function itemTeamAbbrs(item: EspnSearchItem): string[] {
  return (item.teamRelationships ?? [])
    .map((rel) => rel.core?.abbreviation?.toUpperCase())
    .filter((v): v is string => Boolean(v));
}

function pickBestMatch(
  items: EspnSearchItem[],
  playerName: string,
  teamAbbr?: string,
): EspnSearchItem | null {
  const nba = items.filter(
    (item) => item.league === "nba" && headshotFromItem(item),
  );
  if (nba.length === 0) return null;

  const abbr = teamAbbr?.toUpperCase();
  const exact = nba.filter((item) =>
    namesMatch(item.displayName ?? "", playerName),
  );

  if (exact.length > 0) {
    if (abbr) {
      const onTeam = exact.find((item) => itemOnTeam(item, abbr));
      if (onTeam) return onTeam;
    }
    return exact[0] ?? null;
  }

  if (abbr) {
    const { last } = nameTokens(playerName);
    const onTeamLast = nba.find(
      (item) =>
        itemOnTeam(item, abbr) &&
        nameTokens(item.displayName ?? "").last === last,
    );
    if (onTeamLast) return onTeamLast;
  }

  return null;
}

async function espnGetJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "HoopsStockMarket/1.0" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function searchEspnPlayers(query: string): Promise<EspnSearchItem[]> {
  const params = new URLSearchParams({
    query,
    limit: "25",
    type: "player",
  });
  const payload = await espnGetJson<{ items?: EspnSearchItem[] }>(
    `${ESPN_SEARCH}?${params}`,
  );
  return payload?.items ?? [];
}

async function fetchFromTeamRoster(
  playerName: string,
  teamAbbr: string,
): Promise<string | null> {
  const teamId = ESPN_TEAM_IDS[canonicalTeamAbbr(teamAbbr)];
  if (!teamId) return null;

  const payload = await espnGetJson<{ athletes?: EspnRosterAthlete[] }>(
    `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/roster`,
  );
  const athletes = payload?.athletes ?? [];
  const match = athletes.find((a) => namesMatch(a.displayName ?? "", playerName));
  if (!match) return null;

  const href = match.headshot?.href?.trim();
  if (href) return href;
  const id = match.id?.trim();
  if (!id) return null;
  return `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`;
}

async function fetchEspnHeadshotUrl(
  playerName: string,
  teamAbbr?: string,
): Promise<string | null> {
  const query = playerName.trim();
  if (!query) return null;

  let match = pickBestMatch(await searchEspnPlayers(query), query, teamAbbr);
  if (match) return headshotFromItem(match);

  // Legal name vs ESPN nickname (e.g. Airious Bailey → Ace Bailey): search last name.
  const { last } = nameTokens(query);
  if (last.length >= 3 && last.toLowerCase() !== query.toLowerCase()) {
    match = pickBestMatch(await searchEspnPlayers(last), query, teamAbbr);
    if (match) return headshotFromItem(match);
  }

  if (teamAbbr) {
    return fetchFromTeamRoster(query, teamAbbr);
  }

  return null;
}

const positiveCache = new Map<string, string>();

/** ESPN CDN headshot URL for an NBA player (free public search + roster fallback). */
export async function getEspnHeadshotUrl(
  playerName: string,
  teamAbbr?: string,
): Promise<string | null> {
  const cacheKey = `${normalizeName(playerName)}|${(teamAbbr ?? "").toUpperCase()}`;
  const mem = positiveCache.get(cacheKey);
  if (mem) return mem;

  const cached = await unstable_cache(
    async () => {
      const url = await fetchEspnHeadshotUrl(playerName, teamAbbr);
      return url ?? "";
    },
    ["espn-headshot-v3", cacheKey],
    { revalidate: 604_800 },
  )();

  if (cached) {
    positiveCache.set(cacheKey, cached);
    return cached;
  }

  // Misses are not cached long — retry each deploy / cold request.
  return fetchEspnHeadshotUrl(playerName, teamAbbr);
}
