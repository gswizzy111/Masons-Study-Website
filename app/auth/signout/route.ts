// POST only (a GET gets 405, so link prefetching can never sign anyone out).
// Form field `scope=global` signs out on every device; default is this one.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { RECOVERY_COOKIE } from "../recovery-cookie";

/** Rejects cross-site form posts (same check Next applies to Server Actions). */
function isSameSite(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const hosts = [request.headers.get("x-forwarded-host"), request.headers.get("host"), request.nextUrl.host];
  return hosts.some((h) => h && h.split(",")[0]?.trim() === originHost);
}

export async function POST(request: NextRequest) {
  if (!isSameSite(request)) {
    return new NextResponse("Cross-site sign-out refused.", { status: 403 });
  }

  let scope: "local" | "global" = "local";
  try {
    const form = await request.formData();
    if (form.get("scope") === "global") scope = "global";
  } catch {
    // No form body: sign out of this device.
  }

  try {
    const supabase = await createClient();
    await supabase.auth.signOut({ scope });
  } catch (err) {
    console.error("[auth/signout] failed:", err);
  }

  const response = NextResponse.redirect(new URL("/", request.nextUrl.origin), 303);
  response.cookies.delete(RECOVERY_COOKIE);
  return response;
}
