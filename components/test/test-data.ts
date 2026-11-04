// Shared shapes for the Test page. Safe on server and client.
import type { ExamQuestion, TestAttempt } from "@/lib/types";

export const EXAM_QUESTION_COLUMNS = "id, topic_id, stem, choices, answer_index, explanation, difficulty, created_at";
export const EXAM_ATTEMPT_COLUMNS = "id, kind, score, total, details, created_at";

export type ExamQuestionRow = Pick<
  ExamQuestion,
  "id" | "topic_id" | "stem" | "choices" | "answer_index" | "explanation" | "difficulty" | "created_at"
>;

export type AttemptRow = Pick<TestAttempt, "id" | "kind" | "score" | "total" | "details" | "created_at">;

export type TestTab = "cards" | "exam";

/** Drops malformed rows (choices must be 2-6 strings with a valid answer). */
export function cleanQuestions(rows: readonly unknown[]): ExamQuestionRow[] {
  const out: ExamQuestionRow[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const choices = Array.isArray(r.choices) ? r.choices.filter((c): c is string => typeof c === "string") : [];
    const answer = Number(r.answer_index);
    if (typeof r.id !== "string" || typeof r.stem !== "string") continue;
    if (choices.length < 2 || !Number.isInteger(answer) || answer < 0 || answer >= choices.length) continue;
    const difficulty = r.difficulty === "easy" || r.difficulty === "hard" ? r.difficulty : "medium";
    out.push({
      id: r.id,
      topic_id: typeof r.topic_id === "string" ? r.topic_id : null,
      stem: r.stem,
      choices,
      answer_index: answer,
      explanation: typeof r.explanation === "string" ? r.explanation : "",
      difficulty,
      created_at: typeof r.created_at === "string" ? r.created_at : "",
    });
  }
  return out;
}
