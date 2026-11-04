// Runs before every page request (see config.matcher):
// 1. refreshes the Supabase session cookie (standard @supabase/ssr pattern),
// 2. passes the current path to Server Components as x-pathname / x-search,
// 3. sends signed-out visitors on private pages to /login?next=...,
//    and signed-in visitors on /login or /signup to the dashboard.
// /api/* and /auth/* are excluded: they check auth themselves.
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PRIVATE_PREFIXES = ["/dashboard", "/sets", "/settings", "/onboarding"];
const AUTH_PAGES = ["/login", "/signup"];

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function safeNext(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return null;
  }
  return value;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const forwardHeaders = () => {
    const h = new Headers(request.headers);
    h.set("x-pathname", pathname);
    h.set("x-search", search);
    return h;
  };

  let response = NextResponse.next({ request: { headers: forwardHeaders() } });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Not configured yet: let public pages render; private pages will show
  // their own error from createClient().
  if (!supabaseUrl || !supabaseKey) return response;

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, cacheHeaders) {
        // Update the request so Server Components see the fresh session...
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request: { headers: forwardHeaders() } });
        // ...and the response so the browser stores it.
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(cacheHeaders ?? {})) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Do not run code between createServerClient and this call: it refreshes
  // the session. getUser() verifies the token with the Auth server.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const redirectTo = (target: URL) => {
    const redirect = NextResponse.redirect(target);
    // Keep any refreshed session cookies and no-cache headers.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    for (const key of ["cache-control", "expires", "pragma"]) {
      const value = response.headers.get(key);
      if (value) redirect.headers.set(key, value);
    }
    return redirect;
  };

  if (!user && matchesPrefix(pathname, PRIVATE_PREFIXES)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${pathname}${search}`);
    return redirectTo(url);
  }

  if (user && matchesPrefix(pathname, AUTH_PAGES)) {
    // `next` is a same-site path and may carry its own query string.
    const next = safeNext(request.nextUrl.searchParams.get("next")) ?? "/dashboard";
    return redirectTo(new URL(next, request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except: /api/*, /auth/*, Next internals, and static files.
    "/((?!api(?:/|$)|auth(?:/|$)|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|webmanifest|woff2?|ttf|map)$).*)",
  ],
};
