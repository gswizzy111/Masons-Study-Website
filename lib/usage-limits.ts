// Per-user limits on Claude, YouTube and background jobs, so one account
// can't run up the site's API bills. The limits live in the database
// (public.take_ai_quota_for in supabase/migrations/20261104000002_server_guards.sql):
// route handlers check them with take_ai_quota(), and every job a user
// inserts is counted by a trigger on public.jobs.
import type { SupabaseClient } from "@supabase/supabase-js";

export type UsageKind = "chat" | "build_set" | "exam_questions" | "videos";

export type QuotaResult =
  | { ok: true }
  | { ok: false; status: 429 | 503; message: string; retryAfterSeconds?: number };

/** "about 12 minutes", "about 3 hours". */
function waitText(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes < 90) return `about ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.ceil(minutes / 60);
  return `about ${hours} hours`;
}

/** The message a student sees when a limit is reached. */
export function limitMessage(kind: UsageKind, waitSeconds: number): string {
  const wait = waitText(waitSeconds);
  switch (kind) {
    case "chat":
      return `You've asked Claude a lot in a short time. Take a short break and try again in ${wait}.`;
    case "build_set":
      return `You've started a lot of builds recently. Try again in ${wait}.`;
    case "exam_questions":
      return `You've asked for a lot of practice questions recently. Try again in ${wait}.`;
    case "videos":
      return `Video searches are paused for a bit to stay within the daily limit. Try again in ${wait}.`;
  }
}

/** Seconds from a PT429 error raised by the jobs trigger (details holds them). */
export function waitFromLimitError(error: { details?: string | null } | null | undefined): number {
  const seconds = Number(error?.details);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 3600;
}

/** SQLSTATE the jobs trigger raises when a limit is reached (HTTP 429 from PostgREST). */
export const LIMIT_ERROR_CODE = "PT429";

/**
 * Uses `cost` units of the signed-in user's `kind` quota. Call it with the
 * user's server client right before the expensive work. Fails closed: when
 * the check itself can't run (the migration isn't applied), the work
 * doesn't run either.
 */
export async function takeQuota(supabase: SupabaseClient, kind: UsageKind, cost = 1): Promise<QuotaResult> {
  const { data, error } = await supabase.rpc("take_ai_quota", { p_kind: kind, p_cost: Math.max(1, Math.round(cost)) });
  if (error) {
    console.error(`[usage-limits] take_ai_quota(${kind}) failed:`, error.code ?? "", error.message);
    return { ok: false, status: 503, message: "This isn't available right now. Try again in a few minutes." };
  }
  const wait = Number(data);
  if (!Number.isFinite(wait) || wait <= 0) return { ok: true };
  return { ok: false, status: 429, message: limitMessage(kind, wait), retryAfterSeconds: wait };
}
