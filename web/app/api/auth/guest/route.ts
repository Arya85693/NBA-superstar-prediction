import { NextResponse } from "next/server";

import { GUEST_BROWSE_COOKIE } from "@/lib/guestBrowse";

/** Opt in to browsing the home page without registering for this session only. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(GUEST_BROWSE_COOKIE, "1", {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
