// Environment access for Next and for the Netlify background function.
// Relative imports only, no Next-only modules (see docs/ARCHITECTURE.md section 2).
//
// NEXT_PUBLIC_* values must be read with literal `process.env.NAME` expressions
// so Next can inline them into the browser bundle.

const DEFAULT_MODEL = "claude-opus-5-5";

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Values that are safe in the browser. Empty strings when not configured. */
export const publicEnv = {
  supabaseUrl: clean(process.env.NEXT_PUBLIC_SUPABASE_URL) ?? "",
  supabaseAnonKey: clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ?? "",
} as const;

export type ServerEnv = {
  /** Service-role key. Bypasses RLS; only the job runner uses it. */
  serviceRoleKey: string | undefined;
  anthropicApiKey: string | undefined;
  /** `ANTHROPIC_MODEL`, or `claude-opus-5-5` when unset. */
  anthropicModel: string;
  youtubeApiKey: string | undefined;
};

/** Server-only values. Never throws; missing values are `undefined`. */
export function serverEnv(): ServerEnv {
  return {
    serviceRoleKey: clean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    anthropicApiKey: clean(process.env.ANTHROPIC_API_KEY),
    anthropicModel: clean(process.env.ANTHROPIC_MODEL) ?? DEFAULT_MODEL,
    youtubeApiKey: clean(process.env.YOUTUBE_API_KEY),
  };
}

/** True when Supabase URL and anon key are set. */
export function supabaseConfigured(): boolean {
  return Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey);
}

/** True when Claude can be called (ANTHROPIC_API_KEY is set). */
export function aiConfigured(): boolean {
  return Boolean(serverEnv().anthropicApiKey);
}

/** True when YouTube search can be called (YOUTUBE_API_KEY is set). */
export function youtubeConfigured(): boolean {
  return Boolean(serverEnv().youtubeApiKey);
}

/**
 * Absolute site URL without a trailing slash, for auth email links and
 * redirects. Prefers NEXT_PUBLIC_SITE_URL, then the given request origin,
 * then http://localhost:3000.
 */
export function siteUrlFrom(origin?: string): string {
  const configured = clean(process.env.NEXT_PUBLIC_SITE_URL);
  const base = configured ?? clean(origin) ?? "http://localhost:3000";
  return base.replace(/\/+$/, "");
}
