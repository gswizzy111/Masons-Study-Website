import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/** Back link to the games hub, the game's name (h2) and an optional aside. */
export function GamePageHeader({
  setId,
  title,
  titleId,
  description,
  aside,
  className,
}: {
  setId: string;
  title: string;
  titleId?: string;
  description?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex flex-col gap-3 sm:mb-6", className)}>
      <Link
        href={`/sets/${setId}/games`}
        className="-ml-1 inline-flex w-fit items-center gap-1 rounded-sm px-1 py-0.5 text-sm text-ink-2 transition-colors duration-150 hover:text-ink"
      >
        <ChevronLeft className="size-4" strokeWidth={1.75} aria-hidden />
        All games
      </Link>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <h2
            id={titleId}
            className="font-display text-2xl font-semibold tracking-[-0.015em] text-ink"
          >
            {title}
          </h2>
          {description ? (
            <p className="mt-1 max-w-[60ch] text-[0.9375rem] leading-relaxed text-ink-2">
              {description}
            </p>
          ) : null}
        </div>
        {aside ? <div className="shrink-0 text-sm text-ink-2">{aside}</div> : null}
      </div>
    </div>
  );
}
