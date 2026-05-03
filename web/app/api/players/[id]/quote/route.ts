import { NextResponse } from "next/server";
import { getLatestForPlayer } from "@/lib/marketData";

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
  const quote = await getLatestForPlayer(playerId);
  if (!quote) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }
  return NextResponse.json({ quote });
}
