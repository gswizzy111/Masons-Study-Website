"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Brain, RotateCcw, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, pluralize } from "@/lib/utils";

/** End of the deck: what was marked, and where to go next. */
export function DeckSummary({
  total,
  known,
  learning,
  learnHref,
  shuffleOn,
  onRetryLearning,
  onRestart,
  onBack,
}: {
  total: number;
  known: number;
  learning: number;
  learnHref: string;
  shuffleOn: boolean;
  onRetryLearning: () => void;
  onRestart: () => void;
  onBack: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const skipped = Math.max(0, total - known - learning);

  // Move focus here so keyboard and screen reader users land on the result.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  const stats = [
    { label: "Got it", value: known, dot: "bg-mastered" },
    { label: "Still learning", value: learning, dot: "bg-learning" },
    { label: "Not marked", value: skipped, dot: "bg-not-studied" },
  ];

  const allKnown = total > 0 && known === total;

  return (
    <div className="flex flex-col items-center rounded-lg border border-line bg-surface px-5 py-8 text-center shadow-md sm:px-10 sm:py-10 motion-safe:animate-rise-in">
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-2xl font-semibold tracking-[-0.015em] text-ink focus:outline-none sm:text-[1.75rem]"
      >
        {allKnown ? "You knew every card" : "End of the deck"}
      </h2>
      <p className="mt-2 max-w-[44ch] text-[0.9375rem] leading-relaxed text-ink-2">
        You went through {pluralize(total, "card")}.
        {learning > 0
          ? " Go over the ones you're still learning while they're fresh."
          : allKnown
            ? " Learn will check them with questions and bring them back for review."
            : ""}
      </p>

      <dl className="mt-6 grid w-full max-w-md grid-cols-3 gap-2 sm:gap-4">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col items-center gap-1 rounded-md bg-surface-2 px-2 py-3">
            <dt className="flex items-center gap-1.5 text-[0.8125rem] text-ink-2 sm:text-sm">
              <span aria-hidden className={cn("size-2 shrink-0 rounded-full", s.dot)} />
              {s.label}
            </dt>
            <dd className="font-mono text-2xl font-medium text-ink tabular-nums">{s.value.toLocaleString("en-US")}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-7 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-center">
        {learning > 0 ? (
          <Button onClick={onRetryLearning}>
            <RotateCcw strokeWidth={1.75} aria-hidden />
            Study the {learning.toLocaleString("en-US")} still learning
          </Button>
        ) : null}
        <Button asChild variant={learning > 0 ? "outline" : "primary"}>
          <Link href={learnHref}>
            <Brain strokeWidth={1.75} aria-hidden />
            Go to Learn
          </Link>
        </Button>
        <Button variant="ghost" onClick={onRestart}>
          {shuffleOn ? <Shuffle strokeWidth={1.75} aria-hidden /> : <RotateCcw strokeWidth={1.75} aria-hidden />}
          {shuffleOn ? "Shuffle and start over" : "Start over"}
        </Button>
      </div>

      <button
        type="button"
        onClick={onBack}
        className="mt-4 rounded-xs text-sm text-ink-2 underline decoration-1 underline-offset-4 transition-colors duration-150 hover:text-ink"
      >
        Back to the last card
      </button>
    </div>
  );
}
