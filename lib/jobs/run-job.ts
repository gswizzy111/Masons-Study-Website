// Runs one background job with the service role: claim, dispatch, finish.
// See docs/ARCHITECTURE.md section 8.
// Relative imports only and no Next-only modules: the Netlify background
// function (netlify/functions/run-job.mts) bundles this file outside Next.
import { createAdminClient } from "../supabase/admin";
import { allowedEmails, isAllowedEmail, NOT_ALLOWED_MESSAGE } from "../access";
import {
  buildSet,
  CONTINUE_OPTION,
  JobError,
  markBuildFailed,
  readableError,
  type JobContext,
  type JobOutcome,
} from "../ai/build-set";
import { AiNotConfiguredError } from "../ai/client";
import { generateExamQuestions } from "../ai/exam-questions";
import type { Job } from "../types";

export type RunJobOptions = {
  /**
   * The site's origin. A job that runs out of time re-queues itself and
   * continues in a fresh background function at this origin.
   */
  origin?: string;
  /** Time one run may use, in ms. Netlify background functions stop at 15 minutes. */
  budgetMs?: number;
};

/** Default time budget for one run. */
export const RUN_BUDGET_MS = 14 * 60_000;
/** No new long step (a guide section) starts in the last part of the budget. */
const RESERVE_MS = 3.5 * 60_000;
/** How many times one job may continue in a fresh run. */
const MAX_CONTINUATIONS = 4;
/** Path of the background function. */
export const RUN_JOB_FUNCTION_PATH = "/.netlify/functions/run-job";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isJobId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function clampProgress(n: number): number {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 0)));
}

/**
 * Asks the background function to run the job. Resolves true when it
 * answered 202 (accepted), false otherwise (local dev, other hosts, errors).
 */
export async function postToBackgroundFunction(jobId: string, origin: string): Promise<boolean> {
  try {
    const res = await fetch(`${origin.replace(/\/+$/, "")}${RUN_JOB_FUNCTION_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId }),
      signal: AbortSignal.timeout(10_000),
    });
    // Drain the body so the connection is released.
    await res.text().catch(() => undefined);
    return res.status === 202;
  } catch {
    return false;
  }
}

/**
 * Runs a queued job to completion. Safe to call more than once for the same
 * job: the first caller atomically claims it (queued to running) and every
 * other call is a no-op, as is an unknown id. Never throws.
 */
export async function runJob(jobId: string, opts: RunJobOptions = {}): Promise<void> {
  if (!isJobId(jobId)) return;

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error(`[run-job ${jobId}] no service role`, error);
    return;
  }

  // Claim: only a queued job moves to running, and only once.
  const { data: claimed, error: claimError } = await admin
    .from("jobs")
    .update({ status: "running", error: null, finished_at: null })
    .eq("id", jobId)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();
  if (claimError) {
    console.error(`[run-job ${jobId}] claim failed`, claimError.message);
    return;
  }
  if (!claimed) return;
  const job = claimed as Job;

  // Jobs can be inserted straight through the REST API, and logins are shared
  // with another app, so check the owner before spending any credits.
  if (allowedEmails()) {
    const { data: owner } = await admin.auth.admin.getUserById(job.user_id);
    if (!isAllowedEmail(owner?.user?.email)) {
      await fail(admin, job, new JobError(NOT_ALLOWED_MESSAGE));
      return;
    }
  }
  if (!job.started_at) {
    // A continued run keeps the original start time; a new run sets it.
    const startedAt = new Date().toISOString();
    await admin.from("jobs").update({ started_at: startedAt }).eq("id", jobId);
    job.started_at = startedAt;
  }

  const start = Date.now();
  const budget = Math.max(60_000, opts.budgetMs ?? RUN_BUDGET_MS);
  // Progress only moves forward, including across continued runs.
  let shown = clampProgress(job.progress ?? 0);
  const ctx: JobContext = {
    admin,
    job,
    softDeadline: start + Math.max(budget / 2, budget - RESERVE_MS),
    hardDeadline: start + budget,
    report: async (progress, message) => {
      shown = Math.max(shown, clampProgress(progress));
      const { error } = await admin
        .from("jobs")
        .update({ progress: shown, message })
        .eq("id", jobId)
        .eq("status", "running");
      if (error) console.error(`[run-job ${jobId}] progress`, error.message);
    },
  };

  let outcome: JobOutcome;
  try {
    if (job.kind === "build_set") outcome = await buildSet(ctx);
    else if (job.kind === "exam_questions") outcome = await generateExamQuestions(ctx);
    else throw new JobError("This kind of job isn't supported.");
  } catch (error) {
    await fail(admin, job, error);
    return;
  }

  if (outcome.kind === "done") {
    const { error } = await admin
      .from("jobs")
      .update({
        status: "done",
        progress: 100,
        message: outcome.message,
        error: null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .eq("status", "running");
    if (error) console.error(`[run-job ${jobId}] finish`, error.message);
    return;
  }

  // Out of time: re-queue and continue in a fresh run. The count is clamped
  // so no stored value can lift the cap.
  const previous = Math.trunc(Number(job.options?.continuations ?? 0));
  const continuations = Math.min(MAX_CONTINUATIONS, Number.isFinite(previous) && previous > 0 ? previous : 0) + 1;
  if (continuations > MAX_CONTINUATIONS) {
    await fail(
      admin,
      job,
      new JobError("This is taking too long to finish. Try splitting the material into smaller study sets."),
    );
    return;
  }
  const { error: requeueError } = await admin
    .from("jobs")
    .update({
      status: "queued",
      progress: clampProgress(outcome.progress),
      message: outcome.message,
      options: {
        ...(job.options ?? {}),
        ...(outcome.carry ?? {}),
        [CONTINUE_OPTION]: outcome.continueFrom,
        continuations,
      },
    })
    .eq("id", jobId)
    .eq("status", "running");
  if (requeueError) {
    await fail(admin, job, new JobError("This couldn't continue. Try again."));
    return;
  }
  await continueJob(jobId, opts);
}

/** Starts the next run of a re-queued job: a fresh background function, else in this process. */
async function continueJob(jobId: string, opts: RunJobOptions): Promise<void> {
  if (opts.origin && (await postToBackgroundFunction(jobId, opts.origin))) return;
  await runJob(jobId, opts);
}

async function fail(admin: ReturnType<typeof createAdminClient>, job: Job, error: unknown): Promise<void> {
  const message = readableError(error);
  if (error instanceof AiNotConfiguredError) console.warn(`[run-job ${job.id}] ${error.message}`);
  else if (!(error instanceof JobError)) console.error(`[run-job ${job.id}] failed`, error);
  const { error: updateError } = await admin
    .from("jobs")
    .update({ status: "error", error: message, finished_at: new Date().toISOString() })
    .eq("id", job.id)
    .eq("status", "running");
  if (updateError) console.error(`[run-job ${job.id}] could not record the error`, updateError.message);
  if (job.kind === "build_set") {
    try {
      await markBuildFailed(admin, job.set_id);
    } catch (e) {
      console.error(`[run-job ${job.id}] could not update the set`, e);
    }
  }
}
