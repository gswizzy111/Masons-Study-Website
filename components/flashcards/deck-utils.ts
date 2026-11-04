// Pure helpers for the flashcards deck. Safe on the server and the client.
import type { Card, MasteryLevel, Topic } from "@/lib/types";

export type FlashcardData = Pick<Card, "id" | "term" | "definition" | "topic_id" | "hint" | "starred" | "position">;

/** The cards columns the flashcards page reads. */
export const FLASHCARD_COLUMNS = "id, term, definition, topic_id, hint, starred, position";

export type DeckFilter = "all" | "starred" | "learning";
export type FrontSide = "term" | "definition";
export type Mark = "learning" | "known";

/** Topic filter value for cards with no (or an unknown) topic. */
export const OTHER_TOPIC_ID = "other";
export const ALL_TOPICS = "all";

/** Levels 1 and 2 are "still learning" (lib/mastery buckets). */
export function isLearning(level: MasteryLevel | number | undefined): boolean {
  return level === 1 || level === 2;
}

/** The card's topic for filtering: its topic id, or "other". */
export function topicKey(card: Pick<FlashcardData, "topic_id">, topicIds: ReadonlySet<string>): string {
  return card.topic_id && topicIds.has(card.topic_id) ? card.topic_id : OTHER_TOPIC_ID;
}

export function matchesFilters(
  card: FlashcardData,
  filter: DeckFilter,
  topic: string,
  levels: ReadonlyMap<string, MasteryLevel>,
  topicIds: ReadonlySet<string>,
): boolean {
  if (topic !== ALL_TOPICS && topicKey(card, topicIds) !== topic) return false;
  if (filter === "starred") return card.starred;
  if (filter === "learning") return isLearning(levels.get(card.id));
  return true;
}

/** Fisher-Yates shuffle into a new array. Call from event handlers only. */
export function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Topics that have cards, in outline order, plus "Other" when needed. */
export function topicOptions(
  topics: readonly Topic[],
  cards: readonly FlashcardData[],
): Array<{ id: string; title: string; count: number }> {
  const topicIds = new Set(topics.map((t) => t.id));
  const counts = new Map<string, number>();
  for (const card of cards) {
    const key = topicKey(card, topicIds);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const options = topics
    .filter((t) => (counts.get(t.id) ?? 0) > 0)
    .map((t) => ({ id: t.id, title: t.title || "Untitled topic", count: counts.get(t.id) ?? 0 }));
  const other = counts.get(OTHER_TOPIC_ID) ?? 0;
  if (other > 0) options.push({ id: OTHER_TOPIC_ID, title: "Other", count: other });
  return options;
}

/**
 * Type size for a card face: big for a short term, smaller as the text grows,
 * so long definitions still fit and stay readable.
 */
export function faceTextClass(text: string, display: boolean): string {
  const n = text.length;
  if (n <= 28) return display ? "text-[1.875rem] sm:text-[2.5rem] leading-[1.12]" : "text-2xl sm:text-3xl leading-snug";
  if (n <= 70) return display ? "text-[1.625rem] sm:text-[2rem] leading-[1.18]" : "text-xl sm:text-2xl leading-snug";
  if (n <= 160) return "text-xl sm:text-[1.5rem] leading-snug";
  if (n <= 320) return "text-lg sm:text-xl leading-relaxed";
  if (n <= 600) return "text-base sm:text-lg leading-relaxed";
  return "text-[0.9375rem] sm:text-base leading-relaxed";
}
