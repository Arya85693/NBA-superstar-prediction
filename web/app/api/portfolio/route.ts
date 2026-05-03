import { NextResponse } from "next/server";
import { getPortfolioSnapshot } from "@/lib/portfolioView";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snap = await getPortfolioSnapshot();
    return NextResponse.json(snap);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
