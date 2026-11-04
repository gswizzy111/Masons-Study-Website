"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ClipboardCheck, Layers } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { recordAnswer } from "@/lib/learn/progress";
import { OTHER_TOPIC_ID, topicKeyOf, type AnswerWith } from "@/lib/learn/engine";
import {
  TEST_TYPE_LABELS,
  TEST_TYPE_ORDER,
  buildQuickTest,
  gradeQuickTest,
  isAnswered,
  itemCount,
  type GradedItem,
  type TestQuestion,
  type TestQuestionType,
  type TestResponses,
} from "@/lib/learn/quick-test";
import type { SetStatus, Topic } from "@/lib/types";
import { cn, pluralize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Segmented } from "@/components/ui/segmented";
import type { LearnCardRow } from "@/components/learn/learn-data";
import { ChoiceTile } from "@/components/test/choice-tile";
import { QuickTestResults, type SaveState } from "@/components/test/quick-test-results";
import { runLimited } from "@/components/test/run-limited";

const TYPE_HINTS: Record<TestQuestionType, string> = {
  tf: "Does this definition fit the term?",
  mc: "Pick the right answer from four.",
  matching: "Match a few definitions to their terms.",
  written: "Type the answer yourself.",
};

type CountChoice = "10" | "20" | "all";

type Phase = "setup" | "taking" | "results";

