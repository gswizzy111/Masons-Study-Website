import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const tones = {
  accent: "var(--accent)",
  learning: "var(--learning)",
  danger: "var(--danger)",
  ink: "var(--ink)",
} as const;

type ProgressRingProps = {
  /** 0-100. */
  value: number;
  /** Outer size in px. */
  size?: number;
  /** Stroke width in px. */
  stroke?: number;
  tone?: keyof typeof tones;
  /** Accessible name, e.g. "Mastered". */
  label?: string;
  /** Optional human text, e.g. "42% mastered". Defaults to "<value>%". */
  valueText?: string;
  /** Centered inside the ring (a number, an icon). */
  children?: ReactNode;
  className?: string;
};

/** Circular progress (role="progressbar"), with a slot in the middle. */
export function ProgressRing({
  value,
  size = 64,
  stroke = 6,
  tone = "accent",
  label,
  valueText,
  children,
  className,
}: ProgressRingProps) {
  const v = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - v / 100);

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      aria-valuetext={valueText ?? `${Math.round(v)}%`}
      data-slot="progress-ring"
      className={cn("relative inline-grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
        focusable="false"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          style={{ stroke: "color-mix(in oklab, var(--line) 85%, transparent)" }}
        />
        {v > 0 ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            style={{ stroke: tones[tone] }}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-700 ease-out"
          />
        ) : null}
      </svg>
      {children ? (
        <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
      ) : null}
    </div>
  );
}
