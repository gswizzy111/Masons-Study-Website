// The Learn engine: which cards to study next and how to ask about them.
// Pure, no I/O. Relative imports only (lib/learn is bundled outside Next too).
//
// A round has up to 7 cards, picked in this order: reviews that are due,
// still learning (level 1), familiar (level 2), then new (level 0).
// Mastered cards that are not due are left out.
//
// Question type in "mixed" mode: level 0-1 -> multiple choice (4 options,
// distractors from the same topic first), level 2 or due -> written.
// A missed question comes back later in the same round.
import { isDue } from "../mastery";
import type { Card, CardProgress, MasteryLevel } from "../types";
import { normalizeAnswer } from "./grade";

export type LearnScope = "all" | "topic" | "starred" | "review";
export type QuestionTypes = "mixed" | "mc" | "written";
/** What the student answers with. "term": shown the definition, answer with the term. */
export type AnswerWith = "term" | "definition";

export type LearnOptions = {
  scope: LearnScope;
  /** Topic id when scope is "topic" ("other" = cards with no or an unknown topic). */
  topicId?: string | null;
  types: QuestionTypes;
  answerWith: AnswerWith;
};

export const DEFAULT_LEARN_OPTIONS: LearnOptions = {
  scope: "all",
  topicId: null,
  types: "mixed",
  answerWith: "term",
};

export const ROUND_SIZE = 7;
/** Options in a multiple-choice question, answer included. */
export const MC_OPTION_COUNT = 4;
/** A missed question comes back after this many other questions (or at the end). */
export const REQUEUE_GAP = 3;
/** How many times one card can come back in a single round. */
export const MAX_RETRIES_PER_ROUND = 2;
export const OTHER_TOPIC_ID = "other";
const DAY_MS = 24 * 60 * 60 * 1000;

export type LearnCard = Pick<Card, "id" | "term" | "definition" | "topic_id" | "starred"> & {
  hint?: string | null;
};

export type LearnProgress = Pick<CardProgress, "level" | "due_at" | "last_seen_at"> &
  Partial<Pick<CardProgress, "card_id" | "times_wrong" | "streak">>;

export type ProgressLookup = ReadonlyMap<string, LearnProgress>;

export type QuestionKind = "mc" | "written";

export type LearnQuestion = {
  /** Unique per time the card is asked. */
  key: string;
  cardId: string;
  kind: QuestionKind;
  /** The side shown as the prompt. */
  promptSide: "term" | "definition";
  prompt: string;
  /** The expected answer (the other side). */
  answer: string;
  /** Multiple choice only: the options, answer included. */
  options: string[];
  /** Multiple choice only: index of the answer in `options` (-1 for written). */
  answerIndex: number;
  hint: string | null;
  topicId: string | null;
  /** The card's level when the question was made. */
  level: MasteryLevel;
  /** True when this card was a due review. */
  due: boolean;
};

/** Random number source in [0, 1). Pass a seeded one for tests. */
export type Rng = () => number;

export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function levelOf(p: LearnProgress | undefined): MasteryLevel {
  const n = Number(p?.level ?? 0);
  if (n >= 3) return 3;
  if (n >= 2) return 2;
  if (n >= 1) return 1;
  return 0;
}

function timeOf(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? fallback : t;
}

/** The card's topic for scoping: its topic id, or "other" when it has none the set knows. */
export function topicKeyOf(card: Pick<LearnCard, "topic_id">, topicIds: ReadonlySet<string>): string {
  return card.topic_id && topicIds.has(card.topic_id) ? card.topic_id : OTHER_TOPIC_ID;
}

/** Cards the options cover, in their original order. */
export function cardsInScope<C extends LearnCard>(
  cards: readonly C[],
  progress: ProgressLookup,
  options: Pick<LearnOptions, "scope" | "topicId">,
  ctx: { topicIds: ReadonlySet<string>; now?: Date },
): C[] {
  const now = ctx.now ?? new Date();
  switch (options.scope) {
    case "topic":
      if (!options.topicId) return [...cards];
      return cards.filter((c) => topicKeyOf(c, ctx.topicIds) === options.topicId);
    case "starred":
      return cards.filter((c) => c.starred);
    case "review":
      return cards.filter((c) => isDue(progress.get(c.id), now));
    case "all":
    default:
      return [...cards];
  }
}

