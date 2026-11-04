import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Brain,
  ClipboardCheck,
  Gamepad2,
  GalleryVerticalEnd,
  PencilLine,
  RotateCcw,
  SquarePlay,
  Timer,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { summarize, summarizeByTopic, type MasterySummary } from "@/lib/mastery";
import type { CardProgress, MasteryLevel, SetStatus } from "@/lib/types";
import { cn, pluralize } from "@/lib/utils";
import { PageContainer } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MasteryBar } from "@/components/ui/mastery-bar";
import { ProgressRing } from "@/components/ui/progress-ring";
import { BuildPanel } from "@/components/sets/build-panel";
import { LiveText } from "@/components/sets/live-text";
import { MaterialsPanel, type MaterialRow } from "@/components/sets/materials-panel";
import { SetJobProvider } from "@/components/sets/set-job-context";
import { fetchAll, getSet } from "@/components/sets/server-data";
import { relativeText } from "@/components/sets/time-text";

type CardRow = { id: string; topic_id: string | null };
type ProgressRow = Pick<CardProgress, "card_id" | "due_at" | "last_seen_at"> & { level: MasteryLevel };
type AttemptRow = { id: string; kind: "cards" | "exam"; score: number; total: number; created_at: string };
type ScoreRow = { score: number; created_at: string };

