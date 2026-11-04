"use client";

import { useId } from "react";
import { Popover } from "radix-ui";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import type { LearnOptions, QuestionTypes, AnswerWith } from "@/lib/learn/engine";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { controlClasses } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";

export type ScopeChoice = {
  /** "all", "review", "starred" or "topic:<id>". */
  value: string;
  label: string;
  count: number;
};

export function scopeValue(options: Pick<LearnOptions, "scope" | "topicId">): string {
  if (options.scope === "topic" && options.topicId) return `topic:${options.topicId}`;
  return options.scope === "topic" ? "all" : options.scope;
}

function fromScopeValue(value: string): Pick<LearnOptions, "scope" | "topicId"> {
  if (value.startsWith("topic:")) return { scope: "topic", topicId: value.slice(6) };
  if (value === "review" || value === "starred") return { scope: value, topicId: null };
  return { scope: "all", topicId: null };
}

const TYPE_OPTIONS = [
  { value: "mixed", label: "Mixed" },
  { value: "mc", label: "Multiple choice" },
  { value: "written", label: "Written" },
] as const satisfies ReadonlyArray<{ value: QuestionTypes; label: string }>;

const ANSWER_OPTIONS = [
  { value: "term", label: "Term" },
  { value: "definition", label: "Definition" },
] as const satisfies ReadonlyArray<{ value: AnswerWith; label: string }>;

const TYPE_HINTS: Record<QuestionTypes, string> = {
  mixed: "Starts with multiple choice, then switches to written as you learn each card.",
  mc: "Only multiple choice. Quicker, but cards stop at familiar until you write them.",
  written: "Only written answers. Slower, and the fastest way to mastered.",
};

/**
 * The Learn settings: what to study, question types, answer side and
 * auto-advance, in a popover. Every change starts a new round.
 */
export function LearnOptionsPopover({
  options,
  scopes,
  onChange,
  autoAdvance,
  onAutoAdvanceChange,
  className,
}: {
  options: LearnOptions;
  scopes: readonly ScopeChoice[];
  onChange: (next: LearnOptions) => void;
  autoAdvance: boolean;
  onAutoAdvanceChange: (value: boolean) => void;
  className?: string;
}) {
  const id = useId();
  const scopeId = `${id}-scope`;
  const typesId = `${id}-types`;
  const answerId = `${id}-answer`;
  const autoId = `${id}-auto`;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="outline" size="sm" className={className}>
          <SlidersHorizontal strokeWidth={1.75} aria-hidden />
          Options
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={16}
          aria-label="Learn options"
          className={cn(
            "z-50 w-[min(23rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-4 text-ink shadow-lg outline-none sm:p-5",
            "origin-(--radix-popover-content-transform-origin)",
            "data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out",
          )}
        >
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label htmlFor={scopeId} className="text-sm font-medium text-ink">
                Study
              </label>
              <div className="relative">
                <select
                  id={scopeId}
                  value={scopeValue(options)}
                  onChange={(e) => onChange({ ...options, ...fromScopeValue(e.target.value) })}
                  className={cn(controlClasses, "h-10 appearance-none pr-9 pl-3")}
                >
                  {scopes.map((s) => (
                    <option key={s.value} value={s.value} disabled={s.count === 0 && s.value !== "all"}>
                      {s.label} ({s.count})
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-2"
                  strokeWidth={1.75}
                  aria-hidden
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span id={typesId} className="text-sm font-medium text-ink">
                Question types
              </span>
              <Segmented
                aria-labelledby={typesId}
                value={options.types}
                onValueChange={(types) => onChange({ ...options, types })}
                options={TYPE_OPTIONS}
                size="sm"
                fullWidth
              />
              <p className="text-[0.8125rem] leading-snug text-ink-2">
                {TYPE_HINTS[options.types]}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <span id={answerId} className="text-sm font-medium text-ink">
                Answer with
              </span>
              <Segmented
                aria-labelledby={answerId}
                value={options.answerWith}
                onValueChange={(answerWith) => onChange({ ...options, answerWith })}
                options={ANSWER_OPTIONS}
                size="sm"
                fullWidth
              />
              <p className="text-[0.8125rem] leading-snug text-ink-2">
                {options.answerWith === "term"
                  ? "You see the definition and answer with the term."
                  : "You see the term and answer with the definition."}
              </p>
            </div>

            <div className="flex items-start gap-3 border-t border-line pt-4">
              <input
                id={autoId}
                type="checkbox"
                checked={autoAdvance}
                onChange={(e) => onAutoAdvanceChange(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-accent"
              />
              <label htmlFor={autoId} className="text-sm leading-snug text-ink">
                Move on by itself after a correct answer
              </label>
            </div>

            <p className="text-[0.8125rem] leading-snug text-ink-2">A change here starts a new round. Your answers so far are saved.</p>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
