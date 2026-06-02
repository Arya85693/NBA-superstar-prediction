import { unstable_cache } from "next/cache";

const ESPN_SEARCH =
  "https://site.api.espn.com/apis/common/v3/search";

type EspnSearchItem = {
  id?: string;
  displayName?: string;
  league?: string;
  headshot?: { href?: string };
  teamRelationships?: Array<{
    core?: { abbreviation?: string };
  }>;
};

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickBestMatch(
  items: EspnSearchItem[],
  playerName: string,
  teamAbbr?: string,
): EspnSearchItem | null {
  const nba = items.filter(
    (item) =>
      item.league === "nba" &&
      item.headshot?.href &&
      normalizeName(item.displayName ?? "") === normalizeName(playerName),
  );
  if (nba.length === 0) return null;

  const abbr = teamAbbr?.toUpperCase();
  if (abbr) {
    const onTeam = nba.find((item) =>
      (item.teamRelationships ?? []).some(
        (rel) => rel.core?.abbreviation?.toUpperCase() === abbr,
      ),
    );
    if (onTeam) return onTeam;
  }

  return nba[0] ?? null;
}

async function fetchEspnHeadshotUrl(
  playerName: string,
  teamAbbr?: string,
): Promise<string | null> {
  const query = playerName.trim();
  if (!query) return null;

  const url = `${ESPN_SEARCH}?${new URLSearchParams({
    query,
    limit: "8",
    type: "player",
  })}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "HoopsStockMarket/1.0" },
      next: { revalidate: 604_800 },
    });
    if (!res.ok) return null;

    const payload = (await res.json()) as { items?: EspnSearchItem[] };
    const match = pickBestMatch(payload.items ?? [], query, teamAbbr);
    return match?.headshot?.href ?? null;
  } catch {
    return null;
  }
}

/** ESPN CDN headshot URL for an NBA player (free public search API). */
export async function getEspnHeadshotUrl(
  playerName: string,
  teamAbbr?: string,
): Promise<string | null> {
  const cacheKey = `${normalizeName(playerName)}|${(teamAbbr ?? "").toUpperCase()}`;
  return unstable_cache(
    () => fetchEspnHeadshotUrl(playerName, teamAbbr),
    ["espn-headshot", cacheKey],
    { revalidate: 604_800 },
  )();
}
