"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FileQuestion, PlugZap, Sparkles, Timer } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { startJob } from "@/lib/jobs/start-job";
import { isJobActive, useLatestJob } from "@/lib/jobs/use-job";
import {
  examHistory,
  pickExamQuestions,
  type ExamAttemptDetail,
  type ExamSource,
} from "@/lib/learn/exam";
import type { Topic } from "@/lib/types";
import { cn, formatRelative, pluralize } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { JobProgress } from "@/components/jobs/job-progress";
import {
  EXAM_ATTEMPT_COLUMNS,
  EXAM_QUESTION_COLUMNS,
  cleanQuestions,
  type AttemptRow,
  type ExamQuestionRow,
} from "@/components/test/test-data";
import { ExamRunner } from "@/components/test/exam-runner";
import { ExamResults } from "@/components/test/exam-results";
import type { SaveState } from "@/components/test/quick-test-results";

type CountChoice = "5" | "10" | "20" | "all";
type TimerChoice = "off" | "60" | "90";
type GenCount = "5" | "10" | "15" | "20" | "30" | "40";
type Difficulty = "mixed" | "easy" | "medium" | "hard";

type RunningExam = {
  questions: ExamQuestionRow[];
  timeLimitSec: number | null;
  startedAt: number;
};

type FinishedExam = RunningExam & {
  answers: Array<number | null>;
  elapsedMs: number;
  timeUp: boolean;
};

