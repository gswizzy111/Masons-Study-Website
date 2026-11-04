// Service-role Supabase client. Bypasses RLS: only the job runner uses it, and
// it must set `user_id` explicitly on every insert.
// Relative imports only and no Next-only modules: the Netlify background
// function bundles this file outside Next.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "../env";
import { DB_SCHEMA } from "./schema";

export function createAdminClient(): SupabaseClient {
  const url = publicEnv.supabaseUrl;
  const { serviceRoleKey } = serverEnv();
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase service role is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  // The app has no generated Database types, so the schema name in the client's
  // type adds no checking; keep the plain SupabaseClient type used everywhere.
  return createClient(url, serviceRoleKey, {
    db: { schema: DB_SCHEMA },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }) as unknown as SupabaseClient;
}
