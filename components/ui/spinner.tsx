import { cn } from "@/lib/utils";

const sizes = { xs: 12, sm: 16, md: 20, lg: 28 } as const;

type SpinnerProps = {
  size?: keyof typeof sizes | number;
  className?: string;
  /**
   * Announced to screen readers (role="status"). Leave empty when the
   * spinner sits inside something that already says it is busy, such as a
   * loading button.
   */
  label?: string;
};

/** A small ring with a turning arc. Color follows currentColor. */
export function Spinner({ size = "sm", className, label }: SpinnerProps) {
  const px = typeof size === "number" ? size : sizes[size];
  const svg = (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      className={cn("shrink-0 animate-spin", !label && className)}
      aria-hidden
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );

  if (!label) return svg;

  return (
    <span role="status" className={cn("inline-flex items-center", className)}>
      {svg}
      <span className="sr-only">{label}</span>
    </span>
  );
}
