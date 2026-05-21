/** Internal path only — blocks open redirects and auth loops. */
export function safeReturnPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  const base = next.split("?")[0] ?? next;
  if (
    base === "/login" ||
    base === "/signup" ||
    base === "/forgot-password" ||
    base === "/reset-password" ||
    base.startsWith("/auth/")
  ) {
    return "/";
  }
  return next;
}

export function loginHref(returnPath: string): string {
  const next = safeReturnPath(returnPath);
  return next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`;
}

export function signupHref(returnPath: string): string {
  const next = safeReturnPath(returnPath);
  return next === "/" ? "/signup" : `/signup?next=${encodeURIComponent(next)}`;
}
