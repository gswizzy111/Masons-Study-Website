// Client hooks that follow a background job by polling its `jobs` row with
// the browser Supabase client (RLS: users can read their own jobs).
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Job, JobKind } from "@/lib/types";
import { JOB_STARTED_EVENT, type JobStartedDetail } from "@/lib/jobs/start-job";

const POLL_MS = 2_000;
const HIDDEN_POLL_MS = 10_000;
const MAX_BACKOFF_MS = 15_000;

/** True while a job may still change. */
export function isJobActive(job: Pick<Job, "status"> | null | undefined): boolean {
  return job?.status === "queued" || job?.status === "running";
}

type Loaded = { key: string; job: Job | null };

type Fetcher = () => Promise<{ job: Job | null; error: boolean }>;

/**
 * Runs `fetcher` now and then every 2 s (10 s while the tab is hidden) until
 * the job is done, errored or missing. Network errors back off and retry.
 * Returns a cleanup function.
 */
function poll(fetcher: Fetcher, onResult: (job: Job | null) => void): () => void {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;

  const schedule = (ms: number) => {
    if (!cancelled) timer = setTimeout(tick, ms);
  };

  async function tick() {
    timer = undefined;
    let result: Awaited<ReturnType<Fetcher>>;
    try {
      result = await fetcher();
    } catch {
      result = { job: null, error: true };
    }
    if (cancelled) return;

    if (result.error) {
      failures += 1;
      schedule(Math.min(MAX_BACKOFF_MS, POLL_MS * 2 ** failures));
      return;
    }
    failures = 0;
    onResult(result.job);
    if (isJobActive(result.job)) {
      const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
      schedule(hidden ? HIDDEN_POLL_MS : POLL_MS);
    }
  }

  const onVisible = () => {
    // Catch up right away when the tab comes back.
    if (document.visibilityState === "visible" && timer !== undefined) {
      clearTimeout(timer);
      void tick();
    }
  };

  void tick();
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);

  return () => {
    cancelled = true;
    if (timer !== undefined) clearTimeout(timer);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}

/**
 * Follows one job. `job` is null until loaded (and when it doesn't exist);
 * `loading` is true until the first successful read. Polls every 2 s until
 * the job is `done` or `error`.
 */
export function useJob(jobId: string | null): { job: Job | null; loading: boolean } {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!jobId) return;
    const supabase = createClient();
    return poll(
      async () => {
        const { data, error } = await supabase.from("jobs").select("*").eq("id", jobId).maybeSingle();
        return { job: (data as Job | null) ?? null, error: Boolean(error) };
      },
      (job) => setLoaded({ key: jobId, job }),
    );
  }, [jobId]);

  if (!jobId) return { job: null, loading: false };
  const current = loaded?.key === jobId ? loaded : null;
  return { job: current?.job ?? null, loading: current === null };
}

/**
 * Follows the newest job of `kind` for a set. Polls while it is queued or
 * running. Picks up jobs started with startJob() on this page automatically;
 * call `refresh()` to check again after starting one some other way.
 */
export function useLatestJob(
  setId: string,
  kind: JobKind,
): { job: Job | null; loading: boolean; refresh: () => void } {
  const key = `${setId}:${kind}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    const onStarted = (event: Event) => {
      const detail = (event as CustomEvent<JobStartedDetail>).detail;
      if (detail?.setId === setId && detail.kind === kind) setNonce((n) => n + 1);
    };
    window.addEventListener(JOB_STARTED_EVENT, onStarted);
    return () => window.removeEventListener(JOB_STARTED_EVENT, onStarted);
  }, [setId, kind]);

  useEffect(() => {
    if (!setId) return;
    const supabase = createClient();
    const pollKey = `${setId}:${kind}`;
    return poll(
      async () => {
        const { data, error } = await supabase
          .from("jobs")
          .select("*")
          .eq("set_id", setId)
          .eq("kind", kind)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return { job: (data as Job | null) ?? null, error: Boolean(error) };
      },
      (job) => setLoaded({ key: pollKey, job }),
    );
    // `nonce` re-runs the poll after refresh() or a job-started event.
  }, [setId, kind, nonce]);

  const current = loaded?.key === key ? loaded : null;
  return { job: current?.job ?? null, loading: Boolean(setId) && current === null, refresh };
}
