import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The mark: a single cell. Membrane, an off-center nucleus and one small
 * organelle, knocked out of an accent tile. Uses the accent tokens, so it
 * works in both themes.
 */
export function BrandMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-7 shrink-0", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <rect width="32" height="32" rx="9" style={{ fill: "var(--accent)" }} />
      <path
        d="M16.4 6.6c5.3.2 9.2 4.3 9 9.7-.2 5.3-4.5 9.3-9.8 9.1-5.2-.2-9.1-4.5-8.9-9.7.2-5.4 4.4-9.3 9.7-9.1Z"
        fill="none"
        strokeWidth="2"
        style={{ stroke: "var(--accent-ink)" }}
      />
      <circle cx="18.6" cy="13.6" r="3.5" style={{ fill: "var(--accent-ink)" }} />
      <circle cx="12.4" cy="19.6" r="1.5" opacity="0.7" style={{ fill: "var(--accent-ink)" }} />
    </svg>
  );
}

type BrandProps = {
  /** Wrap in a link (for headers). */
  href?: string;
  className?: string;
  /** Hide the wordmark below the sm breakpoint. */
  compact?: boolean;
  size?: "sm" | "md" | "lg";
};

const sizes = {
  sm: { mark: "size-6", text: "text-[1.0625rem]" },
  md: { mark: "size-7", text: "text-[1.1875rem]" },
  lg: { mark: "size-9", text: "text-2xl" },
} as const;

/** Mark + "Mason’s Study" wordmark in Fraunces. */
export function Brand({ href, className, compact = false, size = "md" }: BrandProps) {
  const s = sizes[size];
  const content = (
    <>
      <BrandMark className={s.mark} />
      <span
        className={cn(
          "font-display font-semibold leading-none tracking-[-0.015em] text-ink",
          s.text,
          compact && "max-sm:sr-only",
        )}
      >
        Mason’s Study
      </span>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          "inline-flex items-center gap-2.5 rounded-md outline-offset-4",
          className,
        )}
      >
        {content}
      </Link>
    );
  }

  return <span className={cn("inline-flex items-center gap-2.5", className)}>{content}</span>;
}
