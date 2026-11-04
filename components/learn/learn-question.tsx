"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type Ref } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, CornerDownLeft, Lightbulb, Sparkles, X } from "lucide-react";
import type { LearnQuestion } from "@/lib/learn/engine";
import type { MasteryLevel } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";

export type LearnFeedback = {
  questionKey: string;
  correct: boolean;
  /** What they answered as text ("" for "Don't know"). */
  given: string;
  /** Multiple choice: the option they picked. */
  chosenIndex: number | null;
  /** Written and wrong, but nearly right. */
  close: boolean;
  /** Written and right, but not spelled exactly. */
  typo: boolean;
  dontKnow: boolean;
  /** The card reached mastered with this answer. */
  mastered: boolean;
  /** A missed card that comes back later in the round. */
  comesBack: boolean;
  /** Override was used. */
  overridden: boolean;
};

export const AUTO_ADVANCE_MS = 1100;

const LEVEL_BADGE: Record<MasteryLevel, { label: string; variant: "neutral" | "learning" | "accent" }> = {
  0: { label: "New", variant: "neutral" },
  1: { label: "Still learning", variant: "learning" },
  2: { label: "Familiar", variant: "learning" },
  3: { label: "Mastered", variant: "accent" },
};

/** Type size for the prompt: big for a short term, smaller as text grows. */
function promptClass(text: string, isTerm: boolean): string {
  const n = text.length;
  if (n <= 40) {
    return isTerm
      ? "font-display text-[1.75rem] leading-[1.15] font-semibold tracking-[-0.015em] sm:text-[2.25rem]"
      : "text-xl leading-snug sm:text-2xl";
  }
  if (n <= 120) return isTerm ? "font-display text-2xl leading-snug font-semibold" : "text-lg leading-snug sm:text-xl";
  if (n <= 320) return "text-base leading-relaxed sm:text-lg";
  return "text-[0.9375rem] leading-relaxed sm:text-base";
}

function optionsAreLong(options: readonly string[]): boolean {
  return options.some((o) => o.length > 60);
}

type QuestionProps = {
  question: LearnQuestion;
  feedback: LearnFeedback | null;
  aiReady: boolean;
  autoAdvance: boolean;
  onChoose: (index: number) => void;
  onSubmitWritten: (text: string) => void;
  onDontKnow: () => void;
  onContinue: () => void;
  onOverride: () => void;
  onExplain: (() => void) | null;
};

/**
 * One Learn question with its feedback. Multiple choice: big buttons, keys
 * 1-4. Written: a text box, Enter to answer, "Don't know" to see it.
 */
