"use client";

import { useId, type ReactNode } from "react";
import { RadioGroup } from "radix-ui";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** A lucide icon element shown before the label. */
  icon?: ReactNode;
  disabled?: boolean;
};

type SegmentedProps<T extends string> = {
  value: T;
  onValueChange: (value: T) => void;
  options: ReadonlyArray<SegmentedOption<T>>;
  /** Accessible name for the group (or use aria-labelledby). */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** Submits with forms under this name. */
  name?: string;
  size?: "sm" | "md";
  /** Stretch to the container width, segments sharing it equally. */
  fullWidth?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
};

/**
 * Segmented control: a radio group (role="radiogroup") that looks like a
 * row of tabs. Arrow keys move and select, as with any radio group.
 */
export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  name,
  size = "md",
  fullWidth = false,
  disabled,
  className,
  id,
  ...aria
}: SegmentedProps<T>) {
  const layoutId = `segmented-${useId()}`;
  const reduce = useReducedMotion();

  return (
    <RadioGroup.Root
      id={id}
      value={value}
      onValueChange={(v) => onValueChange(v as T)}
      orientation="horizontal"
      loop
      name={name}
      disabled={disabled}
      aria-label={aria["aria-label"]}
      aria-labelledby={aria["aria-labelledby"]}
      data-slot="segmented"
      className={cn(
        "relative items-stretch gap-0.5 rounded-md border border-line bg-surface-2 p-[3px]",
        fullWidth ? "flex w-full" : "inline-flex max-w-full",
        className,
      )}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <RadioGroup.Item
            key={opt.value}
            value={opt.value}
            disabled={opt.disabled}
            className={cn(
              "relative inline-flex min-w-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-sm font-medium",
              "text-ink-2 transition-colors duration-150 ease-out hover:text-ink",
              "data-[state=checked]:text-ink disabled:pointer-events-none disabled:opacity-50",
              "focus-visible:outline-offset-0",
              "[&_svg]:size-4 [&_svg]:shrink-0",
              size === "sm" ? "h-7 px-2.5 text-[0.8125rem]" : "h-8 px-3 text-sm",
              fullWidth && "flex-1",
            )}
          >
            {selected ? (
              <motion.span
                layoutId={layoutId}
                aria-hidden
                className="absolute inset-0 rounded-sm border border-line/80 bg-surface shadow-xs"
                transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.28, bounce: 0 }}
              />
            ) : null}
            <span className="relative z-[1] inline-flex items-center gap-1.5 truncate">
              {opt.icon}
              {opt.label}
            </span>
          </RadioGroup.Item>
        );
      })}
    </RadioGroup.Root>
  );
}
