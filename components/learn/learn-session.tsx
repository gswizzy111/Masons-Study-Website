"use client";

import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Layers, Star } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { isDue, summarize } from "@/lib/mastery";
import { applyAnswer, recordAnswer, type AnswerMode } from "@/lib/learn/progress";
import { gradeAnswer } from "@/lib/learn/grade";
import {
  cardsInScope,
  makeQuestion,
  MAX_RETRIES_PER_ROUND,
  nextReviewDue,
  OTHER_TOPIC_ID,
  requeue,
  ROUND_SIZE,
  selectRoundCards,
  topicKeyOf,
  type LearnOptions,
  type LearnQuestion,
  type Rng,
} from "@/lib/learn/engine";
import { seededRng } from "@/lib/learn/random";
import type { CardProgress, MasteryLevel, SetStatus, Topic } from "@/lib/types";
import { formatRelative, pluralize } from "@/lib/utils";
import { useOptionalChat } from "@/components/chat/chat-context";
import { PageContainer } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Kbd } from "@/components/ui/kbd";
import { MasteryBar } from "@/components/ui/mastery-bar";
import { Progress } from "@/components/ui/progress";
import { learnSearch, scopeLabel, type LearnCardRow, type LearnProgressRow } from "@/components/learn/learn-data";
import { LearnOptionsPopover, type ScopeChoice } from "@/components/learn/learn-options";
import { AUTO_ADVANCE_MS, LearnQuestionCard, type LearnFeedback } from "@/components/learn/learn-question";
import { LearnFinished, RoundSummary, type SummaryRow } from "@/components/learn/learn-summary";

// ---------------------------------------------------------------------------
// Auto-advance preference (per browser; storage may be unavailable)
// ---------------------------------------------------------------------------

const AUTO_KEY = "masons-study:learn-auto-advance";
const AUTO_EVENT = "masons-study:learn-auto-advance";
let memoryAuto: boolean | null = null;

function readAuto(): boolean {
  if (memoryAuto !== null) return memoryAuto;
  try {
    return window.localStorage.getItem(AUTO_KEY) !== "0";
  } catch {
    return true;
  }
}

function writeAuto(value: boolean): void {
  memoryAuto = value;
  try {
    window.localStorage.setItem(AUTO_KEY, value ? "1" : "0");
  } catch {
    // Kept in memory for this tab.
  }
  window.dispatchEvent(new Event(AUTO_EVENT));
}

function subscribeAuto(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === AUTO_KEY) {
      memoryAuto = null;
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(AUTO_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(AUTO_EVENT, onChange);
  };
}

// ---------------------------------------------------------------------------
// Session state (pure helpers)
// ---------------------------------------------------------------------------

type ProgressMap = ReadonlyMap<string, LearnProgressRow>;

type Round = {
  number: number;
  /** "Practice anyway": mastered cards, studied early. */
  practice: boolean;
  cardIds: string[];
  /** Cards still to ask after the current one. */
  queue: string[];
  current: LearnQuestion;
  retries: Record<string, number>;
  /** Result of each card's first try this round. */
  firstTry: Record<string, boolean>;
  startLevels: Record<string, MasteryLevel>;
  /** Cards finished this round (answered right, or out of retries). */
  done: string[];
};

type SessionFeedback = LearnFeedback & { firstAttempt: boolean };

type State = {
  options: LearnOptions;
  /** Review scope: the cards that were due when it started. */
  reviewIds: string[] | null;
  progress: ProgressMap;
  nowMs: number;
  phase: "question" | "feedback" | "summary" | "finished" | "empty";
  round: Round | null;
  roundsDone: number;
  feedback: SessionFeedback | null;
  /**
   * A written answer that waits until Continue: a miss (until "I was
   * right") or an answer accepted with a typo (until "I was wrong").
   */
  pending: PendingAnswer | null;
};

type PendingAnswer = { cardId: string; mode: AnswerMode; correct: boolean };

type Ctx = {
  cards: readonly LearnCardRow[];
  byId: ReadonlyMap<string, LearnCardRow>;
  topicIds: ReadonlySet<string>;
  /** The set's exam date: reviews are kept before it. */
  examDate: string | null;
};

