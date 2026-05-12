import { NextResponse } from "next/server";

import { GUEST_BROWSE_COOKIE } from "@/lib/guestBrowse";

/** Best-effort cleanup so guest browsing does not survive after the tab closes. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(GUEST_BROWSE_COOKIE, "", {
    path: "/",
    maxAge: 0,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
