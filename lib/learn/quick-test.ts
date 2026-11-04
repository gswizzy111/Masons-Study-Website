// Practice tests made from a set's cards. Pure, no I/O.
// Relative imports only (lib/learn is bundled outside Next too).
import { gradeAnswer, normalizeAnswer } from "./grade";
import {
  pickDistractors,
  shuffle,
  type AnswerWith,
  type LearnCard,
  type Rng,
} from "./engine";

export type TestQuestionType = "tf" | "mc" | "matching" | "written";

/** Display order of the sections in a test (easier first). */
export const TEST_TYPE_ORDER: readonly TestQuestionType[] = ["tf", "mc", "matching", "written"];

export const TEST_TYPE_LABELS: Record<TestQuestionType, string> = {
  tf: "True or false",
  mc: "Multiple choice",
  matching: "Matching",
  written: "Written",
};

type Base = { key: string };

export type McTestQuestion = Base & {
  type: "mc";
  cardId: string;
  promptSide: "term" | "definition";
  prompt: string;
  answer: string;
  options: string[];
  answerIndex: number;
};

export type TfTestQuestion = Base & {
  type: "tf";
  cardId: string;
  term: string;
  /** The definition shown, the card's own or another card's. */
  shown: string;
  /** The card's real definition. */
  definition: string;
  isTrue: boolean;
};

export type WrittenTestQuestion = Base & {
  type: "written";
  cardId: string;
  promptSide: "term" | "definition";
  prompt: string;
  answer: string;
};

export type MatchingTestQuestion = Base & {
  type: "matching";
  /** Definitions to match, in shown order. */
  items: Array<{ cardId: string; definition: string }>;
  /** The terms to choose from (one per item), shuffled. */
  choices: Array<{ cardId: string; term: string }>;
};

export type TestQuestion = McTestQuestion | TfTestQuestion | WrittenTestQuestion | MatchingTestQuestion;

/**
 * Answers keyed by question key:
 * mc -> option index, tf -> boolean, written -> text,
 * matching -> { [itemCardId]: chosen term's cardId }.
 */
export type TestResponses = Record<string, number | boolean | string | Record<string, string> | undefined>;

export type QuickTestOptions = {
  /** Number of cards to test, or "all". */
  count: number | "all";
  types: readonly TestQuestionType[];
  /** Topic keys to include ("other" for cards without a topic); null = all. */
  topicKeys: ReadonlySet<string> | null;
  answerWith: AnswerWith;
};

const MATCH_MIN = 3;
const MATCH_MAX = 5;

/** How many items a question counts for in the score. */
export function itemCount(q: TestQuestion): number {
  return q.type === "matching" ? q.items.length : 1;
}

/** Splits n cards into matching groups of 3-5 (empty when n < 3). */
function matchingGroups(n: number): number[] {
  if (n < MATCH_MIN) return [];
  const groups = Math.ceil(n / MATCH_MAX);
  const base = Math.floor(n / groups);
  const extra = n % groups;
  return Array.from({ length: groups }, (_, i) => base + (i < extra ? 1 : 0));
}

let seq = 0;
const nextKey = (prefix: string) => {
  seq += 1;
  return `${prefix}-${seq}`;
};

/**
 * Builds a test. Each picked card appears in exactly one question; a
 * matching question covers 3-5 cards. Types are spread evenly, and a type
 * that can't be made (too few cards for matching, no distractors for
 * multiple choice or true/false) falls back to written.
 */