function levelOf(p: { level: number } | null | undefined): MasteryLevel {
  const n = Number(p?.level ?? 0);
  return (n >= 3 ? 3 : n >= 2 ? 2 : n >= 1 ? 1 : 0) as MasteryLevel;
}

function timeMs(value: string | null | undefined): number {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function dueIds(cards: readonly LearnCardRow[], progress: ProgressMap, now: Date): string[] {
  return cards.filter((c) => isDue(progress.get(c.id), now)).map((c) => c.id);
}

/** The cards the mastery bar and counts describe. */
function scopeCards(s: Pick<State, "options" | "reviewIds" | "progress" | "nowMs">, ctx: Ctx): LearnCardRow[] {
  if (s.options.scope === "review") {
    const ids = new Set(s.reviewIds ?? []);
    return ctx.cards.filter((c) => ids.has(c.id));
  }
  return cardsInScope(ctx.cards, s.progress, s.options, { topicIds: ctx.topicIds, now: new Date(s.nowMs) });
}

/**
 * The highest level the chosen question types can reach: multiple choice
 * alone stops at familiar, so familiar cards are done there.
 */
function levelGoal(options: Pick<LearnOptions, "types">): MasteryLevel {
  return options.types === "mc" ? 2 : 3;
}

/** The cards a new round can pick from. Review: still due, or missed this session. */
function roundCandidates(s: Pick<State, "options" | "reviewIds" | "progress" | "nowMs">, ctx: Ctx): LearnCardRow[] {
  const scope = scopeCards(s, ctx);
  const now = new Date(s.nowMs);
  if (s.options.scope !== "review") {
    if (levelGoal(s.options) === 3) return scope;
    // Multiple choice only: a familiar card has nothing left to gain until it is due.
    return scope.filter((c) => {
      const p = s.progress.get(c.id);
      return levelOf(p) < 2 || isDue(p, now);
    });
  }
  return scope.filter((c) => {
    const p = s.progress.get(c.id);
    return isDue(p, now) || p?.last_result === "wrong";
  });
}

function withAnswer(
  progress: ProgressMap,
  cardId: string,
  correct: boolean,
  mode: AnswerMode,
  nowMs: number,
  examDate: string | null,
): Map<string, LearnProgressRow> {
  const next = applyAnswer(progress.get(cardId), correct, mode, new Date(nowMs), { examDate });
  const map = new Map(progress);
  map.set(cardId, { ...next, card_id: cardId });
  return map;
}

type RoundBase = Omit<State, "phase" | "round" | "feedback" | "pending">;

function startRound(base: RoundBase, ctx: Ctx, rng: Rng, practice = false): State {
  const empty = { round: null, feedback: null, pending: null };
  const now = new Date(base.nowMs);
  const scope = scopeCards(base, ctx);
  if (scope.length === 0) {
    return { ...base, ...empty, phase: base.options.scope === "review" ? "finished" : "empty" };
  }

  let picked: LearnCardRow[];
  if (practice) {
    picked = [...scope]
      .map((c, i) => ({ c, i, t: timeMs(base.progress.get(c.id)?.last_seen_at) }))
      .sort((a, b) => a.t - b.t || a.i - b.i)
      .slice(0, ROUND_SIZE)
      .map((x) => x.c);
  } else {
    picked = selectRoundCards(roundCandidates(base, ctx), base.progress, { now });
  }
  if (picked.length === 0) return { ...base, ...empty, phase: "finished" };

  const current = makeQuestion(picked[0], base.progress, base.options, ctx.cards, { rng, now });
  return {
    ...base,
    ...empty,
    phase: "question",
    round: {
      number: base.roundsDone + 1,
      practice,
      cardIds: picked.map((c) => c.id),
      queue: picked.slice(1).map((c) => c.id),
      current,
      retries: {},
      firstTry: {},
      startLevels: Object.fromEntries(picked.map((c) => [c.id, levelOf(base.progress.get(c.id))])),
      done: [],
    },
  };
}

function advance(s: State, ctx: Ctx, rng: Rng): State {
  const round = s.round;
  if (!round) return s;
  if (round.queue.length === 0) {
    return { ...s, phase: "summary", feedback: null, pending: null, roundsDone: s.roundsDone + 1 };
  }
  const [nextId, ...rest] = round.queue;
  const card = ctx.byId.get(nextId);
  if (!card) return advance({ ...s, round: { ...round, queue: rest } }, ctx, rng);
  const current = makeQuestion(card, s.progress, s.options, ctx.cards, { rng, now: new Date(s.nowMs) });
  return { ...s, phase: "question", feedback: null, pending: null, round: { ...round, queue: rest, current } };
}

function modeFor(q: LearnQuestion, options: LearnOptions): AnswerMode {
  if (q.kind === "mc") return "mc";
  return options.scope === "review" || q.due ? "review" : "written";
}

type AnswerResult = Pick<LearnFeedback, "correct" | "given" | "chosenIndex" | "close" | "typo" | "dontKnow">;

function applyResult(
  s: State,
  q: LearnQuestion,
  result: AnswerResult,
  mode: AnswerMode,
  nowMs: number,
  commitNow: boolean,
  examDate: string | null,
): State {
  const round = s.round;
  if (!round || round.current.key !== q.key || s.phase !== "question") return s;
  const before = levelOf(s.progress.get(q.cardId));
  const projected = withAnswer(s.progress, q.cardId, result.correct, mode, nowMs, examDate);
  const progress = commitNow ? projected : s.progress;
  const after = levelOf(projected.get(q.cardId));

  const firstAttempt = !(q.cardId in round.firstTry);
  const firstTry = firstAttempt ? { ...round.firstTry, [q.cardId]: result.correct } : round.firstTry;
  let { queue, retries, done } = round;
  let comesBack = false;
  if (result.correct) {
    done = done.includes(q.cardId) ? done : [...done, q.cardId];
  } else {
    const used = retries[q.cardId] ?? 0;
    if (used < MAX_RETRIES_PER_ROUND) {
      queue = requeue(queue, q.cardId);
      retries = { ...retries, [q.cardId]: used + 1 };
      comesBack = true;
    } else if (!done.includes(q.cardId)) {
      done = [...done, q.cardId];
    }
  }

  return {
    ...s,
    progress,
    nowMs,
    phase: "feedback",
    round: { ...round, queue, retries, firstTry, done },
    feedback: {
      ...result,
      questionKey: q.key,
      mastered: result.correct && before < 3 && after === 3,
      comesBack,
      overridden: false,
      firstAttempt,
    },
    pending: commitNow ? null : { cardId: q.cardId, mode, correct: result.correct },
  };
}

function explainPrompt(card: LearnCardRow, q: LearnQuestion, fb: LearnFeedback): string {
  const lines = [
    "I got this card wrong in Learn. Help me understand it.",
    "",
    `Term: ${card.term}`,
    `Definition: ${card.definition}`,
  ];
  if (fb.dontKnow || !fb.given.trim()) lines.push("I didn't know the answer.");
  else lines.push(`My answer: ${fb.given}`);
  lines.push(
    "",
    fb.dontKnow || !fb.given.trim()
      ? `Explain the ${q.promptSide === "term" ? "definition" : "term"} and give me a way to remember it.`
      : "Why is my answer wrong, how is it different from the right one, and how can I remember the right one?",
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Props = {
  setId: string;
  setStatus: SetStatus;
  topics: Topic[];
  cards: LearnCardRow[];
  progress: LearnProgressRow[];
  initialOptions: LearnOptions;
  aiReady: boolean;
  /** Seeds the first round so the server and browser render the same one. */
  seed: number;
  nowIso: string;
  /** The set's exam date (YYYY-MM-DD), so reviews land before it. */
  examDate?: string | null;
};

const ANSWER_FIELDS = [
  "level",
  "streak",
  "times_seen",
  "times_correct",
  "times_wrong",
  "interval_days",
  "ease",
  "due_at",
  "last_result",
  "last_seen_at",
] as const;

function rowFrom(saved: CardProgress): LearnProgressRow {
  const row = { card_id: saved.card_id } as LearnProgressRow;
  for (const f of ANSWER_FIELDS) (row as Record<string, unknown>)[f] = saved[f];
  return row;
}

export function LearnSession({
  setId,
  setStatus,
  topics,
  cards,
  progress: initialProgress,
  initialOptions,
  aiReady,
  seed,
  nowIso,
  examDate = null,
}: Props) {
  const pathname = usePathname();
  const chat = useOptionalChat();
  const reduce = useReducedMotion();

  const ctx = useMemo<Ctx>(
    () => ({
      cards,
      byId: new Map(cards.map((c) => [c.id, c])),
      topicIds: new Set(topics.map((t) => t.id)),
      examDate,
    }),
    [cards, topics, examDate],
  );

  const [state, setState] = useState<State>(() => {
    const progress = new Map(initialProgress.map((p) => [p.card_id, p]));
    const nowMs = new Date(nowIso).getTime();
    const now = new Date(nowMs);
    const base: RoundBase = {
      options: initialOptions,
      reviewIds: initialOptions.scope === "review" ? dueIds(cards, progress, now) : null,
      progress,
      nowMs,
      roundsDone: 0,
    };
    const initCtx: Ctx = {
      cards,
      byId: new Map(cards.map((c) => [c.id, c])),
      topicIds: new Set(topics.map((t) => t.id)),
      examDate,
    };
    // A fresh seeded generator each call, so a double-invoked initializer
    // (Strict Mode) and the server render all build the same first round.
    return startRound(base, initCtx, seededRng(seed));
  });

  const autoAdvance = useSyncExternalStore(subscribeAuto, readAuto, () => true);

  // Guards against double answers from key repeat or fast double clicks.
  const answeredKey = useRef<string | null>(null);
  const continuedKey = useRef<string | null>(null);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const warnedSave = useRef(false);

  const rng: Rng = Math.random;

  function save(cardId: string, correct: boolean, mode: AnswerMode) {
    const answeredAt = Date.now();
    saveChain.current = saveChain.current.then(async () => {
      let saved: CardProgress | null = null;
      try {
        saved = await recordAnswer(createClient(), { cardId, setId, correct, mode, examDate });
      } catch {
        saved = null;
      }
      if (saved) {
        const row = rowFrom(saved);
        setState((s) => {
          const local = s.progress.get(cardId);
          // Keep a newer local answer if one landed while this was saving.
          if (local && timeMs(local.last_seen_at) > Math.max(timeMs(row.last_seen_at), answeredAt)) return s;
          const map = new Map(s.progress);
          map.set(cardId, row);
          return { ...s, progress: map };
        });
      } else if (!warnedSave.current) {
        warnedSave.current = true;
        toast.error("Couldn't save your progress", {
          description: "Check your connection. You can keep going, but recent answers may not be saved.",
        });
      }
    });
  }

  function answer(q: LearnQuestion, result: AnswerResult, defer = false) {
    if (state.phase !== "question" || state.round?.current.key !== q.key) return;
    if (answeredKey.current === q.key) return;
    answeredKey.current = q.key;
    const mode = modeFor(q, state.options);
    const nowMs = Date.now();
    if (!defer) save(q.cardId, result.correct, mode);
    setState((s) => applyResult(s, q, result, mode, nowMs, !defer, examDate));
  }

  function choose(index: number) {
    const q = state.round?.current;
    if (!q || q.kind !== "mc" || index < 0 || index >= q.options.length) return;
    answer(q, {
      correct: index === q.answerIndex,
      given: q.options[index] ?? "",
      chosenIndex: index,
      close: false,
      typo: false,
      dontKnow: false,
    });
  }

  function submitWritten(text: string) {
    const q = state.round?.current;
    if (!q || q.kind !== "written") return;
    // The other cards' answers: typing one of those is a mix-up, not a typo.
    const side = q.promptSide === "definition" ? "term" : "definition";
    const others = ctx.cards.filter((c) => c.id !== q.cardId).map((c) => (side === "term" ? c.term : c.definition));
    const grade = gradeAnswer(text, q.answer, { others, side });
    const typo = grade.correct && grade.similarity < 1;
    answer(
      q,
      {
        correct: grade.correct,
        given: text.trim(),
        chosenIndex: null,
        close: grade.close,
        typo,
        dontKnow: false,
      },
      // A miss waits for "I was right", a typo for "I was wrong".
      !grade.correct || typo,
    );
  }

  function dontKnow() {
    const q = state.round?.current;
    if (!q) return;
    answer(q, { correct: false, given: "", chosenIndex: null, close: false, typo: false, dontKnow: true });
  }

  function continueNext() {
    const fb = state.feedback;
    if (state.phase !== "feedback" || !fb) return;
    if (continuedKey.current === fb.questionKey) return;
    continuedKey.current = fb.questionKey;
    const pending = state.pending;
    const nowMs = Date.now();
    if (pending) save(pending.cardId, pending.correct, pending.mode);
    setState((s) => {
      if (s.phase !== "feedback" || s.feedback?.questionKey !== fb.questionKey) return s;
      const p = s.pending;
      const committed = p
        ? { ...s, nowMs, progress: withAnswer(s.progress, p.cardId, p.correct, p.mode, nowMs, examDate) }
        : { ...s, nowMs };
      return advance(committed, ctx, rng);
    });
  }

  /** "I was right" on a written miss: it counts as correct. */
  function overrideCorrect() {
    const fb = state.feedback;
    const pending = state.pending;
    if (state.phase !== "feedback" || !fb || !pending || pending.correct) return;
    if (continuedKey.current === fb.questionKey) return;
    continuedKey.current = fb.questionKey;
    const nowMs = Date.now();
    save(pending.cardId, true, pending.mode);
    setState((s) => {
      const round = s.round;
      const p = s.pending;
      if (!round || s.phase !== "feedback" || s.feedback?.questionKey !== fb.questionKey || !p || p.correct) return s;
      const cardId = p.cardId;
      const used = round.retries[cardId] ?? 0;
      const fixed: State = {
        ...s,
        nowMs,
        progress: withAnswer(s.progress, cardId, true, p.mode, nowMs, examDate),
        pending: null,
        round: {
          ...round,
          queue: fb.comesBack ? round.queue.filter((id) => id !== cardId) : round.queue,
          retries: fb.comesBack ? { ...round.retries, [cardId]: Math.max(0, used - 1) } : round.retries,
          firstTry: fb.firstAttempt ? { ...round.firstTry, [cardId]: true } : round.firstTry,
          done: round.done.includes(cardId) ? round.done : [...round.done, cardId],
        },
      };
      return advance(fixed, ctx, rng);
    });
  }

  /** "I was wrong" on an answer accepted with a typo: it counts as a miss and comes back. */
  function overrideWrong() {
    const fb = state.feedback;
    const pending = state.pending;
    if (state.phase !== "feedback" || !fb || !pending || !pending.correct) return;
    if (continuedKey.current === fb.questionKey) return;
    continuedKey.current = fb.questionKey;
    const nowMs = Date.now();
    save(pending.cardId, false, pending.mode);
    setState((s) => {
      const round = s.round;
      const p = s.pending;
      if (!round || s.phase !== "feedback" || s.feedback?.questionKey !== fb.questionKey || !p || !p.correct) return s;
      const cardId = p.cardId;
      const used = round.retries[cardId] ?? 0;
      const again = used < MAX_RETRIES_PER_ROUND;
      const done = round.done.filter((id) => id !== cardId);
      const fixed: State = {
        ...s,
        nowMs,
        progress: withAnswer(s.progress, cardId, false, p.mode, nowMs, examDate),
        pending: null,
        round: {
          ...round,
          queue: again ? requeue(round.queue, cardId) : round.queue,
          retries: again ? { ...round.retries, [cardId]: used + 1 } : round.retries,
          firstTry: fb.firstAttempt ? { ...round.firstTry, [cardId]: false } : round.firstTry,
          done: again ? done : [...done, cardId],
        },
      };
      return advance(fixed, ctx, rng);
    });
  }

  /** Saves a written answer that is still waiting (before leaving the round). */
  function flushPending() {
    const pending = state.pending;
    if (pending) save(pending.cardId, pending.correct, pending.mode);
    return pending;
  }

  function restart(options: LearnOptions, practice = false) {
    const pending = flushPending();
    const nowMs = Date.now();
    answeredKey.current = null;
    continuedKey.current = null;
    setState((s) => {
      const progress = pending
        ? withAnswer(s.progress, pending.cardId, pending.correct, pending.mode, nowMs, examDate)
        : s.progress;
      const now = new Date(nowMs);
      const sameReview = options.scope === "review" && s.options.scope === "review" && s.reviewIds;
      return startRound(
        {
          options,
          reviewIds: options.scope === "review" ? (sameReview ? s.reviewIds : dueIds(ctx.cards, progress, now)) : null,
          progress,
          nowMs,
          roundsDone: s.options === options ? s.roundsDone : 0,
        },
        ctx,
        rng,
        practice,
      );
    });
  }

  function changeOptions(next: LearnOptions) {
    restart(next);
    try {
      window.history.replaceState(null, "", `${pathname}${learnSearch(next)}`);
    } catch {
      // The address just won't reflect the options.
    }
  }

  function nextRound() {
    if (state.phase !== "summary") return;
    restart(state.options);
  }

  function explain() {
    const q = state.round?.current;
    const fb = state.feedback;
    const card = q ? ctx.byId.get(q.cardId) : undefined;
    if (!chat || !q || !fb || !card) return;
    chat.ask(explainPrompt(card, q, fb));
  }

  // Keyboard: 1-4 choose, Enter continues. Typing in fields, menus and the
  // chat panel is left alone.
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target instanceof Element ? e.target : null;
    if (
      target?.closest(
        'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]',
      )
    ) {
      return;
    }
    const q = state.round?.current;
    if (state.phase === "question" && q?.kind === "mc") {
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= q.options.length) {
        e.preventDefault();
        choose(n - 1);
      }
      return;
    }
    if (e.key !== "Enter") return;
    if (target?.closest('button, a[href], [role="button"], [role="radio"], [role="tab"], summary')) return;
    if (state.phase === "feedback") {
      e.preventDefault();
      continueNext();
    } else if (state.phase === "summary") {
      e.preventDefault();
      nextRound();
    }
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKeyDown(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Move on by itself after a correct answer (if turned on). Not after a
  // typo: the right spelling and "I was wrong" stay up until Continue.
  const onAutoAdvance = useEffectEvent(() => {
    if (state.phase === "feedback" && state.feedback?.correct && !state.feedback.typo) continueNext();
  });
  const feedbackForTimer =
    state.phase === "feedback" && state.feedback?.correct && !state.feedback.typo ? state.feedback : null;
  useEffect(() => {
    if (!feedbackForTimer || !autoAdvance) return;
    const timer = window.setTimeout(() => onAutoAdvance(), AUTO_ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [feedbackForTimer, autoAdvance]);

  // If they leave mid-feedback, still save a written miss.
  const onLeave = useEffectEvent(() => {
    flushPending();
  });
  useEffect(() => () => onLeave(), []);

  // ----- Derived view data -----
  const now = new Date(state.nowMs);
  const progressList = useMemo(() => [...state.progress.values()], [state.progress]);
  const scope = scopeCards(state, ctx);
  const summary = summarize(scope, progressList, now);
  const label = scopeLabel(state.options, topics);

  const scopes: ScopeChoice[] = useMemo(() => {
    const at = new Date(state.nowMs);
    const due = ctx.cards.filter((c) => isDue(state.progress.get(c.id), at)).length;
    const starred = ctx.cards.filter((c) => c.starred).length;
    const byTopic = new Map<string, number>();
    for (const c of ctx.cards) {
      const k = topicKeyOf(c, ctx.topicIds);
      byTopic.set(k, (byTopic.get(k) ?? 0) + 1);
    }
    const list: ScopeChoice[] = [
      { value: "all", label: "All cards", count: ctx.cards.length },
      { value: "review", label: "Due for review", count: due },
      { value: "starred", label: "Starred", count: starred },
    ];
    for (const t of topics) {
      const n = byTopic.get(t.id) ?? 0;
      if (n > 0) list.push({ value: `topic:${t.id}`, label: t.title || "Untitled topic", count: n });
    }
    const other = byTopic.get(OTHER_TOPIC_ID) ?? 0;
    if (other > 0) list.push({ value: `topic:${OTHER_TOPIC_ID}`, label: "Other cards", count: other });
    return list;
  }, [ctx, topics, state.progress, state.nowMs]);

  const testHref = `/sets/${setId}/test`;

  // ----- No cards in the set -----
  if (cards.length === 0) {
    const building = setStatus === "building" || setStatus === "draft";
    return (
      <PageContainer size="default" className="pt-6 sm:pt-8">
        <EmptyState
          icon={<Layers />}
          title="No cards to learn yet"
          body={
            setStatus === "building"
              ? "Your set is still being built. Cards show up here as Claude writes them."
              : building
                ? "Add your material and build the set, or write cards yourself."
                : "Add a few cards to start learning."
          }
          action={
            <>
              <Button asChild>
                <Link href={`/sets/${setId}/cards`}>Add cards</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/sets/${setId}`}>Go to overview</Link>
              </Button>
            </>
          }
        />
      </PageContainer>
    );
  }

  const round = state.round;
  const inRound = (state.phase === "question" || state.phase === "feedback") && round;
  const roundDone = round ? round.done.length : 0;
  const roundTotal = round ? round.cardIds.length : 0;

  const motionProps = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.12 } }
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -6 },
        transition: { duration: 0.2, ease: [0.23, 1, 0.32, 1] as const },
      };

  let body: ReactNode = null;
  let bodyKey = state.phase as string;

  if (state.phase === "empty") {
    const starred = state.options.scope === "starred";
    body = (
      <EmptyState
        icon={starred ? <Star /> : <Layers />}
        title={starred ? "No starred cards yet" : "No cards in this topic"}
        body={
          starred
            ? "Star cards in Flashcards or on the Cards tab to study just those here."
            : "Pick another topic, or study all cards."
        }
        action={
          <Button onClick={() => changeOptions({ ...state.options, scope: "all", topicId: null })}>
            Study all cards
          </Button>
        }
      />
    );
  } else if (state.phase === "finished") {
    const isReview = state.options.scope === "review";
    const due = isReview ? nextReviewDue(ctx.cards, state.progress) : nextReviewDue(scope, state.progress);
    // Multiple choice only stops at familiar: say so, and offer written answers.
    const familiarOnly =
      !isReview && levelGoal(state.options) < 3 && scope.some((c) => levelOf(state.progress.get(c.id)) < 3);
    body = (
      <LearnFinished
        kind={isReview ? "review" : familiarOnly ? "familiar" : "mastered"}
        onSwitchToWritten={
          familiarOnly ? () => changeOptions({ ...state.options, types: "written" }) : null
        }
        nextDueText={due ? formatRelative(due, now) : null}
        nextDueTitle={
          due
            ? new Date(due).toLocaleString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })
            : null
        }
        scopeTotal={scope.length}
        onPractice={!isReview && scope.length > 0 ? () => restart(state.options, true) : null}
        onStudyAll={
          state.options.scope !== "all"
            ? () => changeOptions({ ...state.options, scope: "all", topicId: null })
            : null
        }
        testHref={testHref}
      />
    );
  } else if (state.phase === "summary" && round) {
    const rows: SummaryRow[] = round.cardIds.flatMap((id) => {
      const card = ctx.byId.get(id);
      if (!card) return [];
      return [
        {
          cardId: id,
          term: card.term,
          definition: card.definition,
          before: round.startLevels[id] ?? 0,
          after: levelOf(state.progress.get(id)),
          firstTry: round.firstTry[id] === true,
        },
      ];
    });
    const goal = levelGoal(state.options);
    const hasMore = roundCandidates(state, ctx).some((c) => {
      const p = state.progress.get(c.id);
      return levelOf(p) < goal || isDue(p, now);
    });
    bodyKey = `summary-${round.number}`;
    body = (
      <RoundSummary
        roundNumber={round.number}
        rows={rows}
        practice={round.practice}
        onNext={nextRound}
        hasMore={hasMore && !round.practice}
      />
    );
  } else if (inRound && round) {
    const q = round.current;
    bodyKey = q.key;
    body = (
      <LearnQuestionCard
        question={q}
        feedback={state.feedback && state.feedback.questionKey === q.key ? state.feedback : null}
        aiReady={aiReady}
        autoAdvance={autoAdvance}
        onChoose={choose}
        onSubmitWritten={submitWritten}
        onDontKnow={dontKnow}
        onContinue={continueNext}
        onOverride={overrideCorrect}
        onOverrideWrong={overrideWrong}
        onExplain={chat ? explain : null}
      />
    );
  }

  const currentKind = inRound && round ? round.current.kind : null;

  return (
    <PageContainer size="default" className="pt-6 sm:pt-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-2xl leading-tight font-semibold tracking-[-0.015em] text-ink">Learn</h2>
          <p className="mt-1 text-sm text-ink-2">
            <span className="font-medium text-ink">{label}</span>
            <span aria-hidden> · </span>
            <span className="sr-only">, </span>
            {pluralize(scope.length, "card")}
          </p>
        </div>
        <LearnOptionsPopover
          options={state.options}
          scopes={scopes}
          onChange={changeOptions}
          autoAdvance={autoAdvance}
          onAutoAdvanceChange={writeAuto}
          className="shrink-0"
        />
      </div>

      <div className="mt-5 rounded-lg border border-line bg-surface px-4 py-3 sm:px-5 sm:py-4">
        {/* Phones: one line, so the question and its choices fit on the first screen. */}
        <div className="flex items-center gap-3 sm:hidden">
          <p className="shrink-0 text-sm font-medium text-ink">Your progress</p>
          <MasteryBar summary={summary} size="md" showLegend={false} label="Your progress" className="min-w-0 flex-1" />
          <p className="shrink-0 text-sm text-ink-2">
            <span className="font-mono font-medium text-ink tabular-nums">{summary.percent}%</span> mastered
          </p>
        </div>
        <div className="max-sm:hidden">
          <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-ink">Your progress</p>
            <p className="text-sm text-ink-2">
              <span className="font-mono font-medium text-ink tabular-nums">{summary.percent}%</span> mastered
            </p>
          </div>
          <MasteryBar summary={summary} size="md" />
        </div>
      </div>

      {inRound && round ? (
        <div className="mt-6 mb-3 flex items-center gap-3">
          <p className="shrink-0 text-sm font-medium text-ink">
            {round.practice ? "Practice" : `Round ${round.number}`}
          </p>
          <Progress
            value={roundDone}
            max={Math.max(1, roundTotal)}
            size="sm"
            label="Round progress"
            valueText={`${roundDone} of ${roundTotal} cards done`}
            className="flex-1"
          />
          <p className="shrink-0 font-mono text-xs text-ink-2 tabular-nums" aria-hidden>
            {roundDone}/{roundTotal}
          </p>
        </div>
      ) : (
        <div className="mt-6" />
      )}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={bodyKey} {...motionProps}>
          {body}
        </motion.div>
      </AnimatePresence>

      {currentKind ? (
        <p className="mt-4 hidden items-center justify-center gap-2 text-[0.8125rem] text-ink-2 sm:flex">
          {state.phase === "feedback" ? (
            <>
              Press <Kbd>Enter</Kbd> to continue
            </>
          ) : currentKind === "mc" ? (
            <>
              Press <Kbd>1</Kbd>
              <span aria-hidden>-</span>
              <span className="sr-only">to</span>
              <Kbd>{round?.current.options.length ?? 4}</Kbd> to choose
            </>
          ) : (
            <>
              Press <Kbd>Enter</Kbd> to answer
            </>
          )}
        </p>
      ) : null}
    </PageContainer>
  );
}
