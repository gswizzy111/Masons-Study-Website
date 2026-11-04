"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Brain, Check, CircleAlert, CircleCheck, RotateCcw, X } from "lucide-react";
import type { GradedItem, TestQuestion } from "@/lib/learn/quick-test";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Segmented } from "@/components/ui/segmented";
import { Spinner } from "@/components/ui/spinner";

export type SaveState = "idle" | "saving" | "saved" | "error";

function verdict(percent: number): string {
  if (percent === 100) return "A perfect score.";
  if (percent >= 90) return "Strong. Look over the few you missed.";
  if (percent >= 70) return "Solid. The misses below are your next focus.";
  if (percent >= 50) return "Getting there. Learn will drill the ones you missed.";
  return "A starting point. Learn will take you through the misses step by step.";
}

/** Score, save status and a per-question review of a quick test. */
export function QuickTestResults({
  setId,
  questions,
  graded,
  saveState,
  onRetake,
  onNewTest,
}: {
  setId: string;
  questions: readonly TestQuestion[];
  graded: readonly GradedItem[];
  saveState: SaveState;
  onRetake: () => void;
  onNewTest: () => void;
}) {
  const id = useId();
  const [filter, setFilter] = useState<"all" | "missed">("all");
  const total = graded.length;
  const score = graded.filter((g) => g.correct).length;
  const missed = total - score;
  const percent = total > 0 ? Math.round((100 * score) / total) : 0;

  const byQuestion = new Map<string, GradedItem[]>();
  for (const g of graded) {
    const list = byQuestion.get(g.questionKey) ?? [];
    list.push(g);
    byQuestion.set(g.questionKey, list);
  }

  let number = 0;
  const rows = questions.map((q) => {
    const items = byQuestion.get(q.key) ?? [];
    const first = number + 1;
    number += items.length;
    return { q, items, first };
  });
  const visible = filter === "missed" ? rows.filter((r) => r.items.some((i) => !i.correct)) : rows;

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-5 px-5 py-6 sm:flex-row sm:items-center sm:gap-7 sm:px-7 sm:py-7">
          <ProgressRing
            value={percent}
            size={96}
            stroke={8}
            tone={percent >= 70 ? "accent" : "learning"}
            label="Score"
            valueText={`${percent}%`}
          >
            <span className="font-mono text-xl font-medium text-ink tabular-nums">{percent}%</span>
          </ProgressRing>
          <div className="min-w-0">
            <h3 className="font-display text-2xl leading-tight font-semibold tracking-[-0.015em] text-ink sm:text-[1.75rem]">
              {score} of {total} correct
            </h3>
            <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-2">{verdict(percent)}</p>
            <p role="status" className="mt-3 flex items-start gap-2 text-sm text-ink-2">
              {saveState === "saving" ? (
                <>
                  <Spinner size="sm" className="mt-0.5 text-ink-2" />
                  Saving your results
                </>
              ) : saveState === "saved" ? (
                <>
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={1.75} aria-hidden />
                  <span>
                    Saved.{" "}
                    {missed > 0
                      ? "Missed cards are back to still learning, so Learn brings them up first."
                      : "Every card here moved up in your progress."}
                  </span>
                </>
              ) : saveState === "error" ? (
                <>
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" strokeWidth={1.75} aria-hidden />
                  <span className="text-danger">Some results didn&apos;t save. Your score is still shown here.</span>
                </>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-line bg-surface-2/50 px-5 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:px-7">
          <Button asChild variant={missed > 0 ? "primary" : "outline"}>
            <Link href={`/sets/${setId}/learn`}>
              <Brain strokeWidth={1.75} aria-hidden />
              {missed > 0 ? "Study the misses in Learn" : "Go to Learn"}
            </Link>
          </Button>
          <Button variant="outline" onClick={onRetake}>
            <RotateCcw strokeWidth={1.75} aria-hidden />
            Retake this test
          </Button>
          <Button variant="ghost" onClick={onNewTest} className="sm:ml-auto">
            New test
          </Button>
        </div>
      </Card>

      <section aria-labelledby={`${id}-review`} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id={`${id}-review`} className="font-display text-xl font-semibold tracking-[-0.01em] text-ink">
            Your answers
          </h3>
          <Segmented
            aria-label="Show"
            size="sm"
            value={filter}
            onValueChange={setFilter}
            options={[
              { value: "all", label: `All ${total}` },
              { value: "missed", label: `Missed ${missed}`, disabled: missed === 0 },
            ]}
          />
        </div>

        {visible.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong px-5 py-8 text-center text-sm text-ink-2">
            Nothing missed. Every answer was right.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {visible.map(({ q, items, first }) => (
              <li key={q.key}>
                <ReviewCard question={q} items={items} number={first} />
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Mark({ correct }: { correct: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full",
        correct ? "bg-accent text-accent-ink" : "bg-danger text-danger-ink",
      )}
    >
      {correct ? <Check className="size-3.5" strokeWidth={2.25} aria-hidden /> : <X className="size-3.5" strokeWidth={2.25} aria-hidden />}
      <span className="sr-only">{correct ? "Correct" : "Wrong"}</span>
    </span>
  );
}

function AnswerLine({ label, text, tone }: { label: string; text: string; tone: "right" | "wrong" | "plain" }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="shrink-0 text-sm text-ink-2 sm:w-32">{label}</dt>
      <dd
        className={cn(
          "min-w-0 text-[0.9375rem] leading-relaxed break-words whitespace-pre-line",
          tone === "right" && "font-medium text-accent-strong",
          tone === "wrong" && "font-medium text-danger",
          tone === "plain" && "text-ink",
        )}
      >
        {text}
      </dd>
    </div>
  );
}

function ReviewCard({ question: q, items, number }: { question: TestQuestion; items: GradedItem[]; number: number }) {
  const allRight = items.every((i) => i.correct);

  if (q.type === "matching") {
    return (
      <Card variant="flat" className="px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex items-center gap-3">
          <Mark correct={allRight} />
          <p className="text-sm font-medium text-ink">
            Matching, {items.filter((i) => i.correct).length} of {items.length} right
          </p>
        </div>
        <ol className="mt-3 flex flex-col divide-y divide-line">
          {q.items.map((item, idx) => {
            const g = items.find((x) => x.cardId === item.cardId);
            if (!g) return null;
            return (
              <li key={item.cardId} className="flex flex-col gap-2 py-3">
                <p className="flex items-start gap-2 text-[0.9375rem] leading-relaxed text-ink">
                  <span className="mt-0.5 font-mono text-xs text-ink-2 tabular-nums">{number + idx}.</span>
                  <span className="min-w-0 break-words whitespace-pre-line">{item.definition}</span>
                </p>
                <dl className="flex flex-col gap-1.5 pl-6">
                  <AnswerLine
                    label="Your match"
                    text={g.blank ? "No answer" : g.given}
                    tone={g.correct ? "right" : "wrong"}
                  />
                  {!g.correct ? <AnswerLine label="Correct term" text={g.expected} tone="plain" /> : null}
                </dl>
              </li>
            );
          })}
        </ol>
      </Card>
    );
  }

  const g = items[0];
  if (!g) return null;

  return (
    <Card variant="flat" className="px-4 py-4 sm:px-6 sm:py-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 font-mono text-xs text-ink-2 tabular-nums">{number}.</span>
        <div className="min-w-0 flex-1">
          {q.type === "tf" ? (
            <>
              <p className="font-display text-[1.0625rem] leading-snug font-semibold break-words text-ink">{q.term}</p>
              <p className="mt-1 text-[0.9375rem] leading-relaxed break-words whitespace-pre-line text-ink-2">
                {q.shown}
              </p>
            </>
          ) : (
            <p
              className={cn(
                "break-words whitespace-pre-line text-ink",
                q.promptSide === "term"
                  ? "font-display text-[1.0625rem] leading-snug font-semibold"
                  : "text-[0.9375rem] leading-relaxed",
              )}
            >
              {q.prompt}
            </p>
          )}

          <dl className="mt-3 flex flex-col gap-1.5">
            <AnswerLine
              label="Your answer"
              text={g.blank ? "No answer" : g.given}
              tone={g.correct ? "right" : "wrong"}
            />
            {!g.correct ? <AnswerLine label="Correct answer" text={g.expected} tone="plain" /> : null}
            {q.type === "tf" && !q.isTrue ? (
              <AnswerLine label="Its definition" text={q.definition} tone="plain" />
            ) : null}
          </dl>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Mark correct={g.correct} />
          {g.close ? <Badge variant="learning">Almost</Badge> : null}
        </div>
      </div>
    </Card>
  );
}
