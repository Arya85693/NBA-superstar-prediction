import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | undefined;

function getEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Set them in web/.env.local.",
    );
  }
  return { url, anonKey };
}

/** Server or Route Handler: new client per call (no cross-request state). */
export function createSupabaseServerClient(): SupabaseClient {
  const { url, anonKey } = getEnv();
  return createClient(url, anonKey);
}

function assertJwtRoleIsServiceRole(key: string): void {
  const parts = key.split(".");
  if (parts.length < 2) return;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const payload = JSON.parse(json) as { role?: string };
    const role = payload.role;
    if (role && role !== "service_role") {
      throw new Error(
        `SUPABASE_SERVICE_ROLE_KEY is the wrong Supabase key (JWT role is "${role}", expected "service_role"). In Supabase → Project Settings → API, copy the service_role secret, not the anon key.`,
      );
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("SUPABASE_SERVICE_ROLE_KEY is the wrong")) {
      throw e;
    }
    /* ignore malformed JWT */
  }
}

/**
 * Server-only: bypasses RLS. Use only in Route Handlers / Server Components for
 * tables revoked from `anon` (e.g. `portfolios` / `positions`). Never expose
 * `SUPABASE_SERVICE_ROLE_KEY` as `NEXT_PUBLIC_*`.
 */
export function createSupabaseServiceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY or Supabase URL. Add the service role key to Vercel (server env only) and web/.env.local — never NEXT_PUBLIC_*.",
    );
  }
  assertJwtRoleIsServiceRole(key.trim());
  return createClient(url, key.trim(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Browser: single shared client (module singleton).
 * Use only from Client Components / client-side code paths.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (typeof window === "undefined") {
    throw new Error("getSupabaseBrowserClient() must run in the browser.");
  }
  if (!browserClient) {
    const { url, anonKey } = getEnv();
    browserClient = createClient(url, anonKey);
  }
  return browserClient;
}
