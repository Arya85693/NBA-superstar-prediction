import { NextResponse } from "next/server";
import { getLatestForPlayer, getMarketQuote } from "@/lib/marketData";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const playerId = Number(id);
  if (!Number.isFinite(playerId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const [quote, market] = await Promise.all([
    getLatestForPlayer(playerId),
    getMarketQuote(playerId),
  ]);
  if (!quote) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }
  // `quote` keeps the legacy shape (latest fair-value game row); `market` adds
  // the tradable Market Price + Fair Value + premium + drivers.
  return NextResponse.json({ quote, market });
}
