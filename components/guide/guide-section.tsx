"use client";

import { memo, type ComponentProps } from "react";
import Link from "next/link";
import type { Components } from "react-markdown";
import { Brain, CircleAlert, FileQuestion, GalleryVerticalEnd, Sparkles } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { GuideEntry } from "@/components/guide/guide-data";

/** The biggest heading level used in the markdown (1-6), ignoring code blocks. */
function topHeadingLevel(markdown: string): number {
  let top = 7;
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^(#{1,6})[ \t]/.exec(line);
    if (match) top = Math.min(top, match[1].length);
  }
  return top === 7 ? 3 : top;
}

type HeadingTag = "h3" | "h4" | "h5" | "h6";
const headingMaps = new Map<number, Components>();

/**
 * Section titles are h2, so a section's own headings start at h3 and keep
 * their relative order, whatever level the markdown starts at.
 */
function headingComponents(top: number): Components {
  const cached = headingMaps.get(top);
  if (cached) return cached;
  const shift = 3 - top;
  const make = (level: number) => {
    const Tag = `h${Math.min(6, Math.max(3, level + shift))}` as HeadingTag;
    function Heading({ node, ...props }: ComponentProps<"h3"> & { node?: unknown }) {
      void node;
      return <Tag {...props} />;
    }
    return Heading;
  };
  const map: Components = { h1: make(1), h2: make(2), h3: make(3), h4: make(4), h5: make(5), h6: make(6) };
  headingMaps.set(top, map);
  return map;
}

/** The markdown body. Memoized so polling and scroll updates skip re-parsing. */
const SectionBody = memo(function SectionBody({ content }: { content: string }) {
  return (
    <div data-guide-body>
      <Markdown components={headingComponents(topHeadingLevel(content))}>{content}</Markdown>
    </div>
  );
});

function WritingPlaceholder({ summary }: { summary: string | null }) {
  return (
    <div className="flex max-w-[68ch] flex-col gap-4">
      <p className="flex items-center gap-2 text-sm font-medium text-accent-strong">
        <Spinner size="sm" />
        Writing this section
      </p>
      {summary ? <p className="text-[0.9375rem] leading-relaxed text-ink-2">{summary}</p> : null}
      <div className="flex flex-col gap-2.5" aria-hidden>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-[94%]" />
        <Skeleton className="h-4 w-[88%]" />
        <Skeleton className="h-4 w-[62%]" />
        <Skeleton className="mt-3 h-5 w-48" />
        <Skeleton className="h-4 w-[91%]" />
        <Skeleton className="h-4 w-[76%]" />
      </div>
    </div>
  );
}

function NotWritten({
  overviewHref,
  failed,
  summary,
}: {
  overviewHref: string;
  failed: boolean;
  summary: string | null;
}) {
  return (
    <div
      className={cn(
        "flex max-w-[68ch] gap-3 rounded-lg border p-4 sm:p-5",
        failed ? "border-danger/30 bg-danger-soft" : "border-line bg-surface-2",
      )}
    >
      {failed ? (
        <CircleAlert className="mt-0.5 size-5 shrink-0 text-danger" strokeWidth={1.75} aria-hidden />
      ) : (
        <FileQuestion className="mt-0.5 size-5 shrink-0 text-ink-2" strokeWidth={1.75} aria-hidden />
      )}
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="font-medium text-ink">
          {failed ? "Claude couldn't write this section." : "This section hasn't been written."}
        </p>
        {summary ? <p className="text-sm leading-relaxed text-ink-2">It covers: {summary}</p> : null}
        <p className="text-sm leading-relaxed text-ink-2">
          {failed
            ? "Use Build again on the overview to write it. Your cards and progress stay."
            : "You can build the set again from the overview."}{" "}
          <Link
            href={overviewHref}
            className="font-medium text-accent-strong underline decoration-1 underline-offset-4 hover:decoration-2"
          >
            Go to the overview
          </Link>
        </p>
      </div>
    </div>
  );
}

const actionSize = "h-10 sm:h-8";

/** One topic of the guide: heading, body (or its state) and study actions. */
export function GuideSectionView({
  entry,
  total,
  setId,
  onAsk,
  className,
  ...props
}: {
  entry: GuideEntry;
  total: number;
  setId: string;
  onAsk: (entry: GuideEntry) => void;
} & Omit<ComponentProps<"section">, "id" | "children">) {
  const base = `/sets/${setId}`;
  const topic = encodeURIComponent(entry.id);
  const headingId = `${entry.id}-heading`;

  return (
    <section
      id={entry.id}
      aria-labelledby={headingId}
      className={cn("scroll-mt-16 @4xl:scroll-mt-4", className)}
      {...props}
    >
      <header className="mb-6">
        <p className="font-mono text-xs text-ink-2 tabular-nums" data-print-hide>
          Topic {entry.number} of {total}
        </p>
        <h2
          id={headingId}
          tabIndex={-1}
          data-guide-heading
          className="mt-1.5 font-display text-[1.625rem] leading-[1.15] font-semibold tracking-[-0.02em] text-ink sm:text-[1.875rem]"
        >
          {entry.title}
        </h2>
      </header>

      {entry.status === "ready" ? (
        <SectionBody content={entry.content} />
      ) : (entry.status === "pending" || entry.status === "writing") && entry.content ? (
        <>
          <p className="mb-5 flex items-center gap-2 text-sm font-medium text-accent-strong" data-print-hide>
            <Spinner size="sm" />
            {entry.status === "writing" ? "Updating this section. " : "Waiting to update this section. "}
            This is the earlier version until the new one is in.
          </p>
          <SectionBody content={entry.content} />
        </>
      ) : entry.status === "pending" || entry.status === "writing" ? (
        <WritingPlaceholder summary={entry.summary} />
      ) : (
        <NotWritten overviewHref={base} failed={entry.status === "error"} summary={entry.summary} />
      )}

      {entry.status === "ready" ? (
        <div
          data-print-hide
          className="mt-8 flex max-w-[68ch] flex-col gap-3 rounded-lg border border-line bg-surface p-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2 sm:py-2.5"
        >
          <p className="px-1 text-sm text-ink-2 sm:mr-auto">Study this topic</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button asChild variant="outline" size="sm" className={actionSize}>
              <Link href={`${base}/learn?topic=${topic}`}>
                <Brain strokeWidth={1.75} aria-hidden />
                Learn this topic
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className={actionSize}>
              <Link href={`${base}/flashcards?topic=${topic}`}>
                <GalleryVerticalEnd strokeWidth={1.75} aria-hidden />
                Flashcards for this topic
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={actionSize}
              onClick={() => onAsk(entry)}
            >
              <Sparkles strokeWidth={1.75} aria-hidden />
              Ask Claude about this section
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
