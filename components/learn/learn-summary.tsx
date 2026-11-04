"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CircleCheck,
  ClipboardCheck,
  CornerDownLeft,
  Repeat,
  Trophy,
} from "lucide-react";
import type { MasteryLevel } from "@/lib/types";
import { cn, pluralize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";

export type SummaryRow = {
  cardId: string;
  term: string;
  definition: string;
  before: MasteryLevel;
  after: MasteryLevel;
  firstTry: boolean;
};

const LEVEL_TEXT: Record<MasteryLevel, string> = {
  0: "Not studied",
  1: "Still learning",
  2: "Familiar",
  3: "Mastered",
};

const LEVEL_DOT: Record<MasteryLevel, string> = {
  0: "bg-not-studied",
  1: "bg-learning",
  2: "bg-learning",
  3: "bg-mastered",
};

function LevelChip({ level }: { level: MasteryLevel }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-ink-2">
      <span aria-hidden className={cn("size-2 rounded-full", LEVEL_DOT[level])} />
      {LEVEL_TEXT[level]}
    </span>
  );
}

/** End of a round: what moved, and the next step. */
export function RoundSummary({
  roundNumber,
  rows,
  practice,
  onNext,
  hasMore,
}: {
  roundNumber: number;
  rows: readonly SummaryRow[];
  practice: boolean;
  onNext: () => void;
  hasMore: boolean;
}) {
  const nextRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    (nextRef.current ?? headingRef.current)?.focus({ preventScroll: false });
  }, []);

  const firstTry = rows.filter((r) => r.firstTry).length;
  const newlyMastered = rows.filter((r) => r.before < 3 && r.after === 3);
  const movedUp = rows.filter((r) => r.after > r.before && r.after < 3).length;

  return (
    <section
      aria-labelledby="round-summary-title"
      className="overflow-hidden rounded-lg border border-line bg-surface shadow-md"
    >
      <div className="px-5 pt-6 pb-5 sm:px-7 sm:pt-7">
        <p className="text-xs font-medium tracking-[0.06em] text-ink-2 uppercase">
          {practice ? "Practice round" : `Round ${roundNumber}`} done
        </p>
        <h3
          id="round-summary-title"
          ref={headingRef}
          tabIndex={-1}
          className="mt-2 font-display text-2xl leading-tight font-semibold tracking-[-0.015em] text-ink outline-none sm:text-[1.75rem]"
        >
          {firstTry === rows.length
            ? "Every card right the first time"
            : `${firstTry} of ${rows.length} right the first time`}
        </h3>

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-line bg-surface-2/60 px-4 py-3">
            <dt className="text-[0.8125rem] text-ink-2">Moved to mastered</dt>
            <dd className="mt-1 font-mono text-2xl font-medium text-accent-strong tabular-nums">
              {newlyMastered.length}
            </dd>
          </div>
          <div className="rounded-md border border-line bg-surface-2/60 px-4 py-3">
            <dt className="text-[0.8125rem] text-ink-2">Moved up</dt>
            <dd className="mt-1 font-mono text-2xl font-medium text-learning-strong tabular-nums">{movedUp}</dd>
          </div>
          <div className="col-span-2 rounded-md border border-line bg-surface-2/60 px-4 py-3 sm:col-span-1">
            <dt className="text-[0.8125rem] text-ink-2">Cards this round</dt>
            <dd className="mt-1 font-mono text-2xl font-medium text-ink tabular-nums">{rows.length}</dd>
          </div>
        </dl>
      </div>

      <ul className="divide-y divide-line border-t border-line">
        {rows.map((r) => {
          const mastered = r.before < 3 && r.after === 3;
          return (
            <li
              key={r.cardId}
              className="flex flex-col gap-1.5 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-7"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium break-words text-ink">
                  {mastered ? (
                    <Trophy className="size-4 shrink-0 text-accent-strong" strokeWidth={1.75} aria-hidden />
                  ) : null}
                  {r.term}
                </p>
                <p className="mt-0.5 line-clamp-1 text-sm text-ink-2">{r.definition}</p>
              </div>
              <p className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem]">
                {r.before !== r.after ? (
                  <>
                    <LevelChip level={r.before} />
                    <ArrowRight className="size-3.5 text-ink-3" strokeWidth={1.75} aria-hidden />
                    <span className="sr-only">to</span>
                    <span className={cn(mastered && "font-medium [&>span]:text-accent-strong")}>
                      <LevelChip level={r.after} />
                    </span>
                  </>
                ) : (
                  <LevelChip level={r.after} />
                )}
              </p>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-2 border-t border-line bg-surface-2/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-7">
        <Button ref={nextRef} onClick={onNext} className="sm:min-w-40">
          {hasMore ? "Next round" : "See where you are"}
          <Kbd className="ml-1 hidden border-accent-ink/30 bg-transparent text-accent-ink/80 sm:inline-flex">
            <CornerDownLeft className="size-3" aria-hidden />
            <span className="sr-only">Enter</span>
          </Kbd>
        </Button>
      </div>
    </section>
  );
}

/** Nothing to study in this scope right now. */
export function LearnFinished({
  kind,
  nextDueText,
  nextDueTitle,
  scopeTotal,
  onPractice,
  onStudyAll,
  testHref,
}: {
  /** "review": nothing due. "mastered": everything in scope is mastered. */
  kind: "review" | "mastered";
  nextDueText: string | null;
  nextDueTitle: string | null;
  scopeTotal: number;
  onPractice: (() => void) | null;
  onStudyAll: (() => void) | null;
  testHref: string;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section
      aria-labelledby="learn-finished-title"
      className="flex flex-col items-center rounded-lg border border-line bg-surface px-6 py-10 text-center shadow-md sm:px-10 sm:py-14"
    >
      <span
        aria-hidden
        className="grid size-14 place-items-center rounded-full bg-accent-soft text-accent-strong motion-safe:animate-pop-in"
      >
        {kind === "review" ? (
          <CircleCheck className="size-7" strokeWidth={1.75} />
        ) : (
          <Trophy className="size-7" strokeWidth={1.75} />
        )}
      </span>
      <h3
        id="learn-finished-title"
        ref={headingRef}
        tabIndex={-1}
        className="mt-5 font-display text-2xl leading-tight font-semibold tracking-[-0.015em] text-ink outline-none sm:text-[1.75rem]"
      >
        {kind === "review" ? "All caught up" : "Everything here is mastered"}
      </h3>
      <p className="mt-2 max-w-[46ch] text-[0.9375rem] leading-relaxed text-ink-2">
        {kind === "review"
          ? "Nothing is due for review right now."
          : `${pluralize(scopeTotal, "card")} mastered. Spaced reviews bring each one back before you forget it.`}
      </p>
      {nextDueText ? (
        <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface-2/60 px-3.5 py-1.5 text-sm text-ink">
          <CalendarClock className="size-4 text-ink-2" strokeWidth={1.75} aria-hidden />
          <span title={nextDueTitle ?? undefined}>Next review due {nextDueText}</span>
        </p>
      ) : null}

      <div className="mt-7 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-center">
        {onPractice ? (
          <Button onClick={onPractice}>
            <Repeat strokeWidth={1.75} aria-hidden />
            Practice anyway
          </Button>
        ) : null}
        {onStudyAll ? (
          <Button variant={onPractice ? "outline" : "primary"} onClick={onStudyAll}>
            Study all cards
          </Button>
        ) : null}
        <Button asChild variant="outline">
          <Link href={testHref}>
            <ClipboardCheck strokeWidth={1.75} aria-hidden />
            Take a practice test
          </Link>
        </Button>
      </div>
    </section>
  );
}