export function LearnQuestionCard({
  question,
  feedback,
  aiReady,
  autoAdvance,
  onChoose,
  onSubmitWritten,
  onDontKnow,
  onContinue,
  onOverride,
  onExplain,
}: QuestionProps) {
  const id = useId();
  const promptId = `${id}-prompt`;
  const answered = feedback !== null;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [showHint, setShowHint] = useState(false);
  const reduce = useReducedMotion();

  // Focus: the text box for written questions, the prompt for multiple choice.
  useEffect(() => {
    if (question.kind === "written") inputRef.current?.focus({ preventScroll: true });
    else headingRef.current?.focus({ preventScroll: true });
  }, [question.key, question.kind]);

  // Feedback: move focus there (Enter continues) and keep it in view.
  useEffect(() => {
    if (!feedback) return;
    const el = feedbackRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [feedback, reduce]);

  const level = LEVEL_BADGE[question.level];
  const promptIsTerm = question.promptSide === "term";
  const answerLabel = question.promptSide === "term" ? "definition" : "term";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (answered) return;
    if (!text.trim()) {
      inputRef.current?.focus();
      return;
    }
    onSubmitWritten(text);
  };

  return (
    <section
      aria-labelledby={promptId}
      className="overflow-hidden rounded-lg border border-line bg-surface shadow-md"
    >
      <div className="flex items-center justify-between gap-3 px-5 pt-4 sm:px-7 sm:pt-6">
        <span className="text-xs font-medium tracking-[0.06em] text-ink-2 uppercase">
          {promptIsTerm ? "Term" : "Definition"}
        </span>
        {question.due && question.level === 3 ? (
          <Badge variant="accent">Review</Badge>
        ) : (
          <Badge variant={level.variant}>{level.label}</Badge>
        )}
      </div>

      <h3
        id={promptId}
        ref={headingRef}
        tabIndex={-1}
        className={cn(
          "px-5 pt-4 pb-6 break-words whitespace-pre-line text-ink outline-none sm:px-7 sm:pt-5 sm:pb-8",
          promptClass(question.prompt, promptIsTerm),
        )}
      >
        {question.prompt}
      </h3>

      {question.kind === "written" && question.hint && !answered ? (
        <div className="-mt-3 px-5 pb-5 sm:px-7">
          {showHint ? (
            <p className="flex items-start gap-2 text-sm leading-relaxed text-ink-2">
              <Lightbulb className="mt-0.5 size-4 shrink-0 text-learning" strokeWidth={1.75} aria-hidden />
              <span>{question.hint}</span>
            </p>
          ) : (
            <Button variant="link" size="sm" onClick={() => setShowHint(true)}>
              <Lightbulb strokeWidth={1.75} aria-hidden />
              Show hint
            </Button>
          )}
        </div>
      ) : null}

      <div className="border-t border-line bg-surface-2/50 px-4 py-4 sm:px-7 sm:py-6">
        {question.kind === "mc" ? (
          <McOptions question={question} feedback={feedback} onChoose={onChoose} answerLabel={answerLabel} />
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
            <label htmlFor={`${id}-answer`} className="text-sm font-medium text-ink-2">
              Type the {answerLabel}
            </label>
            <Input
              ref={inputRef}
              id={`${id}-answer`}
              value={answered ? feedback.given : text}
              onChange={(e) => setText(e.target.value)}
              readOnly={answered}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              placeholder={answered ? "" : `Your answer`}
              aria-invalid={answered && !feedback.correct ? true : undefined}
              className={cn(
                "h-12 text-base sm:text-lg",
                answered && feedback.correct && "border-accent bg-accent-soft/60",
                answered && !feedback.correct && "border-danger bg-danger-soft/60 aria-invalid:border-danger",
              )}
            />
            {!answered ? (
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button type="button" variant="ghost" onClick={onDontKnow} className="sm:-ml-2">
                  Don&apos;t know
                </Button>
                <Button type="submit" disabled={!text.trim()} className="sm:min-w-32">
                  Answer
                  <Kbd className="ml-1 hidden border-accent-ink/30 bg-transparent text-accent-ink/80 sm:inline-flex">
                    <CornerDownLeft className="size-3" aria-hidden />
                    <span className="sr-only">Enter</span>
                  </Kbd>
                </Button>
              </div>
            ) : null}
          </form>
        )}

        {feedback ? (
          <FeedbackPanel
            ref={feedbackRef}
            question={question}
            feedback={feedback}
            aiReady={aiReady}
            autoAdvance={autoAdvance}
            onContinue={onContinue}
            onOverride={onOverride}
            onExplain={onExplain}
          />
        ) : null}
      </div>
    </section>
  );
}

