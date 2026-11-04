// POST /api/jobs { setId, kind: 'build_set' | 'exam_questions', options? }
// Creates a background job for one of the signed-in user's study sets and
// starts it. 201 { jobId }. If a job of the same kind is already queued or
// running for the set, answers 409 with that job's id instead.
// See docs/ARCHITECTURE.md section 8.
import { z } from "zod";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { triggerJob } from "@/lib/jobs/trigger";
import { EXAM_MAX_COUNT, EXAM_MIN_COUNT } from "@/lib/ai/exam-questions";

// Lets the in-process fallback (local dev, other hosts) run as long as allowed.
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A running job with no update for this long has stopped. */
const STALE_MS = 15 * 60_000;

const BuildOptions = z.object({ regenerate: z.boolean().optional() }).strip();
const ExamOptions = z
  .object({
    count: z.number().int().min(EXAM_MIN_COUNT).max(EXAM_MAX_COUNT).optional(),
    topicIds: z.array(z.string().min(1).max(100)).max(100).optional(),
    difficulty: z.enum(["mixed", "easy", "medium", "hard"]).optional(),
  })
  .strip();

const Body = z.discriminatedUnion("kind", [
  z.object({
    setId: z.string().regex(UUID_RE),
    kind: z.literal("build_set"),
    options: BuildOptions.optional(),
  }),
  z.object({
    setId: z.string().regex(UUID_RE),
    kind: z.literal("exam_questions"),
    options: ExamOptions.optional(),
  }),
]);

function json(body: Record<string, unknown>, status: number) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function problemWith(issues: z.core.$ZodIssue[]): string {
  const path = issues[0]?.path?.join(".") ?? "";
  if (path === "setId") return "A valid setId is required.";
  if (path === "kind") return "kind must be build_set or exam_questions.";
  if (path.endsWith("count")) return `Pick between ${EXAM_MIN_COUNT} and ${EXAM_MAX_COUNT} questions.`;
  if (path.endsWith("difficulty")) return "difficulty must be mixed, easy, medium or hard.";
  if (path.includes("topicIds")) return "topicIds must be a list of topic ids.";
  return "That request wasn't valid.";
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "Send a JSON body with setId and kind." }, 400);
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return json({ error: problemWith(parsed.error.issues) }, 400);
  const { setId, kind } = parsed.data;
  const options: Record<string, unknown> = { ...(parsed.data.options ?? {}) };
  if (kind === "exam_questions" && Array.isArray(options.topicIds)) {
    options.topicIds = Array.from(new Set(options.topicIds as string[]));
  }

  const user = await getUser();
  if (!user) return json({ error: "Your session ended. Log in again to continue." }, 401);
  const supabase = await createClient();

  // RLS: only the owner can see the set.
  const { data: set, error: setError } = await supabase
    .from("study_sets")
    .select("id")
    .eq("id", setId)
    .maybeSingle();
  if (setError) return json({ error: "Couldn't load the study set. Try again." }, 500);
  if (!set) return json({ error: "Study set not found." }, 404);

  const origin = new URL(request.url).origin;

  // One queued or running job of each kind per set.
  const { data: active } = await supabase
    .from("jobs")
    .select("id, status, updated_at")
    .eq("set_id", setId)
    .eq("kind", kind)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (active) {
    const stale = Date.now() - new Date(active.updated_at as string).getTime() > STALE_MS;
    if (active.status === "queued" || !stale) {
      // A queued job may have lost its trigger; nudging it is safe (atomic claim).
      if (active.status === "queued") await triggerJob(active.id as string, origin);
      return json(
        {
          jobId: active.id,
          error: kind === "build_set" ? "This set is already being built." : "Questions are already being written.",
        },
        409,
      );
    }
    // A running job that stopped updating long ago has died: close it out.
    try {
      await createAdminClient()
        .from("jobs")
        .update({
          status: "error",
          error: "This stopped before it finished.",
          finished_at: new Date().toISOString(),
        })
        .eq("id", active.id)
        .eq("status", "running");
    } catch {
      return json({ error: "The server isn't set up to run jobs yet." }, 500);
    }
  }

  const { data: job, error: insertError } = await supabase
    .from("jobs")
    .insert({ set_id: setId, kind, options, status: "queued" })
    .select("id")
    .single();
  if (insertError || !job) return json({ error: "Couldn't start that. Try again in a moment." }, 500);

  if (kind === "build_set") {
    await supabase.from("study_sets").update({ status: "building" }).eq("id", setId);
  }

  await triggerJob(job.id as string, origin);
  return json({ jobId: job.id }, 201);
}
