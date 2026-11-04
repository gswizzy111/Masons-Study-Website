import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const tones = {
  accent: "bg-accent",
  learning: "bg-learning",
  danger: "bg-danger",
  ink: "bg-ink",
} as const;

type ProgressProps = Omit<ComponentProps<"div">, "children"> & {
  /** 0 to `max`. Pass null for an indeterminate bar. */
  value: number | null;
  max?: number;
  tone?: keyof typeof tones;
  size?: "xs" | "sm" | "md";
  /** Accessible name, e.g. "Building your set". Required unless aria-labelledby is set. */
  label?: string;
  /** Optional human text for the value, e.g. "12 of 40 cards". */
  valueText?: string;
};

const heights = { xs: "h-1", sm: "h-1.5", md: "h-2" } as const;

/** A thin horizontal progress bar (role="progressbar"). */
export function Progress({
  value,
  max = 100,
  tone = "accent",
  size = "sm",
  label,
  valueText,
  className,
  ...props
}: ProgressProps) {
  const indeterminate = value === null || Number.isNaN(value);
  const pct = indeterminate ? 0 : Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={indeterminate ? undefined : Math.round(Math.min(max, Math.max(0, value)))}
      aria-valuetext={valueText}
      data-slot="progress"
      className={cn(
        "relative w-full overflow-hidden rounded-full bg-line/70",
        heights[size],
        className,
      )}
      {...props}
    >
      {indeterminate ? (
        <div
          className={cn(
            "absolute inset-y-0 left-0 w-1/3 rounded-full motion-safe:animate-progress-slide",
            tones[tone],
          )}
        />
      ) : (
        <div
          className={cn(
            "h-full w-full rounded-full transition-transform duration-500 ease-out",
            tones[tone],
          )}
          style={{ transform: `translateX(-${100 - pct}%)` }}
        />
      )}
    </div>
  );
}