function McOptions({
  question,
  feedback,
  onChoose,
  answerLabel,
}: {
  question: LearnQuestion;
  feedback: LearnFeedback | null;
  onChoose: (index: number) => void;
  answerLabel: string;
}) {
  const answered = feedback !== null;
  const long = optionsAreLong(question.options);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-ink-2">Choose the {answerLabel}</p>
      <ul className={cn("grid gap-2.5", !long && "sm:grid-cols-2")}>
        {question.options.map((option, i) => {
          const isAnswer = i === question.answerIndex;
          const isChosen = feedback?.chosenIndex === i;
          const state = !answered ? "idle" : isAnswer ? "right" : isChosen ? "wrong" : "dim";
          return (
            <li key={`${i}-${option}`} className="min-w-0">
              <button
                type="button"
                onClick={() => onChoose(i)}
                aria-disabled={answered || undefined}
                tabIndex={answered ? -1 : undefined}
                aria-keyshortcuts={String(i + 1)}
                className={cn(
                  "group flex min-h-14 w-full items-start gap-3 rounded-md border px-3.5 py-3 text-left text-[0.9375rem] leading-snug sm:px-4",
                  "transition-[background-color,border-color,opacity,translate] duration-150 ease-out",
                  state === "idle" &&
                    "border-line bg-surface text-ink shadow-xs hover:border-line-strong hover:bg-surface-2 active:translate-y-px",
                  state === "right" && "border-accent bg-accent-soft text-ink",
                  state === "wrong" && "border-danger bg-danger-soft text-ink",
                  state === "dim" && "border-line bg-surface text-ink-2",
                  answered && "cursor-default",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-px inline-flex size-6 shrink-0 items-center justify-center rounded-sm border font-mono text-xs font-medium",
                    state === "idle" && "border-line bg-surface-2 text-ink-2 group-hover:border-line-strong",
                    state === "right" && "border-accent bg-accent text-accent-ink",
                    state === "wrong" && "border-danger bg-danger text-danger-ink",
                    state === "dim" && "border-line text-ink-3",
                  )}
                >
                  {state === "right" ? (
                    <Check className="size-3.5" strokeWidth={2.25} />
                  ) : state === "wrong" ? (
                    <X className="size-3.5" strokeWidth={2.25} />
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="min-w-0 flex-1 break-words whitespace-pre-line">
                  {option}
                  {state === "right" ? <span className="sr-only"> (correct answer)</span> : null}
                  {state === "wrong" ? <span className="sr-only"> (your answer)</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FeedbackPanel({
  ref,
  question,
  feedback,
  aiReady,
  autoAdvance,
  onContinue,
  onOverride,
  onExplain,
}: {
  ref: Ref<HTMLDivElement>;
  question: LearnQuestion;
  feedback: LearnFeedback;
  aiReady: boolean;
  autoAdvance: boolean;
  onContinue: () => void;
  onOverride: () => void;
  onExplain: (() => void) | null;
}) {
  const reduce = useReducedMotion();
  const panelId = useId();
  const { correct } = feedback;
  const showTimer = correct && autoAdvance && !reduce;

  let title: string;
  if (correct) title = feedback.overridden ? "Marked as right" : feedback.typo ? "Correct, with a typo" : "Correct";
  else if (feedback.dontKnow) title = "Here's the answer";
  else if (feedback.close) title = "Almost";
  else title = "Not quite";

  const canOverride =
    !correct && question.kind === "written" && !feedback.dontKnow && feedback.given.trim() !== "";

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="group"
      aria-labelledby={`${panelId}-title`}
      aria-describedby={`${panelId}-details`}
      className={cn(
        "mt-4 rounded-md border p-4 outline-none sm:p-5",
        correct ? "border-accent/40 bg-accent-soft/50" : "border-danger/30 bg-danger-soft/50",
        "motion-safe:animate-fade-in",
      )}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span
            aria-hidden
            className={cn(
              "inline-flex size-7 shrink-0 items-center justify-center rounded-full",
              correct ? "bg-accent text-accent-ink" : "bg-danger text-danger-ink",
            )}
          >
            {correct ? <Check className="size-4" strokeWidth={2.25} /> : <X className="size-4" strokeWidth={2.25} />}
          </span>
          <p
            id={`${panelId}-title`}
            className={cn("text-base font-semibold", correct ? "text-accent-strong" : "text-danger")}
          >
            {title}
          </p>
          {feedback.mastered ? (
            <Badge variant="accent" className="motion-safe:animate-pop-in">
              Mastered
            </Badge>
          ) : null}
        </div>

        <div id={`${panelId}-details`} className="flex flex-col gap-3 empty:hidden">
        {correct && feedback.typo ? (
          <p className="text-sm leading-relaxed text-ink">
            <span className="text-ink-2">Spelled: </span>
            <span className="font-medium break-words">{question.answer}</span>
          </p>
        ) : null}

        {!correct ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4 sm:gap-y-2">
            {question.kind === "written" && !feedback.dontKnow ? (
              <>
                <dt className="text-ink-2">Your answer</dt>
                <dd className="-mt-2.5 font-medium break-words whitespace-pre-line text-ink sm:mt-0">
                  {feedback.given}
                </dd>
              </>
            ) : null}
            <dt className="text-ink-2">Correct answer</dt>
            <dd className="-mt-2.5 font-medium break-words whitespace-pre-line text-ink sm:mt-0">{question.answer}</dd>
          </dl>
        ) : null}

        {feedback.close && !correct ? (
          <p className="text-sm text-ink-2">Close. If it was only a typo, mark it as right.</p>
        ) : null}
        {feedback.comesBack ? (
          <p className="text-sm text-ink-2">This one comes back later in the round.</p>
        ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Button onClick={onContinue} className="sm:order-last sm:ml-auto sm:min-w-32">
          Continue
          <Kbd className="ml-1 hidden border-accent-ink/30 bg-transparent text-accent-ink/80 sm:inline-flex">
            <CornerDownLeft className="size-3" aria-hidden />
            <span className="sr-only">Enter</span>
          </Kbd>
        </Button>
        {canOverride ? (
          <Button variant="outline" onClick={onOverride}>
            <Check strokeWidth={1.75} aria-hidden />I was right
          </Button>
        ) : null}
        {!correct && onExplain && aiReady ? (
          <Button variant="ghost" onClick={onExplain}>
            <Sparkles strokeWidth={1.75} aria-hidden className="text-accent-strong" />
            Explain with Claude
          </Button>
        ) : null}
      </div>

      {showTimer ? (
        <div aria-hidden className="mt-4 h-0.5 overflow-hidden rounded-full bg-accent/15">
          <motion.div
            className="h-full origin-left bg-accent"
            initial={{ scaleX: 1 }}
            animate={{ scaleX: 0 }}
            transition={{ duration: AUTO_ADVANCE_MS / 1000, ease: "linear" }}
          />
        </div>
      ) : null}
    </div>
  );
}
