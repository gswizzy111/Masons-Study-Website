"use client";

import { useId, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProfileOption } from "@/components/profile/learning-profile-options";

/*
 * Option cards and chips built on native radio and checkbox inputs, so
 * keyboard and screen reader behavior is the browser's own: Tab reaches the
 * group, arrow keys move between radios, Space toggles checkboxes. The input
 * is visually hidden; the label draws the control and the focus ring.
 */

const optionBase = cn(
  "group/option relative flex cursor-pointer select-none rounded-md border border-line bg-surface text-left",
  "transition-[border-color,background-color,box-shadow] duration-150 ease-out",
  "hover:border-line-strong",
  "has-[:checked]:border-accent has-[:checked]:bg-accent-soft",
  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
  "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
);

function GroupFrame({
  legend,
  hint,
  children,
  className,
  legendClassName,
}: {
  legend: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  legendClassName?: string;
}) {
  const hintId = useId();
  return (
    <fieldset className={cn("min-w-0", className)} aria-describedby={hint ? hintId : undefined}>
      <legend className={cn("mb-1 text-[0.9375rem] font-medium text-ink", legendClassName)}>
        {legend}
      </legend>
      {hint ? (
        <p id={hintId} className="mb-3 text-sm leading-snug text-ink-2">
          {hint}
        </p>
      ) : (
        <div className="mb-3" />
      )}
      {children}
    </fieldset>
  );
}

function RadioDot() {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px] border-line-strong bg-surface",
        "transition-colors duration-150 ease-out",
        "group-has-[:checked]/option:border-accent",
      )}
    >
      <span className="size-2 scale-0 rounded-full bg-accent transition-transform duration-150 ease-out group-has-[:checked]/option:scale-100" />
    </span>
  );
}

function CheckBox({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-xs border-[1.5px] border-line-strong bg-surface text-accent-ink",
        "transition-colors duration-150 ease-out",
        "group-has-[:checked]/option:border-accent group-has-[:checked]/option:bg-accent",
        className,
      )}
    >
      <Check
        className="size-3 opacity-0 transition-opacity duration-100 group-has-[:checked]/option:opacity-100"
        strokeWidth={3}
      />
    </span>
  );
}

function OptionText<T extends string>({ option }: { option: ProfileOption<T> }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[0.9375rem] leading-snug font-medium text-ink">{option.label}</span>
      {option.description ? (
        <span className="text-sm leading-snug text-ink-2">{option.description}</span>
      ) : null}
    </span>
  );
}

type RadioCardsProps<T extends string> = {
  legend: ReactNode;
  hint?: ReactNode;
  name: string;
  options: ReadonlyArray<ProfileOption<T>>;
  value: T | undefined;
  onChange: (value: T) => void;
  columns?: 1 | 2 | 3;
  className?: string;
  legendClassName?: string;
};

const gridCols = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-3",
} as const;

/** Single choice as a group of option cards (native radios). */
export function RadioCards<T extends string>({
  legend,
  hint,
  name,
  options,
  value,
  onChange,
  columns = 2,
  className,
  legendClassName,
}: RadioCardsProps<T>) {
  const groupId = useId();
  return (
    <GroupFrame legend={legend} hint={hint} className={className} legendClassName={legendClassName}>
      <div className={cn("grid gap-2", gridCols[columns])}>
        {options.map((opt) => {
          const id = `${groupId}-${opt.value}`;
          return (
            <label key={opt.value} htmlFor={id} className={cn(optionBase, "items-start gap-3 p-3.5")}>
              <input
                id={id}
                type="radio"
                name={`${name}-${groupId}`}
                value={opt.value}
                checked={value === opt.value}
                onChange={() => onChange(opt.value)}
                className="sr-only"
              />
              <RadioDot />
              <OptionText option={opt} />
            </label>
          );
        })}
      </div>
    </GroupFrame>
  );
}

type CheckboxCardsProps<T extends string> = {
  legend: ReactNode;
  hint?: ReactNode;
  options: ReadonlyArray<ProfileOption<T>>;
  value: readonly T[] | undefined;
  onChange: (value: T[]) => void;
  /** "cards" show the description line; "chips" are compact pills. */
  variant?: "cards" | "chips";
  columns?: 1 | 2 | 3;
  className?: string;
  legendClassName?: string;
};

/** Multiple choice as option cards or chips (native checkboxes). */
export function CheckboxCards<T extends string>({
  legend,
  hint,
  options,
  value,
  onChange,
  variant = "cards",
  columns = 2,
  className,
  legendClassName,
}: CheckboxCardsProps<T>) {
  const groupId = useId();
  const selected = new Set(value ?? []);

  const toggle = (v: T, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(v);
    else next.delete(v);
    // Keep the options' order.
    onChange(options.filter((o) => next.has(o.value)).map((o) => o.value));
  };

  return (
    <GroupFrame legend={legend} hint={hint} className={className} legendClassName={legendClassName}>
      <div className={variant === "chips" ? "flex flex-wrap gap-2" : cn("grid gap-2", gridCols[columns])}>
        {options.map((opt) => {
          const id = `${groupId}-${opt.value}`;
          return (
            <label
              key={opt.value}
              htmlFor={id}
              className={cn(
                optionBase,
                variant === "chips"
                  ? "min-h-10 items-center gap-2.5 rounded-sm py-2 pr-3.5 pl-3"
                  : "items-start gap-3 p-3.5",
              )}
            >
              <input
                id={id}
                type="checkbox"
                value={opt.value}
                checked={selected.has(opt.value)}
                onChange={(e) => toggle(opt.value, e.target.checked)}
                className="sr-only"
              />
              <CheckBox className={variant === "chips" ? "mt-0" : undefined} />
              {variant === "chips" ? (
                <span className="text-[0.9375rem] leading-snug font-medium text-ink">{opt.label}</span>
              ) : (
                <OptionText option={opt} />
              )}
            </label>
          );
        })}
      </div>
    </GroupFrame>
  );
}
