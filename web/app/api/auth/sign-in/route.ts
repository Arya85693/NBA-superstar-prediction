import { NextResponse } from "next/server";

import { createSupabaseAuthRouteHandlerClient } from "@/lib/supabase-auth-route";

export const dynamic = "force-dynamic";

type Body = { email?: string; password?: string };

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  try {
    const supabase = await createSupabaseAuthRouteHandlerClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 401 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sign-in failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
