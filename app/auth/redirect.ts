// Redirects with a relative Location header. Building an absolute URL from
// request.nextUrl.origin can name a different host than the one the visitor
// is on (localhost vs 127.0.0.1 under `next start`, or an internal host
// behind a proxy), which would drop them onto another origin. Browsers
// resolve a relative Location against the page they are on.
import { NextResponse } from "next/server";

/** A redirect to a same-site path (already checked with safeNextPath). */
export function redirectTo(path: string, status: 303 | 307 = 307): NextResponse {
  return new NextResponse(null, { status, headers: { Location: path } });
}
