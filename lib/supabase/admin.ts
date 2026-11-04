// Service-role Supabase client. Bypasses RLS: only the job runner uses it, and
// it must set `user_id` explicitly on every insert.
// Relative imports only and no Next-only modules: the Netlify background
// function bundles this file outside Next.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "../env";

export function createAdminClient(): SupabaseClient {
  const url = publicEnv.supabaseUrl;
  const { serviceRoleKey } = serverEnv();
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase service role is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