/**
 * Study priority: 0 due review, 1 still learning, 2 familiar, 3 new.
 * null for a mastered card that is not due (nothing to do yet).
 */
export function priorityOf(p: LearnProgress | undefined, now: Date = new Date()): 0 | 1 | 2 | 3 | null {
  if (p && isDue(p, now)) return 0;
  const level = levelOf(p);
  if (level === 3) return null;
  if (level === 1) return 1;
  if (level === 2) return 2;
  return 3;
}

/**
 * The cards for the next round, at most `size`, by priority. Due reviews
 * come oldest-due first (ties: mastered, then still learning, then
 * familiar); learning cards least recently seen first; new cards in set
 * order.
 */
export function selectRoundCards<C extends LearnCard>(
  scopeCards: readonly C[],
  progress: ProgressLookup,
  opts: { size?: number; now?: Date; exclude?: ReadonlySet<string> } = {},
): C[] {
  const size = opts.size ?? ROUND_SIZE;
  const now = opts.now ?? new Date();
  const buckets: C[][] = [[], [], [], []];
  for (const card of scopeCards) {
    if (opts.exclude?.has(card.id)) continue;
    const pr = priorityOf(progress.get(card.id), now);
    if (pr !== null) buckets[pr].push(card);
  }

  // When each due card became due: a mastered card at its due_at, a
  // learning card a day after it was last seen (see isDue in lib/mastery).
  const dueKey = (c: C) => {
    const p = progress.get(c.id);
    return levelOf(p) === 3 ? timeOf(p?.due_at, 0) : timeOf(p?.last_seen_at, 0) + DAY_MS;
  };
  const seenKey = (c: C) => timeOf(progress.get(c.id)?.last_seen_at, 0);
  // Ties among due cards: mastered reviews keep their schedule, then the
  // weaker learning card (still learning before familiar).
  const levelKey = (c: C) => {
    const level = levelOf(progress.get(c.id));
    return level === 3 ? 0 : level;
  };

  const sortStable = (list: C[], key: (c: C) => number, tie: (c: C) => number = () => 0) =>
    list
      .map((c, i) => ({ c, i, k: key(c), t: tie(c) }))
      .sort((a, b) => a.k - b.k || a.t - b.t || a.i - b.i)
      .map((x) => x.c);

  const ordered = [
    ...sortStable(buckets[0], dueKey, levelKey),
    ...sortStable(buckets[1], seenKey),
    ...sortStable(buckets[2], seenKey),
    ...buckets[3],
  ];
  return ordered.slice(0, size);
}

/** Cards in scope with nothing to do right now (all mastered, none due). */
export function isScopeFinished(
  scopeCards: readonly LearnCard[],
  progress: ProgressLookup,
  now: Date = new Date(),
): boolean {
  return scopeCards.every((c) => priorityOf(progress.get(c.id), now) === null);
}

/** The earliest upcoming review among mastered cards in scope (ISO), or null. */
export function nextReviewDue(
  scopeCards: readonly LearnCard[],
  progress: ProgressLookup,
): string | null {
  let best: number | null = null;
  let bestIso: string | null = null;
  for (const c of scopeCards) {
    const p = progress.get(c.id);
    if (levelOf(p) !== 3 || !p?.due_at) continue;
    const t = timeOf(p.due_at, Number.NaN);
    if (Number.isNaN(t)) continue;
    if (best === null || t < best) {
      best = t;
      bestIso = p.due_at;
    }
  }
  return bestIso;
}

function sides(card: LearnCard, answerWith: AnswerWith) {
  return answerWith === "term"
    ? { promptSide: "definition" as const, prompt: card.definition, answer: card.term }
    : { promptSide: "term" as const, prompt: card.term, answer: card.definition };
}

function answerTextOf(card: LearnCard, answerWith: AnswerWith): string {
  return answerWith === "term" ? card.term : card.definition;
}

function sameKey(text: string): string {
  return normalizeAnswer(text) || text.trim().toLowerCase();
}

/**
 * Up to `count` wrong options for a card: unique, never equal to the
 * answer (after normalizing), from the same topic first, then the rest.
 * A card whose prompt side is the same as this card's ("ATP: energy
 * currency" and "GTP: energy currency") is never used: its answer would
 * be right too.
 */
