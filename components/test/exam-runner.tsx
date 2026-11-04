"use client";

import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Clock } from "lucide-react";
import { choiceLetter } from "@/lib/learn/exam";
import type { Topic } from "@/lib/types";
import { cn, pluralize } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { Markdown } from "@/components/markdown";
import { ChoiceTile } from "@/components/test/choice-tile";
import type { ExamQuestionRow } from "@/components/test/test-data";

const DIFFICULTY_LABEL = { easy: "Easy", medium: "Medium", hard: "Hard" } as const;

function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Takes an exam one question at a time. Keys: A-E (or 1-5) choose, Enter
 * goes to the next question, the arrow keys move between questions when a
 * choice isn't focused.
 */
export function ExamRunner({
  questions,
  topics,
  timeLimitSec,
  startedAt,
  active,
  onSubmit,
  onCancel,
}: {
  questions: ExamQuestionRow[];
  topics: Topic[];
  timeLimitSec: number | null;
  startedAt: number;
  active: boolean;
  onSubmit: (answers: Array<number | null>, elapsedMs: number, timeUp: boolean) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Array<number | null>>(() => questions.map(() => null));
  const [now, setNow] = useState(startedAt);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const submitted = useRef(false);
  const headingRef = useRef<HTMLDivElement>(null);

  const q = questions[index];
  const total = questions.length;
  const answered = answers.filter((a) => a !== null).length;
  const remainingMs = timeLimitSec ? timeLimitSec * 1000 - (now - startedAt) : null;
  const lowTime = remainingMs !== null && remainingMs <= 60_000;

  function finish(timeUp: boolean) {
    if (submitted.current) return;
    submitted.current = true;
    setConfirmOpen(false);
    onSubmit(answers, Date.now() - startedAt, timeUp);
  }

  const onTick = useEffectEvent(() => {
    const t = Date.now();
    setNow(t);
    if (timeLimitSec && t - startedAt >= timeLimitSec * 1000) finish(true);
  });
  useEffect(() => {
    if (!timeLimitSec) return;
    const timer = window.setInterval(() => onTick(), 1000);
    return () => window.clearInterval(timer);
  }, [timeLimitSec]);

  // New question: move focus to it so screen readers read the stem.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [index]);

  const choose = (choice: number) => {
    setAnswers((cur) => {
      const next = [...cur];
      next[index] = choice;
      return next;
    });
  };

  const go = (to: number) => setIndex(Math.max(0, Math.min(total - 1, to)));
  const next = () => {
    if (index < total - 1) go(index + 1);
    else setConfirmOpen(true);
  };

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (!active || confirmOpen || cancelOpen) return;
    if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('textarea, select, input:not([type="radio"]), [contenteditable="true"], [role="dialog"], [role="menu"]')) {
      return;
    }
    const key = e.key.toLowerCase();
    const letter = key.length === 1 ? key.charCodeAt(0) - 97 : -1;
    const digit = /^[1-9]$/.test(key) ? Number(key) - 1 : -1;
    const pick = letter >= 0 && letter < q.choices.length ? letter : digit >= 0 && digit < q.choices.length ? digit : -1;
    if (pick >= 0) {
      e.preventDefault();
      choose(pick);
      return;
    }
    const onRadio = target instanceof HTMLInputElement && target.type === "radio";
    if (e.key === "Enter" && !target?.closest('button, a[href], [role="button"]')) {
      e.preventDefault();
      next();
    } else if (!onRadio && e.key === "ArrowRight" && !target?.closest("button, a[href]")) {
      e.preventDefault();
      go(index + 1);
    } else if (!onRadio && e.key === "ArrowLeft" && !target?.closest("button, a[href]")) {
      e.preventDefault();
      go(index - 1);
    }
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKeyDown(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!q) return null;
  const topic = q.topic_id ? topics.find((t) => t.id === q.topic_id) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2">
          Question <span className="font-mono font-medium text-ink tabular-nums">{index + 1}</span> of{" "}
          <span className="font-mono tabular-nums">{total}</span>
          <span aria-hidden> · </span>
          <span className="sr-only">, </span>
          {answered} answered
        </p>
        <div className="flex items-center gap-2">
          {remainingMs !== null ? (
            <p
              role="timer"
              aria-label="Time left"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 font-mono text-sm font-medium tabular-nums",
                lowTime ? "border-learning/50 bg-learning-soft text-learning-strong" : "border-line bg-surface text-ink",
              )}
            >
              <Clock className="size-4" strokeWidth={1.75} aria-hidden />
              {clock(remainingMs)}
            </p>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => setCancelOpen(true)}>
            Quit
          </Button>
          <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
            Submit
          </Button>
        </div>
      </div>

      <nav aria-label="Questions" className="-mx-1 overflow-x-auto px-1 pb-1 scrollbar-none">
        <ol className="flex gap-1.5">
          {questions.map((item, i) => {
            const done = answers[i] !== null;
            const current = i === index;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={current ? "step" : undefined}
                  aria-label={`Question ${i + 1}${done ? ", answered" : ""}`}
                  className={cn(
                    "inline-flex size-8 items-center justify-center rounded-sm border font-mono text-xs font-medium tabular-nums transition-colors duration-150",
                    current
                      ? "border-ink bg-ink text-bg"
                      : done
                        ? "border-accent/50 bg-accent-soft text-accent-strong hover:border-accent"
                        : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink",
                  )}
                >
                  {i + 1}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <Card variant="flat" className="overflow-hidden" key={q.id}>
        <div className="px-5 pt-5 pb-5 sm:px-7 sm:pt-6 motion-safe:animate-fade-in">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {topic ? <Badge variant="neutral">{topic.title}</Badge> : null}
            <Badge variant={q.difficulty === "hard" ? "learning" : "outline"}>{DIFFICULTY_LABEL[q.difficulty]}</Badge>
          </div>
          <div
            ref={headingRef}
            tabIndex={-1}
            role="group"
            aria-label={`Question ${index + 1}`}
            id={`${id}-stem`}
            className="outline-none"
          >
            <Markdown className="text-[1.0625rem] leading-relaxed">{q.stem}</Markdown>
          </div>
        </div>
        <fieldset
          aria-describedby={`${id}-stem`}
          className="border-t border-line bg-surface-2/50 px-4 py-4 sm:px-7 sm:py-5"
        >
          <legend className="sr-only">Answer choices for question {index + 1}</legend>
          <div className="flex flex-col gap-2.5">
            {q.choices.map((choice, i) => (
              <ChoiceTile
                key={`${q.id}-${i}`}
                name={`${id}-${q.id}`}
                value={String(i)}
                marker={choiceLetter(i)}
                checked={answers[index] === i}
                onSelect={() => choose(i)}
              >
                {choice}
              </ChoiceTile>
            ))}
          </div>
        </fieldset>
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3.5 sm:px-7">
          <Button variant="ghost" onClick={() => go(index - 1)} disabled={index === 0}>
            <ArrowLeft strokeWidth={1.75} aria-hidden />
            Previous
          </Button>
          <p className="hidden items-center gap-1.5 text-[0.8125rem] text-ink-2 md:flex">
            <Kbd>A</Kbd>
            <span aria-hidden>-</span>
            <span className="sr-only">to</span>
            <Kbd>{choiceLetter(q.choices.length - 1)}</Kbd> to choose, <Kbd>Enter</Kbd> for next
          </p>
          <Button onClick={next} variant={index === total - 1 ? "primary" : "outline"}>
            {index === total - 1 ? "Finish" : "Next"}
            {index === total - 1 ? null : <ArrowRight strokeWidth={1.75} aria-hidden />}
          </Button>
        </div>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          size="sm"
          title="Submit your exam?"
          description={
            answered < total
              ? `${pluralize(total - answered, "question")} ${total - answered === 1 ? "has" : "have"} no answer. Blanks count as wrong.`
              : "You've answered every question. You'll see your score and an explanation for each one."
          }
        >
          <DialogFooter className="mt-6">
            <DialogClose asChild>
              <Button variant="ghost">Keep going</Button>
            </DialogClose>
            <Button onClick={() => finish(false)}>Submit exam</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent size="sm" title="Quit this exam?" description="Your answers so far won't be saved.">
          <DialogFooter className="mt-6">
            <DialogClose asChild>
              <Button variant="ghost">Keep going</Button>
            </DialogClose>
            <Button variant="danger" onClick={onCancel}>
              Quit exam
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
