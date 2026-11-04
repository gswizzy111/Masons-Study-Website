// POST /api/jobs/[jobId]/retry
// Re-queues one of the user's jobs that ended in an error, or one stuck
// running with no update for 15+ minutes, and starts it again. 200 { jobId }.
// A queued job is simply nudged. A restart counts toward the same per-user
// limit as a new job (429 when reached). See docs/ARCHITECTURE.md section 8.
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { triggerJob } from "@/lib/jobs/trigger";
import { takeQuota } from "@/lib/usage-limits";

// Lets the in-process fallback (local dev, other hosts) run as long as allowed.
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STALE_MS = 15 * 60_000;

function json(body: Record<string, unknown>, status: number, extraHeaders: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "cache-control": "no-store", ...extraHeaders } });
}

type JobRow = {
  id: string;
  set_id: string;
  kind: string;
  status: string;
  options: Record<string, unknown> | null;
  updated_at: string;
};

export async function POST(request: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;
  if (!UUID_RE.test(jobId)) return json({ error: "Job not found." }, 404);

  const user = await getUser();
  if (!user) return json({ error: "Your session ended. Log in again to continue." }, 401);
  const supabase = await createClient();

  // RLS: users can read only their own jobs.
  const { data, error } = await supabase
    .from("jobs")
    .select("id, set_id, kind, status, options, updated_at")
    .eq("id", jobId)
    .maybeSingle();
  if (error) return json({ error: "Couldn't load that job. Try again." }, 500);
  if (!data) return json({ error: "Job not found." }, 404);
  const job = data as JobRow;
  const origin = new URL(request.url).origin;

  if (job.status === "queued") {
    await triggerJob(job.id, origin);
    return json({ jobId: job.id }, 200);
  }
  if (job.status === "done") return json({ jobId: job.id, error: "This already finished." }, 409);
  const stale = Date.now() - new Date(job.updated_at).getTime() > STALE_MS;
  if (job.status === "running" && !stale) {
    return json({ jobId: job.id, error: "This is still running." }, 409);
  }

  // Don't restart an old job while a newer one of the same kind is active.
  const { data: active } = await supabase
    .from("jobs")
    .select("id, updated_at")
    .eq("set_id", job.set_id)
    .eq("kind", job.kind)
    .in("status", ["queued", "running"])
    .neq("id", job.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (active && Date.now() - new Date(active.updated_at as string).getTime() <= STALE_MS) {
    return json({ jobId: active.id, error: "Another run is already going." }, 409);
  }

  if (job.kind !== "build_set" && job.kind !== "exam_questions") return json({ error: "Job not found." }, 404);
  // A restart runs the whole job again, so it uses the same quota as a new one.
  const quota = await takeQuota(supabase, job.kind);
  if (!quota.ok) {
    const wait = quota.retryAfterSeconds;
    return json({ jobId: job.id, error: quota.message }, quota.status, wait ? { "retry-after": String(Math.ceil(wait)) } : {});
  }

  // Only the service role may update jobs.
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return json({ error: "The server isn't set up to run jobs yet." }, 500);
  }
  const { data: requeued, error: updateError } = await admin
    .from("jobs")
    .update({
      status: "queued",
      progress: 0,
      message: "Starting again",
      error: null,
      started_at: null,
      finished_at: null,
      // A build that already saved its outline picks up from the sections.
      options: { ...(job.options ?? {}), continuations: 0 },
    })
    .eq("id", job.id)
    .eq("status", job.status)
    .eq("updated_at", job.updated_at)
    .select("id")
    .maybeSingle();
  if (updateError?.code === "23505") {
    // Another run of this kind started for the set in the meantime.
    return json({ jobId: job.id, error: "Another run is already going." }, 409);
  }
  if (updateError) return json({ error: "Couldn't restart it. Try again in a moment." }, 500);
  if (!requeued) return json({ jobId: job.id, error: "This job changed. Refresh and try again." }, 409);

  if (job.kind === "build_set") {
    await supabase.from("study_sets").update({ status: "building" }).eq("id", job.set_id);
  }

  await triggerJob(job.id, origin);
  return json({ jobId: job.id }, 200);
}
