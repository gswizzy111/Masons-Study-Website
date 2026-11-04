import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The card every auth page sits in: a Fraunces h1, a line of context, the form. */
export function AuthCard({
  title,
  description,
  icon,
  children,
  footer,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Optional lucide icon element shown above the title (status screens). */
  icon?: ReactNode;
  children?: ReactNode;
  /** Quiet line under the card, e.g. "New here? Create an account". */
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className="motion-safe:animate-rise-in">
      <section
        className={cn(
          "rounded-lg border border-line bg-surface px-5 py-7 shadow-md sm:px-8 sm:py-9",
          className,
        )}
      >
        {icon ? (
          <div className="mb-5 grid size-11 place-items-center rounded-md bg-accent-soft text-accent-strong [&_svg]:size-5">
            {icon}
          </div>
        ) : null}
        <h1 className="font-display text-[1.625rem] leading-tight font-semibold tracking-[-0.02em] text-ink sm:text-[1.75rem]">
          {title}
        </h1>
        {description ? (
          <div className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">{description}</div>
        ) : null}
        {children ? <div className="mt-7">{children}</div> : null}
      </section>
      {footer ? <div className="mt-6 text-center text-[0.9375rem] text-ink-2">{footer}</div> : null}
    </div>
  );
}
