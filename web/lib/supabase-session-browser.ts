import { createBrowserClient } from "@supabase/ssr";

let client: ReturnType<typeof createBrowserClient> | undefined;

/** Browser Supabase client with session persistence (Auth). Client Components only. */
export function createSupabaseSessionBrowser() {
  if (typeof window === "undefined") {
    throw new Error("createSupabaseSessionBrowser() must run in the browser.");
  }
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      );
    }
    client = createBrowserClient(url, anonKey);
  }
  return client;
}
