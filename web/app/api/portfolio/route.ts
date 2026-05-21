import { NextResponse } from "next/server";
import { getPortfolioSnapshot } from "@/lib/portfolioView";
import { createSupabaseSessionServer } from "@/lib/supabase-session-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createSupabaseSessionServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const snap = await getPortfolioSnapshot(user.id);
    return NextResponse.json(snap);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