export default async function SetOverviewPage({ params }: { params: Promise<{ setId: string }> }) {
  const { setId } = await params;
  const { supabase, user } = await requireUser();
  const set = await getSet(setId);
  if (!set) notFound();

  const [cards, progress, materialsRes, attemptsRes, meteorRes, matchRes] = await Promise.all([
    fetchAll<CardRow>((from, to) =>
      supabase
        .from("cards")
        .select("id, topic_id")
        .eq("set_id", set.id)
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAll<ProgressRow>((from, to) =>
      supabase
        .from("card_progress")
        .select("card_id, level, due_at, last_seen_at")
        .eq("set_id", set.id)
        .order("card_id", { ascending: true })
        .range(from, to),
    ),
    supabase
      .from("materials")
      .select("id, kind, file_name, mime_type, size_bytes, storage_path, char_count, status, error, created_at")
      .eq("set_id", set.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("test_attempts")
      .select("id, kind, score, total, created_at")
      .eq("set_id", set.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("game_scores")
      .select("score, created_at")
      .eq("set_id", set.id)
      .eq("game", "meteor")
      .order("score", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("game_scores")
      .select("score, created_at")
      .eq("set_id", set.id)
      .eq("game", "match")
      .order("score", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const now = new Date();
  const summary = summarize(cards, progress, now);
  const byTopic = summarizeByTopic(set.topics, cards, progress, now);
  const materials = (materialsRes.data ?? []) as MaterialRow[];
  const attempts = (attemptsRes.data ?? []) as AttemptRow[];
  const meteorBest = (meteorRes.data as ScoreRow | null) ?? null;
  const matchBest = (matchRes.data as ScoreRow | null) ?? null;
  const built = set.topics.length > 0;
  const base = `/sets/${set.id}`;

  return (
    <SetJobProvider setId={set.id} setStatus={set.status}>
      <PageContainer className="flex flex-col gap-6 pt-6 sm:pt-8">
        <BuildPanel userId={user.id} materialCount={materials.length} built={built} />

        <div className="@container">
          <div className="grid gap-6 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            <div className="@container flex min-w-0 flex-col gap-6">
              <ProgressCard summary={summary} base={base} status={set.status} />
              <QuickActions base={base} />
              <TopicsCard byTopic={byTopic} base={base} status={set.status} />
            </div>
            <div className="flex min-w-0 flex-col gap-6">
              <MaterialsPanel materials={materials} userId={user.id} built={built} />
              <ScoresCard base={base} attempts={attempts} meteorBest={meteorBest} matchBest={matchBest} />
            </div>
          </div>
        </div>
      </PageContainer>
    </SetJobProvider>
  );
}

function ProgressCard({
  summary,
  base,
  status,
}: {
  summary: MasterySummary;
  base: string;
  status: SetStatus;
}) {
  const stats = [
    { label: "Learned", value: summary.mastered, dot: "bg-mastered" },
    { label: "Still learning", value: summary.learning, dot: "bg-learning" },
    { label: "Not studied", value: summary.not_studied, dot: "bg-not-studied" },
  ];
  const fresh = summary.total > 0 && summary.not_studied === summary.total;

  return (
    <Card role="region" aria-labelledby="progress-title" className="p-5 sm:p-6">
      <h2 id="progress-title" className="sr-only">
        Your progress
      </h2>
      {summary.total === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="font-display text-xl font-semibold text-ink">No cards yet</p>
          <p className="max-w-[60ch] text-[0.9375rem] leading-relaxed text-ink-2">
            {status === "building"
              ? "Cards show up here as Claude writes each topic. Your progress fills in as you study."
              : "Once the set is built, or you add cards on the Cards tab, your progress shows up here."}
          </p>
          <div className="mt-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`${base}/cards`}>
                <PencilLine strokeWidth={1.75} aria-hidden />
                Add cards by hand
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col items-center gap-6 @md:flex-row @md:items-center">
            <ProgressRing
              value={summary.percent}
              size={132}
              stroke={10}
              label="Learned"
              valueText={`${summary.percent}% learned`}
            >
              <span className="flex flex-col items-center leading-none">
                <span className="font-mono text-3xl font-medium tracking-tight text-ink tabular-nums">
                  {summary.percent}%
                </span>
                <span className="mt-1.5 text-xs text-ink-2">learned</span>
              </span>
            </ProgressRing>
            <div className="flex w-full min-w-0 flex-1 flex-col gap-4">
              <dl className="grid grid-cols-3 gap-2 sm:gap-4">
                {stats.map((s) => (
                  <div key={s.label} className="min-w-0">
                    <dt className="flex items-center gap-1.5 text-[0.8125rem] text-ink-2 sm:text-sm">
                      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", s.dot)} />
                      <span className="truncate">{s.label}</span>
                    </dt>
                    <dd className="mt-1 font-mono text-2xl font-medium text-ink tabular-nums">
                      {s.value.toLocaleString("en-US")}
                    </dd>
                  </div>
                ))}
              </dl>
              <MasteryBar summary={summary} showLegend={false} size="lg" label="Progress" />
              <p className="text-sm text-ink-2">{pluralize(summary.total, "card")} in this set</p>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-[0.9375rem] text-ink">
              <RotateCcw
                className={cn("size-4 shrink-0", summary.due > 0 ? "text-learning" : "text-ink-3")}
                strokeWidth={1.75}
                aria-hidden
              />
              {summary.due > 0 ? (
                <span>
                  <span className="font-medium tabular-nums">{summary.due.toLocaleString("en-US")}</span>{" "}
                  {summary.due === 1 ? "card is" : "cards are"} due for review
                </span>
              ) : (
                <span className="text-ink-2">Nothing due for review right now</span>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              {summary.due > 0 ? (
                <Button asChild>
                  <Link href={`${base}/learn?mode=review`}>
                    Review now
                    <ArrowRight strokeWidth={1.75} aria-hidden />
                  </Link>
                </Button>
              ) : null}
              <Button asChild variant={summary.due > 0 ? "outline" : "primary"}>
                <Link href={`${base}/learn`}>{fresh ? "Start learning" : "Keep learning"}</Link>
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

const QUICK_ACTIONS: ReadonlyArray<{ path: string; label: string; body: string; icon: LucideIcon }> = [
  { path: "guide", label: "Guide", body: "Read the study guide", icon: BookOpen },
  { path: "flashcards", label: "Flashcards", body: "Flip through cards", icon: GalleryVerticalEnd },
  { path: "learn", label: "Learn", body: "Practice until it sticks", icon: Brain },
  { path: "test", label: "Test", body: "Practice test with a score", icon: ClipboardCheck },
  { path: "games", label: "Games", body: "Meteor and Match", icon: Gamepad2 },
  { path: "videos", label: "Videos", body: "Picked for each topic", icon: SquarePlay },
  { path: "cards", label: "Cards", body: "Edit, add or star cards", icon: PencilLine },
];

function QuickActions({ base }: { base: string }) {
  return (
    <nav aria-label="Study this set">
      <ul className="grid grid-cols-2 gap-3 @xl:grid-cols-4">
        {QUICK_ACTIONS.map(({ path, label, body, icon: Icon }) => (
          <li key={path}>
            <Link
              href={`${base}/${path}`}
              className={cn(
                "group flex h-full flex-col gap-2 rounded-lg border border-line bg-surface p-4",
                "transition-[border-color,box-shadow] duration-200 ease-out hover:border-line-strong hover:shadow-md",
              )}
            >
              <span
                aria-hidden
                className="grid size-9 place-items-center rounded-md bg-surface-2 text-ink-2 transition-colors duration-200 group-hover:bg-accent-soft group-hover:text-accent-strong"
              >
                <Icon className="size-[18px]" strokeWidth={1.75} />
              </span>
              <span className="font-medium text-ink">{label}</span>
              <span className="text-[0.8125rem] leading-snug text-ink-2">{body}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function TopicsCard({
  byTopic,
  base,
  status,
}: {
  byTopic: ReturnType<typeof summarizeByTopic>;
  base: string;
  status: SetStatus;
}) {
  const realTopics = byTopic.filter((t) => t.topic.id !== "other").length;

  return (
    <Card variant="flat" role="region" aria-labelledby="topics-title">
      <div className="px-5 pt-5 pb-4 sm:px-6">
        <h2 id="topics-title" className="font-display text-lg font-semibold text-ink">
          Topics
        </h2>
        <p className="text-sm text-ink-2">
          {realTopics > 0
            ? `${pluralize(realTopics, "topic")}, in the order to study them`
            : status === "building"
              ? "Topics appear here once Claude has outlined your material."
              : "Topics appear here after the set is built."}
        </p>
      </div>
      {byTopic.length > 0 ? (
        <ol className="divide-y divide-line border-t border-line">
          {byTopic.map(({ topic, summary }, i) => {
            const isOther = topic.id === "other";
            return (
              <li
                key={topic.id}
                className="flex flex-col gap-3 px-5 py-4 sm:px-6 @2xl:flex-row @2xl:items-center @2xl:gap-6"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="flex items-baseline gap-2.5 font-medium text-ink">
                    <span aria-hidden className="w-5 shrink-0 font-mono text-sm text-ink-3 tabular-nums">
                      {isOther ? "" : String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 break-words">{topic.title}</span>
                  </h3>
                  {topic.summary ? (
                    <p className="mt-1 line-clamp-2 pl-7.5 text-sm leading-relaxed text-ink-2">{topic.summary}</p>
                  ) : null}
                  <div className="mt-2.5 flex items-center gap-3 pl-7.5">
                    <MasteryBar
                      summary={summary}
                      showLegend={false}
                      size="sm"
                      label={`${topic.title} progress`}
                      className="max-w-xs flex-1"
                    />
                    <span className="shrink-0 text-xs text-ink-2 tabular-nums">
                      {summary.total > 0
                        ? `${summary.mastered}/${summary.total} learned`
                        : "No cards yet"}
                    </span>
                  </div>
                </div>
                {!isOther ? (
                  <div className="flex shrink-0 gap-2 pl-7.5 @2xl:pl-0">
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={`${base}/learn?topic=${encodeURIComponent(topic.id)}`}
                        aria-label={`Learn this topic: ${topic.title}`}
                      >
                        Learn this topic
                      </Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                      <Link
                        href={`${base}/guide#${encodeURIComponent(topic.id)}`}
                        aria-label={`Read: ${topic.title}`}
                      >
                        Read
                      </Link>
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </Card>
  );
}

function formatMs(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function ScoresCard({
  base,
  attempts,
  meteorBest,
  matchBest,
}: {
  base: string;
  attempts: AttemptRow[];
  meteorBest: ScoreRow | null;
  matchBest: ScoreRow | null;
}) {
  return (
    <Card variant="flat" role="region" aria-labelledby="scores-title">
      <div className="px-5 pt-5 pb-4 sm:px-6">
        <h2 id="scores-title" className="font-display text-lg font-semibold text-ink">
          Recent scores
        </h2>
      </div>

      <div className="border-t border-line px-5 py-4 sm:px-6">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-ink">
          <ClipboardCheck className="size-4 text-ink-2" strokeWidth={1.75} aria-hidden />
          Practice tests
        </h3>
        {attempts.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {attempts.map((a) => {
              const pct = Math.round((100 * a.score) / Math.max(1, a.total));
              return (
                <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-ink-2">
                    {a.kind === "exam" ? "Exam-style" : "From cards"}
                    <span aria-hidden> · </span>
                    <LiveText kind="relative" value={a.created_at} serverText={relativeText(a.created_at)} />
                  </span>
                  <span className="shrink-0 font-mono text-ink tabular-nums">
                    {a.score}/{a.total}
                    <span
                      className={cn(
                        "ml-2 inline-block w-11 text-right",
                        pct >= 80 ? "text-accent-strong" : pct >= 60 ? "text-learning-strong" : "text-ink-2",
                      )}
                    >
                      {pct}%
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-ink-2">
            No tests yet.{" "}
            <Link href={`${base}/test`} className="font-medium text-accent-strong underline-offset-4 hover:underline">
              Take a practice test
            </Link>
          </p>
        )}
      </div>

      <div className="border-t border-line px-5 py-4 sm:px-6">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-ink">
          <Trophy className="size-4 text-ink-2" strokeWidth={1.75} aria-hidden />
          Game bests
        </h3>
        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-md bg-surface-2 px-3 py-2.5">
            <dt className="text-[0.8125rem] text-ink-2">Meteor</dt>
            <dd className="mt-0.5 font-mono text-lg font-medium text-ink tabular-nums">
              {meteorBest ? meteorBest.score.toLocaleString("en-US") : <span className="font-sans text-[0.9375rem] font-normal text-ink-2">None yet</span>}
              {meteorBest ? <span className="ml-1 font-sans text-xs text-ink-2">points</span> : null}
            </dd>
          </div>
          <div className="rounded-md bg-surface-2 px-3 py-2.5">
            <dt className="flex items-center gap-1 text-[0.8125rem] text-ink-2">
              Match
              <Timer className="size-3.5" strokeWidth={1.75} aria-hidden />
            </dt>
            <dd className="mt-0.5 font-mono text-lg font-medium text-ink tabular-nums">
              {matchBest ? formatMs(matchBest.score) : <span className="font-sans text-[0.9375rem] font-normal text-ink-2">None yet</span>}
            </dd>
          </div>
        </dl>
        <Link
          href={`${base}/games`}
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent-strong underline-offset-4 hover:underline"
        >
          Play a game
          <ArrowRight className="size-3.5" strokeWidth={1.75} aria-hidden />
        </Link>
      </div>
    </Card>
  );
}
