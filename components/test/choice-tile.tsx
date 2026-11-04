"use client";

import type { ReactNode } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChoiceState = "idle" | "right" | "wrong" | "missed" | "dim";

/**
 * A big radio choice (a styled native radio, so arrow keys and screen
 * readers work as usual). In review, `state` marks it right, wrong, or the
 * right answer they missed.
 */
export function ChoiceTile({
  name,
  value,
  checked,
  onSelect,
  marker,
  state = "idle",
  disabled,
  children,
  className,
}: {
  name: string;
  value: string;
  checked: boolean;
  onSelect?: () => void;
  /** "A", "1", "T"... shown in the small box. */
  marker: string;
  state?: ChoiceState;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const review = state !== "idle";
  return (
    <label
      className={cn(
        "group relative flex min-h-12 items-start gap-3 rounded-md border px-3.5 py-3 text-left text-[0.9375rem] leading-snug sm:px-4",
        "transition-[background-color,border-color,opacity] duration-150 ease-out",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
        !review && !disabled && "cursor-pointer",
        !review &&
          (checked
            ? "border-accent bg-accent-soft/70 text-ink"
            : "border-line bg-surface text-ink hover:border-line-strong hover:bg-surface-2"),
        state === "right" && "border-accent bg-accent-soft text-ink",
        state === "missed" && "border-accent border-dashed bg-surface text-ink",
        state === "wrong" && "border-danger bg-danger-soft text-ink",
        state === "dim" && "border-line bg-surface text-ink-2",
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onSelect?.()}
        disabled={disabled}
        className="sr-only"
      />
      <span
        aria-hidden
        className={cn(
          "mt-px inline-flex size-6 shrink-0 items-center justify-center rounded-sm border font-mono text-xs font-medium",
          !review && (checked ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface-2 text-ink-2"),
          (state === "right" || state === "missed") && "border-accent bg-accent text-accent-ink",
          state === "wrong" && "border-danger bg-danger text-danger-ink",
          state === "dim" && "border-line text-ink-3",
        )}
      >
        {state === "right" || state === "missed" ? (
          <Check className="size-3.5" strokeWidth={2.25} />
        ) : state === "wrong" ? (
          <X className="size-3.5" strokeWidth={2.25} />
        ) : (
          marker
        )}
      </span>
      <span className="min-w-0 flex-1 break-words whitespace-pre-line">
        {children}
        {state === "right" ? <span className="sr-only"> (your answer, correct)</span> : null}
        {state === "missed" ? <span className="sr-only"> (correct answer)</span> : null}
        {state === "wrong" ? <span className="sr-only"> (your answer, wrong)</span> : null}
      </span>
    </label>
  );
}