export function pickDistractors(
  card: LearnCard,
  pool: readonly LearnCard[],
  answerWith: AnswerWith,
  count: number = MC_OPTION_COUNT - 1,
  rng: Rng = Math.random,
): string[] {
  const answer = answerTextOf(card, answerWith);
  const promptWith: AnswerWith = answerWith === "term" ? "definition" : "term";
  const promptKey = sameKey(answerTextOf(card, promptWith));
  const used = new Set<string>([sameKey(answer)]);
  const sameTopic: LearnCard[] = [];
  const others: LearnCard[] = [];
  for (const c of pool) {
    if (c.id === card.id) continue;
    if (sameKey(answerTextOf(c, promptWith)) === promptKey) continue;
    if (card.topic_id && c.topic_id === card.topic_id) sameTopic.push(c);
    else others.push(c);
  }

  const out: string[] = [];
  for (const c of [...shuffle(sameTopic, rng), ...shuffle(others, rng)]) {
    if (out.length >= count) break;
    const text = answerTextOf(c, answerWith).trim();
    const key = sameKey(text);
    if (!text || used.has(key)) continue;
    used.add(key);
    out.push(text);
  }
  return out;
}

/** The question type a card gets under `types`. */
export function questionKindFor(
  p: LearnProgress | undefined,
  types: QuestionTypes,
  now: Date = new Date(),
): QuestionKind {
  if (types === "mc") return "mc";
  if (types === "written") return "written";
  return levelOf(p) >= 2 || isDue(p, now) ? "written" : "mc";
}

let questionSeq = 0;

/**
 * One question for a card. Falls back to written when the set has too few
 * other answers for a multiple-choice question.
 */
export function makeQuestion(
  card: LearnCard,
  progress: ProgressLookup,
  options: Pick<LearnOptions, "types" | "answerWith">,
  pool: readonly LearnCard[],
  ctx: { rng?: Rng; now?: Date; kind?: QuestionKind } = {},
): LearnQuestion {
  const rng = ctx.rng ?? Math.random;
  const now = ctx.now ?? new Date();
  const p = progress.get(card.id);
  const { promptSide, prompt, answer } = sides(card, options.answerWith);
  let kind = ctx.kind ?? questionKindFor(p, options.types, now);

  let choices: string[] = [];
  let answerIndex = -1;
  if (kind === "mc") {
    const distractors = pickDistractors(card, pool, options.answerWith, MC_OPTION_COUNT - 1, rng);
    if (distractors.length === 0) {
      kind = "written";
    } else {
      answerIndex = Math.floor(rng() * (distractors.length + 1));
      choices = [...distractors];
      choices.splice(answerIndex, 0, answer);
    }
  }

  questionSeq += 1;
  return {
    key: `${card.id}:${questionSeq}`,
    cardId: card.id,
    kind,
    promptSide,
    prompt,
    answer,
    options: choices,
    answerIndex,
    hint: card.hint ?? null,
    topicId: card.topic_id,
    level: levelOf(p),
    due: isDue(p, now),
  };
}

/**
 * Builds a round: up to 7 questions for the highest-priority cards in
 * scope. `pool` is every card in the set (for distractors).
 */
export function buildRound(
  scopeCards: readonly LearnCard[],
  pool: readonly LearnCard[],
  progress: ProgressLookup,
  options: LearnOptions,
  ctx: { rng?: Rng; now?: Date; size?: number } = {},
): LearnQuestion[] {
  const now = ctx.now ?? new Date();
  const picked = selectRoundCards(scopeCards, progress, { size: ctx.size, now });
  return picked.map((card) => makeQuestion(card, progress, options, pool, { rng: ctx.rng, now }));
}

/**
 * Puts a missed card back into the round's queue (card ids still to ask,
 * not counting the current one), `gap` places later or at the end.
 */
export function requeue(queue: readonly string[], cardId: string, gap: number = REQUEUE_GAP): string[] {
  const out = queue.filter((id) => id !== cardId);
  const at = Math.min(Math.max(0, gap), out.length);
  out.splice(at, 0, cardId);
  return out;
}
