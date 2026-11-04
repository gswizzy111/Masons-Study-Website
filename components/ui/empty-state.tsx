import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  /** A lucide icon element, e.g. <Layers />. */
  icon?: ReactNode;
  title: ReactNode;
  /** One or two sentences that say how to fill this space. */
  body?: ReactNode;
  /** Usually a Button. */
  action?: ReactNode;
  /** Heading level for the title. Default h2. */
  headingLevel?: "h2" | "h3" | "h4";
  /** Dashed outline around the block. Default true. */
  bordered?: boolean;
  size?: "sm" | "md";
  className?: string;
};

export function EmptyState({
  icon,
  title,
  body,
  action,
  headingLevel: Heading = "h2",
  bordered = true,
  size = "md",
  className,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center text-center",
        size === "md" ? "gap-3 px-6 py-12 sm:py-16" : "gap-2.5 px-5 py-8",
        bordered && "rounded-lg border border-dashed border-line-strong/80",
        className,
      )}
    >
      {icon ? (
        <div
          aria-hidden
          className={cn(
            "mb-1 grid place-items-center rounded-md bg-surface-2 text-ink-2",
            "[&_svg]:stroke-[1.75]",
            size === "md" ? "size-12 [&_svg]:size-6" : "size-10 [&_svg]:size-5",
          )}
        >
          {icon}
        </div>
      ) : null}
      <Heading
        className={cn(
          "font-display font-semibold tracking-[-0.012em] text-ink",
          size === "md" ? "text-xl" : "text-lg",
        )}
      >
        {title}
      </Heading>
      {body ? (
        <div className="max-w-[44ch] text-[0.9375rem] leading-relaxed text-ink-2">{body}</div>
      ) : null}
      {action ? <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
