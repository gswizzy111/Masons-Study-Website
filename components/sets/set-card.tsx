import Link from "next/link";
import { CalendarClock, History, RotateCcw } from "lucide-react";
import type { MasterySummary } from "@/lib/mastery";
import type { SetStatus } from "@/lib/types";
import { cn, pluralize } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MasteryBar } from "@/components/ui/mastery-bar";
import { ProgressRing } from "@/components/ui/progress-ring";
import { CourseChip } from "@/components/sets/course-chip";
import { LiveText } from "@/components/sets/live-text";
import { SetStatusBadge } from "@/components/sets/set-status-badge";
import {
  examCountdownText,
  examUrgency,
  formatExamDate,
  lastStudiedText,
} from "@/components/sets/time-text";
import type { CourseLite } from "@/components/sets/course-colors";

export type SetCardData = {
  id: string;
  title: string;
  status: SetStatus;
  exam_date: string | null;
  last_studied_at: string | null;
  course: CourseLite | null;
  summary: MasterySummary;
};

/** One study set on the dashboard. The whole card is a link to the set. */
export function SetCard({ set, className }: { set: SetCardData; className?: string }) {
  const { summary } = set;
  const urgency = examUrgency(set.exam_date);
  const headingId = `set-${set.id}-title`;

  return (
    <Card interactive className={cn("h-full gap-4 p-5", className)}>
      <div className="flex min-h-6 flex-wrap items-center gap-2">
        {set.course ? <CourseChip course={set.course} /> : null}
        <SetStatusBadge status={set.status} />
        {summary.due > 0 ? (
          // Neutral, not amber: due cards include mastered ones up for review.
          <Badge variant="neutral">
            <RotateCcw strokeWidth={1.75} aria-hidden />
            {summary.due.toLocaleString("en-US")} due
          </Badge>
        ) : null}
      </div>

      <h3 id={headingId} className="font-display text-lg leading-snug font-semibold tracking-[-0.01em] text-ink">
        <Link
          href={`/sets/${set.id}`}
          className="line-clamp-2 break-words outline-none after:absolute after:inset-0 after:rounded-lg after:content-['']"
        >
          {set.title}
        </Link>
      </h3>

      <div className="flex items-center gap-4">
        <ProgressRing
          value={summary.percent}
          size={56}
          stroke={5}
          label="Mastered"
          valueText={`${summary.percent}% mastered`}
        >
          <span className="font-mono text-[0.8125rem] font-medium text-ink tabular-nums">
            {summary.percent}%
          </span>
        </ProgressRing>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-sm text-ink-2">
            {summary.total > 0 ? (
              <>
                <span className="font-medium text-ink tabular-nums">
                  {summary.mastered.toLocaleString("en-US")}
                </span>{" "}
                of {pluralize(summary.total, "card")} mastered
              </>
            ) : set.status === "building" ? (
              "Cards are on the way"
            ) : (
              "No cards yet"
            )}
          </p>
          <MasteryBar summary={summary} showLegend={false} size="sm" label="Mastery" />
        </div>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line pt-3 text-sm text-ink-2">
        {set.exam_date ? (
          <span
            className={cn(
              "inline-flex items-center gap-1.5",
              urgency === "soon" && "font-medium text-ink",
            )}
            title={formatExamDate(set.exam_date)}
          >
            <CalendarClock className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
            <LiveText kind="exam" value={set.exam_date} serverText={examCountdownText(set.exam_date)} />
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1.5">
          <History className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
          <LiveText
            kind="last-studied"
            value={set.last_studied_at}
            serverText={lastStudiedText(set.last_studied_at)}
          />
        </span>
      </div>
    </Card>
  );
}
