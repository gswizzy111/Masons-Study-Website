"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { isJobActive, useLatestJob } from "@/lib/jobs/use-job";
import type { Job, SetStatus } from "@/lib/types";

type SetJobValue = {
  setId: string;
  /** The set's status as the server last rendered it. */
  setStatus: SetStatus;
  /** Newest build_set job for the set (null until loaded or if none). */
  job: Job | null;
  loading: boolean;
  /** A build is queued or running. */
  active: boolean;
  refresh: () => void;
};

const SetJobContext = createContext<SetJobValue | null>(null);

const REFRESH_EVERY_MS = 4_000;

/**
 * Follows the set's latest build job once for the whole overview page, and
 * re-renders the server data when it moves on: when it finishes (or stops),
 * and every few seconds while its step changes, so topics and materials fill
 * in as they are made.
 */
export function SetJobProvider({
  setId,
  setStatus,
  children,
}: {
  setId: string;
  setStatus: SetStatus;
  children: ReactNode;
}) {
  const router = useRouter();
  const { job, loading, refresh } = useLatestJob(setId, "build_set");
  const seen = useRef<{ id: string; status: Job["status"]; message: string | null } | null>(null);
  const lastRefresh = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const jobId = job?.id ?? null;
  const jobStatus = job?.status ?? null;
  const jobMessage = job?.message ?? null;

  useEffect(() => {
    if (!jobId || !jobStatus) return;
    const prev = seen.current;
    seen.current = { id: jobId, status: jobStatus, message: jobMessage };
    const activeNow = jobStatus === "queued" || jobStatus === "running";

    const refreshNow = () => {
      if (pending.current) clearTimeout(pending.current);
      pending.current = undefined;
      lastRefresh.current = Date.now();
      router.refresh();
    };

    if (!prev || prev.id !== jobId) {
      // First look at this job: if it already ended but the page still
      // shows the set as building, catch up once.
      if (!activeNow && setStatus === "building") refreshNow();
      return;
    }
    if (prev.status !== jobStatus && !activeNow) {
      refreshNow();
      return;
    }
    if (activeNow && prev.message !== jobMessage) {
      const wait = lastRefresh.current + REFRESH_EVERY_MS - Date.now();
      if (wait <= 0) refreshNow();
      else if (!pending.current) pending.current = setTimeout(refreshNow, wait);
    }
  }, [jobId, jobStatus, jobMessage, setStatus, router]);

  useEffect(() => () => clearTimeout(pending.current), []);

  const value: SetJobValue = {
    setId,
    setStatus,
    job,
    loading,
    active: isJobActive(job),
    refresh,
  };

  return <SetJobContext.Provider value={value}>{children}</SetJobContext.Provider>;
}

export function useSetJob(): SetJobValue {
  const value = useContext(SetJobContext);
  if (!value) throw new Error("useSetJob() must be used inside <SetJobProvider>.");
  return value;
}
