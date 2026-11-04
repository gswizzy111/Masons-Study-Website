"use client";

import { useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useReducedMotion } from "motion/react";
import { BookOpen, Brain, CircleAlert, GalleryVerticalEnd, Printer } from "lucide-react";
import { useChat } from "@/components/chat/chat-context";
import { PageContainer } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { pluralize } from "@/lib/utils";
import type { SetStatus, Topic } from "@/lib/types";
import {
  buildEntries,
  readingMinutes,
  type GuideEntry,
  type GuideSectionRow,
} from "@/components/guide/guide-data";
import { GuideSectionView } from "@/components/guide/guide-section";
import { GuideTocAside, GuideTocMobile } from "@/components/guide/guide-toc";
import { SelectionAsk } from "@/components/guide/selection-ask";
import { useLiveGuide } from "@/components/guide/use-live-guide";
import { useScrollSpy } from "@/components/guide/use-scroll-spy";

type GuideViewProps = {
  setId: string;
  setTitle: string;
  initialStatus: SetStatus;
  initialTopics: Topic[];
  initialSections: GuideSectionRow[];
};

function printGuide() {
  window.print();
}

/** The study guide: contents, live-filling sections, and study actions. */
export function GuideView({ setId, setTitle, initialStatus, initialTopics, initialSections }: GuideViewProps) {
  const live = useLiveGuide({ setId, initialStatus, initialTopics, initialSections });
  const entries = useMemo(
    () => buildEntries(live.topics, live.sections, live.status),
    [live.topics, live.sections, live.status],
  );
  const ids = useMemo(() => entries.map((e) => e.id), [entries]);
  const activeId = useScrollSpy(ids);
  const contentRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const { ask } = useChat();

  const building = live.status === "building";
  const total = entries.length;
  const written = entries.filter((e) => e.status === "ready").length;
  const minutes = readingMinutes(entries);
  const base = `/sets/${setId}`;

  const navigate = useCallback(
    (id: string) => {
      const section = document.getElementById(id);
      if (!section) return;
      section.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      try {
        window.history.replaceState(window.history.state, "", `#${encodeURIComponent(id)}`);
      } catch {
        // Some embedded browsers refuse history changes; the scroll still happened.
      }
      const heading = document.getElementById(`${id}-heading`);
      heading?.focus({ preventScroll: true });
    },
    [reduceMotion],
  );

  const askAbout = useCallback(
    (entry: GuideEntry) => {
      ask(
        `Help me understand the "${entry.title}" section of my study guide. Walk me through the main ideas, then ask me a question to check that I've got it.`,
      );
    },
    [ask],
  );

  // Nothing to show yet.
  if (total === 0) {
    return (
      <PageContainer size="default" className="pt-6 sm:pt-8">
        {building ? (
          <OutliningState />
        ) : (
          <EmptyState
            icon={live.status === "error" ? <CircleAlert /> : <BookOpen />}
            title={live.status === "error" ? "The guide wasn't built" : "No study guide yet"}
            body={
              live.status === "error"
                ? "Something stopped the build before Claude wrote the guide. Check the overview to try again."
                : "Add your lecture slides or notes on the overview, then build the set. Claude writes the guide one topic at a time, in the style you picked."
            }
            action={
              <Button asChild>
                <Link href={base}>Go to the overview</Link>
              </Button>
            }
          />
        )}
      </PageContainer>
    );
  }

  const meta = [
    pluralize(total, "topic"),
    minutes > 0 ? `about ${minutes} min read` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const printButton = (
    <Button variant="outline" size="sm" onClick={printGuide} disabled={written === 0}>
      <Printer strokeWidth={1.75} aria-hidden />
      Print guide
    </Button>
  );

  return (
    <PageContainer className="pt-6 sm:pt-8">
      <div className="@container">
        <div className="grid gap-x-12 @4xl:grid-cols-[15rem_minmax(0,1fr)] @6xl:grid-cols-[16.5rem_minmax(0,1fr)] @6xl:gap-x-16">
          <aside data-print-hide className="hidden @4xl:block">
            <GuideTocAside
              entries={entries}
              activeId={activeId}
              onNavigate={navigate}
              footer={
                <div className="flex flex-col items-start gap-3">
                  <p className="text-sm text-ink-2">{meta}</p>
                  {printButton}
                </div>
              }
            />
          </aside>

          {/* Sized in the guide's text size so 68ch matches the prose measure. */}
          <div className="mx-auto w-full max-w-[68ch] min-w-0 text-base sm:text-[1.0625rem] @4xl:mx-0">
            {/* Printed copies lose the set header, so name the set here. */}
            <div className="mb-8 hidden print:block">
              <p className="font-display text-2xl font-semibold">{setTitle}</p>
              <p className="text-sm">Study guide</p>
            </div>

            <div data-print-hide className="mb-6 flex flex-wrap items-center justify-between gap-3 @4xl:hidden">
              <p className="text-sm text-ink-2">{meta}</p>
              {printButton}
            </div>

            <GuideTocMobile
              entries={entries}
              activeId={activeId}
              onNavigate={navigate}
              className="@4xl:hidden"
            />

            {building ? (
              <BuildingBanner
                written={written}
                total={total}
                updating={entries.some((e) => (e.status === "pending" || e.status === "writing") && e.content)}
              />
            ) : null}

            <div ref={contentRef} className="flex flex-col">
              {entries.map((entry, i) => (
                <GuideSectionView
                  key={entry.id}
                  entry={entry}
                  total={total}
                  setId={setId}
                  onAsk={askAbout}
                  className={i > 0 ? "mt-14 border-t border-line pt-12 print:mt-8 print:pt-6" : undefined}
                />
              ))}
            </div>

            {!building && written > 0 ? <EndOfGuide base={base} /> : null}
          </div>
        </div>
      </div>

      <SelectionAsk containerRef={contentRef} />
    </PageContainer>
  );
}

function BuildingBanner({ written, total, updating }: { written: number; total: number; updating: boolean }) {
  return (
    <div
      data-print-hide
      className="mb-10 flex flex-col gap-3 rounded-lg border border-line bg-accent-soft p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <Spinner size="sm" className="mt-0.5 text-accent-strong" />
        <p role="status" className="text-[0.9375rem] leading-relaxed text-ink">
          <span className="font-medium">
            {updating ? "Claude is updating your guide." : "Claude is writing your guide."}
          </span>{" "}
          <span className="tabular-nums">
            {written} of {total}
          </span>{" "}
          {updating
            ? "sections done. The others show their earlier text until the new version is in."
            : "sections done. Each one appears here as soon as it's written."}
        </p>
      </div>
      <Progress
        value={written}
        max={Math.max(total, 1)}
        label="Guide sections written"
        valueText={`${written} of ${total} sections written`}
      />
    </div>
  );
}

function OutliningState() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start gap-3 rounded-lg border border-line bg-accent-soft p-4 sm:p-5">
        <Spinner size="sm" className="mt-0.5 text-accent-strong" />
        <p role="status" className="text-[0.9375rem] leading-relaxed text-ink">
          <span className="font-medium">Claude is reading your material.</span> The topics show up here
          first, then each section as it&apos;s written. You can leave this page and come back.
        </p>
      </div>
      <div className="flex flex-col gap-3" aria-hidden>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="mt-3 h-4 w-full" />
        <Skeleton className="h-4 w-[92%]" />
        <Skeleton className="h-4 w-[80%]" />
        <Skeleton className="h-4 w-[56%]" />
      </div>
    </div>
  );
}

function EndOfGuide({ base }: { base: string }) {
  return (
    <div
      data-print-hide
      className="mt-16 flex max-w-[68ch] flex-col gap-4 rounded-lg border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
    >
      <div>
        <p className="font-display text-lg font-semibold text-ink">That&apos;s the whole guide</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">Lock it in with Learn, or flip through the cards.</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild>
          <Link href={`${base}/learn`}>
            <Brain strokeWidth={1.75} aria-hidden />
            Start Learn
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`${base}/flashcards`}>
            <GalleryVerticalEnd strokeWidth={1.75} aria-hidden />
            Flashcards
          </Link>
        </Button>
      </div>
    </div>
  );
}
