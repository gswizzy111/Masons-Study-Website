// Browser Supabase client for Client Components. RLS applies as the signed-in
// user; the session lives in cookies that proxy.ts keeps fresh.
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { DB_SCHEMA } from "@/lib/supabase/schema";

let browserClient: SupabaseClient | undefined;

/** Shared browser client (one per tab). */
export function createClient(): SupabaseClient {
  if (browserClient) return browserClient;
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  // The app has no generated Database types, so the schema name in the client's
  // type adds no checking; keep the plain SupabaseClient type used everywhere.
  browserClient = createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    db: { schema: DB_SCHEMA },
  }) as unknown as SupabaseClient;
  return browserClient;
}
