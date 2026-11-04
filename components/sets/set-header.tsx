"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AskClaudeButton, STUDY_ROUTE } from "@/components/sets/set-workspace";
import { cn } from "@/lib/utils";

/**
 * The set's header above the tabs. On the overview, guide, videos and cards
 * tabs it has the breadcrumb, the course and exam line and the full title.
 * On the study tabs (flashcards, learn, test, games) it shrinks to one line
 * (title, Ask Claude, the set menu) so the card and its buttons, or the
 * question and its answers, fit on the first screen.
 *
 * Every slot keeps its place in both modes, so moving between tabs never
 * remounts the tab bar or the menu.
 */
export function SetHeader({
  title,
  breadcrumb,
  meta,
  actions,
  tabs,
}: {
  title: string;
  /** The back link to the dashboard (full mode only). */
  breadcrumb: ReactNode;
  /** Course, status and exam line (full mode only). */
  meta: ReactNode;
  /** The set menu, after the Ask Claude button. */
  actions: ReactNode;
  tabs: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const compact = STUDY_ROUTE.test(pathname);

  return (
    <div data-print-hide className="border-b border-line">
      <div
        className={cn(
          "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8",
          compact ? "pt-3 sm:pt-5" : "pt-5 sm:pt-7",
        )}
      >
        {compact ? null : <nav aria-label="Breadcrumb">{breadcrumb}</nav>}

        <div
          className={cn(
            "flex",
            compact
              ? "items-center justify-between gap-3"
              : "mt-3 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
          )}
        >
          <div className="min-w-0">
            {compact ? null : meta}
            <h1
              title={compact ? title : undefined}
              className={cn(
                "font-display leading-tight font-semibold text-ink",
                compact
                  ? "truncate text-xl tracking-[-0.015em] sm:text-2xl"
                  : "text-[1.75rem] tracking-[-0.02em] break-words sm:text-[2.125rem]",
              )}
            >
              {title}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <AskClaudeButton compact={compact} />
            {actions}
          </div>
        </div>

        <div className={compact ? "mt-2 sm:mt-4" : "mt-5 sm:mt-6"}>{tabs}</div>
      </div>
    </div>
  );
}
