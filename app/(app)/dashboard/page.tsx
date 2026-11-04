import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  FileUp,
  GraduationCap,
  Layers,
  Plus,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { cn, daysUntil, pluralize } from "@/lib/utils";
import type { MasteryLevel, SetStatus } from "@/lib/types";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CourseChip } from "@/components/sets/course-chip";
import { courseDot, type CourseLite } from "@/components/sets/course-colors";
import { LiveText } from "@/components/sets/live-text";
import { SetCard, type SetCardData } from "@/components/sets/set-card";
import { fetchAll, getCourses, summaryFromProgress } from "@/components/sets/server-data";
import { examCountdownText, formatExamDate } from "@/components/sets/time-text";

export const metadata: Metadata = { title: "Dashboard" };

type SetRow = {
  id: string;
  title: string;
  course_id: string | null;
  exam_date: string | null;
  status: SetStatus;
  last_studied_at: string | null;
  updated_at: string;
  cards: Array<{ count: number }> | null;
};

type ProgressRow = {
  card_id: string;
  set_id: string;
  level: MasteryLevel;
  due_at: string | null;
  last_seen_at: string | null;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, user } = await requireUser();
  const courseFilter = firstParam((await searchParams).course) ?? null;

  const [profileRes, courses, sets, progress] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    getCourses(supabase),
    fetchAll<SetRow>((from, to) =>
      supabase
        .from("study_sets")
        .select("id, title, course_id, exam_date, status, last_studied_at, updated_at, cards(count)")
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    // Only studied cards have a level above 0; the rest count as not studied.
    fetchAll<ProgressRow>((from, to) =>
      supabase
        .from("card_progress")
        .select("card_id, set_id, level, due_at, last_seen_at")
        .gt("level", 0)
        .order("card_id", { ascending: true })
        .range(from, to),
    ),
  ]);

  const displayName =
    (profileRes.data as { display_name: string | null } | null)?.display_name?.trim() ||
    user.email?.split("@")[0] ||
    "";

  const now = new Date();
  const progressBySet = new Map<string, ProgressRow[]>();
  for (const p of progress) {
    const list = progressBySet.get(p.set_id);
    if (list) list.push(p);
    else progressBySet.set(p.set_id, [p]);
  }
  const courseById = new Map<string, CourseLite>(courses.map((c) => [c.id, c]));

  const cards: SetCardData[] = sets.map((s) => ({
    id: s.id,
    title: s.title,
    status: s.status,
    exam_date: s.exam_date,
    last_studied_at: s.last_studied_at,
    course: s.course_id ? (courseById.get(s.course_id) ?? null) : null,
    summary: summaryFromProgress(s.cards?.[0]?.count ?? 0, progressBySet.get(s.id) ?? [], now),
  }));

  if (cards.length === 0) {
    return (
      <PageContainer>
        <PageHeader
          title={displayName ? `Welcome, ${displayName}` : "Welcome"}
          description="Your study sets live here. Start with one exam or unit."
        />
        <FirstSetEmptyState />
      </PageContainer>
    );
  }

  // Due for review, across every set.
  const dueSets = cards
    .filter((c) => c.summary.due > 0)
    .sort((a, b) => b.summary.due - a.summary.due);
  const dueTotal = dueSets.reduce((n, c) => n + c.summary.due, 0);

  // The nearest exam that hasn't happened yet.
  const nextExam = cards
    .filter((c) => c.exam_date && daysUntil(c.exam_date, now) >= 0)
    .sort((a, b) => (a.exam_date! < b.exam_date! ? -1 : a.exam_date! > b.exam_date! ? 1 : 0))[0];

  // Course filter chips: only courses that have sets, plus "No course".
  const usedCourseIds = new Set(cards.map((c) => c.course?.id).filter(Boolean) as string[]);
  const chipCourses = courses.filter((c) => usedCourseIds.has(c.id));
  const hasUncategorized = cards.some((c) => !c.course);
  const showFilter = chipCourses.length > 0;
  const activeFilter =
    courseFilter === "none" || (courseFilter && usedCourseIds.has(courseFilter)) ? courseFilter : null;
  const visible = cards.filter((c) =>
    activeFilter === null ? true : activeFilter === "none" ? !c.course : c.course?.id === activeFilter,
  );

  return (
    <PageContainer>
      <PageHeader
        title={displayName ? `Welcome back, ${displayName}` : "Welcome back"}
        description={
          dueTotal > 0
            ? `You have ${pluralize(dueTotal, "card")} ready for review.`
            : "Nothing is waiting for review. A good time to learn something new."
        }
        actions={
          <Button asChild>
            <Link href="/sets/new">
              <Plus strokeWidth={1.75} aria-hidden />
              New set
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
        <DuePanel dueSets={dueSets} dueTotal={dueTotal} className="lg:col-span-2" />
        <NextExamPanel exam={nextExam ?? null} />
      </div>

      <section aria-labelledby="your-sets" className="mt-10 sm:mt-12">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2
            id="your-sets"
            className="font-display text-2xl font-semibold tracking-[-0.015em] text-ink"
          >
            Your sets
            <span className="ml-2 align-middle font-mono text-sm font-medium text-ink-2 tabular-nums">
              {visible.length}
            </span>
          </h2>
          {showFilter ? (
            <CourseFilter
              courses={chipCourses}
              active={activeFilter}
              showNone={hasUncategorized}
            />
          ) : null}
        </div>

        {visible.length > 0 ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
            {visible.map((set, i) => (
              <li
                key={set.id}
                className="motion-safe:animate-rise-in"
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              >
                <SetCard set={set} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            size="sm"
            headingLevel="h3"
            icon={<Layers />}
            title="No sets here yet"
            body="Nothing in this course so far. Make a set for it, or look at all your sets."
            action={
              <>
                <Button asChild variant="outline">
                  <Link href="/dashboard" scroll={false}>
                    Show all sets
                  </Link>
                </Button>
                <Button asChild>
                  <Link href="/sets/new">New set</Link>
                </Button>
              </>
            }
          />
        )}
      </section>
    </PageContainer>
  );
}

function DuePanel({
  dueSets,
  dueTotal,
  className,
}: {
  dueSets: SetCardData[];
  dueTotal: number;
  className?: string;
}) {
  const shown = dueSets.slice(0, 5);
  const more = dueSets.length - shown.length;

  return (
    <Card role="region" className={cn("p-5 sm:p-6", className)} aria-labelledby="due-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="due-title" className="text-sm font-medium text-ink-2">
            Due for review
          </h2>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-4xl font-medium tracking-tight text-ink tabular-nums">
              {dueTotal.toLocaleString("en-US")}
            </span>
            <span className="text-sm text-ink-2">
              {dueTotal === 1 ? "card" : "cards"}
              {dueSets.length > 0 ? ` across ${pluralize(dueSets.length, "set")}` : ""}
            </span>
          </p>
        </div>
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-md bg-learning-soft text-learning-strong"
        >
          <RotateCcw className="size-5" strokeWidth={1.75} />
        </span>
      </div>

      {shown.length > 0 ? (
        <ul className="mt-5 divide-y divide-line border-t border-line">
          {shown.map((set) => (
            <li key={set.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/sets/${set.id}`}
                  className="block truncate font-medium text-ink underline-offset-4 hover:underline"
                >
                  {set.title}
                </Link>
                <p className="mt-0.5 flex items-center gap-2 text-sm text-ink-2">
                  {set.course ? (
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <span
                        aria-hidden
                        className={cn("size-2 shrink-0 rounded-full", courseDot(set.course.color))}
                      />
                      <span className="truncate">{set.course.name}</span>
                    </span>
                  ) : null}
                  <span className="shrink-0 tabular-nums">{set.summary.due.toLocaleString("en-US")} due</span>
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link
                  href={`/sets/${set.id}/learn?mode=review`}
                  aria-label={`Review ${set.title}`}
                >
                  Review
                  <ArrowRight strokeWidth={1.75} aria-hidden />
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-2">
          Cards you&apos;re learning come back here a day after you see them, and mastered cards
          return on a schedule so they stick.
        </p>
      )}
      {more > 0 ? (
        <p className="mt-1 text-sm text-ink-2">
          And {pluralize(more, "more set")} with cards due.
        </p>
      ) : null}
    </Card>
  );
}

function NextExamPanel({ exam }: { exam: SetCardData | null }) {
  return (
    <Card role="region" className="p-5 sm:p-6" aria-labelledby="next-exam-title">
      <div className="flex items-start justify-between gap-4">
        <h2 id="next-exam-title" className="text-sm font-medium text-ink-2">
          Next exam
        </h2>
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-md bg-accent-soft text-accent-strong"
        >
          <CalendarClock className="size-5" strokeWidth={1.75} />
        </span>
      </div>
      {exam && exam.exam_date ? (
        <div className="mt-1 flex flex-1 flex-col">
          <p className="font-display text-2xl font-semibold tracking-[-0.015em] text-ink">
            <LiveText kind="exam" value={exam.exam_date} serverText={examCountdownText(exam.exam_date)} />
          </p>
          <p className="mt-1 text-sm text-ink-2">{formatExamDate(exam.exam_date)}</p>
          <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
            {exam.course ? <CourseChip course={exam.course} className="self-start" /> : null}
            <Link
              href={`/sets/${exam.id}`}
              className="font-medium text-ink underline-offset-4 hover:underline"
            >
              {exam.title}
            </Link>
            <p className="text-sm text-ink-2">{exam.summary.percent}% mastered so far</p>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">
          No upcoming exam dates. Add one to a set and the countdown shows up here.
        </p>
      )}
    </Card>
  );
}

function CourseFilter({
  courses,
  active,
  showNone,
}: {
  courses: CourseLite[];
  active: string | null;
  showNone: boolean;
}) {
  const chip = (selected: boolean) =>
    cn(
      "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm border px-3 text-sm font-medium whitespace-nowrap",
      "transition-colors duration-150 ease-out",
      selected
        ? "border-accent/40 bg-accent-soft text-accent-strong"
        : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink",
    );

  return (
    <nav aria-label="Filter sets by course" className="-mx-4 min-w-0 px-4 sm:mx-0 sm:px-0">
      <ul className="scrollbar-none flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:justify-end sm:overflow-visible sm:pb-0">
        <li>
          <Link
            href="/dashboard"
            scroll={false}
            aria-current={active === null ? "true" : undefined}
            className={chip(active === null)}
          >
            All
          </Link>
        </li>
        {courses.map((c) => (
          <li key={c.id}>
            <Link
              href={`/dashboard?course=${c.id}`}
              scroll={false}
              aria-current={active === c.id ? "true" : undefined}
              className={chip(active === c.id)}
            >
              <span aria-hidden className={cn("size-2 rounded-full", courseDot(c.color))} />
              {c.name}
            </Link>
          </li>
        ))}
        {showNone ? (
          <li>
            <Link
              href="/dashboard?course=none"
              scroll={false}
              aria-current={active === "none" ? "true" : undefined}
              className={chip(active === "none")}
            >
              No course
            </Link>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}

function FirstSetEmptyState() {
  const steps = [
    {
      icon: <FileUp className="size-5" strokeWidth={1.75} />,
      title: "Add your material",
      body: "Lecture slides, notes, readings or photos of handwritten pages.",
    },
    {
      icon: <Sparkles className="size-5" strokeWidth={1.75} />,
      title: "Claude builds the set",
      body: "A study guide written the way you learn, plus flashcards for every topic.",
    },
    {
      icon: <GraduationCap className="size-5" strokeWidth={1.75} />,
      title: "Study until it sticks",
      body: "Learn, practice tests and games, with progress for every topic.",
    },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="graph-paper border-b border-line px-6 py-12 text-center sm:py-16">
        <div className="mx-auto flex max-w-xl flex-col items-center gap-4">
          <span
            aria-hidden
            className="grid size-12 place-items-center rounded-md border border-line bg-surface text-accent shadow-xs"
          >
            <Layers className="size-6" strokeWidth={1.75} />
          </span>
          <h2 className="font-display text-[1.75rem] leading-tight font-semibold tracking-[-0.02em] text-ink sm:text-3xl">
            Make your first study set
          </h2>
          <p className="max-w-[48ch] text-[0.9375rem] leading-relaxed text-ink-2">
            One set per exam or unit works best, like &ldquo;Exam 2: Metabolism&rdquo;. It takes a
            minute to set up, and a few more for Claude to build.
          </p>
          <Button asChild size="lg" className="mt-2">
            <Link href="/sets/new">
              <Plus strokeWidth={1.75} aria-hidden />
              Make your first study set
            </Link>
          </Button>
        </div>
      </div>
      <ol className="grid gap-px bg-line sm:grid-cols-3">
        {steps.map((step, i) => (
          <li key={step.title} className="flex gap-3 bg-surface p-5 sm:flex-col sm:p-6">
            <span
              aria-hidden
              className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-2 text-ink-2"
            >
              {step.icon}
            </span>
            <div>
              <p className="font-medium text-ink">
                <span className="mr-1.5 font-mono text-sm text-ink-2 tabular-nums">{i + 1}.</span>
                {step.title}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
