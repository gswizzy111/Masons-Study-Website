"use client";

import { useState, useSyncExternalStore } from "react";
import { CircleAlert, CircleCheck, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { JOB_STARTED_EVENT, type JobStartedDetail } from "@/lib/jobs/start-job";
import type { Job } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { secondClock } from "@/components/sets/clock";

const noopSubscribe = () => () => {};
const noTime = () => 0;

function timeOf(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/** "45s", "2m 05s", "1h 04m". */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

async function retryJob(job: Job): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api/jobs/${job.id}/retry`, { method: "POST" });
  } catch {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }
  let data: Record<string, unknown> | null = null;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    // Not JSON.
  }
  if (!res.ok) {
    if (res.status === 401) throw new Error("Your session ended. Log in again to continue.");
    const message = typeof data?.error === "string" ? data.error : typeof data?.message === "string" ? data.message : "";
    throw new Error(message || "Couldn't restart it. Try again in a moment.");
  }
  const jobId = typeof data?.jobId === "string" && data.jobId ? data.jobId : job.id;
  // Wake up useLatestJob() so it follows the job again.
  window.dispatchEvent(
    new CustomEvent<JobStartedDetail>(JOB_STARTED_EVENT, {
      detail: { setId: job.set_id, kind: job.kind, jobId },
    }),
  );
}

/**
 * Live state of a background job: a progress bar with the current step and
 * elapsed time while it runs, the error with a Retry button if it stopped,
 * or a short "finished" line. Step changes are announced politely.
 *
 * Without `onRetry`, Retry POSTs /api/jobs/[jobId]/retry and wakes
 * useLatestJob() for that set.
 */
export function JobProgress(props: { job: Job | null; onRetry?: () => void; className?: string }) {
  const { job, onRetry, className } = props;
  const active = job?.status === "queued" || job?.status === "running";
  const now = useSyncExternalStore(
    active ? secondClock.subscribe : noopSubscribe,
    secondClock.getSnapshot,
    noTime,
  );
  const [retrying, setRetrying] = useState(false);

  if (!job) return null;

  const start = timeOf(job.started_at) ?? timeOf(job.created_at);
  const end = timeOf(job.finished_at) ?? (active ? now : timeOf(job.updated_at));
  const elapsed = start !== null && end !== null && end > 0 ? formatElapsed(end - start) : null;

  if (job.status === "error") {
    const handleRetry = async () => {
      if (onRetry) {
        onRetry();
        return;
      }
      setRetrying(true);
      try {
        await retryJob(job);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't restart it.");
      } finally {
        setRetrying(false);
      }
    };

    return (
      <div
        role="alert"
        className={cn(
          "flex flex-col gap-3 rounded-md border border-danger/30 bg-danger-soft p-4 text-sm sm:flex-row sm:items-start sm:justify-between",
          className,
        )}
      >
        <div className="flex min-w-0 items-start gap-2.5">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" strokeWidth={1.75} aria-hidden />
          <div className="min-w-0">
            <p className="font-medium text-danger">It stopped before finishing.</p>
            <p className="mt-0.5 leading-relaxed break-words text-ink">
              {job.error || "Something went wrong on our side."}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRetry}
          loading={retrying}
          className="shrink-0 self-start"
        >
          {retrying ? null : <RotateCcw strokeWidth={1.75} aria-hidden />}
          Retry
        </Button>
      </div>
    );
  }

  if (job.status === "done") {
    return (
      <p role="status" className={cn("flex items-center gap-2 text-sm text-ink-2", className)}>
        <CircleCheck className="size-4 shrink-0 text-accent" strokeWidth={1.75} aria-hidden />
        <span>
          {job.message || "Finished"}
          {elapsed ? (
            <span className="tabular-nums">
              <span aria-hidden> · </span>
              <span className="sr-only">, </span>took {elapsed}
            </span>
          ) : null}
        </span>
      </p>
    );
  }

  const pct = Math.max(0, Math.min(100, Math.round(job.progress ?? 0)));
  const waiting = job.status === "queued";
  const message = job.message || (waiting ? "Waiting to start" : "Working on it");
  const indeterminate = waiting && pct === 0;

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <p role="status" aria-live="polite" className="min-w-0 text-sm font-medium text-ink">
          {message}
        </p>
        <p className="shrink-0 font-mono text-xs text-ink-2 tabular-nums">
          {indeterminate ? null : <span>{pct}%</span>}
          {elapsed && !indeterminate ? <span aria-hidden> · </span> : null}
          {elapsed ? <span>{elapsed}</span> : null}
        </p>
      </div>
      <Progress
        value={indeterminate ? null : pct}
        size="md"
        label={waiting ? "Waiting to start" : "Progress"}
        valueText={indeterminate ? undefined : `${pct}%`}
      />
    </div>
  );
}
