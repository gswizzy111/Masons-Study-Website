// Exam practice with AI-written questions. Pure, no I/O.
// Relative imports only (lib/learn is bundled outside Next too).
import type { ExamQuestion, Topic } from "../types";
import { shuffle, type Rng } from "./engine";

export type ExamSource = "unseen" | "all" | "missed";

/** One answer as saved in test_attempts.details for kind "exam". */
export type ExamAttemptDetail = {
  questionId: string;
  /** Chosen option index, or null when left blank. */
  chosen: number | null;
  correct: boolean;
};

export type QuestionHistory = {
  seen: boolean;
  /** The result the last time it was answered. */
  lastCorrect: boolean | null;
  timesSeen: number;
};

function isDetail(value: unknown): value is ExamAttemptDetail {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.questionId === "string" && typeof v.correct === "boolean";
}

/**
 * What happened to each question across past exam attempts. `attempts`
 * may be in any order; the newest result wins.
 */
export function examHistory(
  attempts: ReadonlyArray<{ created_at: string; details: unknown }>,
): Map<string, QuestionHistory> {
  const sorted = [...attempts].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const map = new Map<string, QuestionHistory>();
  for (const attempt of sorted) {
    const details = Array.isArray(attempt.details) ? attempt.details : [];
    for (const d of details) {
      if (!isDetail(d)) continue;
      const prev = map.get(d.questionId);
      map.set(d.questionId, {
        seen: true,
        lastCorrect: d.correct,
        timesSeen: (prev?.timesSeen ?? 0) + 1,
      });
    }
  }
  return map;
}

/**
 * Picks questions for an exam.
 * - "unseen": never-answered questions first (shuffled), then the rest.
 * - "missed": only questions whose last answer was wrong.
 * - "all": every question, shuffled.
 */
export function pickExamQuestions<Q extends Pick<ExamQuestion, "id">>(
  questions: readonly Q[],
  history: ReadonlyMap<string, QuestionHistory>,
  opts: { count: number | "all"; source: ExamSource },
  rng: Rng = Math.random,
): Q[] {
  let ordered: Q[];
  if (opts.source === "missed") {
    ordered = shuffle(
      questions.filter((q) => history.get(q.id)?.lastCorrect === false),
      rng,
    );
  } else if (opts.source === "unseen") {
    const unseen = questions.filter((q) => !history.get(q.id)?.seen);
    const seen = questions.filter((q) => history.get(q.id)?.seen);
    // Seen ones: missed before first, then the least practiced.
    const seenOrdered = shuffle(seen, rng).sort((a, b) => {
      const ha = history.get(a.id);
      const hb = history.get(b.id);
      const ma = ha?.lastCorrect === false ? 0 : 1;
      const mb = hb?.lastCorrect === false ? 0 : 1;
      return ma - mb || (ha?.timesSeen ?? 0) - (hb?.timesSeen ?? 0);
    });
    ordered = [...shuffle(unseen, rng), ...seenOrdered];
  } else {
    ordered = shuffle(questions, rng);
  }
  return opts.count === "all" ? ordered : ordered.slice(0, Math.max(1, opts.count));
}

export type TopicScore = {
  topicId: string;
  title: string;
  correct: number;
  total: number;
  percent: number;
};

/** Per-topic scores for an exam, weakest first. Questions with no known topic go under "Other". */
export function topicScores(
  results: ReadonlyArray<{ topicId: string | null; correct: boolean }>,
  topics: readonly Topic[],
): TopicScore[] {
  const titles = new Map(topics.map((t) => [t.id, t.title]));
  const order = new Map(topics.map((t, i) => [t.id, i]));
  const map = new Map<string, { correct: number; total: number }>();
  for (const r of results) {
    const id = r.topicId && titles.has(r.topicId) ? r.topicId : "other";
    const s = map.get(id) ?? { correct: 0, total: 0 };
    s.total += 1;
    if (r.correct) s.correct += 1;
    map.set(id, s);
  }
  return [...map.entries()]
    .map(([topicId, s]) => ({
      topicId,
      title: titles.get(topicId) || "Other",
      correct: s.correct,
      total: s.total,
      percent: s.total > 0 ? Math.round((100 * s.correct) / s.total) : 0,
    }))
    .sort(
      (a, b) =>
        a.percent - b.percent || (order.get(a.topicId) ?? 999) - (order.get(b.topicId) ?? 999),
    );
}

/** Topics under 70% in this exam (weakest first). */
export function weakTopics(scores: readonly TopicScore[], threshold = 70): TopicScore[] {
  return scores.filter((s) => s.percent < threshold);
}

/** "A", "B", ... for an option index. */
export function choiceLetter(index: number): string {
  return String.fromCharCode(65 + index);
}
