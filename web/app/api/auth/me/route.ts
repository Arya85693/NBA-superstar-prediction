import { NextResponse } from "next/server";
import { createSupabaseSessionServer } from "@/lib/supabase-session-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createSupabaseSessionServer();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ user: null });
    }
    return NextResponse.json({
      user: { id: user.id, email: user.email ?? null },
    });
  } catch {
    return NextResponse.json({ user: null });
  }
}
