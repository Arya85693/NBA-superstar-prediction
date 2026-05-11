/** Build public origin for emailRedirectTo (supports Vercel forwarded headers). */
export function getRequestOrigin(request: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;

  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protoHeader = request.headers.get("x-forwarded-proto");
  const proto =
    protoHeader ??
    (host?.startsWith("localhost") || host?.startsWith("127.")
      ? "http"
      : "https");

  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}
