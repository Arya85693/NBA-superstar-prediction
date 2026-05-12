import { NextResponse } from "next/server";

import { getRequestOrigin } from "@/lib/requestOrigin";
import { createSupabaseAuthRouteHandlerClient } from "@/lib/supabase-auth-route";

export const dynamic = "force-dynamic";

type Body = { email?: string };

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  try {
    const origin = getRequestOrigin(request);
    const supabase = await createSupabaseAuthRouteHandlerClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/reset-password`,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Password reset failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