/** Quick practice test from the set's cards. */
export function QuickTest({
  setId,
  setStatus,
  topics,
  cards,
}: {
  setId: string;
  setStatus: SetStatus;
  topics: Topic[];
  cards: LearnCardRow[];
}) {
  const id = useId();
  const topicIds = useMemo(() => new Set(topics.map((t) => t.id)), [topics]);

  const topicChoices = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of cards) {
      const k = topicKeyOf(c, topicIds);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const list = topics
      .filter((t) => (counts.get(t.id) ?? 0) > 0)
      .map((t) => ({ id: t.id, title: t.title || "Untitled topic", count: counts.get(t.id) ?? 0 }));
    const other = counts.get(OTHER_TOPIC_ID) ?? 0;
    if (other > 0) list.push({ id: OTHER_TOPIC_ID, title: "Other cards", count: other });
    return list;
  }, [cards, topics, topicIds]);

  const [phase, setPhase] = useState<Phase>("setup");
  const [count, setCount] = useState<CountChoice>(() => (cards.length > 20 ? "20" : "all"));
  const [types, setTypes] = useState<TestQuestionType[]>(["tf", "mc", "matching", "written"]);
  const [answerWith, setAnswerWith] = useState<AnswerWith>("term");
  const [selectedTopics, setSelectedTopics] = useState<string[] | null>(null); // null = all

  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [responses, setResponses] = useState<TestResponses>({});
  const [graded, setGraded] = useState<GradedItem[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const scopeCards = useMemo(() => {
    if (!selectedTopics) return cards;
    const keys = new Set(selectedTopics);
    return cards.filter((c) => keys.has(topicKeyOf(c, topicIds)));
  }, [cards, selectedTopics, topicIds]);

  const countOptions = useMemo(() => {
    const n = scopeCards.length;
    const opts: Array<{ value: CountChoice; label: string; disabled?: boolean }> = [];
    if (n > 10) opts.push({ value: "10", label: "10" });
    if (n > 20) opts.push({ value: "20", label: "20" });
    opts.push({ value: "all", label: `All ${n}` });
    return opts;
  }, [scopeCards.length]);
  const effectiveCount: CountChoice = countOptions.some((o) => o.value === count) ? count : "all";
  const plannedTotal = effectiveCount === "all" ? scopeCards.length : Math.min(Number(effectiveCount), scopeCards.length);

  // Bring the top of the test or the results into view when the phase changes.
  useEffect(() => {
    if (phase === "setup") return;
    topRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
    topRef.current?.focus({ preventScroll: true });
  }, [phase]);

  if (cards.length === 0) {
    return (
      <EmptyState
        icon={<Layers />}
        title="No cards to test yet"
        body={
          setStatus === "building"
            ? "Your set is still being built. Cards show up as Claude writes them."
            : "Add cards, or build the set from your material, to make a practice test."
        }
        action={
          <Button asChild>
            <Link href={`/sets/${setId}/cards`}>Add cards</Link>
          </Button>
        }
      />
    );
  }

  const start = (e?: FormEvent) => {
    e?.preventDefault();
    if (types.length === 0 || scopeCards.length === 0) return;
    const built = buildQuickTest(scopeCards, cards, {
      count: effectiveCount === "all" ? "all" : Number(effectiveCount),
      types,
      topicKeys: selectedTopics ? new Set(selectedTopics) : null,
      answerWith,
    });
    setQuestions(built);
    setResponses({});
    setGraded([]);
    setSaveState("idle");
    setPhase("taking");
  };

  const retake = () => {
    setResponses({});
    setGraded([]);
    setSaveState("idle");
    setPhase("taking");
  };

  const totalItems = questions.reduce((n, q) => n + itemCount(q), 0);
  const answeredItems = questions.reduce((n, q) => {
    if (q.type !== "matching") return n + (isAnswered(q, responses) ? 1 : 0);
    const picks = (responses[q.key] as Record<string, string> | undefined) ?? {};
    return n + q.items.filter((i) => Boolean(picks[i.cardId])).length;
  }, 0);

  async function save(items: GradedItem[]) {
    setSaveState("saving");
    let failed = false;
    try {
      const supabase = createClient();
      const score = items.filter((i) => i.correct).length;
      const { error } = await supabase.from("test_attempts").insert({
        set_id: setId,
        kind: "cards",
        score,
        total: items.length,
        details: items.map((i) => ({
          cardId: i.cardId,
          type: i.type,
          correct: i.correct,
          given: i.given.slice(0, 500),
        })),
      });
      if (error) failed = true;
      const results = await runLimited(items, 4, (i) =>
        recordAnswer(supabase, { cardId: i.cardId, setId, correct: i.correct, mode: "test" }),
      );
      if (results.some((r) => r === null)) failed = true;
    } catch {
      failed = true;
    }
    setSaveState(failed ? "error" : "saved");
    if (failed) {
      toast.error("Couldn't save all of your results", {
        description: "Your score is below. Check your connection; some cards may not have updated.",
      });
    }
  }

  const submit = () => {
    setConfirmOpen(false);
    const items = gradeQuickTest(questions, responses);
    if (items.length === 0) return;
    setGraded(items);
    setPhase("results");
    void save(items);
  };

  const trySubmit = () => {
    if (answeredItems < totalItems) setConfirmOpen(true);
    else submit();
  };

  if (phase === "results") {
    return (
      <div ref={topRef} tabIndex={-1} className="scroll-mt-[calc(var(--header-h)+1rem)] outline-none">
        <QuickTestResults
          setId={setId}
          questions={questions}
          graded={graded}
          saveState={saveState}
          onRetake={retake}
          onNewTest={() => setPhase("setup")}
        />
      </div>
    );
  }

  if (phase === "taking") {
    const layout = questions.reduce<Array<{ q: TestQuestion; first: number; heading: string | null }>>(
      (acc, q) => {
        const prev = acc[acc.length - 1];
        const first = prev ? prev.first + itemCount(prev.q) : 1;
        const heading = !prev || prev.q.type !== q.type ? TEST_TYPE_LABELS[q.type] : null;
        acc.push({ q, first, heading });
        return acc;
      },
      [],
    );
    return (
      <div ref={topRef} tabIndex={-1} className="scroll-mt-[calc(var(--header-h)+1rem)] outline-none">
        <div className="sticky top-[var(--header-h)] z-20 -mx-4 mb-6 border-b border-line bg-bg px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink-2" aria-live="polite">
                <span className="font-mono font-medium text-ink tabular-nums">{answeredItems}</span> of{" "}
                <span className="font-mono tabular-nums">{totalItems}</span> answered
              </p>
              <Progress
                value={answeredItems}
                max={Math.max(1, totalItems)}
                size="xs"
                label="Answered"
                valueText={`${answeredItems} of ${totalItems} answered`}
                className="mt-1.5"
              />
            </div>
            <Button variant="ghost" size="sm" onClick={() => setPhase("setup")} className="hidden sm:inline-flex">
              Cancel
            </Button>
            <Button size="sm" onClick={trySubmit}>
              <ClipboardCheck strokeWidth={1.75} aria-hidden />
              Submit
            </Button>
          </div>
        </div>

        <ol className="flex flex-col gap-4">
          {layout.map(({ q, first, heading }) => {
            return (
              <li key={q.key} className="flex flex-col gap-4">
                {heading ? (
                  <h3 className="mt-4 text-xs font-semibold tracking-[0.06em] text-ink-2 uppercase first:mt-0">
                    {heading}
                  </h3>
                ) : null}
                <QuestionBlock
                  question={q}
                  number={first}
                  value={responses[q.key]}
                  onChange={(v) => setResponses((r) => ({ ...r, [q.key]: v }))}
                />
              </li>
            );
          })}
        </ol>

        <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" onClick={() => setPhase("setup")}>
            Cancel test
          </Button>
          <Button size="lg" onClick={trySubmit}>
            Submit test
          </Button>
        </div>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent
            size="sm"
            title="Submit with blanks?"
            description={`${pluralize(totalItems - answeredItems, "question")} ${
              totalItems - answeredItems === 1 ? "has" : "have"
            } no answer. Blanks count as wrong.`}
          >
            <DialogFooter className="mt-6">
              <DialogClose asChild>
                <Button variant="ghost">Keep going</Button>
              </DialogClose>
              <Button onClick={submit}>Submit anyway</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ----- Setup -----
  const toggleType = (t: TestQuestionType, on: boolean) => {
    setTypes((cur) => {
      const next = on ? [...new Set([...cur, t])] : cur.filter((x) => x !== t);
      return next.length === 0 ? cur : TEST_TYPE_ORDER.filter((x) => next.includes(x));
    });
  };
  const allTopics = selectedTopics === null;
  const toggleTopic = (topicId: string, on: boolean) => {
    setSelectedTopics((cur) => {
      const base = cur ?? topicChoices.map((t) => t.id);
      const next = on ? [...new Set([...base, topicId])] : base.filter((x) => x !== topicId);
      if (next.length === 0) return cur;
      return next.length === topicChoices.length ? null : next;
    });
  };

  return (
    <Card variant="flat" className="overflow-hidden">
      <form onSubmit={start} noValidate>
        <div className="flex flex-col gap-7 px-5 py-6 sm:px-7 sm:py-7">
          <div>
            <h3 className="font-display text-xl font-semibold tracking-[-0.01em] text-ink">Set up your test</h3>
            <p className="mt-1 text-sm text-ink-2">
              One page of questions. You see your score and every answer when you submit.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <span id={`${id}-count`} className="text-sm font-medium text-ink">
                Questions
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
              <span id={`${id}-answer`} className="text-sm font-medium text-ink">
                Answer with
              </span>
              <Segmented
                aria-labelledby={`${id}-answer`}
                value={answerWith}
                onValueChange={setAnswerWith}
                options={[
                  { value: "term", label: "Term" },
                  { value: "definition", label: "Definition" },
                ]}
                fullWidth
              />
            </div>
          </div>

          <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-2.5 text-sm font-medium text-ink">Question types</legend>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {TEST_TYPE_ORDER.map((t) => {
                const checked = types.includes(t);
                const only = checked && types.length === 1;
                return (
                  <label
                    key={t}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-md border px-3.5 py-3 transition-colors duration-150",
                      "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
                      checked ? "border-accent/60 bg-accent-soft/50" : "border-line bg-surface hover:bg-surface-2",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggleType(t, e.target.checked)}
                      aria-describedby={only ? `${id}-types-note` : undefined}
                      className="mt-0.5 size-4 shrink-0 accent-accent"
                    />
                    <span className="min-w-0">
                      <span className="block text-[0.9375rem] font-medium text-ink">{TEST_TYPE_LABELS[t]}</span>
                      <span className="block text-[0.8125rem] leading-snug text-ink-2">{TYPE_HINTS[t]}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {types.length === 1 ? (
              <p id={`${id}-types-note`} className="text-[0.8125rem] text-ink-2">
                Keep at least one type.
              </p>
            ) : null}
          </fieldset>

          {topicChoices.length > 1 ? (
            <fieldset className="flex flex-col">
              <legend className="mb-2.5 text-sm font-medium text-ink">Topics</legend>
              <div className="rounded-md border border-line bg-surface-2/50 p-1.5">
                <label className="flex cursor-pointer items-center gap-3 rounded-sm px-2.5 py-2 hover:bg-surface has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
                  <input
                    type="checkbox"
                    checked={allTopics}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedTopics(null);
                    }}
                    className="size-4 shrink-0 accent-accent"
                  />
                  <span className="flex-1 text-sm font-medium text-ink">All topics</span>
                  <span className="font-mono text-xs text-ink-2 tabular-nums">{cards.length}</span>
                </label>
                <div className="my-1 border-t border-line" />
                <ul className="flex max-h-72 flex-col overflow-y-auto">
                  {topicChoices.map((t) => {
                    const checked = allTopics || (selectedTopics ?? []).includes(t.id);
                    return (
                      <li key={t.id}>
                        <label className="flex cursor-pointer items-center gap-3 rounded-sm px-2.5 py-2 hover:bg-surface has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => toggleTopic(t.id, e.target.checked)}
                            className="size-4 shrink-0 accent-accent"
                          />
                          <span className="min-w-0 flex-1 truncate text-sm text-ink">{t.title}</span>
                          <span className="font-mono text-xs text-ink-2 tabular-nums">{t.count}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </fieldset>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 border-t border-line bg-surface-2/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <p className="text-sm text-ink-2">
            {pluralize(plannedTotal, "question")} from {allTopics ? "all topics" : pluralize(selectedTopics?.length ?? 0, "topic")}
          </p>
          <Button type="submit" size="lg" disabled={plannedTotal === 0 || types.length === 0}>
            Start test
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// One question while taking the test
// ---------------------------------------------------------------------------

type ResponseValue = TestResponses[string];

/** One question while taking the test (exported for previews). */
export function QuestionBlock({
  question: q,
  number,
  value,
  onChange,
}: {
  question: TestQuestion;
  number: number;
  value: ResponseValue;
  onChange: (value: ResponseValue) => void;
}) {
  const id = useId();
  const numberBadge = (n: number | string) => (
    <span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-sm bg-surface-2 px-1.5 font-mono text-xs font-medium text-ink-2 tabular-nums">
      {n}
    </span>
  );

  if (q.type === "tf") {
    return (
      <Card variant="flat" className="px-4 py-5 sm:px-6">
        <fieldset>
          <legend className="flex w-full items-start gap-3">
            {numberBadge(number)}
            <span className="min-w-0 flex-1">
              <span className="block font-display text-lg leading-snug font-semibold break-words text-ink">{q.term}</span>
              <span className="mt-1.5 block text-[0.9375rem] leading-relaxed break-words whitespace-pre-line text-ink">
                {q.shown}
              </span>
              <span className="mt-2 block text-sm text-ink-2">Is this the right definition?</span>
            </span>
          </legend>
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:max-w-sm">
            <ChoiceTile name={`${id}-tf`} value="true" marker="T" checked={value === true} onSelect={() => onChange(true)}>
              True
            </ChoiceTile>
            <ChoiceTile name={`${id}-tf`} value="false" marker="F" checked={value === false} onSelect={() => onChange(false)}>
              False
            </ChoiceTile>
          </div>
        </fieldset>
      </Card>
    );
  }

  if (q.type === "mc") {
    const long = q.options.some((o) => o.length > 60);
    return (
      <Card variant="flat" className="px-4 py-5 sm:px-6">
        <fieldset>
          <legend className="flex w-full items-start gap-3">
            {numberBadge(number)}
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium tracking-[0.06em] text-ink-2 uppercase">
                {q.promptSide === "term" ? "Term" : "Definition"}
              </span>
              <span
                className={cn(
                  "mt-1 block break-words whitespace-pre-line text-ink",
                  q.promptSide === "term"
                    ? "font-display text-lg leading-snug font-semibold"
                    : "text-[0.9375rem] leading-relaxed",
                )}
              >
                {q.prompt}
              </span>
            </span>
          </legend>
          <div className={cn("mt-4 grid gap-2.5", !long && "sm:grid-cols-2")}>
            {q.options.map((opt, i) => (
              <ChoiceTile
                key={`${i}-${opt}`}
                name={`${id}-mc`}
                value={String(i)}
                marker={String.fromCharCode(65 + i)}
                checked={value === i}
                onSelect={() => onChange(i)}
              >
                {opt}
              </ChoiceTile>
            ))}
          </div>
        </fieldset>
      </Card>
    );
  }

  if (q.type === "written") {
    const inputId = `${id}-written`;
    return (
      <Card variant="flat" className="px-4 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          {numberBadge(number)}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium tracking-[0.06em] text-ink-2 uppercase">
              {q.promptSide === "term" ? "Term" : "Definition"}
            </p>
            <p
              id={`${inputId}-prompt`}
              className={cn(
                "mt-1 break-words whitespace-pre-line text-ink",
                q.promptSide === "term"
                  ? "font-display text-lg leading-snug font-semibold"
                  : "text-[0.9375rem] leading-relaxed",
              )}
            >
              {q.prompt}
            </p>
            <label htmlFor={inputId} className="mt-4 mb-2 block text-sm font-medium text-ink-2">
              Your answer ({q.promptSide === "term" ? "definition" : "term"})
            </label>
            <Input
              id={inputId}
              aria-describedby={`${inputId}-prompt`}
              value={typeof value === "string" ? value : ""}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                // Enter moves on instead of submitting anything.
                if (e.key === "Enter") e.preventDefault();
              }}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
        </div>
      </Card>
    );
  }

  // Matching
  const picks = (value && typeof value === "object" ? value : {}) as Record<string, string>;
  return (
    <Card variant="flat" className="px-4 py-5 sm:px-6">
      <fieldset>
        <legend className="flex w-full items-start gap-3">
          {numberBadge(q.items.length > 1 ? `${number}-${number + q.items.length - 1}` : number)}
          <span className="min-w-0 flex-1 text-[0.9375rem] font-medium text-ink">
            Match each definition with its term.
          </span>
        </legend>
        <div className="mt-4 rounded-md border border-line bg-surface-2/50 px-3.5 py-3">
          <p className="text-xs font-medium tracking-[0.06em] text-ink-2 uppercase">Terms</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {q.choices.map((c, i) => (
              <li
                key={c.cardId}
                className="inline-flex items-center gap-1.5 rounded-sm border border-line bg-surface px-2 py-1 text-sm text-ink"
              >
                <span className="font-mono text-xs text-ink-2">{String.fromCharCode(65 + i)}</span>
                <span className="break-words">{c.term}</span>
              </li>
            ))}
          </ul>
        </div>
        <ol className="mt-3 flex flex-col divide-y divide-line">
          {q.items.map((item, i) => {
            const selectId = `${id}-m-${i}`;
            return (
              <li key={item.cardId} className="flex flex-col gap-2.5 py-3 sm:flex-row sm:items-center sm:gap-4">
                <label
                  htmlFor={selectId}
                  className="flex min-w-0 flex-1 items-start gap-3 text-[0.9375rem] leading-relaxed text-ink"
                >
                  <span className="mt-0.5 font-mono text-xs text-ink-2 tabular-nums">{number + i}.</span>
                  <span className="min-w-0 break-words whitespace-pre-line">{item.definition}</span>
                </label>
                <select
                  id={selectId}
                  value={picks[item.cardId] ?? ""}
                  onChange={(e) => onChange({ ...picks, [item.cardId]: e.target.value })}
                  className={cn(
                    "h-10 w-full shrink-0 appearance-auto rounded-md border border-line bg-surface px-2.5 text-base text-ink shadow-xs sm:w-56 sm:text-[0.9375rem]",
                    "hover:border-line-strong focus-visible:border-accent",
                  )}
                >
                  <option value="">Choose a term</option>
                  {q.choices.map((c, j) => (
                    <option key={c.cardId} value={c.cardId}>
                      {String.fromCharCode(65 + j)}. {c.term.length > 60 ? `${c.term.slice(0, 57)}...` : c.term}
                    </option>
                  ))}
                </select>
              </li>
            );
          })}
        </ol>
      </fieldset>
    </Card>
  );
}
