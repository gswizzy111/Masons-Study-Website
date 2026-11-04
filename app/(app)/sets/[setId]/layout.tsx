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
import { SetHeader } from "@/components/sets/set-header";
import { SetWorkspace } from "@/components/sets/set-workspace";
import { getCourses, getGuideState, getSet } from "@/components/sets/server-data";
import type { ChatGrounding } from "@/components/chat/chat-panel";
import { aiConfigured } from "@/lib/env";
import { examCountdownText, examUrgency, formatExamDate } from "@/components/sets/time-text";
import { cn } from "@/lib/utils";

type Params = Promise<{ setId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { setId } = await params;
  const set = await getSet(setId).catch(() => undefined);
  if (set === null) return { title: "Set not found" };
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
  const [set, courses, guide] = await Promise.all([
    getSet(setId),
    getCourses(supabase),
    getGuideState(setId),
  ]);
  if (!set) notFound();

  const urgency = examUrgency(set.exam_date);
  const grounding: ChatGrounding =
    guide.writtenSections > 0 ? "guide" : guide.readyMaterials > 0 ? "material" : "none";

  return (
    <ChatProvider setId={set.id}>
      <SetWorkspace setId={set.id} setTitle={set.title} aiReady={aiConfigured()} grounding={grounding}>
        <SetHeader
          title={set.title}
          breadcrumb={
            <Link
              href="/dashboard"
              className="-ml-1 inline-flex items-center gap-1 rounded-sm px-1 py-0.5 text-sm text-ink-2 transition-colors duration-150 hover:text-ink"
            >
              <ChevronLeft className="size-4" strokeWidth={1.75} aria-hidden />
              Dashboard
            </Link>
          }
          meta={
            set.course || set.exam_date || set.status !== "ready" ? (
              <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                {set.course ? <CourseChip course={set.course} /> : null}
                <SetStatusBadge status={set.status} />
                {set.exam_date ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 text-sm",
                      urgency === "soon" ? "font-medium text-ink" : "text-ink-2",
                    )}
                  >
                    <CalendarClock className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                    <LiveText
                      kind="exam"
                      value={set.exam_date}
                      serverText={examCountdownText(set.exam_date)}
                    />
                    <span className="font-normal text-ink-2">
                      <span aria-hidden>·</span> {formatExamDate(set.exam_date)}
                    </span>
                  </span>
                ) : null}
              </div>
            ) : null
          }
          actions={
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
          }
          tabs={<TabsNav items={tabsFor(set.id)} aria-label="Study set sections" className="border-b-0" />}
        />

        {children}
      </SetWorkspace>
    </ChatProvider>
  );
}
