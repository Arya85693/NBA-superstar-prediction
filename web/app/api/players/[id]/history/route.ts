import { NextResponse } from "next/server";
import { getPlayerHistory } from "@/lib/marketData";

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
  try {
    const history = await getPlayerHistory(playerId);
    return NextResponse.json({ history });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
