// Shared shapes and URL handling for the Learn page. Safe on server and client.
import type { Card, CardProgress, Topic } from "@/lib/types";
import {
  DEFAULT_LEARN_OPTIONS,
  OTHER_TOPIC_ID,
  type AnswerWith,
  type LearnOptions,
  type QuestionTypes,
} from "@/lib/learn/engine";

export const LEARN_CARD_COLUMNS = "id, term, definition, topic_id, hint, starred, position";
export const LEARN_PROGRESS_COLUMNS =
  "card_id, level, streak, times_seen, times_correct, times_wrong, interval_days, ease, due_at, last_result, last_seen_at";

export type LearnCardRow = Pick<
  Card,
  "id" | "term" | "definition" | "topic_id" | "hint" | "starred" | "position"
>;

export type LearnProgressRow = Pick<
  CardProgress,
  | "card_id"
  | "level"
  | "streak"
  | "times_seen"
  | "times_correct"
  | "times_wrong"
  | "interval_days"
  | "ease"
  | "due_at"
  | "last_result"
  | "last_seen_at"
>;

type Query = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Learn options from the address: `?topic=<id>`, `?mode=review`,
 * `?starred=1`, `?types=mixed|mc|written`, `?answer=term|definition`.
 * Unknown values fall back to the defaults.
 */
export function parseLearnParams(query: Query, topicIds: ReadonlySet<string>): LearnOptions {
  const options: LearnOptions = { ...DEFAULT_LEARN_OPTIONS };
  const mode = first(query.mode);
  const starred = first(query.starred);
  const topic = first(query.topic);

  if (mode === "review") {
    options.scope = "review";
  } else if (starred === "1" || starred === "true") {
    options.scope = "starred";
  } else if (topic && (topicIds.has(topic) || topic === OTHER_TOPIC_ID)) {
    options.scope = "topic";
    options.topicId = topic;
  }

  const types = first(query.types);
  if (types === "mc" || types === "written" || types === "mixed") options.types = types as QuestionTypes;
  const answer = first(query.answer);
  if (answer === "term" || answer === "definition") options.answerWith = answer as AnswerWith;
  return options;
}

/** The query string for a set of options ("" for the defaults). */
export function learnSearch(options: LearnOptions): string {
  const params = new URLSearchParams();
  if (options.scope === "review") params.set("mode", "review");
  else if (options.scope === "starred") params.set("starred", "1");
  else if (options.scope === "topic" && options.topicId) params.set("topic", options.topicId);
  if (options.types !== DEFAULT_LEARN_OPTIONS.types) params.set("types", options.types);
  if (options.answerWith !== DEFAULT_LEARN_OPTIONS.answerWith) params.set("answer", options.answerWith);
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** "All cards", "Due for review", "Starred", or the topic's title. */
export function scopeLabel(options: Pick<LearnOptions, "scope" | "topicId">, topics: readonly Topic[]): string {
  switch (options.scope) {
    case "review":
      return "Due for review";
    case "starred":
      return "Starred cards";
    case "topic": {
      if (options.topicId === OTHER_TOPIC_ID) return "Other cards";
      const t = topics.find((x) => x.id === options.topicId);
      return t?.title || "Topic";
    }
    default:
      return "All cards";
  }
}
