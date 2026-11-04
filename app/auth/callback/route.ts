// Email links (sign-up confirmation, password reset) land here with a PKCE
// `code`. Exchange it for a session, then go to a safe `next` path.
import type { NextRequest } from "next/server";
import { createClient, safeNextPath } from "@/lib/supabase/server";
import { setRecoveryCookie } from "../recovery-cookie";
import { redirectTo } from "../redirect";

function isResetPath(path: string): boolean {
  return path === "/reset-password" || path.startsWith("/reset-password?");
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next")) ?? "/dashboard";
  const isReset = isResetPath(next);

  if (code) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error && data.user) {
        const response = redirectTo(next);
        if (isReset) setRecoveryCookie(response, data.user.id);
        return response;
      }
      if (error) console.error("[auth/callback] exchangeCodeForSession:", error.code ?? error.message);
    } catch (err) {
      console.error("[auth/callback] failed:", err);
    }
  }

  // No code (Supabase adds ?error=... for expired links) or the exchange failed.
  const fallback = isReset ? "/forgot-password?error=reset_link" : "/login?error=link";
  return redirectTo(fallback);
}
