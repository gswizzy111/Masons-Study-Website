import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BookOpen,
  Brain,
  CalendarClock,
  ChevronLeft,
  ClipboardCheck,
  Gamepad2,
  GalleryVerticalEnd,
  LayoutDashboard,
  PencilLine,
  SquarePlay,
} from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { ChatProvider } from "@/components/chat/chat-context";
import { TabsNav, type TabsNavItem } from "@/components/ui/tabs-nav";
import { CourseChip } from "@/components/sets/course-chip";
import { LiveText } from "@/components/sets/live-text";
import { SetActions } from "@/components/sets/set-actions";
import { SetStatusBadge } from "@/components/sets/set-status-badge";
import { AskClaudeButton, SetWorkspace } from "@/components/sets/set-workspace";
import { getCourses, getSet } from "@/components/sets/server-data";
import { examCountdownText, examUrgency, formatExamDate } from "@/components/sets/time-text";
import { cn } from "@/lib/utils";

type Params = Promise<{ setId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { setId } = await params;
  const set = await getSet(setId).catch(() => null);
  return { title: set?.title ?? "Study set" };
}

const icon = (Icon: typeof BookOpen) => <Icon strokeWidth={1.75} />;

function tabsFor(setId: string): TabsNavItem[] {
  const base = `/sets/${setId}`;
  return [
    { href: base, label: "Overview", icon: icon(LayoutDashboard), exact: true },
    { href: `${base}/guide`, label: "Guide", icon: icon(BookOpen) },
    { href: `${base}/flashcards`, label: "Flashcards", icon: icon(GalleryVerticalEnd) },
    { href: `${base}/learn`, label: "Learn", icon: icon(Brain) },
    { href: `${base}/test`, label: "Test", icon: icon(ClipboardCheck) },
    { href: `${base}/games`, label: "Games", icon: icon(Gamepad2) },
    { href: `${base}/videos`, label: "Videos", icon: icon(SquarePlay) },
    { href: `${base}/cards`, label: "Cards", icon: icon(PencilLine) },
  ];
}

export default async function SetLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Params;
}) {
  const { setId } = await params;
  const { supabase, user } = await requireUser();
  const [set, courses] = await Promise.all([getSet(setId), getCourses(supabase)]);
  if (!set) notFound();

  const urgency = examUrgency(set.exam_date);

  return (
    <ChatProvider setId={set.id}>
      <SetWorkspace setId={set.id} setTitle={set.title}>
        <div data-print-hide className="border-b border-line">
          <div className="mx-auto w-full max-w-7xl px-4 pt-5 sm:px-6 sm:pt-7 lg:px-8">
            <nav aria-label="Breadcrumb">
              <Link
                href="/dashboard"
                className="-ml-1 inline-flex items-center gap-1 rounded-sm px-1 py-0.5 text-sm text-ink-2 transition-colors duration-150 hover:text-ink"
              >
                <ChevronLeft className="size-4" strokeWidth={1.75} aria-hidden />
                Dashboard
              </Link>
            </nav>

            <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                {set.course || set.exam_date || set.status !== "ready" ? (
                  <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                    {set.course ? <CourseChip course={set.course} /> : null}
                    <SetStatusBadge status={set.status} />
                    {set.exam_date ? (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 text-sm",
                          urgency === "soon" ? "font-medium text-learning-strong" : "text-ink-2",
                        )}
                      >
                        <CalendarClock className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                        <LiveText
                          kind="exam"
                          value={set.exam_date}
                          serverText={examCountdownText(set.exam_date)}
                        />
                        <span className="text-ink-2">
                          <span aria-hidden>·</span> {formatExamDate(set.exam_date)}
                        </span>
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <h1 className="font-display text-[1.75rem] leading-tight font-semibold tracking-[-0.02em] break-words text-ink sm:text-[2.125rem]">
                  {set.title}
                </h1>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <AskClaudeButton />
                <SetActions
                  set={{
                    id: set.id,
                    title: set.title,
                    description: set.description,
                    exam_date: set.exam_date,
                    course_id: set.course_id,
                  }}
                  courses={courses}
                  userId={user.id}
                />
              </div>
            </div>

            <TabsNav
              items={tabsFor(set.id)}
              aria-label="Study set sections"
              className="mt-5 border-b-0 sm:mt-6"
            />
          </div>
        </div>

        {children}
      </SetWorkspace>
    </ChatProvider>
  );
}
