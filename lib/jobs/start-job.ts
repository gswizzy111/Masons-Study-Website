// Client helper: start a background job (build a set, make exam questions).
import type { JobKind } from "@/lib/types";

/** Window event fired after a job starts, so useLatestJob() picks it up. */
export const JOB_STARTED_EVENT = "masons-study:job-started";

export type JobStartedDetail = { setId: string; kind: JobKind; jobId: string };

function messageFrom(data: unknown): string | null {
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    for (const key of ["error", "message"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return null;
}

/**
 * POSTs /api/jobs and resolves to the job id. If a job of the same kind is
 * already queued or running for the set, resolves to that job's id. Throws
 * Error(message) with a readable message on failure.
 */
export async function startJob(
  setId: string,
  kind: JobKind,
  options?: Record<string, unknown>,
): Promise<string> {
  let res: Response;
  try {
    res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setId, kind, ...(options ? { options } : {}) }),
    });
  } catch {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // Not JSON; handled below.
  }

  const jobId =
    data && typeof data === "object" ? (data as Record<string, unknown>).jobId : undefined;

  if (typeof jobId === "string" && jobId) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent<JobStartedDetail>(JOB_STARTED_EVENT, { detail: { setId, kind, jobId } }),
      );
    }
    return jobId;
  }

  if (res.status === 401) throw new Error("Your session ended. Log in again to continue.");
  throw new Error(messageFrom(data) ?? "Couldn't start that. Try again in a moment.");
}
