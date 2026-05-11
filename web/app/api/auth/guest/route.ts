import { NextResponse } from "next/server";

import {
  GUEST_BROWSE_COOKIE,
  GUEST_BROWSE_MAX_AGE,
} from "@/lib/guestBrowse";

/** Opt in to browsing the home page without registering (cookie is HttpOnly). */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(GUEST_BROWSE_COOKIE, "1", {
    path: "/",
    maxAge: GUEST_BROWSE_MAX_AGE,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
