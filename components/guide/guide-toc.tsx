"use client";

import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { ChevronDown, CircleAlert, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import type { GuideEntry } from "@/components/guide/guide-data";

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function StatusMark({ entry }: { entry: GuideEntry }) {
  if (entry.status === "pending" || entry.status === "writing") {
    return (
      <span className="mt-0.5 inline-flex shrink-0 text-ink-3">
        <Spinner size="xs" />
        <span className="sr-only">(being written)</span>
      </span>
    );
  }
  if (entry.status === "error" || entry.status === "missing") {
    return (
      <span className="mt-0.5 inline-flex shrink-0 text-danger">
        <CircleAlert className="size-3.5" strokeWidth={1.75} aria-hidden />
        <span className="sr-only">(not written)</span>
      </span>
    );
  }
  return null;
}

/** The ordered list of sections, with the current one marked. */
export function GuideTocList({
  entries,
  activeId,
  onNavigate,
  className,
}: {
  entries: readonly GuideEntry[];
  activeId: string | null;
  onNavigate: (id: string) => void;
  className?: string;
}) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    // Let modified clicks (new tab, etc.) behave like normal links.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    onNavigate(id);
  };

  return (
    <ol className={cn("flex flex-col border-l border-line", className)}>
      {entries.map((entry) => {
        const active = entry.id === activeId;
        return (
          <li key={entry.id}>
            <a
              href={`#${encodeURIComponent(entry.id)}`}
              aria-current={active ? "location" : undefined}
              onClick={(e) => handleClick(e, entry.id)}
              className={cn(
                "-ml-px flex items-start gap-2.5 border-l-2 py-2 pr-2 pl-3 text-sm leading-snug",
                "rounded-r-sm transition-[color,border-color,background-color] duration-150 ease-out",
                active
                  ? "border-accent font-medium text-ink"
                  : "border-transparent text-ink-2 hover:border-line-strong hover:text-ink",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "mt-px shrink-0 font-mono text-xs tabular-nums",
                  active ? "text-accent-strong" : "text-ink-2",
                )}
              >
                {pad(entry.number)}
              </span>
              <span className="min-w-0 flex-1 break-words">{entry.title}</span>
              <StatusMark entry={entry} />
            </a>
          </li>
        );
      })}
    </ol>
  );
}

/** Sticky contents column for wide layouts. */
export function GuideTocAside({
  entries,
  activeId,
  onNavigate,
  footer,
}: {
  entries: readonly GuideEntry[];
  activeId: string | null;
  onNavigate: (id: string) => void;
  footer?: ReactNode;
}) {
  const headingId = useId();
  return (
    <nav
      aria-labelledby={headingId}
      className={cn(
        "sticky top-[calc(var(--header-h)+1.5rem)] flex max-h-[calc(100dvh-var(--header-h)-3rem)] flex-col",
      )}
    >
      <p id={headingId} className="mb-3 text-sm font-medium text-ink">
        Contents
      </p>
      <div className="-mr-2 min-h-0 overflow-y-auto overscroll-contain pr-2 scrollbar-none">
        <GuideTocList entries={entries} activeId={activeId} onNavigate={onNavigate} />
      </div>
      {footer ? <div className="mt-5 border-t border-line pt-4">{footer}</div> : null}
    </nav>
  );
}

/**
 * Contents for narrow layouts: a bar that sticks under the site header,
 * shows the section being read, and opens the full list.
 */
export function GuideTocMobile({
  entries,
  activeId,
  onNavigate,
  className,
}: {
  entries: readonly GuideEntry[];
  activeId: string | null;
  onNavigate: (id: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const active = entries.find((e) => e.id === activeId) ?? entries[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!active) return null;

  return (
    <div
      ref={rootRef}
      data-print-hide
      className={cn(
        "sticky top-[var(--header-h)] z-20 -mx-4 mb-8 border-y border-line bg-bg px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8",
        className,
      )}
    >
      <nav aria-label="Guide contents">
        <button
          ref={buttonRef}
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-12 w-full items-center gap-3 py-1.5 text-left focus-visible:outline-offset-[-2px]"
        >
          <ListOrdered className="size-[18px] shrink-0 text-ink-2" strokeWidth={1.75} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-ink-2">
              Contents{" "}
              <span className="font-mono tabular-nums">
                {active.number} / {entries.length}
              </span>
            </span>
            <span className="block truncate text-sm font-medium text-ink">{active.title}</span>
          </span>
          <ChevronDown
            className={cn(
              "size-[18px] shrink-0 text-ink-2 transition-transform duration-200 ease-out",
              open && "rotate-180",
            )}
            strokeWidth={1.75}
            aria-hidden
          />
        </button>
        <div
          id={listId}
          hidden={!open}
          className={cn(
            "absolute inset-x-0 top-full max-h-[min(60dvh,28rem)] overflow-y-auto overscroll-contain",
            "border-b border-line bg-surface px-4 py-3 shadow-lg sm:px-6 lg:px-8",
            "origin-top motion-safe:animate-fade-in",
          )}
        >
          <GuideTocList
            entries={entries}
            activeId={activeId}
            onNavigate={(id) => {
              setOpen(false);
              onNavigate(id);
            }}
          />
        </div>
      </nav>
    </div>
  );
}