export function buildQuickTest(
  scopeCards: readonly LearnCard[],
  pool: readonly LearnCard[],
  options: QuickTestOptions,
  rng: Rng = Math.random,
): TestQuestion[] {
  const types = TEST_TYPE_ORDER.filter((t) => options.types.includes(t));
  if (types.length === 0 || scopeCards.length === 0) return [];
  const total =
    options.count === "all" ? scopeCards.length : Math.max(1, Math.min(options.count, scopeCards.length));
  const picked = shuffle(scopeCards, rng).slice(0, total);

  // Cards per type. Matching takes a block of 3+ cards; the rest are
  // spread evenly over the other types.
  const counts = new Map<TestQuestionType, number>(types.map((t) => [t, 0]));
  const others = types.filter((t) => t !== "matching");
  let matching = 0;
  if (types.includes("matching")) {
    if (others.length === 0) {
      matching = picked.length;
    } else {
      matching = Math.round(picked.length / types.length);
      if (matching < MATCH_MIN && picked.length - MATCH_MIN >= others.length) matching = MATCH_MIN;
    }
    if (matching < MATCH_MIN) matching = 0;
  }
  counts.set("matching", matching);
  const rest = others.length > 0 ? others : (["written"] as TestQuestionType[]);
  for (let i = 0; i < picked.length - matching; i += 1) {
    const t = rest[i % rest.length];
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }

  const questions: TestQuestion[] = [];
  let cursor = 0;
  const take = (n: number) => {
    const out = picked.slice(cursor, cursor + n);
    cursor += n;
    return out;
  };

  for (const type of TEST_TYPE_ORDER) {
    const n = counts.get(type) ?? 0;
    if (n <= 0) continue;
    const cards = take(n);

    if (type === "matching") {
      let i = 0;
      for (const size of matchingGroups(cards.length)) {
        const group = cards.slice(i, i + size);
        i += size;
        questions.push({
          type: "matching",
          key: nextKey("match"),
          items: group.map((c) => ({ cardId: c.id, definition: c.definition })),
          choices: shuffle(
            group.map((c) => ({ cardId: c.id, term: c.term })),
            rng,
          ),
        });
      }
      for (const c of cards.slice(i)) questions.push(writtenQuestion(c, options.answerWith));
      continue;
    }

    for (const card of cards) {
      if (type === "written") {
        questions.push(writtenQuestion(card, options.answerWith));
      } else if (type === "mc") {
        const distractors = pickDistractors(card, pool, options.answerWith, 3, rng);
        if (distractors.length === 0) {
          questions.push(writtenQuestion(card, options.answerWith));
          continue;
        }
        const promptSide = options.answerWith === "term" ? "definition" : "term";
        const answer = options.answerWith === "term" ? card.term : card.definition;
        const answerIndex = Math.floor(rng() * (distractors.length + 1));
        const opts = [...distractors];
        opts.splice(answerIndex, 0, answer);
        questions.push({
          type: "mc",
          key: nextKey("mc"),
          cardId: card.id,
          promptSide,
          prompt: promptSide === "term" ? card.term : card.definition,
          answer,
          options: opts,
          answerIndex,
        });
      } else {
        // True or false: half the time show another card's definition.
        const wantFalse = rng() < 0.5;
        const other = wantFalse ? pickDistractors(card, pool, "definition", 1, rng)[0] : undefined;
        questions.push({
          type: "tf",
          key: nextKey("tf"),
          cardId: card.id,
          term: card.term,
          definition: card.definition,
          shown: other ?? card.definition,
          isTrue: other === undefined,
        });
      }
    }
  }
  return questions;
}

function writtenQuestion(card: LearnCard, answerWith: AnswerWith): WrittenTestQuestion {
  const promptSide = answerWith === "term" ? "definition" : "term";
  return {
    type: "written",
    key: nextKey("written"),
    cardId: card.id,
    promptSide,
    prompt: promptSide === "term" ? card.term : card.definition,
    answer: answerWith === "term" ? card.term : card.definition,
  };
}

/** One graded item (a matching question has one per pair). */
export type GradedItem = {
  questionKey: string;
  type: TestQuestionType;
  cardId: string;
  correct: boolean;
  /** Written only: a near miss. */
  close?: boolean;
  /** What they answered, as text ("" when blank). */
  given: string;
  /** The right answer, as text. */
  expected: string;
  blank: boolean;
};

/** True when the question has any answer. */
export function isAnswered(q: TestQuestion, responses: TestResponses): boolean {
  const r = responses[q.key];
  switch (q.type) {
    case "mc":
      return typeof r === "number";
    case "tf":
      return typeof r === "boolean";
    case "written":
      return typeof r === "string" && normalizeAnswer(r) !== "";
    case "matching":
      return typeof r === "object" && r !== null && Object.values(r).some(Boolean);
  }
}

/** Grades every item of a test. */
export function gradeQuickTest(questions: readonly TestQuestion[], responses: TestResponses): GradedItem[] {
  const out: GradedItem[] = [];
  for (const q of questions) {
    const r = responses[q.key];
    switch (q.type) {
      case "mc": {
        const chosen = typeof r === "number" ? r : null;
        out.push({
          questionKey: q.key,
          type: "mc",
          cardId: q.cardId,
          correct: chosen === q.answerIndex,
          given: chosen === null ? "" : (q.options[chosen] ?? ""),
          expected: q.answer,
          blank: chosen === null,
        });
        break;
      }
      case "tf": {
        const chosen = typeof r === "boolean" ? r : null;
        out.push({
          questionKey: q.key,
          type: "tf",
          cardId: q.cardId,
          correct: chosen === q.isTrue,
          given: chosen === null ? "" : chosen ? "True" : "False",
          expected: q.isTrue ? "True" : "False",
          blank: chosen === null,
        });
        break;
      }
      case "written": {
        const text = typeof r === "string" ? r.trim() : "";
        const grade = text ? gradeAnswer(text, q.answer) : { correct: false, close: false };
        out.push({
          questionKey: q.key,
          type: "written",
          cardId: q.cardId,
          correct: grade.correct,
          close: grade.close,
          given: text,
          expected: q.answer,
          blank: !text,
        });
        break;
      }
      case "matching": {
        const picks = typeof r === "object" && r !== null ? (r as Record<string, string>) : {};
        const termOf = new Map(q.choices.map((c) => [c.cardId, c.term]));
        for (const item of q.items) {
          const chosen = picks[item.cardId] || "";
          out.push({
            questionKey: q.key,
            type: "matching",
            cardId: item.cardId,
            correct: chosen === item.cardId,
            given: chosen ? (termOf.get(chosen) ?? "") : "",
            expected: termOf.get(item.cardId) ?? "",
            blank: !chosen,
          });
        }
        break;
      }
    }
  }
  return out;
}
