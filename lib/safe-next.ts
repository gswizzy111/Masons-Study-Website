// The one check for `next` redirect targets (after login, email links).
// No Next-only imports, so proxy.ts, route handlers, server actions and plain
// node tests can all use it.

const PROBE_ORIGIN = "http://next.invalid";
// URL parsers drop tab, CR and LF and read "\" as "/", so "/\t/evil.example"
// would become "//evil.example". Refuse any control character or backslash.
const UNSAFE_CHARS = /[\u0000-\u001F\u007F\\]/;

/**
 * A same-site path (with its query and hash) that is safe to redirect to,
 * or null. The value must start with a single "/", contain no control
 * characters or backslashes, and still resolve to this site after URL
 * parsing (so "//host", "/a/../..//host" and the like are refused).
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return null;
  if (UNSAFE_CHARS.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value, PROBE_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PROBE_ORIGIN) return null;
  const path = `${url.pathname}${url.search}${url.hash}`;
  // Dot segments can collapse into a protocol-relative path ("/a/..//host").
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  return path;
}
