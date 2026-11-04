// Server Supabase client for Server Components, Server Functions and route
// handlers. RLS applies as the signed-in user.
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

/** Header proxy.ts sets on every page request: the current pathname. */
export const PATHNAME_HEADER = "x-pathname";
/** Header proxy.ts sets on every page request: the current query string ("" or "?a=b"). */
export const SEARCH_HEADER = "x-search";

/** A new server client for this request. */
export async function createClient(): Promise<SupabaseClient> {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  const cookieStore = await cookies();
  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components can't set cookies. proxy.ts refreshes the
          // session on every request, so this is safe to ignore here.
        }
      },
    },
  });
}

/**
 * The signed-in user, verified with the Supabase Auth server, or null.
 * Deduplicated per request, so layouts and pages can both call it.
 */
export const getUser = cache(async (): Promise<User | null> => {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
});

/** A same-site path that is safe to redirect to after sign-in, or null. */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return null;
  }
  return value;
}

/**
 * The signed-in user and a server client, or a redirect to
 * `/login?next=<current path>` when signed out.
 */
export async function requireUser(): Promise<{ supabase: SupabaseClient; user: User }> {
  const user = await getUser();
  if (!user) {
    const h = await headers();
    const path = safeNextPath(h.get(PATHNAME_HEADER));
    const search = h.get(SEARCH_HEADER) ?? "";
    const next = path ? `${path}${search.startsWith("?") ? search : ""}` : "/dashboard";
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  const supabase = await createClient();
  return { supabase, user };
}
