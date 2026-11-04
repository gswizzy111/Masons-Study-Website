// Email links that carry a `token_hash` (custom Supabase email templates:
// {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=...&next=...).
// Unlike /auth/callback, these work in any browser.
import type { NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient, safeNextPath } from "@/lib/supabase/server";
import { setRecoveryCookie } from "../recovery-cookie";
import { redirectTo } from "../redirect";

const OTP_TYPES = new Set<string>(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

function defaultNext(type: EmailOtpType): string {
  if (type === "recovery") return "/reset-password";
  if (type === "signup" || type === "invite") return "/onboarding";
  return "/dashboard";
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type");
  const type = rawType && OTP_TYPES.has(rawType) ? (rawType as EmailOtpType) : null;

  if (tokenHash && type) {
    const next = safeNextPath(searchParams.get("next")) ?? defaultNext(type);
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (!error && data.user) {
        // A recovery link always ends on the reset page.
        const target = type === "recovery" ? "/reset-password" : next;
        const response = redirectTo(target);
        if (type === "recovery") setRecoveryCookie(response, data.user.id);
        return response;
      }
      if (error) console.error("[auth/confirm] verifyOtp:", error.code ?? error.message);
    } catch (err) {
      console.error("[auth/confirm] failed:", err);
    }
  }

  const fallback = type === "recovery" ? "/forgot-password?error=reset_link" : "/login?error=link";
  return redirectTo(fallback);
}