/** AI exam-style questions: the bank, writing more, and taking an exam. */
export function ExamPractice({
  setId,
  topics,
  initialQuestions,
  initialAttempts,
  aiReady,
  active,
}: {
  setId: string;
  topics: Topic[];
  initialQuestions: ExamQuestionRow[];
  initialAttempts: AttemptRow[];
  aiReady: boolean;
  /** False while another tab is showing (turns keyboard shortcuts off). */
  active: boolean;
}) {
  const id = useId();
  const [questions, setQuestions] = useState(initialQuestions);
  const [attempts, setAttempts] = useState(initialAttempts);
  const [running, setRunning] = useState<RunningExam | null>(null);
  const [finished, setFinished] = useState<FinishedExam | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // Exam options
  const [count, setCount] = useState<CountChoice>("10");
  const [source, setSource] = useState<ExamSource>("unseen");
  const [timer, setTimer] = useState<TimerChoice>("off");

  // Generate options
  const [genCount, setGenCount] = useState<GenCount>("15");
  const [difficulty, setDifficulty] = useState<Difficulty>("mixed");
  const [genTopics, setGenTopics] = useState<string[] | null>(null); // null = all
  const [starting, setStarting] = useState(false);
  const [startedJobId, setStartedJobId] = useState<string | null>(null);

  const { job } = useLatestJob(setId, "exam_questions");
  const watchedJob = useRef<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const history = useMemo(() => examHistory(attempts), [attempts]);
  const unseenCount = questions.filter((q) => !history.get(q.id)?.seen).length;
  const missedCount = questions.filter((q) => history.get(q.id)?.lastCorrect === false).length;
  const pool = source === "missed" ? missedCount : questions.length;

  const countOptions = useMemo(() => {
    const opts: Array<{ value: CountChoice; label: string }> = [];
    for (const n of [5, 10, 20] as const) if (pool > n) opts.push({ value: String(n) as CountChoice, label: String(n) });
    opts.push({ value: "all", label: `All ${pool}` });
    return opts;
  }, [pool]);
  const effectiveCount: CountChoice = countOptions.some((o) => o.value === count) ? count : "all";
  const examSize = effectiveCount === "all" ? pool : Math.min(Number(effectiveCount), pool);
  const effectiveSource: ExamSource = source === "missed" && missedCount === 0 ? "unseen" : source;

  const byTopic = useMemo(() => {
    const counts = new Map<string, number>();
    for (const q of questions) {
      const key = q.topic_id && topics.some((t) => t.id === q.topic_id) ? q.topic_id : "other";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const list = topics
      .map((t) => ({ id: t.id, title: t.title || "Untitled topic", count: counts.get(t.id) ?? 0 }))
      .filter((t) => t.count > 0);
    const other = counts.get("other") ?? 0;
    if (other > 0) list.push({ id: "other", title: "Other", count: other });
    return list;
  }, [questions, topics]);
  const maxTopicCount = Math.max(1, ...byTopic.map((t) => t.count));
  const byDifficulty = useMemo(() => {
    const d = { easy: 0, medium: 0, hard: 0 };
    for (const q of questions) d[q.difficulty] += 1;
    return d;
  }, [questions]);
  const lastExam = attempts.length > 0 ? attempts[attempts.length - 1] : null;

  async function reloadQuestions() {
    const supabase = createClient();
    const rows: unknown[] = [];
    for (let page = 0; page < 20; page += 1) {
      const from = page * 1000;
      const { data, error } = await supabase
        .from("exam_questions")
        .select(EXAM_QUESTION_COLUMNS)
        .eq("set_id", setId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + 999);
      if (error) {
        toast.error("Couldn't load the new questions", { description: "Reload the page to see them." });
        return;
      }
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    const next = cleanQuestions(rows);
    const added = next.length - questions.length;
    setQuestions(next);
    if (added > 0) toast.success(`Added ${pluralize(added, "question")} to your bank`);
  }

  // When a question job finishes, load the new questions.
  useEffect(() => {
    if (!job) return;
    if (isJobActive(job)) {
      watchedJob.current = job.id;
      return;
    }
    if (job.status === "done" && watchedJob.current === job.id) {
      watchedJob.current = null;
      void reloadQuestions();
    }
    // reloadQuestions only depends on setId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job]);

  const jobActive = isJobActive(job);
  const showJob = job !== null && (jobActive || job.id === startedJobId);

  async function generate() {
    if (starting || jobActive) return;
    setStarting(true);
    try {
      const options: Record<string, unknown> = { count: Number(genCount), difficulty };
      if (genTopics && genTopics.length > 0) options.topicIds = genTopics;
      const jobId = await startJob(setId, "exam_questions", options);
      watchedJob.current = jobId;
      setStartedJobId(jobId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start writing questions.");
    } finally {
      setStarting(false);
    }
  }

  function begin(list: ExamQuestionRow[], timeLimitPerQ: number | null) {
    if (list.length === 0) return;
    setFinished(null);
    setSaveState("idle");
    setRunning({
      questions: list,
      timeLimitSec: timeLimitPerQ ? timeLimitPerQ * list.length : null,
      startedAt: Date.now(),
    });
  }

  function startExam() {
    const picked = pickExamQuestions(questions, history, {
      count: effectiveCount === "all" ? "all" : Number(effectiveCount),
      source: effectiveSource,
    });
    begin(picked, timer === "off" ? null : Number(timer));
  }

  async function save(exam: FinishedExam) {
    setSaveState("saving");
    const details: ExamAttemptDetail[] = exam.questions.map((q, i) => ({
      questionId: q.id,
      chosen: exam.answers[i] ?? null,
      correct: exam.answers[i] === q.answer_index,
    }));
    const score = details.filter((d) => d.correct).length;
    try {
      const { data, error } = await createClient()
        .from("test_attempts")
        .insert({ set_id: setId, kind: "exam", score, total: details.length, details })
        .select(EXAM_ATTEMPT_COLUMNS)
        .single();
      if (error || !data) throw new Error(error?.message ?? "No row");
      setAttempts((prev) => [...prev, data as AttemptRow]);
      setSaveState("saved");
    } catch {
      // Keep the history in this tab even if the save failed.
      setAttempts((prev) => [
        ...prev,
        {
          id: `local-${prev.length}`,
          kind: "exam",
          score,
          total: details.length,
          details,
          created_at: new Date().toISOString(),
        },
      ]);
      setSaveState("error");
      toast.error("Couldn't save this exam", { description: "Your score is shown, but it isn't in your history." });
    }
  }

  function submit(answers: Array<number | null>, elapsedMs: number, timeUp: boolean) {
    if (!running) return;
    const done: FinishedExam = { ...running, answers, elapsedMs, timeUp };
    setRunning(null);
    setFinished(done);
    if (timeUp) toast("Time's up", { description: "Your exam was submitted." });
    void save(done);
  }

  useEffect(() => {
    if (running || finished) topRef.current?.scrollIntoView({ block: "start" });
  }, [running, finished]);

  if (running) {
    return (
      <div ref={topRef} className="scroll-mt-[calc(var(--header-h)+1rem)]">
        <ExamRunner
          key={running.startedAt}
          questions={running.questions}
          topics={topics}
          timeLimitSec={running.timeLimitSec}
          startedAt={running.startedAt}
          active={active}
          onSubmit={submit}
          onCancel={() => setRunning(null)}
        />
      </div>
    );
  }

  if (finished) {
    const missedHere = finished.questions.filter((q, i) => finished.answers[i] !== q.answer_index);
    return (
      <div ref={topRef} className="scroll-mt-[calc(var(--header-h)+1rem)]">
        <ExamResults
          setId={setId}
          topics={topics}
          questions={finished.questions}
          answers={finished.answers}
          elapsedMs={finished.elapsedMs}
          timeUp={finished.timeUp}
          saveState={saveState}
          onNewExam={() => setFinished(null)}
          onRetakeMissed={
            missedHere.length > 0
              ? () => begin(missedHere, finished.timeLimitSec ? finished.timeLimitSec / finished.questions.length : null)
              : null
          }
        />
      </div>
    );
  }

  // ----- Home: take an exam, the bank, write more -----
  const takeCard =
    questions.length > 0 ? (
      <Card variant="flat" className="overflow-hidden">
        <div className="flex flex-col gap-6 px-5 py-6 sm:px-7">
          <div>
            <h3 className="font-display text-xl font-semibold tracking-[-0.01em] text-ink">Take a practice exam</h3>
            <p className="mt-1 text-sm text-ink-2">
              One question at a time, like the real thing. Explanations come at the end.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <span id={`${id}-source`} className="text-sm font-medium text-ink">
              Which questions
            </span>
            <Segmented
              aria-labelledby={`${id}-source`}
              value={effectiveSource}
              onValueChange={setSource}
              fullWidth
              options={[
                { value: "unseen", label: "New first" },
                { value: "all", label: "Any" },
                { value: "missed", label: `Missed (${missedCount})`, disabled: missedCount === 0 },
              ]}
            />
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <span id={`${id}-count`} className="text-sm font-medium text-ink">
                How many
              </span>
              <Segmented
                aria-labelledby={`${id}-count`}
                value={effectiveCount}
                onValueChange={setCount}
                options={countOptions}
                fullWidth
              />
            </div>
            <div className="flex flex-col gap-2">
              <span id={`${id}-timer`} className="text-sm font-medium text-ink">
                Timer
              </span>
              <Segmented
                aria-labelledby={`${id}-timer`}
                value={timer}
                onValueChange={setTimer}
                fullWidth
                options={[
                  { value: "off", label: "Off" },
                  { value: "60", label: "60 s each" },
                  { value: "90", label: "90 s each" },
                ]}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-line bg-surface-2/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <p className="flex items-center gap-2 text-sm text-ink-2">
            {pluralize(examSize, "question")}
            {timer !== "off" ? (
              <>
                <span aria-hidden>·</span>
                <Timer className="size-4" strokeWidth={1.75} aria-hidden />
                {Math.ceil((examSize * Number(timer)) / 60)} min
              </>
            ) : null}
          </p>
          <Button size="lg" onClick={startExam} disabled={examSize === 0}>
            Start exam
          </Button>
        </div>
      </Card>
    ) : (
      <Card variant="flat" className="items-center px-6 py-10 text-center sm:py-12">
        <span aria-hidden className="grid size-12 place-items-center rounded-md bg-surface-2 text-ink-2">
          <FileQuestion className="size-6" strokeWidth={1.75} />
        </span>
        <h3 className="mt-4 font-display text-xl font-semibold tracking-[-0.01em] text-ink">No exam questions yet</h3>
        <p className="mt-2 max-w-[46ch] text-[0.9375rem] leading-relaxed text-ink-2">
          {aiReady
            ? "Have Claude write a batch from your material. Each one is exam style, with an explanation for every choice."
            : "Exam questions are written by Claude, and Claude isn't connected to this site yet."}
        </p>
      </Card>
    );

  const generateCard = aiReady ? (
    <Card variant="flat" className="overflow-hidden">
      <div className="flex flex-col gap-6 px-5 py-6 sm:px-7">
        <div>
          <h3 className="flex items-center gap-2 font-display text-xl font-semibold tracking-[-0.01em] text-ink">
            <Sparkles className="size-[18px] text-accent-strong" strokeWidth={1.75} aria-hidden />
            Write more questions
          </h3>
          <p className="mt-1 text-sm text-ink-2">
            Claude writes MCAT and course-exam style questions from your material: short vignettes and
            experiments, one best answer, and why each choice is right or wrong.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <span id={`${id}-gen-count`} className="text-sm font-medium text-ink">
            How many
          </span>
          <Segmented
            aria-labelledby={`${id}-gen-count`}
            value={genCount}
            onValueChange={setGenCount}
            fullWidth
            size="sm"
            disabled={jobActive || starting}
            options={(["5", "10", "15", "20", "30", "40"] as const).map((n) => ({ value: n, label: n }))}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span id={`${id}-gen-diff`} className="text-sm font-medium text-ink">
            Difficulty
          </span>
          <Segmented
            aria-labelledby={`${id}-gen-diff`}
            value={difficulty}
            onValueChange={setDifficulty}
            fullWidth
            size="sm"
            disabled={jobActive || starting}
            options={[
              { value: "mixed", label: "Mixed" },
              { value: "easy", label: "Easy" },
              { value: "medium", label: "Medium" },
              { value: "hard", label: "Hard" },
            ]}
          />
        </div>
        {topics.length > 1 ? (
          <fieldset disabled={jobActive || starting}>
            <legend className="mb-2 text-sm font-medium text-ink">Topics</legend>
            <ul className="flex max-h-60 flex-col overflow-y-auto rounded-md border border-line bg-surface-2/50 p-1.5">
              <li>
                <label className="flex cursor-pointer items-center gap-3 rounded-sm px-2.5 py-2 hover:bg-surface has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
                  <input
                    type="checkbox"
                    checked={genTopics === null}
                    onChange={(e) => {
                      if (e.target.checked) setGenTopics(null);
                    }}
                    className="size-4 shrink-0 accent-accent"
                  />
                  <span className="text-sm font-medium text-ink">All topics</span>
                </label>
              </li>
              {topics.map((t) => {
                const checked = genTopics === null || genTopics.includes(t.id);
                return (
                  <li key={t.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-sm px-2.5 py-2 hover:bg-surface has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setGenTopics((cur) => {
                            const base = cur ?? topics.map((x) => x.id);
                            const next = e.target.checked
                              ? [...new Set([...base, t.id])]
                              : base.filter((x) => x !== t.id);
                            if (next.length === 0) return cur;
                            return next.length === topics.length ? null : next;
                          });
                        }}
                        className="size-4 shrink-0 accent-accent"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{t.title || "Untitled topic"}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ) : null}

        {showJob ? <JobProgress job={job} /> : null}
      </div>
      <div className="flex flex-col gap-3 border-t border-line bg-surface-2/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <p className="text-sm text-ink-2">
          {jobActive ? "You can leave this page. It keeps going." : "Usually takes a minute or two."}
        </p>
        <Button onClick={generate} loading={starting} disabled={jobActive}>
          {starting ? null : <Sparkles strokeWidth={1.75} aria-hidden />}
          {jobActive ? "Writing questions" : `Write ${genCount} questions`}
        </Button>
      </div>
    </Card>
  ) : (
    <Card variant="sunken" className="px-5 py-5 sm:px-6">
      <div className="flex items-start gap-3">
        <PlugZap className="mt-0.5 size-5 shrink-0 text-ink-2" strokeWidth={1.75} aria-hidden />
        <div>
          <h3 className="text-[0.9375rem] font-semibold text-ink">Claude is not connected yet</h3>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">
            Exam questions are written by Claude. Add <code className="font-mono text-[0.8125rem]">ANTHROPIC_API_KEY</code>{" "}
            to the site&apos;s environment variables to turn this on.
            {questions.length > 0 ? " The questions you already have still work." : null}
          </p>
        </div>
      </div>
    </Card>
  );

  const bankCard =
    questions.length > 0 ? (
      <Card variant="flat" className="px-5 py-5 sm:px-6">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[0.9375rem] font-semibold text-ink">Question bank</h3>
          <p className="font-mono text-sm font-medium text-ink tabular-nums">{questions.length}</p>
        </div>
        <p className="mt-1 text-sm text-ink-2">
          {unseenCount > 0 ? `${unseenCount} not tried yet` : "You've tried every question"}
          {missedCount > 0 ? `, ${missedCount} missed last time` : ""}.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {byDifficulty.easy > 0 ? <Badge variant="outline">{byDifficulty.easy} easy</Badge> : null}
          {byDifficulty.medium > 0 ? <Badge variant="outline">{byDifficulty.medium} medium</Badge> : null}
          {byDifficulty.hard > 0 ? <Badge variant="outline">{byDifficulty.hard} hard</Badge> : null}
        </div>
        {byTopic.length > 0 ? (
          <ul className="mt-5 flex flex-col gap-3">
            {byTopic.map((t) => (
              <li key={t.id} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-ink">{t.title}</span>
                  <span className="font-mono text-xs text-ink-2 tabular-nums">{t.count}</span>
                </div>
                <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-line/70">
                  <div
                    className="h-full rounded-full bg-ink-3"
                    style={{ width: `${Math.max(4, (100 * t.count) / maxTopicCount)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {lastExam ? (
          <p className="mt-5 border-t border-line pt-4 text-sm text-ink-2">
            Last exam:{" "}
            <span className="font-mono font-medium text-ink tabular-nums">
              {lastExam.score}/{lastExam.total}
            </span>{" "}
            <span suppressHydrationWarning>{formatRelative(lastExam.created_at)}</span>
          </p>
        ) : null}
      </Card>
    ) : null;

  return (
    <div className={cn("grid gap-5", bankCard && "lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start")}>
      <div className="flex min-w-0 flex-col gap-5">
        {takeCard}
        {generateCard}
      </div>
      {bankCard ? <div className="min-w-0 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)]">{bankCard}</div> : null}
    </div>
  );
}
