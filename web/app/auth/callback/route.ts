import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { GUEST_BROWSE_COOKIE } from "@/lib/guestBrowse";

function destinationUrl(
  requestUrl: URL,
  nextPathWithQuery: string,
  forwardedHost: string | null,
): URL {
  const isLocal = process.env.NODE_ENV === "development";
  const baseOrigin =
    isLocal && !forwardedHost
      ? requestUrl.origin
      : forwardedHost
        ? `https://${forwardedHost}`
        : requestUrl.origin;

  const path = nextPathWithQuery.startsWith("/")
    ? nextPathWithQuery
    : `/${nextPathWithQuery}`;
  return new URL(path, baseOrigin);
}

/** Default: land on sign-in with banner after confirming email (must stay sign-in first). */
const DEFAULT_AFTER_AUTH = "/login?confirmed=1";
const DEFAULT_AFTER_RECOVERY = "/reset-password";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const nextRaw =
    requestUrl.searchParams.get("next") ??
    (type === "recovery" ? DEFAULT_AFTER_RECOVERY : DEFAULT_AFTER_AUTH);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.redirect(`${requestUrl.origin}/auth/auth-code-error`);
  }

  if (!code && !(tokenHash && type)) {
    return NextResponse.redirect(`${requestUrl.origin}/auth/auth-code-error`);
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const dest = destinationUrl(requestUrl, nextRaw, forwardedHost);

  /**
   * Cookie writes must target this redirect response so exchange + signOut actually clear the
   * session cookies on the client (Route Handler + cookies() alone can miss outgoing Set-Cookie).
   */
  const redirectResponse = NextResponse.redirect(dest);

  const incomingCookies = await cookies();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return incomingCookies.getAll();
      },
      setAll(cookieList: { name: string; value: string; options?: object }[]) {
        cookieList.forEach(({ name, value, options }) =>
          redirectResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: type! });
  if (error) {
    return NextResponse.redirect(`${requestUrl.origin}/auth/auth-code-error`);
  }

  if (type !== "recovery") {
    /** Require password sign-in after confirmation: verify email, then clear magic-link session. */
    await supabase.auth.signOut();
  }

  /** Avoid landing on `/` as guest demo while we ask them to sign in. */
  redirectResponse.cookies.set(GUEST_BROWSE_COOKIE, "", {
    path: "/",
    maxAge: 0,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
  });

  return redirectResponse;
}
