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
