import type { MetadataRoute } from "next";

import { getMarketRows } from "@/lib/marketData";

function siteOrigin(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  return raw || undefined;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  if (!origin) return [];

  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${origin}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${origin}/market`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    {
      url: `${origin}/how-it-works`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];

  try {
    const rows = await getMarketRows();
    const playerRoutes: MetadataRoute.Sitemap = rows.map((r) => ({
      url: `${origin}/player/${r.player_id}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.6,
    }));
    return [...staticRoutes, ...playerRoutes];
  } catch {
    return staticRoutes;
  }
}
