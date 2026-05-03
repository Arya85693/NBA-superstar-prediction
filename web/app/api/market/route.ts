import { NextResponse } from "next/server";
import { getMarketRows } from "@/lib/marketData";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await getMarketRows();
    return NextResponse.json({ rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load market";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
