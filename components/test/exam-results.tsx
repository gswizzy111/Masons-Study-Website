"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { BookOpen, Brain, CircleAlert, CircleCheck, Clock, RotateCcw, Sparkles } from "lucide-react";
import { choiceLetter, topicScores, weakTopics } from "@/lib/learn/exam";
import type { Topic } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useOptionalChat } from "@/components/chat/chat-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Segmented } from "@/components/ui/segmented";
import { Spinner } from "@/components/ui/spinner";
import { Markdown } from "@/components/markdown";
import { ChoiceTile, type ChoiceState } from "@/components/test/choice-tile";
import type { SaveState } from "@/components/test/quick-test-results";
import type { ExamQuestionRow } from "@/components/test/test-data";

function duration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s} s`;
  return `${m} min ${String(s).padStart(2, "0")} s`;
}

function askPrompt(q: ExamQuestionRow, chosen: number | null): string {
  const lines = [
    "Help me with this practice exam question.",
    "",
    "Question:",
    q.stem,
    "",
    "Choices:",
    ...q.choices.map((c, i) => `${choiceLetter(i)}. ${c}`),
    "",
    `Correct answer: ${choiceLetter(q.answer_index)}. ${q.choices[q.answer_index] ?? ""}`,
    chosen === null
      ? "I left it blank."
      : chosen === q.answer_index
        ? `I chose ${choiceLetter(chosen)} and got it right, but I want to be sure of the reasoning.`
        : `I chose ${choiceLetter(chosen)}. ${q.choices[chosen] ?? ""}`,
  ];
  if (q.explanation.trim()) lines.push("", "The explanation I was given:", q.explanation.trim());
  lines.push(
    "",
    "Walk me through how to reason to the right answer step by step" +
      (chosen !== null && chosen !== q.answer_index ? ", and why my choice is wrong." : "."),
  );
  return lines.join("\n");
}

/** Score, weak topics and a per-question review with explanations. */
export function ExamResults({
  setId,
  topics,
  questions,
  answers,
  elapsedMs,
  timeUp,
  saveState,
  onNewExam,
  onRetakeMissed,
}: {
  setId: string;
  topics: Topic[];
  questions: ExamQuestionRow[];
  answers: Array<number | null>;
  elapsedMs: number;
  timeUp: boolean;
  saveState: SaveState;
  onNewExam: () => void;
  onRetakeMissed: (() => void) | null;
}) {
  const id = useId();
  const chat = useOptionalChat();
  const [filter, setFilter] = useState<"all" | "missed">("all");

  const results = questions.map((q, i) => ({
    q,
    index: i,
    chosen: answers[i] ?? null,
    correct: answers[i] === q.answer_index,
  }));
  const score = results.filter((r) => r.correct).length;
  const total = results.length;
  const missed = total - score;
  const percent = total > 0 ? Math.round((100 * score) / total) : 0;
  const scores = topicScores(
    results.map((r) => ({ topicId: r.q.topic_id, correct: r.correct })),
    topics,
  );
  const weak = weakTopics(scores);
  const visible = filter === "missed" ? results.filter((r) => !r.correct) : results;

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
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
              <Clock className="size-4" strokeWidth={1.75} aria-hidden />
              {timeUp ? "Time ran out" : `Took ${duration(elapsedMs)}`}
              <span aria-hidden>·</span>
              {Math.round(elapsedMs / 1000 / Math.max(1, total))} s per question
            </p>
            <p role="status" className="mt-3 flex items-start gap-2 text-sm text-ink-2">
              {saveState === "saving" ? (
                <>
                  <Spinner size="sm" className="mt-0.5" />
                  Saving to your history
                </>
              ) : saveState === "saved" ? (
                <>
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={1.75} aria-hidden />
                  Saved to your history.
                </>
              ) : saveState === "error" ? (
                <>
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" strokeWidth={1.75} aria-hidden />
                  <span className="text-danger">This exam didn&apos;t save.</span>
                </>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-line bg-surface-2/50 px-5 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:px-7">
          {onRetakeMissed ? (
            <Button onClick={onRetakeMissed}>
              <RotateCcw strokeWidth={1.75} aria-hidden />
              Retry the {missed} missed
            </Button>
          ) : null}
          <Button variant={onRetakeMissed ? "outline" : "primary"} onClick={onNewExam}>
            New exam
          </Button>
        </div>
      </Card>

      {scores.length > 0 ? (
        <Card variant="flat" className="px-5 py-5 sm:px-7 sm:py-6">
          <h3 className="font-display text-lg font-semibold tracking-[-0.01em] text-ink">By topic</h3>
          <p className="mt-1 text-sm text-ink-2">
            {weak.length > 0
              ? `Weakest first. Under 70% is worth another pass: ${weak.map((w) => w.title).join(", ")}.`
              : "Every topic was at 70% or better in this exam."}
          </p>
          <ul className="mt-4 flex flex-col divide-y divide-line">
            {scores.map((s) => {
              const isWeak = s.percent < 70;
              const topicLink = s.topicId !== "other" ? `?topic=${encodeURIComponent(s.topicId)}` : "";
              return (
                <li key={s.topicId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 truncate text-[0.9375rem] font-medium text-ink">{s.title}</p>
                      <p className="shrink-0 font-mono text-sm text-ink-2 tabular-nums">
                        {s.correct}/{s.total}
                      </p>
                    </div>
                    <div
                      role="img"
                      aria-label={`${s.title}: ${s.percent}% correct`}
                      className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line/70"
                    >
                      <div
                        className={cn("h-full rounded-full", isWeak ? "bg-learning" : "bg-accent")}
                        style={{ width: `${Math.max(3, s.percent)}%` }}
                      />
                    </div>
                  </div>
                  {isWeak ? (
                    <div className="flex shrink-0 gap-1.5">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/sets/${setId}/learn${topicLink}`}>
                          <Brain strokeWidth={1.75} aria-hidden />
                          Learn
                          <span className="sr-only"> {s.title}</span>
                        </Link>
                      </Button>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/sets/${setId}/guide`}>
                          <BookOpen strokeWidth={1.75} aria-hidden />
                          Guide
                        </Link>
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      <section aria-labelledby={`${id}-review`} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id={`${id}-review`} className="font-display text-xl font-semibold tracking-[-0.01em] text-ink">
            Questions and explanations
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
        <ol className="flex flex-col gap-4">
          {visible.map(({ q, index, chosen, correct }) => {
            const topic = q.topic_id ? topics.find((t) => t.id === q.topic_id) : undefined;
            return (
              <li key={q.id}>
                <Card variant="flat" className="overflow-hidden">
                  <div className="px-5 pt-5 pb-4 sm:px-7 sm:pt-6">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-medium text-ink-2 tabular-nums">{index + 1}.</span>
                      <Badge variant={correct ? "accent" : "danger"}>
                        {correct ? "Correct" : chosen === null ? "Blank" : "Missed"}
                      </Badge>
                      {topic ? <Badge variant="neutral">{topic.title}</Badge> : null}
                    </div>
                    <Markdown className="text-[1rem]">{q.stem}</Markdown>
                  </div>
                  <div className="flex flex-col gap-2 border-t border-line bg-surface-2/40 px-4 py-4 sm:px-7">
                    {q.choices.map((c, i) => {
                      let state: ChoiceState = "dim";
                      if (i === q.answer_index) state = chosen === i ? "right" : "missed";
                      else if (i === chosen) state = "wrong";
                      return (
                        <ChoiceTile
                          key={`${q.id}-${i}`}
                          name={`${id}-${q.id}`}
                          value={String(i)}
                          marker={choiceLetter(i)}
                          checked={chosen === i}
                          state={state}
                          disabled
                        >
                          {c}
                        </ChoiceTile>
                      );
                    })}
                  </div>
                  {q.explanation.trim() ? (
                    <div className="border-t border-line px-5 py-4 sm:px-7">
                      <p className="mb-1.5 text-xs font-semibold tracking-[0.06em] text-ink-2 uppercase">
                        Explanation
                      </p>
                      <Markdown compact>{q.explanation}</Markdown>
                    </div>
                  ) : null}
                  {chat ? (
                    <div className="border-t border-line px-4 py-3 sm:px-7">
                      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => chat.ask(askPrompt(q, chosen))}>
                        <Sparkles strokeWidth={1.75} aria-hidden className="text-accent-strong" />
                        Ask Claude about this question
                      </Button>
                    </div>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
