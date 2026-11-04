import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

const widths = {
  narrow: "max-w-3xl",
  default: "max-w-5xl",
  wide: "max-w-7xl",
} as const;

/** Page width and padding, aligned with the header. */
export function PageContainer({
  size = "wide",
  className,
  ...props
}: ComponentProps<"div"> & { size?: keyof typeof widths }) {
  return (
    <div
      className={cn("mx-auto w-full px-4 py-8 sm:px-6 sm:py-10 lg:px-8", widths[size], className)}
      {...props}
    />
  );
}

/** Page title row: h1 in Fraunces, optional description and actions. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="font-display text-[1.75rem] leading-tight font-semibold tracking-[-0.02em] text-ink sm:text-[2rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-[60ch] text-[0.9375rem] leading-relaxed text-ink-2">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
