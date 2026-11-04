"use client";

import { useSyncExternalStore } from "react";
import { minuteClock, noTime } from "@/components/sets/clock";
import { liveText, type LiveTextKind } from "@/components/sets/time-text";

/**
 * Time-relative text ("Exam in 3 days", "Studied 2 hours ago") that matches
 * the server HTML on hydration, then switches to the visitor's own clock and
 * time zone and keeps itself current once a minute.
 *
 * Render it from a Server Component and pass `serverText` computed there
 * with the same helper, e.g. `serverText={examCountdownText(date)}`.
 */
export function LiveText({
  kind,
  value,
  serverText,
  className,
}: {
  kind: LiveTextKind;
  value: string | null;
  serverText: string;
  className?: string;
}) {
  const now = useSyncExternalStore(minuteClock.subscribe, minuteClock.getSnapshot, noTime);
  const text = now === null ? serverText : liveText(kind, value, new Date(now));
  return <span className={className}>{text}</span>;
}
