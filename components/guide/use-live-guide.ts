"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SetStatus, Topic } from "@/lib/types";
import { GUIDE_SECTION_COLUMNS, type GuideSectionRow } from "@/components/guide/guide-data";

const POLL_MS = 3000;
const HIDDEN_POLL_MS = 15000;
const MAX_BACKOFF_MS = 30000;

export type LiveGuide = {
  status: SetStatus;
  topics: Topic[];
  sections: GuideSectionRow[];
};

function asTopics(value: unknown): Topic[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (t): t is Topic => !!t && typeof t === "object" && typeof (t as Topic).id === "string",
  );
}

/**
 * The guide's sections, kept fresh while the set is building: every 3 s
 * (15 s while the tab is hidden) it reads the set's status and outline,
 * then the sections, so sections appear as the build job writes them.
 * Polling stops once the set is no longer building, and the route is
 * refreshed so the set header catches up.
 */
export function useLiveGuide({
  setId,
  initialStatus,
  initialTopics,
  initialSections,
}: {
  setId: string;
  initialStatus: SetStatus;
  initialTopics: Topic[];
  initialSections: GuideSectionRow[];
}): LiveGuide {
  const router = useRouter();
  const [seed, setSeed] = useState({ initialStatus, initialTopics, initialSections });
  const [live, setLive] = useState<LiveGuide>({
    status: initialStatus,
    topics: initialTopics,
    sections: initialSections,
  });

  // Fresh server data (a refresh or another set) replaces what we polled.
  if (
    seed.initialStatus !== initialStatus ||
    seed.initialTopics !== initialTopics ||
    seed.initialSections !== initialSections
  ) {
    setSeed({ initialStatus, initialTopics, initialSections });
    setLive({ status: initialStatus, topics: initialTopics, sections: initialSections });
  }

  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  const building = live.status === "building";

  useEffect(() => {
    if (!building) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let inFlight = false;

    const schedule = (ms: number) => {
      if (cancelled) return;
      clearTimeout(timer);
      timer = setTimeout(tick, ms);
    };

    async function tick() {
      if (cancelled || inFlight) return;
      if (document.visibilityState === "hidden") {
        schedule(HIDDEN_POLL_MS);
        return;
      }
      inFlight = true;
      try {
        const supabase = createClient();
        // Status first, then sections: once the status says the build is
        // over, the sections read after it include everything it wrote.
        const setRes = await supabase
          .from("study_sets")
          .select("status, topics")
          .eq("id", setId)
          .maybeSingle();
        if (setRes.error) throw new Error(setRes.error.message);
        const secRes = await supabase
          .from("guide_sections")
          .select(GUIDE_SECTION_COLUMNS)
          .eq("set_id", setId)
          .order("position", { ascending: true });
        if (secRes.error) throw new Error(secRes.error.message);
        if (cancelled) return;

        failures = 0;
        const row = setRes.data as { status: SetStatus; topics: unknown } | null;
        const status: SetStatus = row?.status ?? "error";
        setLive({
          status,
          topics: row ? asTopics(row.topics) : [],
          sections: (secRes.data ?? []) as GuideSectionRow[],
        });
        if (status !== "building") {
          routerRef.current.refresh();
          return;
        }
        schedule(POLL_MS);
      } catch {
        failures += 1;
        schedule(Math.min(MAX_BACKOFF_MS, POLL_MS * 2 ** failures));
      } finally {
        inFlight = false;
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") schedule(0);
    };

    schedule(POLL_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [building, setId]);

  return live;
}
