import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";
import type { RevisionPayload } from "@/lib/liveMarket";

export const dynamic = "force-dynamic";

/**
 * Cheap one-row read that browsers poll to learn whether new prices were published.
 * Pages re-render only when this changes, so polling never reloads the full board.
 */
export async function GET() {
  const headers = { "Cache-Control": "no-store, max-age=0" };

  if (process.env.PRICES_SOURCE !== "supabase") {
    const body: RevisionPayload = { prices: 0, market: 0, updatedAt: null };
    return NextResponse.json(body, { headers });
  }

  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("prices_snapshot_meta")
      .select("revision, market_revision, market_updated_at")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw error;
    const body: RevisionPayload = {
      prices: Number(data?.revision ?? 0),
      market: Number(data?.market_revision ?? 0),
      updatedAt: typeof data?.market_updated_at === "string" ? data.market_updated_at : null,
    };
    return NextResponse.json(body, { headers });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to read pricing revision";
    return NextResponse.json({ error: msg }, { status: 503, headers });
  }
}
